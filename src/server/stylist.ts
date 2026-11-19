import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { checkPicks, type Pick } from "@/server/outfits";
import { UserError } from "@/server/errors";
import { matchOccasion, slotFor, type Occasion } from "@/shared/catalog";

export interface Suggestion {
  name: string;
  occasion: Occasion | null;
  picks: Pick[];
  /** The outfit it was saved as. */
  savedOutfitId: string | null;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions: Suggestion[];
  createdAt: string;
}

/**
 * The model's outfits, kept only as far as they hold: items this member
 * owns, each in the slot its category fits, at least two per outfit.
 */
export function cleanSuggestions(
  raw: unknown,
  owned: ReadonlyMap<string, { category: string }>,
): Suggestion[] {
  if (!Array.isArray(raw)) return [];
  const kept: Suggestion[] = [];
  for (const entry of raw.slice(0, 4)) {
    if (!entry || typeof entry !== "object") continue;
    const { name, occasion, itemIds } = entry as Record<string, unknown>;
    if (!Array.isArray(itemIds)) continue;
    const picks: Pick[] = [];
    for (const id of itemIds) {
      if (typeof id !== "string") continue;
      const item = owned.get(id);
      const slot = item && slotFor(item.category);
      if (!slot || picks.some((p) => p.itemId === id)) continue;
      if (!slot.many && picks.some((p) => p.slot === slot.id)) continue;
      picks.push({ slot: slot.id, itemId: id });
    }
    try {
      kept.push({
        name:
          typeof name === "string" && name.trim()
            ? name.trim().slice(0, 80)
            : "Suggested outfit",
        occasion: matchOccasion(occasion),
        picks: checkPicks(picks, owned),
        savedOutfitId: null,
      });
    } catch {
      // Fewer than two items survived.
    }
  }
  return kept;
}

function parse(json: string | null): Suggestion[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Suggestion[];
  } catch {
    return [];
  }
}

export async function listMessages(userId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    suggestions: parse(r.suggestions),
    createdAt: r.createdAt,
  }));
}

/** Stores a question and its answer together. */
export async function appendExchange(
  userId: string,
  question: string,
  answer: { note: string; suggestions: Suggestion[] },
) {
  const now = Date.now();
  await db.batch([
    db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      userId,
      role: "user",
      content: question,
      createdAt: new Date(now).toISOString(),
    }),
    db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      userId,
      role: "assistant",
      content: answer.note,
      suggestions: JSON.stringify(answer.suggestions),
      createdAt: new Date(now + 1).toISOString(),
    }),
  ]);
}

export async function getSuggestion(
  userId: string,
  messageId: string,
  index: number,
) {
  const [row] = await db
    .select({ suggestions: chatMessages.suggestions })
    .from(chatMessages)
    .where(
      and(eq(chatMessages.id, messageId), eq(chatMessages.userId, userId)),
    );
  const all = parse(row?.suggestions ?? null);
  const suggestion = all[index];
  if (!suggestion) throw new UserError("That suggestion is gone");
  return { all, suggestion };
}

export async function markSaved(
  userId: string,
  messageId: string,
  all: Suggestion[],
) {
  await db
    .update(chatMessages)
    .set({ suggestions: JSON.stringify(all) })
    .where(
      and(eq(chatMessages.id, messageId), eq(chatMessages.userId, userId)),
    );
}

export async function clearMessages(userId: string) {
  await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
}
