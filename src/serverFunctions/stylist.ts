import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { askForJson } from "@/server/ai";
import { UserError } from "@/server/errors";
import { listItems } from "@/server/items";
import { saveOutfit } from "@/server/outfits";
import * as stylist from "@/server/stylist";
import { OCCASIONS, categoryLabel } from "@/shared/catalog";

/** The conversation, with the wardrobe its suggestions draw from. */
export const getStylist = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    const [messages, wardrobe] = await Promise.all([
      stylist.listMessages(user.id),
      listItems(user.id),
    ]);
    return { messages, wardrobe };
  });

const SYSTEM = `You are a friendly personal stylist. You only suggest outfits made from the person's own wardrobe, listed below by id. Reply with one JSON object:
{"note": two or three sentences of advice, "outfits": [{"name": a short name, "occasion": one of ${OCCASIONS.map((o) => o.label.toLowerCase()).join(", ")}, "itemIds": ids from the wardrobe}]}
Suggest one to three outfits. Each outfit takes at most one top, bottom, one-piece, outerwear, shoes and bag, and any number of accessories; a one-piece replaces a top and bottom. Use only ids from the list. If the wardrobe can't make an outfit, say what to add and return no outfits.`;

export const askStylist = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z
      .object({
        message: z.string().trim().min(1, "Say what you need").max(2000),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context: { user } }) => {
    const [wardrobe, history] = await Promise.all([
      listItems(user.id),
      stylist.listMessages(user.id),
    ]);
    const list = wardrobe
      .map(
        (i) =>
          `- id=${i.id} | ${i.category} | ${i.name}${i.colour ? ` | ${i.colour}` : ""}${i.brand ? ` | ${i.brand}` : ""}`,
      )
      .join("\n");
    const answer = await askForJson([
      {
        role: "system",
        content: `${SYSTEM}\n\nWardrobe (category names: ${wardrobe.length ? [...new Set(wardrobe.map((i) => categoryLabel(i.category)))].join(", ") : "none"}):\n${list || "(empty)"}`,
      },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: data.message },
    ]);
    if (answer.off) return answer;
    const value = (answer.value ?? {}) as Record<string, unknown>;
    const owned = new Map(wardrobe.map((i) => [i.id, i]));
    const suggestions = stylist.cleanSuggestions(value.outfits, owned);
    const note =
      typeof value.note === "string" && value.note.trim()
        ? value.note.trim().slice(0, 2000)
        : suggestions.length
          ? "Here are some ideas."
          : "I couldn't put an outfit together from your wardrobe for that.";
    await stylist.appendExchange(user.id, data.message, { note, suggestions });
    return { off: false as const };
  });

/** Saves one of the stylist's suggestions as an outfit. */
export const saveSuggestion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z
      .object({ messageId: z.string().uuid(), index: z.number().int().min(0) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context: { user } }) => {
    const { all, suggestion } = await stylist.getSuggestion(
      user.id,
      data.messageId,
      data.index,
    );
    if (suggestion.savedOutfitId) {
      throw new UserError("That outfit is already saved");
    }
    const id = await saveOutfit(
      user.id,
      {
        name: suggestion.name,
        occasion: suggestion.occasion,
        picks: suggestion.picks,
      },
      "ai",
    );
    all[data.index] = { ...suggestion, savedOutfitId: id };
    await stylist.markSaved(user.id, data.messageId, all);
    return { id };
  });

export const clearStylist = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await stylist.clearMessages(user.id);
    return { ok: true };
  });
