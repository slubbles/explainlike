import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POLL_TIMEOUT_MS, RECONNECT_AFTER_FAILURES, pollDelay, postJson, retryAfterMs } from "../lib/client.ts";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

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

test("a failed job poll waits 3 s first, then backs off to 15 s", () => {
  assert.equal(pollDelay(1), 3000);
  assert.equal(pollDelay(2), 6000);
  assert.equal(pollDelay(3), 12000);
  assert.equal(pollDelay(4), 15000);
  assert.equal(pollDelay(10), 15000);
});

test("the job poll keeps going through failures instead of failing the page", () => {
  assert.equal(POLL_TIMEOUT_MS, 15_000);
  assert.equal(RECONNECT_AFTER_FAILURES, 3);
  const s = src("lib/client.ts");
  assert.match(s, /new AbortController\(\)/, "each poll can time out");
  assert.match(s, /POLL_TIMEOUT_MS/, "the timeout is about 15 s");
  assert.match(s, /reconnecting/, "a reconnecting flag is exposed");
  assert.match(s, /setTimeout\(poll, pollDelay\(failures\)\)/, "failed polls back off and retry");
  assert.match(s, /status === 404/, "only a 404 ends the loop besides done or error");
  assert.match(s, /setReconnecting\(false\)/, "a good poll clears the reconnecting state");
  assert.doesNotMatch(s, /MAX_POLL_FAILURES/, "no give-up limit replaces the job anymore");
  assert.doesNotMatch(s, /stopped answering/, "no fake failure replaces the last job state");
  assert.doesNotMatch(s, /Reload the page to keep watching/, "the page never asks for a reload to keep watching");
});

test("a reconnecting page keeps the last job and says so in a muted line", () => {
  const steps = src("components/Steps.tsx");
  assert.match(steps, /reconnecting\?: boolean/, "the progress card takes the reconnecting flag");
  assert.match(steps, /Reconnecting to the server\.\.\./, "the progress card shows the reconnecting line");
  const workspace = src("app/app/components/VideoWorkspace.tsx");
  assert.match(workspace, /\{ job, reconnecting \} = useJob\(jobId\)/, "the video page reads the flag");
  assert.match(workspace, /reconnecting=\{reconnecting\}/, "the flag reaches the progress card");
  assert.match(workspace, /Reconnecting to the server\.\.\./, "no job yet still shows the line instead of an error");
});

test("a rate-limited poll waits out Retry-After and does not flag reconnecting", () => {
  assert.equal(retryAfterMs("7"), 7000);
  assert.equal(retryAfterMs("0.2"), 1000);
  assert.equal(retryAfterMs("600"), 30_000);
  assert.equal(retryAfterMs(null), 5000);
  assert.equal(retryAfterMs("soon"), 5000);
  const s = src("lib/client.ts");
  assert.match(s, /status === 429\) \{\s*timer = setTimeout\(poll, retryAfterMs/, "a 429 reschedules without failed()");
});
