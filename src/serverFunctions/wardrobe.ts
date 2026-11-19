import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { askForJson } from "@/server/ai";
import { UserError } from "@/server/errors";
import * as items from "@/server/items";
import {
  checkPhoto,
  deletePhotos,
  photoDataUrl,
  putPhoto,
} from "@/server/photos";
import { rememberUser } from "@/server/users";
import { CATEGORY_IDS, matchCategory } from "@/shared/catalog";

export const getWardrobe = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await rememberUser(user);
    return items.listItems(user.id);
  });

function formInput(data: unknown) {
  if (!(data instanceof FormData)) throw new UserError("Send a form");
  const id = data.get("id");
  const fields = items.itemFields.parse(
    JSON.parse(String(data.get("fields") ?? "{}")),
  );
  const photo = data.get("photo");
  return {
    id: id ? z.string().uuid().parse(id) : null,
    fields,
    photo: photo instanceof File && photo.size > 0 ? checkPhoto(photo) : null,
  };
}

/** Adds an item (a photo is required) or changes one (a new photo is optional). */
export const saveItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(formInput)
  .handler(async ({ data, context: { user } }) => {
    if (!data.id) {
      if (!data.photo) throw new UserError("Add a photo");
      const photo = await putPhoto(user.id, data.photo);
      return items.createItem(user.id, data.fields, photo);
    }
    const photo = data.photo ? await putPhoto(user.id, data.photo) : undefined;
    const changed = await items.updateItem(
      user.id,
      data.id,
      data.fields,
      photo,
    );
    if (!changed) {
      if (photo) await deletePhotos([photo.key]);
      throw new UserError("That item isn't in your wardrobe");
    }
    if (photo) await deletePhotos([changed.oldPhotoKey]);
    return changed.item;
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid() }).strict().parse(data),
  )
  .handler(async ({ data, context: { user } }) => {
    const deleted = await items.deleteItem(user.id, data.id);
    if (!deleted) throw new UserError("That item isn't in your wardrobe");
    await deletePhotos([deleted.photoKey]);
    return { ok: true };
  });

/** Looks at a photo and suggests a name, category and colour. */
export const autofillItem = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new UserError("Send a form");
    return checkPhoto(data.get("photo"));
  })
  .handler(async ({ data }) => {
    const answer = await askForJson([
      {
        role: "system",
        content: `You catalogue clothing from photos. Reply with one JSON object: {"name": a short descriptive name such as "Navy linen shirt", "category": one of ${CATEGORY_IDS.join(", ")}, "colour": the main colour in one or two words}.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "What is this item?" },
          { type: "image_url", image_url: { url: await photoDataUrl(data) } },
        ],
      },
    ]);
    if (answer.off) return answer;
    const value = (answer.value ?? {}) as Record<string, unknown>;
    const text = (v: unknown, max: number) =>
      typeof v === "string" ? v.trim().slice(0, max) : "";
    return {
      off: false as const,
      name: text(value.name, 120),
      category: matchCategory(value.category),
      colour: text(value.colour, 40),
    };
  });
