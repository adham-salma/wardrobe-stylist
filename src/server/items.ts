import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { items, outfitItems } from "@/db/schema";
import { CATEGORY_IDS } from "@/shared/catalog";

const text = (max: number) => z.string().trim().max(max);

export const itemFields = z
  .object({
    name: text(120).min(1, "Give the item a name"),
    category: z.enum(CATEGORY_IDS, { message: "Pick a category" }),
    brand: text(80).default(""),
    colour: text(40).default(""),
    priceCents: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .nullable()
      .default(null),
    notes: text(1000).default(""),
  })
  .strict();
export type ItemFields = z.infer<typeof itemFields>;

export interface Item extends ItemFields {
  id: string;
  createdAt: string;
}

const shown = {
  id: items.id,
  name: items.name,
  category: items.category,
  brand: items.brand,
  colour: items.colour,
  priceCents: items.priceCents,
  notes: items.notes,
  createdAt: items.createdAt,
};

export function listItems(userId: string): Promise<Item[]> {
  return db
    .select(shown)
    .from(items)
    .where(eq(items.userId, userId))
    .orderBy(desc(items.createdAt), items.id) as Promise<Item[]>;
}

export async function createItem(
  userId: string,
  fields: ItemFields,
  photo: { key: string; type: string },
): Promise<Item> {
  const [item] = await db
    .insert(items)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...fields,
      photoKey: photo.key,
      photoType: photo.type,
    })
    .returning(shown);
  return item as Item;
}

/** The changed item and the photo it replaced, or null when this user has no item with the id. */
export async function updateItem(
  userId: string,
  id: string,
  fields: ItemFields,
  photo?: { key: string; type: string },
): Promise<{ item: Item; oldPhotoKey: string } | null> {
  const [before] = await db
    .select({ photoKey: items.photoKey })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)));
  if (!before) return null;
  const [item] = await db
    .update(items)
    .set({
      ...fields,
      ...(photo ? { photoKey: photo.key, photoType: photo.type } : {}),
    })
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning(shown);
  if (!item) return null;
  return { item: item as Item, oldPhotoKey: before.photoKey };
}

/** Deletes the item and takes it out of every outfit; the photo to remove, or null. */
export async function deleteItem(
  userId: string,
  id: string,
): Promise<{ photoKey: string } | null> {
  const [found] = await db
    .select({ photoKey: items.photoKey })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)));
  if (!found) return null;
  await db.batch([
    db.delete(outfitItems).where(eq(outfitItems.itemId, id)),
    db.delete(items).where(and(eq(items.id, id), eq(items.userId, userId))),
  ]);
  return found;
}

/** The photo of one of this user's items. */
export async function itemPhoto(userId: string, id: string) {
  const [found] = await db
    .select({ key: items.photoKey, type: items.photoType })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)));
  return found ?? null;
}
