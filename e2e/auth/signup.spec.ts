import { expect, test } from "@playwright/test";
import { createVideo, readOtp, requestCode, signIn, uniqueEmail, uniqueIp, verifyCode } from "./helpers";

test("requesting a code captures a 6-digit email", async ({ request, baseURL }) => {
  const email = uniqueEmail();
  const res = await requestCode(request, baseURL!, email, uniqueIp());
  expect(res.ok()).toBe(true);
  expect(await readOtp(baseURL!, email)).toMatch(/^\d{6}$/);
});

test("a wrong code is rejected", async ({ request, baseURL }) => {
  const email = uniqueEmail();
  const ip = uniqueIp();
  expect((await requestCode(request, baseURL!, email, ip)).ok()).toBe(true);
  const real = await readOtp(baseURL!, email);
  const wrong = real === "000000" ? "000001" : "000000";
  const res = await verifyCode(request, baseURL!, email, wrong, ip);
  expect(res.ok()).toBe(false);
  expect(res.status()).toBeGreaterThanOrEqual(400);
  const config = await request.get("/api/auth-config");
  expect(((await config.json()) as { user: unknown }).user).toBeNull();
});

test("the right code signs in", async ({ request, baseURL }) => {
  const email = uniqueEmail();
  await signIn(request, baseURL!, email, uniqueIp());
  const config = await request.get("/api/auth-config");
  const body = (await config.json()) as { user: { email: string } | null; videos: { used: number; limit: number } | null };
  expect(body.user?.email).toBe(email);
  expect(body.videos).toMatchObject({ used: 0, limit: 3 });
});

test("signing in through the page shows who is signed in", async ({ page, baseURL }) => {
  const email = uniqueEmail();
  await signIn(page.request, baseURL!, email, uniqueIp());
  await page.goto("/");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByText("3 of 3 videos left today").first()).toBeVisible();
});

test("a long address truncates without clipping Sign out", async ({ page, baseURL }) => {
  const email = `e2e-truncation-${Date.now()}-${"x".repeat(20)}@example.com`;
  await signIn(page.request, baseURL!, email, uniqueIp());
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // the address ellipsizes, so this page really exercises the truncation
  const truncated = await page.locator(".navuser .who").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(truncated).toBe(true);
  const boxes = await page.evaluate(() => {
    const u = document.querySelector(".navuser")!.getBoundingClientRect();
    const b = document.querySelector(".navout")!.getBoundingClientRect();
    return { u: u.toJSON(), b: b.toJSON(), vw: window.innerWidth };
  });
  expect(boxes.b.left).toBeGreaterThanOrEqual(boxes.u.left - 1);
  expect(boxes.b.right).toBeLessThanOrEqual(boxes.u.right + 1);
  expect(boxes.b.right).toBeLessThanOrEqual(boxes.vw + 1);
});

test("a signed-out user cannot create a video but can browse the gallery", async ({ request, page, baseURL }) => {
  const res = await createVideo(request, baseURL!, "how DNS works", uniqueIp());
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toBe("Sign in to make a video.");

  const gallery = await page.goto("/gallery");
  expect(gallery?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Play E2E sample video" })).toBeVisible();
  const api = await request.get("/api/gallery");
  expect(api.ok()).toBe(true);
  expect(((await api.json()) as { videos: unknown[] }).videos.length).toBeGreaterThan(0);
});
