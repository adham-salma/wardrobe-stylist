import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { listItems } from "@/server/items";
import * as outfits from "@/server/outfits";

const byId = (data: unknown) =>
  z.object({ id: z.string().uuid() }).strict().parse(data);

export const getOutfits = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context: { user } }) => outfits.listOutfits(user.id));

/** The builder's data: the outfit when editing one (null if it isn't this user's), and the wardrobe. */
export const getBuilder = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ id: z.string().nullable() }).strict().parse(data),
  )
  .handler(async ({ data, context: { user } }) => {
    const id =
      data.id && z.string().uuid().safeParse(data.id).success ? data.id : null;
    const [outfit, wardrobe] = await Promise.all([
      id ? outfits.getOutfit(user.id, id) : null,
      listItems(user.id),
    ]);
    return { outfit, missing: data.id !== null && !outfit, wardrobe };
  });

export const saveOutfit = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => outfits.outfitInput.parse(data))
  .handler(async ({ data, context: { user } }) => ({
    id: await outfits.saveOutfit(user.id, data),
  }));

export const deleteOutfit = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(byId)
  .handler(async ({ data, context: { user } }) => ({
    ok: await outfits.deleteOutfit(user.id, data.id),
  }));
