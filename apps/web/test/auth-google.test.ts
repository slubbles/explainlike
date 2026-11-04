import { test } from "node:test";
import assert from "node:assert/strict";

// Google sign-in is offered only when both OAuth settings are set; the helper decides it
// and /api/auth-config reports it to the sign-in panel. No database here: signed out, the
// session check fails closed and the flag still comes through.
delete process.env.EXPLANIMATE_AUTH_ENABLED;
delete process.env.BETTER_AUTH_SECRET;
delete process.env.EXPLANIMATE_TURNSTILE_SITE_KEY;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

const auth = () => import("../lib/auth.ts");
const authConfig = () => import("../app/api/auth-config/route.ts");

test.afterEach(() => {
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
  delete process.env.EXPLANIMATE_TURNSTILE_SITE_KEY;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

/** The signed-out path logs why the session check failed; keep the test output quiet. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

test("googleEnabled needs both settings, and blank counts as missing", async () => {
  const { googleEnabled } = await auth();
  assert.equal(googleEnabled("id", "secret"), true);
  assert.equal(googleEnabled(undefined, undefined), false);
  assert.equal(googleEnabled("id", undefined), false);
  assert.equal(googleEnabled(undefined, "secret"), false);
  assert.equal(googleEnabled("", "secret"), false);
  assert.equal(googleEnabled("id", ""), false);
  assert.equal(googleEnabled("  ", "secret"), false);
  assert.equal(googleEnabled("id", "  "), false);
});

test("flag off: auth-config reports no sign-in and no Google", async () => {
  const { GET } = await authConfig();
  assert.deepEqual(await (await GET(new Request("http://x/api/auth-config"))).json(), { enabled: false, google: false });
});

test("flag on without the Google settings: google is false", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  process.env.EXPLANIMATE_TURNSTILE_SITE_KEY = "test-site-key";
  await quiet(async () => {
    const { GET } = await authConfig();
    const body = (await (await GET(new Request("http://x/api/auth-config"))).json()) as Record<string, unknown>;
    assert.deepEqual(body, { enabled: true, turnstileSiteKey: "test-site-key", user: null, videos: null, google: false });
  });
});

test("flag on with both Google settings: google is true; one alone stays false", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  process.env.EXPLANIMATE_TURNSTILE_SITE_KEY = "test-site-key";
  await quiet(async () => {
    const { GET } = await authConfig();
    const googleOf = async () => ((await (await GET(new Request("http://x/api/auth-config"))).json()) as { google: unknown }).google;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    assert.equal(await googleOf(), false);
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    assert.equal(await googleOf(), true);
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal(await googleOf(), false);
  });
});
