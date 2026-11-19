import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  comments,
  items,
  likes,
  outfitItems,
  outfits,
  postPhotos,
  posts,
  users,
} from "@/db/schema";
import { UserError } from "@/server/errors";

export const shareInput = z
  .object({
    outfitId: z.string().uuid(),
    caption: z.string().trim().max(500).default(""),
  })
  .strict();
export const postId = z.object({ postId: z.string().uuid() }).strict();
export const commentInput = z
  .object({
    postId: z.string().uuid(),
    body: z.string().trim().min(1, "Write a comment").max(1000),
  })
  .strict();
export const commentId = z.object({ commentId: z.string().uuid() }).strict();

/** Who is acting: the member, their organization, and whether they're an admin. */
export interface Actor {
  id: string;
  orgId: string;
  admin: boolean;
}

/** One of this user's outfits with its items' photos, in order. */
export async function outfitForSharing(userId: string, outfitId: string) {
  const [outfit] = await db
    .select({ name: outfits.name, occasion: outfits.occasion })
    .from(outfits)
    .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)));
  if (!outfit) return null;
  const photos = await db
    .select({ name: items.name, key: items.photoKey, type: items.photoType })
    .from(outfitItems)
    .innerJoin(items, eq(items.id, outfitItems.itemId))
    .where(and(eq(outfitItems.outfitId, outfitId), eq(items.userId, userId)))
    .orderBy(asc(outfitItems.position));
  return { ...outfit, photos };
}

export async function createPost(
  actor: Actor,
  post: {
    id: string;
    outfitName: string;
    occasion: string | null;
    caption: string;
    photos: { id: string; name: string; key: string; type: string }[];
  },
) {
  await db.batch([
    db.insert(posts).values({
      id: post.id,
      orgId: actor.orgId,
      userId: actor.id,
      outfitName: post.outfitName,
      occasion: post.occasion,
      caption: post.caption,
    }),
    db.insert(postPhotos).values(
      post.photos.map((p, position) => ({
        id: p.id,
        postId: post.id,
        name: p.name,
        photoKey: p.key,
        photoType: p.type,
        position,
      })),
    ),
  ]);
}

export interface FeedComment {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  canDelete: boolean;
}
export interface FeedPost {
  id: string;
  author: string;
  outfitName: string;
  occasion: string | null;
  caption: string;
  createdAt: string;
  photos: { id: string; name: string }[];
  likeCount: number;
  liked: boolean;
  comments: FeedComment[];
  canDelete: boolean;
}

export async function listPosts(actor: Actor): Promise<FeedPost[]> {
  const rows = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      author: users.email,
      outfitName: posts.outfitName,
      occasion: posts.occasion,
      caption: posts.caption,
      createdAt: posts.createdAt,
      likeCount: sql<number>`(select count(*) from ${likes} where ${likes.postId} = ${posts.id})`,
      liked: sql<number>`exists(select 1 from ${likes} where ${likes.postId} = ${posts.id} and ${likes.userId} = ${actor.id})`,
    })
    .from(posts)
    .leftJoin(users, eq(users.id, posts.userId))
    .where(eq(posts.orgId, actor.orgId))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(100);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [photos, notes] = await Promise.all([
    db
      .select({
        id: postPhotos.id,
        postId: postPhotos.postId,
        name: postPhotos.name,
      })
      .from(postPhotos)
      .where(inArray(postPhotos.postId, ids))
      .orderBy(asc(postPhotos.position)),
    db
      .select({
        id: comments.id,
        postId: comments.postId,
        userId: comments.userId,
        body: comments.body,
        author: users.email,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.userId))
      .where(inArray(comments.postId, ids))
      .orderBy(asc(comments.createdAt), asc(comments.id)),
  ]);
  return rows.map((row) => {
    const mine = row.userId === actor.id;
    return {
      id: row.id,
      author: row.author ?? "A former member",
      outfitName: row.outfitName,
      occasion: row.occasion,
      caption: row.caption,
      createdAt: row.createdAt,
      likeCount: Number(row.likeCount),
      liked: Boolean(row.liked),
      canDelete: mine || actor.admin,
      photos: photos
        .filter((p) => p.postId === row.id)
        .map(({ id, name }) => ({ id, name })),
      comments: notes
        .filter((c) => c.postId === row.id)
        .map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author ?? "A former member",
          createdAt: c.createdAt,
          canDelete: c.userId === actor.id || mine || actor.admin,
        })),
    };
  });
}

async function postInOrg(actor: Actor, id: string) {
  const [post] = await db
    .select({ id: posts.id, userId: posts.userId })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.orgId, actor.orgId)));
  return post ?? null;
}

/** Likes the post, or takes the like back; whether it's now liked. */
export async function toggleLike(actor: Actor, id: string): Promise<boolean> {
  if (!(await postInOrg(actor, id))) throw new UserError("That post is gone");
  const removed = await db
    .delete(likes)
    .where(and(eq(likes.postId, id), eq(likes.userId, actor.id)))
    .returning({ postId: likes.postId });
  if (removed.length > 0) return false;
  await db
    .insert(likes)
    .values({ postId: id, userId: actor.id })
    .onConflictDoNothing();
  return true;
}

export async function addComment(
  actor: Actor,
  input: z.infer<typeof commentInput>,
) {
  if (!(await postInOrg(actor, input.postId))) {
    throw new UserError("That post is gone");
  }
  await db.insert(comments).values({
    id: crypto.randomUUID(),
    postId: input.postId,
    userId: actor.id,
    body: input.body,
  });
}

/** The comment's author, the post's author and admins may delete it. */
export async function deleteComment(actor: Actor, id: string) {
  const [found] = await db
    .select({ userId: comments.userId, postAuthor: posts.userId })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(and(eq(comments.id, id), eq(posts.orgId, actor.orgId)));
  if (!found) throw new UserError("That comment is gone");
  if (
    found.userId !== actor.id &&
    found.postAuthor !== actor.id &&
    !actor.admin
  ) {
    throw new UserError("You can't delete that comment");
  }
  await db.delete(comments).where(eq(comments.id, id));
}

/** The post's author and admins may delete it; the photo keys to remove. */
export async function deletePost(actor: Actor, id: string): Promise<string[]> {
  const post = await postInOrg(actor, id);
  if (!post) throw new UserError("That post is gone");
  if (post.userId !== actor.id && !actor.admin) {
    throw new UserError("You can't delete that post");
  }
  const photos = await db
    .select({ key: postPhotos.photoKey })
    .from(postPhotos)
    .where(eq(postPhotos.postId, id));
  await db.batch([
    db.delete(likes).where(eq(likes.postId, id)),
    db.delete(comments).where(eq(comments.postId, id)),
    db.delete(postPhotos).where(eq(postPhotos.postId, id)),
    db.delete(posts).where(eq(posts.id, id)),
  ]);
  return photos.map((p) => p.key);
}

/** A photo of a post in this organization. */
export async function postPhoto(orgId: string, id: string) {
  const [found] = await db
    .select({ key: postPhotos.photoKey, type: postPhotos.photoType })
    .from(postPhotos)
    .innerJoin(posts, eq(posts.id, postPhotos.postId))
    .where(and(eq(postPhotos.id, id), eq(posts.orgId, orgId)));
  return found ?? null;
}
