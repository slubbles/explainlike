import { test } from "node:test";
import assert from "node:assert/strict";
import { TURNSTILE_DUMMY_TOKEN, TURNSTILE_TEST_SECRET, verifyTurnstile } from "../lib/turnstile.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  return Promise.resolve(fn()).finally(restore);
}

const ENV = { EXPLANIMATE_TURNSTILE_SECRET: "secret", EXPLANIMATE_TURNSTILE_HOSTNAMES: "explanimate.co,www.explanimate.co" };

function siteverify(answer: Record<string, unknown> | Error) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init: init! });
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof fetch & { seen: typeof seen };
  fetchImpl.seen = seen;
  return fetchImpl;
}

test("a valid login token for a listed hostname passes, and posts secret, token and ip", async () => {
  await withEnv(ENV, async () => {
    const fetchImpl = siteverify({ success: true, action: "login", hostname: "explanimate.co" });
    assert.deepEqual(await verifyTurnstile("tok", "9.9.9.9", fetchImpl), { ok: true });
    assert.equal(fetchImpl.seen.length, 1);
    assert.equal(fetchImpl.seen[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams(String(fetchImpl.seen[0].init.body));
    assert.equal(body.get("secret"), "secret");
    assert.equal(body.get("response"), "tok");
    assert.equal(body.get("remoteip"), "9.9.9.9");
  });
});

test("a wrong action, a wrong hostname, or a failed check is rejected", async () => {
  await withEnv(ENV, async () => {
    for (const answer of [
      { success: true, action: "other", hostname: "explanimate.co" },
      { success: true, action: "login", hostname: "evil.example" },
      { success: false, action: "login", hostname: "explanimate.co" },
      {},
    ]) {
      const r = await verifyTurnstile("tok", "9.9.9.9", siteverify(answer));
      assert.deepEqual(r, { ok: false, error: "That check did not pass. Try again." }, JSON.stringify(answer));
    }
  });
});

test("a network error, a missing token, a missing secret, or no hostname list fails closed", async () => {
  await withEnv(ENV, async () => {
    const net = siteverify(new Error("down"));
    assert.deepEqual(await verifyTurnstile("tok", "9.9.9.9", net), { ok: false, error: "That check did not pass. Try again." });
    const unused = siteverify({ success: true, action: "login", hostname: "explanimate.co" });
    assert.deepEqual(await verifyTurnstile("", "9.9.9.9", unused), { ok: false, error: "That check did not pass. Try again." });
    assert.equal(unused.seen.length, 0, "no token, no call");
  });
  await withEnv(
    { EXPLANIMATE_TURNSTILE_SECRET: undefined, EXPLANIMATE_TURNSTILE_HOSTNAMES: "explanimate.co", NODE_ENV: "production" },
    async () => {
      const orig = console.error;
      console.error = () => {};
      const r = await verifyTurnstile("tok", "9.9.9.9", siteverify({ success: true, action: "login", hostname: "explanimate.co" }));
      console.error = orig;
      assert.deepEqual(r, { ok: false, error: "That check did not pass. Try again." });
    },
  );
  await withEnv({ EXPLANIMATE_TURNSTILE_SECRET: "secret", EXPLANIMATE_TURNSTILE_HOSTNAMES: undefined }, async () => {
    const r = await verifyTurnstile("tok", "9.9.9.9", siteverify({ success: true, action: "login", hostname: "explanimate.co" }));
    assert.deepEqual(r, { ok: false, error: "That check did not pass. Try again." }, "no list, nothing passes");
  });
});

test("outside production a missing secret skips the check with no network call", async () => {
  await withEnv(
    { EXPLANIMATE_TURNSTILE_SECRET: undefined, EXPLANIMATE_TURNSTILE_HOSTNAMES: undefined, NODE_ENV: "development" },
    async () => {
      const orig = console.warn;
      console.warn = () => {};
      try {
        const r = await verifyTurnstile("", "9.9.9.9", (() => assert.fail("must not call fetch")) as unknown as typeof fetch);
        assert.deepEqual(r, { ok: true });
      } finally {
        console.warn = orig;
      }
    },
  );
});

test("the documented test secret plus the dummy token passes with no network call", async () => {
  await withEnv({ EXPLANIMATE_TURNSTILE_SECRET: TURNSTILE_TEST_SECRET }, async () => {
    const r = await verifyTurnstile(TURNSTILE_DUMMY_TOKEN, "9.9.9.9", (() =>
      assert.fail("must not call fetch")) as unknown as typeof fetch);
    assert.deepEqual(r, { ok: true });
  });
  await withEnv({ EXPLANIMATE_TURNSTILE_SECRET: "secret" }, async () => {
    const r = await verifyTurnstile(TURNSTILE_DUMMY_TOKEN, "9.9.9.9", siteverify({ success: false }));
    assert.deepEqual(r, { ok: false, error: "That check did not pass. Try again." }, "the dummy token needs the test secret");
  });
});
