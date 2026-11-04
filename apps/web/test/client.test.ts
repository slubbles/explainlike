import { test } from "node:test";
import assert from "node:assert/strict";
import { postJson } from "../lib/client.ts";

test("a rate limit without a retry-after reads as a minute, not 'a minute seconds'", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    const r = await postJson("/api/jobs", {});
    assert.equal(r.ok, false);
    assert.equal(r.error, "Too many requests. Wait a minute and try again.");
    globalThis.fetch = (async () => new Response("{}", { status: 429, headers: { "retry-after": "7" } })) as typeof fetch;
    const r2 = await postJson("/api/jobs", {});
    assert.equal(r2.ok, false);
    assert.equal(r2.error, "Too many requests. Wait 7 seconds and try again.");
  } finally {
    globalThis.fetch = realFetch;
  }
});
