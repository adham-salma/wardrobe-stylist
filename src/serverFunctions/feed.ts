import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { UserError } from "@/server/errors";
import * as feed from "@/server/feed";
import { copyPhoto, deletePhotos } from "@/server/photos";
import { rememberUser } from "@/server/users";

function actorOf(user: { id: string; orgId: string; orgRole: string }) {
  return { id: user.id, orgId: user.orgId, admin: isAdmin(user) };
}

export const getFeed = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context: { user } }) => feed.listPosts(actorOf(user)));

/** Shares one of the member's outfits, with copies of its photos as they are now. */
export const shareOutfit = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => feed.shareInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const outfit = await feed.outfitForSharing(user.id, data.outfitId);
    if (!outfit) throw new UserError("That outfit isn't yours");
    if (outfit.photos.length === 0)
      throw new UserError("This outfit has no items");
    await rememberUser(user);
    const postId = crypto.randomUUID();
    const photos = [];
    for (const photo of outfit.photos) {
      const id = crypto.randomUUID();
      const key = `posts/${postId}/${id}`;
      if (await copyPhoto(photo.key, key)) {
        photos.push({ id, name: photo.name, key, type: photo.type });
      }
    }
    try {
      await feed.createPost(actorOf(user), {
        id: postId,
        outfitName: outfit.name,
        occasion: outfit.occasion,
        caption: data.caption,
        photos,
      });
    } catch (error) {
      await deletePhotos(photos.map((p) => p.key));
      throw error;
    }
    return { id: postId };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => feed.postId.parse(data))
  .handler(async ({ data, context: { user } }) => ({
    liked: await feed.toggleLike(actorOf(user), data.postId),
  }));

export const addComment = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => feed.commentInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await rememberUser(user);
    await feed.addComment(actorOf(user), data);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => feed.commentId.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await feed.deleteComment(actorOf(user), data.commentId);
    return { ok: true };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => feed.postId.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await deletePhotos(await feed.deletePost(actorOf(user), data.postId));
    return { ok: true };
  });
