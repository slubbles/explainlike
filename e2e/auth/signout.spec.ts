import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail, uniqueIp } from "./helpers";

// the nav's Sign out button must really end the session: Better Auth answers 415 to a
// POST with no JSON content type, which once left the button doing nothing.
test("Sign out in the nav ends the session and shows Sign in again", async ({ page, baseURL }) => {
  const email = uniqueEmail();
  await signIn(page.context().request, baseURL!, email, uniqueIp());
  await page.goto("/");
  const out = page.getByRole("button", { name: "Sign out" });
  await expect(out).toBeVisible();
  const res = page.waitForResponse("**/api/auth/sign-out");
  await out.click();
  expect((await res).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});
