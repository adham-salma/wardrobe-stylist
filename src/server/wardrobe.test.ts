import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

// An in-memory SQLite with the app's migrations stands in for D1.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const items = await import("./items");
const outfits = await import("./outfits");
const feed = await import("./feed");
const { cleanSuggestions } = await import("./stylist");

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  testDb.current = db;
});

const photo = { key: "k", type: "image/png" };
const fields = (name: string, category: "tops" | "bottoms" | "shoes") =>
  items.itemFields.parse({ name, category, priceCents: 1000 });

describe("wardrobe", () => {
  it("keeps each member's items and outfits to themselves", async () => {
    const top = await items.createItem("alice", fields("Shirt", "tops"), photo);
    const pants = await items.createItem(
      "alice",
      fields("Pants", "bottoms"),
      photo,
    );
    const bobTop = await items.createItem("bob", fields("Tee", "tops"), photo);

    expect((await items.listItems("bob")).map((i) => i.name)).toEqual(["Tee"]);
    expect(
      await items.updateItem("bob", top.id, fields("Mine", "tops")),
    ).toBeNull();
    expect(await items.deleteItem("bob", top.id)).toBeNull();

    const id = await outfits.saveOutfit("alice", {
      name: "Office",
      occasion: "work",
      picks: [
        { slot: "top", itemId: top.id },
        { slot: "bottom", itemId: pants.id },
      ],
    });
    expect(await outfits.getOutfit("bob", id)).toBeNull();
    await expect(
      outfits.saveOutfit("bob", {
        name: "Mixed",
        occasion: null,
        picks: [
          { slot: "top", itemId: bobTop.id },
          { slot: "bottom", itemId: pants.id },
        ],
      }),
    ).rejects.toThrow("isn't in your wardrobe");
    await expect(
      outfits.saveOutfit("bob", {
        id,
        name: "Taken",
        occasion: null,
        picks: [],
      }),
    ).rejects.toThrow();

    // Deleting an item takes it out of the outfit.
    await items.deleteItem("alice", pants.id);
    expect(
      (await outfits.getOutfit("alice", id))?.items.map((i) => i.name),
    ).toEqual(["Shirt"]);
  });

  it("needs two items, each in its own slot", () => {
    const owned = new Map([
      ["a", { category: "tops" }],
      ["b", { category: "tops" }],
      ["c", { category: "accessories" }],
      ["d", { category: "accessories" }],
    ]);
    expect(() =>
      outfits.checkPicks([{ slot: "top", itemId: "a" }], owned),
    ).toThrow("two items");
    expect(() =>
      outfits.checkPicks(
        [
          { slot: "top", itemId: "a" },
          { slot: "top", itemId: "b" },
        ],
        owned,
      ),
    ).toThrow("Only one");
    expect(() =>
      outfits.checkPicks(
        [
          { slot: "bottom", itemId: "a" },
          { slot: "accessories", itemId: "c" },
        ],
        owned,
      ),
    ).toThrow("doesn't fit");
    expect(
      outfits
        .checkPicks(
          [
            { slot: "accessories", itemId: "c" },
            { slot: "accessories", itemId: "d" },
            { slot: "top", itemId: "a" },
          ],
          owned,
        )
        .map((p) => p.itemId),
    ).toEqual(["a", "c", "d"]);
  });

  it("drops stylist suggestions for items the member doesn't own", () => {
    const owned = new Map([
      ["a", { category: "tops" }],
      ["b", { category: "bottoms" }],
    ]);
    expect(
      cleanSuggestions(
        [
          { name: "Good", occasion: "Date night", itemIds: ["a", "b", "zzz"] },
          { name: "Bad", itemIds: ["a", "zzz"] },
        ],
        owned,
      ),
    ).toEqual([
      {
        name: "Good",
        occasion: "date-night",
        picks: [
          { slot: "top", itemId: "a" },
          { slot: "bottom", itemId: "b" },
        ],
        savedOutfitId: null,
      },
    ]);
  });
});

describe("feed", () => {
  const alice = { id: "alice", orgId: "org", admin: false };
  const bob = { id: "bob", orgId: "org", admin: false };
  const admin = { id: "carol", orgId: "org", admin: true };

  it("lets authors and admins moderate, and nobody else", async () => {
    const postId = crypto.randomUUID();
    await feed.createPost(alice, {
      id: postId,
      outfitName: "Office",
      occasion: "work",
      caption: "Hi",
      photos: [
        { id: crypto.randomUUID(), name: "Shirt", key: "p", type: "image/png" },
      ],
    });
    expect(await feed.toggleLike(bob, postId)).toBe(true);
    expect(await feed.toggleLike(bob, postId)).toBe(false);
    expect(await feed.toggleLike(bob, postId)).toBe(true);
    await feed.addComment(bob, { postId, body: "Nice" });
    await feed.addComment(alice, { postId, body: "Thanks" });
    const [post] = await feed.listPosts(bob);
    expect(post?.likeCount).toBe(1);
    expect(post?.canDelete).toBe(false);
    const thanks = post!.comments.find((c) => c.body === "Thanks")!;
    expect(thanks.canDelete).toBe(false);
    await expect(feed.deleteComment(bob, thanks.id)).rejects.toThrow();
    await expect(feed.deletePost(bob, postId)).rejects.toThrow();
    await expect(
      feed.deletePost({ ...admin, orgId: "elsewhere" }, postId),
    ).rejects.toThrow();
    const nice = post!.comments.find((c) => c.body === "Nice")!;
    await feed.deleteComment(alice, nice.id);
    expect(await feed.deletePost(admin, postId)).toEqual(["p"]);
    expect(await feed.listPosts(alice)).toEqual([]);
  });
});
