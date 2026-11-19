import { env } from "cloudflare:workers";
import { UserError } from "@/server/errors";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024;

function bucket(): R2Bucket {
  return (env as unknown as { photos: R2Bucket }).photos;
}

/** Checks an uploaded photo: a PNG, JPEG, WebP or GIF up to 10 MB. */
export function checkPhoto(value: FormDataEntryValue | null): File {
  if (!(value instanceof File) || value.size === 0) {
    throw new UserError("Add a photo");
  }
  if (!TYPES.has(value.type)) {
    throw new UserError("Use a PNG, JPEG, WebP or GIF photo");
  }
  if (value.size > MAX_BYTES) throw new UserError("Photos can be up to 10 MB");
  return value;
}

export async function putPhoto(userId: string, file: File) {
  const key = `items/${userId}/${crypto.randomUUID()}`;
  await bucket().put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  return { key, type: file.type };
}

/** Copies a photo under a new key, so a post keeps it after the item changes. */
export async function copyPhoto(from: string, to: string) {
  const object = await bucket().get(from);
  if (!object) return false;
  await bucket().put(to, await object.arrayBuffer(), {
    httpMetadata: object.httpMetadata,
  });
  return true;
}

export async function getPhoto(key: string) {
  return bucket().get(key);
}

export async function deletePhotos(keys: string[]) {
  if (keys.length > 0) await bucket().delete(keys);
}

/** The photo as a data URL, for the model. */
export async function photoDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}
