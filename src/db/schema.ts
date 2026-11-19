import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** Members as the Gateway names them, kept on first sight. */
export const users = sqliteTable("users", {
  // The Gateway's user id (`user.id`).
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    brand: text("brand").notNull().default(""),
    colour: text("colour").notNull().default(""),
    // Purchase price in cents; null when unknown.
    priceCents: integer("price_cents"),
    notes: text("notes").notNull().default(""),
    // R2 key of the photo, and its content type.
    photoKey: text("photo_key").notNull(),
    photoType: text("photo_type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("items_user").on(t.userId)],
);

export const outfits = sqliteTable(
  "outfits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    occasion: text("occasion"),
    // "manual" or "ai".
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("outfits_user").on(t.userId)],
);

export const outfitItems = sqliteTable(
  "outfit_items",
  {
    id: text("id").primaryKey(),
    outfitId: text("outfit_id")
      .notNull()
      .references(() => outfits.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    index("outfit_items_outfit").on(t.outfitId),
    index("outfit_items_item").on(t.itemId),
  ],
);

/** The stylist conversation, one row per message. */
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    // JSON: the outfits the stylist suggested, with the outfit each was saved as.
    suggestions: text("suggestions"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_user").on(t.userId, t.createdAt)],
);

/** A shared outfit, with copies of its photos as they were when shared. */
export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    outfitName: text("outfit_name").notNull(),
    occasion: text("occasion"),
    caption: text("caption").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("posts_org").on(t.orgId, t.createdAt)],
);

export const postPhotos = sqliteTable(
  "post_photos",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    photoKey: text("photo_key").notNull(),
    photoType: text("photo_type").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("post_photos_post").on(t.postId)],
);

export const likes = sqliteTable(
  "likes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_post").on(t.postId)],
);
