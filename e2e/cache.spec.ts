import { expect, test } from "@playwright/test";

const IMMUTABLE = "public, max-age=31536000, immutable";

for (const route of ["/", "/docs", "/gallery", "/admin", "/no-such-page"]) {
  test(`${route} sends no-store so the edge never shares HTML`, async ({ request }) => {
    const res = await request.get(route);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
}

for (const route of ["/api/health", "/api/gallery", "/api/jobs", "/api/auth-config", "/api/runtime-config"]) {
  test(`${route} sends no-store`, async ({ request }) => {
    const res = await request.get(route);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
}

for (const file of ["/og.png", "/hero.jpg", "/api/gallery/sample.jpg"]) {
  test(`${file} caches for a year`, async ({ request }) => {
    const res = await request.get(file);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe(IMMUTABLE);
  });
}

test("the Next build output caches for a year", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const m = html.match(/\/_next\/static\/[^"']+\.js/);
  expect(m).not.toBeNull();
  const res = await request.get(m![0]);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe(IMMUTABLE);
});
