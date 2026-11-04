import { expect, test } from "@playwright/test";

/** Every public page loads without script errors and without sideways scrolling. */
for (const route of ["/", "/gallery", "/docs"]) {
  test(`${route} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("security headers are on every page", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-powered-by"]).toBeUndefined();
  expect(h["content-security-policy"]).toContain("script-src");
  expect(h["x-content-type-options"]).toBe("nosniff");
});

test("the landing page explains the product and links the docs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Explained in a video");
  await expect(page.getByLabel("Link or topic to explain").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watch your video draw itself." })).toBeVisible();
  // on phones the nav links hide behind the menu button
  const docs = page.locator("nav.nav").getByRole("link", { name: "Docs" });
  if (!(await docs.isVisible())) await page.getByRole("button", { name: "Menu" }).click();
  await docs.click();
  await expect(page).toHaveURL(/\/docs$/);
});

test("the docs page has copy-paste MCP setup", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByText("/explanimate").first()).toBeVisible();
  await expect(page.locator("pre, code").first()).toBeVisible();
});

test("unknown pages return 404", async ({ request }) => {
  expect((await request.get("/no-such-page")).status()).toBe(404);
});
