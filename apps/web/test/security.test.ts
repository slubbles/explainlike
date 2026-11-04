import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrigin, contentSecurityPolicy, gaMeasurementId, securityHeaders } from "../lib/security.ts";
import fs from "node:fs";
import path from "node:path";
import { readBody } from "../lib/guard.ts";

test("the production build ships no browser source maps and stays minified", () => {
  const config = fs.readFileSync(path.join(import.meta.dirname, "../next.config.mjs"), "utf8");
  assert.match(config, /productionBrowserSourceMaps:\s*false/);
  assert.doesNotMatch(config, /swcMinify:\s*false|minimize:\s*false/);
});

test("every security header is present and non-empty", () => {
  const h = securityHeaders(contentSecurityPolicy("abc123"));
  assert.deepEqual(Object.keys(h).sort(), [
    "content-security-policy",
    "permissions-policy",
    "referrer-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
  ]);
  for (const [k, v] of Object.entries(h)) assert.ok(v.length > 0, k);
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(h["x-frame-options"], "DENY");
  assert.match(h["strict-transport-security"], /max-age=\d+/);
  assert.match(h["permissions-policy"], /microphone=\(self\)/);
  assert.match(h["permissions-policy"], /camera=\(\)/);
  assert.match(h["permissions-policy"], /geolocation=\(\)/);
});

test("the policy is self plus a nonce plus Turnstile, and frames nobody", () => {
  const csp = contentSecurityPolicy("abc123");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'nonce-abc123' https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, "no unsafe-inline for scripts");
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /connect-src[^;]*wss:\/\/api\.deepgram\.com/, "voice mode listens straight from the browser");
  assert.match(csp, /frame-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

test("the Google hosts join the policy only when a measurement id is set", () => {
  const saved = { next: process.env.NEXT_PUBLIC_GA_ID, legacy: process.env.GA_MEASUREMENT_ID };
  try {
    delete process.env.NEXT_PUBLIC_GA_ID;
    delete process.env.GA_MEASUREMENT_ID;
    assert.equal(gaMeasurementId(), undefined);
    assert.doesNotMatch(contentSecurityPolicy("n"), /google/, "unset: nothing from Google");
    process.env.GA_MEASUREMENT_ID = "  ";
    assert.equal(gaMeasurementId(), undefined);
    process.env.GA_MEASUREMENT_ID = "G-LEGACY";
    assert.equal(gaMeasurementId(), "G-LEGACY");
    process.env.NEXT_PUBLIC_GA_ID = "G-TEST123";
    assert.equal(gaMeasurementId(), "G-TEST123", "NEXT_PUBLIC_GA_ID wins when both are set");
    const csp = contentSecurityPolicy("n");
    assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/www\.google-analytics\.com/);
    assert.match(csp, /img-src[^;]*https:\/\/www\.google-analytics\.com/);
  } finally {
    if (saved.next === undefined) delete process.env.NEXT_PUBLIC_GA_ID;
    else process.env.NEXT_PUBLIC_GA_ID = saved.next;
    if (saved.legacy === undefined) delete process.env.GA_MEASUREMENT_ID;
    else process.env.GA_MEASUREMENT_ID = saved.legacy;
  }
});

const req = (origin?: string) =>
  new Request("http://x/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
  });

test("same-origin POSTs and non-browser clients pass; cross-origin POSTs get a 403", async () => {
  assert.equal(checkOrigin(req()), undefined, "no Origin header: curl and server-to-server pass");
  assert.equal(checkOrigin(req("http://x")), undefined);
  assert.equal(checkOrigin(req("HTTP://X:80")), undefined, "host comparison is case-insensitive");
  const evil = checkOrigin(req("https://evil.test"));
  assert.ok(evil && evil.status === 403);
  assert.deepEqual(await evil.json(), { error: "Cross-origin requests are not allowed." });
  const bad = checkOrigin(req("not a url"));
  assert.ok(bad && bad.status === 403);
});

test("a stated content type must be JSON", async () => {
  const plain = await readBody(new Request("http://x/", { method: "POST", headers: { "content-type": "text/plain" }, body: "message=hi" }));
  assert.ok("error" in plain && plain.error.status === 415);
  const form = await readBody(
    new Request("http://x/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=b" }),
  );
  assert.ok("error" in form && form.error.status === 415);
  const json = await readBody(
    new Request("http://x/", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: "{}" }),
  );
  assert.ok("body" in json);
  const vendor = await readBody(
    new Request("http://x/", { method: "POST", headers: { "content-type": "application/hal+json" }, body: "{}" }),
  );
  assert.ok("body" in vendor);
});
