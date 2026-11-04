import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const WIDTHS = [1440, 1024, 768, 390, 345];
const ROUTES = ["/", "/docs", "/gallery", "/admin", "/no-such-page"];

/** The page never scrolls sideways: the widest box fits the viewport (1px for rounding). */
async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return Math.max(de.scrollWidth, body ? body.scrollWidth : 0) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

interface NavBox {
  ok: boolean;
  vw: number;
  navLeft: number;
  navRight: number;
  links: { left: number; right: number; visible: boolean }[];
}

/** Every visible nav link sits fully inside the viewport, never cut off at the edge. */
async function expectNavUnclipped(page: Page) {
  await expect(page.locator("nav.nav")).toBeVisible();
  const box = (await page.evaluate((): NavBox => {
    const nav = document.querySelector("nav.nav");
    if (!nav) return { ok: false, vw: 0, navLeft: 0, navRight: 0, links: [] };
    const vw = window.innerWidth;
    const r = nav.getBoundingClientRect();
    const links = Array.from(nav.querySelectorAll("a, button")).map((el) => {
      const b = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = style.display !== "none" && style.visibility !== "hidden" && b.width > 0 && b.height > 0;
      return { left: b.left, right: b.right, visible };
    });
    return { ok: true, vw, navLeft: r.left, navRight: r.right, links };
  })) as NavBox;
  expect(box.ok).toBe(true);
  expect(box.navLeft).toBeGreaterThanOrEqual(-1);
  expect(box.navRight).toBeLessThanOrEqual(box.vw + 1);
  for (const l of box.links) {
    if (!l.visible) continue;
    expect(l.left).toBeGreaterThanOrEqual(-1);
    expect(l.right).toBeLessThanOrEqual(box.vw + 1);
  }
}

async function makeDoneJobId(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post("/api/jobs", {
    data: { input: "how DNS works", voice: "silent" },
    headers: { origin: baseURL },
  });
  expect(res.ok()).toBe(true);
  const { id } = (await res.json()) as { id: string };
  return id;
}

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`${route} fits ${width}px without sideways scroll or a clipped nav`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const res = await page.goto(route);
      if (route === "/admin" || route === "/no-such-page") expect(res?.status()).toBe(404);
      else expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoOverflow(page);
      await expectNavUnclipped(page);
    });
  }

  test(`a finished result fits ${width}px without sideways scroll or a clipped nav`, async ({ page, request, baseURL }) => {
    const id = await makeDoneJobId(request, baseURL!);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?job=${id}`);
    await expect(page.getByRole("link", { name: "Download mp4" })).toBeVisible({ timeout: 15_000 });
    await expectNoOverflow(page);
    await expectNavUnclipped(page);
  });
}
