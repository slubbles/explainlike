import { expect, test } from "@playwright/test";

test("a pasted link becomes a finished video", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Link or topic to explain").first().fill("https://github.com/karpathy/micrograd");
  await page
    .getByRole("button", { name: /Explain it/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\?job=[a-z0-9]+/);
  // the stand-in pipeline finishes in about a second; the result shows the video and a download
  await expect(page.getByRole("link", { name: "Download mp4" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("A stand-in explainer").first()).toBeVisible();
  const href = await page.getByRole("link", { name: "Download mp4" }).getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("video/mp4");
});

test("a reopened job link shows the same result", async ({ page, request }) => {
  const res = await request.post("/api/jobs", {
    data: { input: "how DNS works", voice: "silent" },
    headers: { origin: test.info().project.use.baseURL! },
  });
  expect(res.ok()).toBe(true);
  const { id } = await res.json();
  await page.goto(`/?job=${id}`);
  await expect(page.getByRole("link", { name: "Download mp4" })).toBeVisible({ timeout: 15_000 });
});

test("a failed render says so instead of spinning forever", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Link or topic to explain").first().fill("https://example.com/fail-on-purpose");
  await page
    .getByRole("button", { name: /Explain it/ })
    .first()
    .click();
  await expect(page.getByText(/failed on purpose|went wrong|failed/i).first()).toBeVisible({ timeout: 15_000 });
});

test("bad input is refused with a plain message", async ({ request }) => {
  const res = await request.post("/api/jobs", { data: { input: "" }, headers: { origin: test.info().project.use.baseURL! } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/Paste a GitHub repo/);
});

test("cross-site job requests are refused", async ({ request }) => {
  const res = await request.post("/api/jobs", {
    data: { input: "how DNS works" },
    headers: { origin: "https://evil.example" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test("nobody can list other visitors' jobs or see server paths", async ({ request }) => {
  const res = await request.post("/api/jobs", {
    data: { input: "how TLS works", voice: "silent" },
    headers: { origin: test.info().project.use.baseURL! },
  });
  const { id } = await res.json();
  const all = await request.get("/api/jobs");
  expect(await all.json()).toEqual([]);
  expect(all.headers()["cache-control"]).toContain("no-store");
  const clips = await request.get(`/api/jobs?parent=${id}`);
  expect(await clips.json()).toEqual([]);
  const job = await request.get(`/api/jobs/${id}`);
  const body = await job.json();
  expect(body.id).toBe(id);
  expect(body.args).toBeUndefined();
  expect(JSON.stringify(body)).not.toMatch(/\/tmp\/|\/data\/|\/home\//);
});
