// F001-F004 main paths, with a local stand-in for the AI provider behind the Gateway.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import {
  addItem,
  buildOutfit,
  choose,
  makePhoto,
  rows,
  shareOutfit,
} from "./lib.mjs";

// Answers chat completions the way a model would: a photo gets a guess at
// the item, a styling request gets outfits from the item ids in the prompt
// plus one id that belongs to nobody, which the app must drop.
const FAKE_AI = `export default { async fetch(request) {
  const body = await request.json();
  const text = JSON.stringify(body.messages);
  let content;
  if (text.includes("image_url")) {
    content = JSON.stringify({ name: "Navy Linen Shirt", category: "tops", colour: "Navy" });
  } else {
    const ids = [...text.matchAll(/id=([0-9a-f-]{36}) \\| (\\w+)/g)];
    const first = (category) => ids.find((match) => match[2] === category)?.[1];
    content = JSON.stringify({
      note: "A mild evening calls for light layers: the coat over the shirt keeps it polished.",
      outfits: [{ name: "Downtown dinner", occasion: "date night",
        itemIds: [first("tops"), first("bottoms"), first("outerwear"), first("shoes"), "00000000-0000-4000-8000-000000000000"].filter(Boolean) }],
    });
  }
  return Response.json({ id: "x", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] });
} };`;

const runtime = await startRuntime({
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-ai" } },
  workers: [
    {
      config: {
        name: "fake-ai",
        compatibilityDate: "2025-01-01",
        manifest: {
          mainModule: "fake.mjs",
          modules: { "fake.mjs": { type: "esm", contents: FAKE_AI } },
        },
      },
    },
  ],
});
try {
  const owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/");
  await runtime.assertBackLink(owner);
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText("Wardrobe");

  // F001: Auto-fill suggests name, category and colour from the photo; the person reviews and saves.
  await owner.getByTestId("add-item").click();
  const dialog = owner.getByRole("dialog");
  await dialog
    .getByTestId("item-photo")
    .setInputFiles(await makePhoto(owner, "top", "#1f3a5f"));
  await dialog.getByTestId("autofill").click();
  await expect(dialog.getByTestId("item-name")).toHaveValue("Navy Linen Shirt");
  await expect(dialog.getByTestId("item-colour")).toHaveValue("Navy");
  await expect(dialog.getByTestId("item-category")).toContainText("Tops");
  await dialog.getByTestId("item-brand").fill("Harbor & Pine");
  await dialog.getByTestId("item-price").fill("45");
  await dialog.getByTestId("item-notes").fill("Runs a little large");
  await dialog.getByTestId("save-item").click();
  await expect(
    owner.getByTestId("item-card").filter({ hasText: "Navy Linen Shirt" }),
  ).toBeVisible();

  const items = [
    {
      name: "Wide-Leg Trousers",
      category: "Bottoms",
      brand: "Mercer",
      colour: "Charcoal",
      price: 60,
      shape: "bottom",
      fill: "#3b3b3f",
    },
    {
      name: "Camel Wool Coat",
      category: "Outerwear",
      brand: "Northfold",
      colour: "Camel",
      price: 190,
      shape: "outerwear",
      fill: "#b58a5a",
    },
    {
      name: "White Leather Sneakers",
      category: "Shoes",
      colour: "White",
      price: 85,
      shape: "shoes",
      fill: "#e8e6e1",
    },
    {
      name: "Tan Crossbody Bag",
      category: "Bags",
      colour: "Tan",
      price: 120,
      shape: "bag",
      fill: "#c49a6c",
    },
    {
      name: "Gold Hoop Earrings",
      category: "Accessories",
      colour: "Gold",
      price: 30,
      shape: "accessory",
      fill: "#c9a227",
    },
    {
      name: "Silk Scarf",
      category: "Accessories",
      colour: "Rust",
      price: 25,
      shape: "accessory",
      fill: "#a0522d",
    },
  ];
  for (const item of items) await addItem(owner, item);

  await expect(owner.getByTestId("wardrobe-count")).toContainText("7");
  await expect(owner.getByTestId("wardrobe-value")).toContainText("$555.00");
  await expect(owner.getByTestId("filter-accessories")).toContainText("2");
  await owner.getByTestId("filter-accessories").click();
  await expect(owner.getByTestId("item-card")).toHaveCount(2);
  await owner.getByTestId("filter-all").click();
  await expect(owner.getByTestId("item-card")).toHaveCount(7);

  // Edit: the price change shows in the total.
  await owner
    .getByTestId("item-card")
    .filter({ hasText: "Navy Linen Shirt" })
    .click();
  await expect(owner.getByRole("dialog").getByTestId("item-notes")).toHaveValue(
    "Runs a little large",
  );
  await owner.getByRole("dialog").getByTestId("item-price").fill("50");
  await owner.getByRole("dialog").getByTestId("save-item").click();
  await expect(owner.getByTestId("wardrobe-value")).toContainText("$560.00");

  // Request level: the photo route serves the owner's photo and nobody else's.
  const [shirt] = await rows(
    runtime,
    "SELECT id FROM items WHERE name = ?",
    "Navy Linen Shirt",
  );
  const photo = await runtime.fetch(`/photos/${shirt.id}`, { role: "owner" });
  expect(photo.status).toBe(200);
  expect(photo.headers.get("content-type")).toBe("image/png");
  expect(
    (await runtime.fetch(`/photos/${shirt.id}`, { role: "member" })).status,
  ).toBe(404);

  // F002: slots offer only their category; an outfit needs two items.
  await owner.goto("/outfits/new");
  await owner.getByTestId("slot-top").click();
  await expect(owner.getByRole("dialog").getByTestId("pick-item")).toHaveCount(
    1,
  );
  await owner.getByRole("dialog").getByTestId("pick-item").click();
  await owner.getByTestId("outfit-name").fill("Too small");
  await owner.getByTestId("save-outfit").click();
  await expect(owner.getByTestId("outfit-error")).toContainText("two items");

  await buildOutfit(owner, {
    name: "Monday meeting",
    occasion: "Work",
    picks: [
      ["top", "Navy Linen Shirt"],
      ["bottom", "Wide-Leg Trousers"],
      ["shoes", "White Leather Sneakers"],
      ["bag", "Tan Crossbody Bag"],
      ["accessories", "Gold Hoop Earrings"],
      ["accessories", "Silk Scarf"],
    ],
  });
  const meeting = owner
    .getByTestId("outfit-card")
    .filter({ hasText: "Monday meeting" });
  await expect(meeting.getByRole("img")).toHaveCount(6);
  await expect(meeting).toContainText("Hand-picked");
  await owner.getByTestId("occasion-weekend").click();
  await expect(owner.getByTestId("outfit-card")).toHaveCount(0);
  await owner.getByTestId("occasion-work").click();
  await expect(owner.getByTestId("outfit-card")).toHaveCount(1);

  // Deleting an item takes it out of the outfit.
  await owner.goto("/");
  await owner
    .getByTestId("item-card")
    .filter({ hasText: "Silk Scarf" })
    .click();
  await owner.getByRole("dialog").getByTestId("delete-item").click();
  await owner
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(owner.getByTestId("item-card")).toHaveCount(6);
  await expect(owner.getByTestId("wardrobe-value")).toContainText("$535.00");
  await owner.goto("/outfits");
  await expect(
    owner
      .getByTestId("outfit-card")
      .filter({ hasText: "Monday meeting" })
      .getByRole("img"),
  ).toHaveCount(5);

  // F003: the stylist answers from the member's own items; an unknown id is dropped.
  await owner.goto("/stylist");
  await owner
    .getByTestId("stylist-input")
    .fill("Dinner downtown on a mild evening, something polished");
  await owner.getByTestId("stylist-send").click();
  const suggestion = owner.getByTestId("suggestion").first();
  await expect(owner.getByTestId("chat-message").last()).toContainText(
    "light layers",
  );
  await expect(suggestion.getByRole("img")).toHaveCount(4);
  await suggestion.getByTestId("save-suggestion").click();
  await expect(suggestion.getByTestId("save-suggestion")).toHaveText("Saved");
  await owner.goto("/outfits");
  await expect(
    owner.getByTestId("outfit-card").filter({ hasText: "Downtown dinner" }),
  ).toContainText("Stylist");
  await owner.goto("/stylist");
  await expect(owner.getByTestId("chat-message")).toHaveCount(2);
  await owner.getByTestId("clear-chat").click();
  await owner
    .getByRole("alertdialog")
    .getByRole("button", { name: "Clear" })
    .click();
  await expect(owner.getByTestId("chat-message")).toHaveCount(0);

  // F004: share, then edit the outfit; the post keeps the photos it was shared with.
  await shareOutfit(owner, "Monday meeting", "Ready for the quarterly review");
  await owner.goto("/outfits");
  await owner
    .getByTestId("outfit-card")
    .filter({ hasText: "Monday meeting" })
    .getByRole("link")
    .first()
    .click();
  await owner
    .getByTestId("slot-accessories")
    .getByRole("button", { name: /Remove/ })
    .first()
    .click();
  await owner.getByTestId("save-outfit").click();
  await expect(
    owner
      .getByTestId("outfit-card")
      .filter({ hasText: "Monday meeting" })
      .getByRole("img"),
  ).toHaveCount(4);
  await owner.goto("/feed");
  const post = owner
    .getByTestId("post")
    .filter({ hasText: "Ready for the quarterly review" });
  await expect(post.getByTestId("post-photo")).toHaveCount(5);
  const postPhoto = await post
    .getByTestId("post-photo")
    .first()
    .getAttribute("src");
  expect((await runtime.fetch(postPhoto, { role: "member" })).status).toBe(200);

  // Another member likes and comments; the post author sees both.
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/feed");
  const seen = member
    .getByTestId("post")
    .filter({ hasText: "Ready for the quarterly review" });
  await expect(seen.getByTestId("post-author")).toContainText(
    "owner@example.test",
  );
  await expect(seen.getByTestId("delete-post")).toHaveCount(0);
  await seen.getByTestId("like-button").click();
  await expect(seen.getByTestId("like-count")).toHaveText("1");
  await seen.getByTestId("like-button").click();
  await expect(seen.getByTestId("like-count")).toHaveText("0");
  await seen.getByTestId("like-button").click();
  await expect(seen.getByTestId("like-count")).toHaveText("1");
  await seen
    .getByTestId("comment-input")
    .fill("The bag works so well with the trousers");
  await seen.getByTestId("comment-submit").click();
  await expect(seen.getByTestId("comment")).toContainText(
    "The bag works so well",
  );
  await seen.getByTestId("comment-input").fill("Typo, ignore");
  await seen.getByTestId("comment-submit").click();
  await seen
    .getByTestId("comment")
    .filter({ hasText: "Typo, ignore" })
    .getByTestId("delete-comment")
    .click();
  await expect(seen.getByTestId("comment")).toHaveCount(1);

  await owner.reload();
  await expect(post.getByTestId("like-count")).toHaveText("1");
  await expect(post.getByTestId("comment-count")).toHaveText("1");
  await expect(post.getByTestId("comment")).toContainText(
    "The bag works so well",
  );
  await runtime.screenshot(owner);

  // Phone-sized smoke.
  const phone = await (
    await runtime.context("member", {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await phone.goto("/feed");
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Feed");
  await expect(phone.getByTestId("post").first()).toBeVisible();
  await expect(phone.getByRole("link", { name: "Wardrobe" })).toBeVisible();
  const width = await phone.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(width).toBeLessThanOrEqual(390);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
