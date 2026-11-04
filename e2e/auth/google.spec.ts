import { expect, test, type Page } from "@playwright/test";

// the sign-in panel offers Google only when the server says so. The auth servers run
// without Google settings, so the live answer covers "off" and a routed answer "on".
// Phone width: the button and divider must fit at 390px.
test.use({ viewport: { width: 390, height: 844 } });

async function openSignin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
}

test("the Google button is hidden when Google sign-in is off", async ({ page }) => {
  await openSignin(page);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
});

test("the Google button shows above the email box when Google sign-in is on", async ({ page }) => {
  await page.route("**/api/auth-config", (r) =>
    r.fulfill({
      json: { enabled: true, turnstileSiteKey: "1x00000000000000000000AA", user: null, videos: null, google: true },
    }),
  );
  await openSignin(page);
  const panel = page.getByRole("dialog", { name: "Sign in" });
  const google = panel.getByRole("button", { name: "Continue with Google" });
  const email = panel.getByPlaceholder("you@example.com");
  await expect(google).toBeVisible();
  await expect(email).toBeVisible();
  await expect(panel.getByText("or", { exact: true })).toBeVisible();
  const box = (el: typeof google) => el.evaluate((b) => b.getBoundingClientRect().toJSON());
  expect((await box(google)).bottom).toBeLessThan((await box(email)).top);
});
