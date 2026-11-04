import { expect, test } from "@playwright/test";

// Signed out (and with sign-in off, as here) the admin portal must not exist: 404, never 403.
test("the admin page is a plain 404 to a visitor", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  await expect(page.getByText(/users|spend/i)).toHaveCount(0);
});

for (const route of ["users", "videos", "usage", "spend", "errors", "health"]) {
  test(`/api/admin/${route} is a 404 to a visitor`, async ({ request }) => {
    const res = await request.get(`/api/admin/${route}`);
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toMatch(/@|spent|email/i);
  });
}

test("a visitor cannot change a limit", async ({ request, baseURL }) => {
  const res = await request.post("/api/admin/limits", {
    data: { email: "someone@example.com", limit: 999 },
    headers: { origin: baseURL! },
  });
  expect(res.status()).toBe(404);
});
