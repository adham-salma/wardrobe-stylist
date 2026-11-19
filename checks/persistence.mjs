// Wardrobe, outfits, feed and chat survive a restart; with no AI provider the
// stylist and Auto-fill say how to set it up and the rest keeps working.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { addItem, buildOutfit, makePhoto, rows, shareOutfit } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const page = await (await runtime.context("owner")).newPage();
  await page.goto("/");
  await addItem(page, {
    name: "Striped Breton Top",
    category: "Tops",
    price: 40,
    shape: "top",
    fill: "#20304a",
  });
  await addItem(page, {
    name: "Linen Shorts",
    category: "Bottoms",
    price: 35,
    shape: "bottom",
    fill: "#d9c9a8",
  });

  await page.getByTestId("add-item").click();
  await page
    .getByRole("dialog")
    .getByTestId("item-photo")
    .setInputFiles(await makePhoto(page, "bag", "#333333"));
  await page.getByRole("dialog").getByTestId("autofill").click();
  await expect(
    page.getByRole("dialog").getByTestId("autofill-off"),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await buildOutfit(page, {
    name: "Beach day",
    occasion: "Travel",
    picks: [
      ["top", "Striped Breton Top"],
      ["bottom", "Linen Shorts"],
    ],
  });
  await shareOutfit(page, "Beach day", "Packed for the coast");

  await page.goto("/stylist");
  await page.getByTestId("stylist-input").fill("A warm day by the sea");
  await page.getByTestId("stylist-send").click();
  await expect(page.getByTestId("ai-off")).toBeVisible();
  await expect(page.getByTestId("chat-message")).toHaveCount(0);

  await runtime.restart();

  await page.goto("/");
  await expect(page.getByTestId("item-card")).toHaveCount(2);
  await expect(page.getByTestId("wardrobe-value")).toContainText("$75.00");
  const [top] = await rows(
    runtime,
    "SELECT id FROM items WHERE name = ?",
    "Striped Breton Top",
  );
  const photo = await runtime.fetch(`/photos/${top.id}`, { role: "owner" });
  expect(photo.status).toBe(200);
  expect((await photo.arrayBuffer()).byteLength).toBeGreaterThan(100);
  await page.goto("/outfits");
  await expect(
    page
      .getByTestId("outfit-card")
      .filter({ hasText: "Beach day" })
      .getByRole("img"),
  ).toHaveCount(2);
  await page.goto("/feed");
  await expect(
    page
      .getByTestId("post")
      .filter({ hasText: "Packed for the coast" })
      .getByTestId("post-photo"),
  ).toHaveCount(2);
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
