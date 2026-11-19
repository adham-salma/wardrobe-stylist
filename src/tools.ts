// The app's tools for AI clients, served by the Gateway at /mcp and called
// with the signed-in member. Read-only: they show the member's own wardrobe
// and outfits.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listItems } from "@/server/items";
import { listOutfits } from "@/server/outfits";

export const tools = defineTools({
  list_wardrobe: {
    description:
      "List the member's wardrobe items: name, category, brand, colour, price in cents and notes.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => listItems(user.id),
  },
  list_outfits: {
    description:
      "List the member's saved outfits with their occasion and the items in each slot.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => listOutfits(user.id),
  },
});
