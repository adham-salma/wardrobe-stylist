import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { items, outfitItems, outfits } from "@/db/schema";
import { OCCASION_IDS, SLOTS, SLOT_IDS, type Slot } from "@/shared/catalog";
import { UserError } from "@/server/errors";

export const outfitInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Give the outfit a name").max(80),
    occasion: z.enum(OCCASION_IDS).nullable(),
    picks: z
      .array(
        z
          .object({ slot: z.enum(SLOT_IDS), itemId: z.string().uuid() })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type OutfitInput = z.infer<typeof outfitInput>;

export interface Pick {
  slot: Slot;
  itemId: string;
}

/**
 * The picks put in slot order, or a UserError: at least two items, each
 * one the owner's and of its slot's category, one per slot except
 * accessories, none twice.
 */
export function checkPicks(
  picks: readonly Pick[],
  owned: ReadonlyMap<string, { category: string }>,
): Pick[] {
  if (new Set(picks.map((p) => p.itemId)).size !== picks.length) {
    throw new UserError("An item can only be in an outfit once");
  }
  if (picks.length < 2) throw new UserError("Pick at least two items");
  for (const slot of SLOTS) {
    const inSlot = picks.filter((p) => p.slot === slot.id);
    if (!slot.many && inSlot.length > 1) {
      throw new UserError(`Only one item fits ${slot.label.toLowerCase()}`);
    }
    for (const pick of inSlot) {
      const item = owned.get(pick.itemId);
      if (!item) throw new UserError("That item isn't in your wardrobe");
      if (item.category !== slot.category) {
        throw new UserError(
          `That item doesn't fit ${slot.label.toLowerCase()}`,
        );
      }
    }
  }
  const order = (slot: Slot) => SLOT_IDS.indexOf(slot);
  return [...picks].sort((a, b) => order(a.slot) - order(b.slot));
}

export interface OutfitItem {
  id: string;
  name: string;
  category: string;
  slot: Slot;
}
export interface Outfit {
  id: string;
  name: string;
  occasion: string | null;
  source: "manual" | "ai";
  createdAt: string;
  items: OutfitItem[];
}

async function ownedItems(userId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { category: string }>();
  const rows = await db
    .select({ id: items.id, category: items.category })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, ids)));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function listOutfits(
  userId: string,
  only?: { id: string },
): Promise<Outfit[]> {
  const where = only
    ? and(eq(outfits.userId, userId), eq(outfits.id, only.id))
    : eq(outfits.userId, userId);
  const [rows, pieces] = await Promise.all([
    db
      .select({
        id: outfits.id,
        name: outfits.name,
        occasion: outfits.occasion,
        source: outfits.source,
        createdAt: outfits.createdAt,
      })
      .from(outfits)
      .where(where)
      .orderBy(desc(outfits.createdAt), outfits.id),
    db
      .select({
        outfitId: outfitItems.outfitId,
        id: items.id,
        name: items.name,
        category: items.category,
        slot: outfitItems.slot,
      })
      .from(outfitItems)
      .innerJoin(outfits, eq(outfits.id, outfitItems.outfitId))
      .innerJoin(items, eq(items.id, outfitItems.itemId))
      .where(and(where, eq(items.userId, userId)))
      .orderBy(asc(outfitItems.position)),
  ]);
  return rows.map((row) => ({
    ...row,
    source: row.source === "ai" ? "ai" : "manual",
    items: pieces
      .filter((p) => p.outfitId === row.id)
      .map(({ outfitId: _, ...p }) => ({ ...p, slot: p.slot as Slot })),
  }));
}

export async function getOutfit(userId: string, id: string) {
  const [outfit] = await listOutfits(userId, { id });
  return outfit ?? null;
}

/** Creates or replaces one of this user's outfits; its id. */
export async function saveOutfit(
  userId: string,
  input: OutfitInput,
  source: "manual" | "ai" = "manual",
): Promise<string> {
  const owned = await ownedItems(
    userId,
    input.picks.map((p) => p.itemId),
  );
  const picks = checkPicks(input.picks, owned);
  const id = input.id ?? crypto.randomUUID();
  const rows = picks.map((p, position) => ({
    id: crypto.randomUUID(),
    outfitId: id,
    itemId: p.itemId,
    slot: p.slot,
    position,
  }));
  if (input.id) {
    const [mine] = await db
      .select({ id: outfits.id })
      .from(outfits)
      .where(and(eq(outfits.id, input.id), eq(outfits.userId, userId)));
    if (!mine) throw new UserError("That outfit isn't yours");
    await db.batch([
      db
        .update(outfits)
        .set({ name: input.name, occasion: input.occasion })
        .where(and(eq(outfits.id, id), eq(outfits.userId, userId))),
      db.delete(outfitItems).where(eq(outfitItems.outfitId, id)),
      db.insert(outfitItems).values(rows),
    ]);
  } else {
    await db.batch([
      db.insert(outfits).values({
        id,
        userId,
        name: input.name,
        occasion: input.occasion,
        source,
      }),
      db.insert(outfitItems).values(rows),
    ]);
  }
  return id;
}

export async function deleteOutfit(userId: string, id: string) {
  const [mine] = await db
    .select({ id: outfits.id })
    .from(outfits)
    .where(and(eq(outfits.id, id), eq(outfits.userId, userId)));
  if (!mine) return false;
  await db.batch([
    db.delete(outfitItems).where(eq(outfitItems.outfitId, id)),
    db
      .delete(outfits)
      .where(and(eq(outfits.id, id), eq(outfits.userId, userId))),
  ]);
  return true;
}
