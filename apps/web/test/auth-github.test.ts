import { test } from "node:test";
import assert from "node:assert/strict";

// GitHub sign-in is offered only when both OAuth settings are set; the helper decides it
// and /api/auth-config reports it to the sign-in panel. No database here: signed out, the
// session check fails closed and the flag still comes through.
delete process.env.EXPLANIMATE_AUTH_ENABLED;
delete process.env.BETTER_AUTH_SECRET;
delete process.env.EXPLANIMATE_TURNSTILE_SITE_KEY;
delete process.env.GITHUB_CLIENT_ID;
delete process.env.GITHUB_CLIENT_SECRET;

const auth = () => import("../lib/auth.ts");
const authConfig = () => import("../app/api/auth-config/route.ts");

test.afterEach(() => {
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
  delete process.env.EXPLANIMATE_TURNSTILE_SITE_KEY;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
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

test("githubEnabled needs both settings, and blank counts as missing", async () => {
  const { githubEnabled } = await auth();
  assert.equal(githubEnabled("id", "secret"), true);
  assert.equal(githubEnabled(undefined, undefined), false);
  assert.equal(githubEnabled("id", undefined), false);
  assert.equal(githubEnabled(undefined, "secret"), false);
  assert.equal(githubEnabled("", "secret"), false);
  assert.equal(githubEnabled("id", ""), false);
  assert.equal(githubEnabled("  ", "secret"), false);
  assert.equal(githubEnabled("id", "  "), false);
});

test("flag off: auth-config reports no sign-in and no GitHub", async () => {
  const { GET } = await authConfig();
  assert.deepEqual(await (await GET(new Request("http://x/api/auth-config"))).json(), {
    enabled: false,
    google: false,
    github: false,
  });
});

test("flag on without the GitHub settings: github is false", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  process.env.EXPLANIMATE_TURNSTILE_SITE_KEY = "test-site-key";
  await quiet(async () => {
    const { GET } = await authConfig();
    const body = (await (await GET(new Request("http://x/api/auth-config"))).json()) as Record<string, unknown>;
    assert.deepEqual(body, {
      enabled: true,
      turnstileSiteKey: "test-site-key",
      user: null,
      videos: null,
      google: false,
      github: false,
    });
  });
});

test("flag on with both GitHub settings: github is true; one alone stays false", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  process.env.EXPLANIMATE_TURNSTILE_SITE_KEY = "test-site-key";
  await quiet(async () => {
    const { GET } = await authConfig();
    const githubOf = async () => ((await (await GET(new Request("http://x/api/auth-config"))).json()) as { github: unknown }).github;
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    assert.equal(await githubOf(), false);
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    assert.equal(await githubOf(), true);
    delete process.env.GITHUB_CLIENT_ID;
    assert.equal(await githubOf(), false);
  });
});

test("the auth instance offers the github provider only when both settings are set", async () => {
  const saved = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    EXPLANIMATE_D1_LOCAL_PATH: process.env.EXPLANIMATE_D1_LOCAL_PATH,
  };
  process.env.BETTER_AUTH_SECRET = "test-secret-for-github-wiring";
  process.env.EXPLANIMATE_D1_LOCAL_PATH = ":memory:";
  try {
    const { getAuth, resetAuthForTests } = await auth();
    const providersOf = () => {
      resetAuthForTests();
      const options = getAuth().options as { socialProviders?: Record<string, unknown> };
      return Object.keys(options.socialProviders ?? {}).sort();
    };
    assert.deepEqual(providersOf(), []);
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    assert.deepEqual(providersOf(), []);
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    assert.deepEqual(providersOf(), ["github"]);
    process.env.GOOGLE_CLIENT_ID = "test-google-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    assert.deepEqual(providersOf(), ["github", "google"]);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    (await auth()).resetAuthForTests();
  }
});
