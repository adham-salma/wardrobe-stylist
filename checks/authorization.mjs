// Who may see and change what: the Gateway's perimeter, private wardrobes and
// outfits, and the feed's author and admin rules. X001: no sign-in of its own.
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { addItem, buildOutfit, forgeNext, rows, shareOutfit } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess([
    "/",
    "/outfits",
    "/outfits/new",
    "/stylist",
    "/feed",
    "/health",
  ]);

  // The app serves no sign-in of its own (X001).
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout"]) {
    const anonymous = await runtime.fetch(path);
    expect([401, 403]).toContain(anonymous.status);
    const signedIn = await runtime.fetch(path, { role: "member" });
    expect(signedIn.status).toBe(404);
  }
  const home = await (await runtime.fetch("/", { role: "member" })).text();
  expect(home).not.toMatch(/type="password"|Sign in|Log in/i);

  const owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/");
  await addItem(owner, {
    name: "Owner Blazer",
    category: "Outerwear",
    price: 150,
    shape: "outerwear",
    fill: "#222244",
  });
  await addItem(owner, {
    name: "Owner Loafers",
    category: "Shoes",
    price: 90,
    shape: "shoes",
    fill: "#5a3a22",
  });
  await buildOutfit(owner, {
    name: "Owner office look",
    occasion: "Work",
    picks: [
      ["outerwear", "Owner Blazer"],
      ["shoes", "Owner Loafers"],
    ],
  });
  await shareOutfit(owner, "Owner office look", "Owner post caption");
  const [blazer] = await rows(
    runtime,
    "SELECT id FROM items WHERE name = ?",
    "Owner Blazer",
  );
  const [ownerOutfit] = await rows(
    runtime,
    "SELECT id FROM outfits WHERE name = ?",
    "Owner office look",
  );
  const [ownerPost] = await rows(
    runtime,
    "SELECT id FROM posts WHERE caption = ?",
    "Owner post caption",
  );

  // Anonymous and outsiders can't reach photos.
  expect([401, 403]).toContain(
    (await runtime.fetch(`/photos/${blazer.id}`)).status,
  );
  expect([401, 403]).toContain(
    (await runtime.fetch(`/photos/${blazer.id}`, { role: "outsider" })).status,
  );

  // Another member sees none of the owner's wardrobe or outfits.
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  await expect(member.getByTestId("wardrobe-count")).toContainText("0");
  await expect(member.getByText("Owner Blazer")).toHaveCount(0);
  await member.goto("/outfits");
  await expect(member.getByText("Owner office look")).toHaveCount(0);
  await member.goto(`/outfits/${ownerOutfit.id}`);
  await expect(member.getByTestId("not-found")).toBeVisible();
  await expect(member.getByText("Owner Blazer")).toHaveCount(0);
  expect(
    (await runtime.fetch(`/photos/${blazer.id}`, { role: "member" })).status,
  ).toBe(404);

  // A forged delete of the owner's item, sent as the member, changes nothing.
  await member.goto("/");
  await addItem(member, {
    name: "Member Tee",
    category: "Tops",
    price: 20,
    shape: "top",
    fill: "#7a9a5a",
  });
  await addItem(member, {
    name: "Member Jeans",
    category: "Bottoms",
    price: 70,
    shape: "bottom",
    fill: "#2a4a7a",
  });
  const [tee] = await rows(
    runtime,
    "SELECT id FROM items WHERE name = ?",
    "Member Tee",
  );
  await forgeNext(member, tee.id, blazer.id);
  await member
    .getByTestId("item-card")
    .filter({ hasText: "Member Tee" })
    .click();
  await member.getByRole("dialog").getByTestId("delete-item").click();
  await member
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await member.waitForTimeout(500);
  expect(
    await rows(runtime, "SELECT id FROM items WHERE id = ?", blazer.id),
  ).toHaveLength(1);
  expect(
    await rows(
      runtime,
      "SELECT id FROM outfit_items WHERE item_id = ?",
      blazer.id,
    ),
  ).toHaveLength(1);

  // A forged outfit holding the owner's item is refused.
  await member.goto("/");
  await buildOutfit(member, {
    name: "Member weekend",
    occasion: "Weekend",
    picks: [
      ["top", "Member Tee"],
      ["bottom", "Member Jeans"],
    ],
  });
  const [memberOutfit] = await rows(
    runtime,
    "SELECT id FROM outfits WHERE name = ?",
    "Member weekend",
  );
  await member.goto(`/outfits/${memberOutfit.id}`);
  await forgeNext(member, tee.id, blazer.id);
  await member.getByTestId("outfit-name").fill("Member weekend v2");
  await member.getByTestId("save-outfit").click();
  await expect(member.getByTestId("outfit-error")).toBeVisible();
  expect(
    await rows(
      runtime,
      "SELECT id FROM outfit_items WHERE outfit_id = ? AND item_id = ?",
      memberOutfit.id,
      blazer.id,
    ),
  ).toHaveLength(0);
  // ...and so is a forged share of the owner's outfit.
  await member.goto(`/outfits/${memberOutfit.id}`);
  await forgeNext(member, memberOutfit.id, ownerOutfit.id);
  await member.getByTestId("share-outfit").click();
  await member.getByTestId("share-caption").fill("Forged share");
  await member.getByTestId("share-submit").click();
  await expect(member.getByTestId("share-error")).toBeVisible();
  expect(
    await rows(
      runtime,
      "SELECT id FROM posts WHERE caption = ?",
      "Forged share",
    ),
  ).toHaveLength(0);

  // Feed: the member can't delete the owner's post or comment, even forged.
  await shareOutfit(member, "Member weekend", "Member post caption");
  await member.goto("/feed");
  const ownerPostCard = member
    .getByTestId("post")
    .filter({ hasText: "Owner post caption" });
  await expect(ownerPostCard.getByTestId("delete-post")).toHaveCount(0);
  const [memberPost] = await rows(
    runtime,
    "SELECT id FROM posts WHERE caption = ?",
    "Member post caption",
  );
  await forgeNext(member, memberPost.id, ownerPost.id);
  const memberPostCard = member
    .getByTestId("post")
    .filter({ hasText: "Member post caption" });
  await memberPostCard.getByTestId("delete-post").click();
  await member
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await member.waitForTimeout(500);
  expect(
    await rows(runtime, "SELECT id FROM posts WHERE id = ?", ownerPost.id),
  ).toHaveLength(1);

  await owner.goto("/feed");
  const ownerSide = owner
    .getByTestId("post")
    .filter({ hasText: "Owner post caption" });
  await ownerSide.getByTestId("comment-input").fill("Owner's own note");
  await ownerSide.getByTestId("comment-submit").click();
  await expect(ownerSide.getByTestId("comment")).toHaveCount(1);
  const [ownerComment] = await rows(
    runtime,
    "SELECT id FROM comments WHERE body = ?",
    "Owner's own note",
  );
  await member.goto("/feed");
  await expect(
    ownerPostCard.getByTestId("comment").getByTestId("delete-comment"),
  ).toHaveCount(0);
  await ownerPostCard.getByTestId("comment-input").fill("Member note");
  await ownerPostCard.getByTestId("comment-submit").click();
  await expect(ownerPostCard.getByTestId("comment")).toHaveCount(2);
  const [memberComment] = await rows(
    runtime,
    "SELECT id FROM comments WHERE body = ?",
    "Member note",
  );
  await forgeNext(member, memberComment.id, ownerComment.id);
  await ownerPostCard
    .getByTestId("comment")
    .filter({ hasText: "Member note" })
    .getByTestId("delete-comment")
    .click();
  await member.waitForTimeout(500);
  expect(
    await rows(
      runtime,
      "SELECT id FROM comments WHERE id = ?",
      ownerComment.id,
    ),
  ).toHaveLength(1);

  // The post author removes a comment on their post; the admin removes another member's post.
  await owner.goto("/feed");
  await ownerSide
    .getByTestId("comment")
    .filter({ hasText: "Member note" })
    .getByTestId("delete-comment")
    .click();
  await expect(
    ownerSide.getByTestId("comment").filter({ hasText: "Member note" }),
  ).toHaveCount(0);
  const memberSide = owner
    .getByTestId("post")
    .filter({ hasText: "Member post caption" });
  await memberSide.getByTestId("delete-post").click();
  await owner
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(
    owner.getByTestId("post").filter({ hasText: "Member post caption" }),
  ).toHaveCount(0);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
