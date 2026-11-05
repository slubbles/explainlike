import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { signinRedirect } from "../lib/appuser.ts";

test("a signed-out deep link returns to the same /app page after sign-in", () => {
  assert.equal(signinRedirect("/app/videos"), "/signin?next=%2Fapp%2Fvideos");
  assert.equal(signinRedirect("/app/new?prompt=dns"), "/signin?next=%2Fapp%2Fnew%3Fprompt%3Ddns");
  assert.equal(signinRedirect("/app"), "/signin?next=%2Fapp");
  assert.equal(signinRedirect(null), "/signin?next=%2Fapp");
  assert.equal(signinRedirect("//evil.com"), "/signin?next=%2Fapp");
  assert.equal(signinRedirect("/pricing"), "/signin?next=%2Fapp");
});

test("the sign-in form has plain-English code errors, a resend and no admin wording", () => {
  const src = fs.readFileSync(new URL("../components/SignIn.tsx", import.meta.url), "utf8");
  assert.match(src, /INVALID_OTP: "That code isn't right\. Check the email and try again\."/);
  assert.match(src, /OTP_EXPIRED: "That code has expired/);
  assert.match(src, /Resend code/);
  assert.doesNotMatch(src, /admin|unlimited/i);
});
