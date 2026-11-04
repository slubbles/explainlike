import { expect, test } from "@playwright/test";

test("gallery cards show a real frame and play in place", async ({ page }) => {
  await page.goto("/gallery");
  const card = page.getByRole("button", { name: "Play E2E sample video" });
  await expect(card).toBeVisible();
  // the poster really loaded (an empty thumbnail on phones was a past bug)
  const poster = card.locator("img");
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await card.click();
  const video = page.getByLabel("E2E sample video", { exact: true });
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
});

test("an entry without a poster still shows a video frame", async ({ page }) => {
  await page.goto("/gallery");
  const card = page.getByRole("button", { name: "Play E2E sample without a poster" });
  await card.scrollIntoViewIfNeeded();
  const v = card.locator("video");
  await expect(v).toBeAttached();
  await expect.poll(() => v.evaluate((x: HTMLVideoElement) => x.readyState)).toBeGreaterThan(0);
});

test("gallery API only serves files from the manifest", async ({ request }) => {
  const list = await (await request.get("/api/gallery")).json();
  expect(list.videos.map((v: { id: string }) => v.id)).toEqual(["e2e-sample", "e2e-no-poster"]);
  expect((await request.get("/api/gallery/sample.jpg")).status()).toBe(200);
  expect((await request.get("/api/gallery/gallery.json")).status()).toBe(404);
  expect((await request.get("/api/gallery/..%2F..%2Fpackage.json")).status()).toBe(404);
});
