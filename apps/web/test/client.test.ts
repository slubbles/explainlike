import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAX_POLL_FAILURES, postJson } from "../lib/client.ts";

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

test("the job poll gives up with a reload prompt instead of loading forever", () => {
  assert.equal(MAX_POLL_FAILURES, 10);
  const s = fs.readFileSync(path.join(import.meta.dirname, "../lib/client.ts"), "utf8");
  assert.match(s, /failures > MAX_POLL_FAILURES/);
  assert.match(s, /Reload the page to keep watching/);
});
