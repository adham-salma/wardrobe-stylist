// Shared helpers for the release suites.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

const SHAPES = {
  // Simple garment silhouettes, drawn on a canvas so uploads are real PNGs.
  top: "M30 20 L70 20 L95 40 L85 55 L75 48 L75 95 L25 95 L25 48 L15 55 L5 40 Z",
  bottom: "M25 10 L75 10 L80 95 L58 95 L50 40 L42 95 L20 95 Z",
  shoes: "M10 60 L40 55 L55 40 L65 45 L70 60 L92 65 L92 80 L10 80 Z",
  bag: "M20 40 L80 40 L85 90 L15 90 Z M35 40 Q50 5 65 40",
  accessory: "M50 15 A30 30 0 1 1 49.9 15 Z M50 30 A15 15 0 1 0 50.1 30 Z",
  outerwear:
    "M28 12 L72 12 L96 38 L84 54 L76 46 L76 96 L24 96 L24 46 L16 54 L4 38 Z",
};

/** A PNG photo of a garment silhouette in `colour`. */
export async function makePhoto(page, shape, colour) {
  const data = await page.evaluate(
    ([path, fill]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f4f1ec";
      ctx.fillRect(0, 0, 400, 400);
      ctx.scale(4, 4);
      ctx.fillStyle = fill;
      ctx.fill(new Path2D(path), "evenodd");
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [SHAPES[shape], colour],
  );
  return {
    name: `${shape}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}

/** Picks `label` in the Select whose trigger has `testId`. */
export async function choose(page, testId, label) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/** Adds an item through the wardrobe's dialog, by hand. */
export async function addItem(
  page,
  { name, category, brand = "", colour = "", price = "", shape, fill },
) {
  await page.getByTestId("add-item").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByTestId("item-photo")
    .setInputFiles(await makePhoto(page, shape, fill));
  await dialog.getByTestId("item-name").fill(name);
  await choose(page, "item-category", category);
  if (brand) await dialog.getByTestId("item-brand").fill(brand);
  if (colour) await dialog.getByTestId("item-colour").fill(colour);
  if (price) await dialog.getByTestId("item-price").fill(String(price));
  await dialog.getByTestId("save-item").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByTestId("item-card").filter({ hasText: name }),
  ).toBeVisible();
}

/** Builds an outfit on /outfits/new from item names by slot. */
export async function buildOutfit(page, { name, occasion, picks }) {
  await page.goto("/outfits/new");
  for (const [slot, itemName] of picks) {
    await page.getByTestId(`slot-${slot}`).click();
    await page
      .getByRole("dialog")
      .getByTestId("pick-item")
      .filter({ hasText: itemName })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByTestId("outfit-name").fill(name);
  if (occasion) await choose(page, "outfit-occasion", occasion);
  await page.getByTestId("save-outfit").click();
  await expect(
    page.getByTestId("outfit-card").filter({ hasText: name }),
  ).toBeVisible();
}

/** Shares the outfit called `name` to the feed from its page. */
export async function shareOutfit(page, name, caption) {
  await page.goto("/outfits");
  await page
    .getByTestId("outfit-card")
    .filter({ hasText: name })
    .getByRole("link")
    .first()
    .click();
  await page.getByTestId("share-outfit").click();
  await page.getByTestId("share-caption").fill(caption);
  await page.getByTestId("share-submit").click();
  await expect(
    page.getByTestId("post").filter({ hasText: caption }),
  ).toBeVisible();
}

/**
 * Sends the next server-function POST whose body contains `fromId` with
 * `toId` in its place: a member forging a request for another's object.
 */
export async function forgeNext(page, fromId, toId) {
  let done = false;
  const handler = async (route) => {
    const request = route.request();
    const body = request.postData();
    if (!done && request.method() === "POST" && body && body.includes(fromId)) {
      done = true;
      return route.continue({ postData: body.replaceAll(fromId, toId) });
    }
    return route.fallback();
  };
  await page.route("**/*", handler);
}

export async function rows(runtime, sql, ...params) {
  const db = await runtime.database();
  return (
    await db
      .prepare(sql)
      .bind(...params)
      .all()
  ).results;
}
