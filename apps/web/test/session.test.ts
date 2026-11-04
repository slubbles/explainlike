import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

// one shared read of /api/auth-config plus the sign-out call, both plain fetch with no React,
// so this file runs anywhere fetch exists. The sign-out shape matters: the endpoint answers
// 415 to a POST without a JSON content type, which once left a sign-out button doing nothing.
const session = () => import("../lib/session");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A stub fetch answering `body` with `ok`, counting its calls and keeping the requests. */
function stub(body: unknown, ok = true) {
  let calls = 0;
  const seen: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls += 1;
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status: ok ? 200 : 429 });
  }) as typeof fetch;
  return { calls: () => calls, seen: () => seen };
}

test("components mounting together share one auth-config read", async () => {
  const { fetchAuthConfig } = await session();
  const s = stub({ enabled: true, user: null });
  const [a, b] = await Promise.all([fetchAuthConfig(), fetchAuthConfig()]);
  assert.equal(s.calls(), 1);
  assert.deepEqual(a, { enabled: true, user: null });
  assert.deepEqual(b, { enabled: true, user: null });
});

test("the next read after a settled one asks again, so sign-in and sign-out refresh", async () => {
  const { fetchAuthConfig } = await session();
  const s = stub({ enabled: true });
  await fetchAuthConfig();
  await fetchAuthConfig();
  assert.equal(s.calls(), 2);
});

test("a refused or failed read answers null instead of throwing", async () => {
  const { fetchAuthConfig } = await session();
  const s = stub({ error: "Too many requests." }, false);
  assert.equal(await fetchAuthConfig(), null);
  assert.equal(s.calls(), 1);
  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  assert.equal(await fetchAuthConfig(), null);
});

test("signing out posts JSON, which is what the endpoint accepts", async () => {
  const { signOut } = await session();
  const s = stub({});
  assert.equal(await signOut(), true);
  assert.equal(s.calls(), 1);
  const [req] = s.seen();
  assert.equal(req.url, "/api/auth/sign-out");
  assert.equal(req.init?.method, "POST");
  assert.equal((req.init?.headers as Record<string, string>)["content-type"], "application/json");
  assert.equal(req.init?.body, "{}");
});

test("signing out reports a refused or failed call instead of throwing", async () => {
  const { signOut } = await session();
  stub({}, false);
  assert.equal(await signOut(), false);
  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  assert.equal(await signOut(), false);
});
