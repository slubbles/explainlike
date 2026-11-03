import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHealth, type Probe } from "../lib/health.ts";

const probe = (o: Partial<Probe> & { env?: NodeJS.ProcessEnv } = {}): Probe => ({
  env: { MODEL_API_KEY: "secret-model-key", DEEPGRAM_API_KEY: "secret-voice-key" },
  has: (f) => f === "/usr/bin/chromium",
  runs: () => true,
  writable: () => true,
  ...o,
});

test("a server with ffmpeg, Chrome, the Meta key and a writable disk is healthy, and no key value leaks", () => {
  const h = checkHealth("/jobs", true, probe());
  assert.equal(h.ok, true);
  assert.deepEqual(h.checks, { ffmpeg: true, chrome: true, modelKey: true, voiceKey: true, jobsDir: true });
  assert.equal(h.paused, false);
  assert.doesNotMatch(JSON.stringify(h), /secret/);
});

test("each missing piece fails the check with a plain reason; a missing voice key does not", () => {
  const h = checkHealth("/jobs", true, probe({ env: {}, has: () => false, runs: () => false, writable: () => false }));
  assert.equal(h.ok, false);
  assert.equal(h.problems.length, 4);
  assert.match(h.problems.join(" "), /ffmpeg.*Chrome.*MODEL_API_KEY.*jobs folder/);
  assert.equal(checkHealth("/jobs", true, probe({ env: { MODEL_API_KEY: "k" } })).ok, true);
});

test("demo-only mode or a spent cap reads as paused, not unhealthy", () => {
  assert.deepEqual([checkHealth("/j", false, probe()).ok, checkHealth("/j", false, probe()).paused], [true, true]);
  const demo = checkHealth("/j", true, probe({ env: { MODEL_API_KEY: "k", EXPLANIMATE_DEMO_ONLY: "1" } }));
  assert.equal(demo.paused, true);
});

test("EXPLANIMATE_CHROME points at a Chrome in an unusual place", () => {
  const h = checkHealth(
    "/j",
    true,
    probe({ env: { MODEL_API_KEY: "k", EXPLANIMATE_CHROME: "/opt/chrome/chrome" }, has: (f) => f === "/opt/chrome/chrome" }),
  );
  assert.equal(h.checks.chrome, true);
});

test("with an OpenRouter key the OpenRouter key is the one that counts, and a bad provider name is a plain problem", () => {
  assert.equal(checkHealth("/j", true, probe({ env: { OPENROUTER_API_KEY: "secret-or" } })).checks.modelKey, true);
  const want = checkHealth("/j", true, probe({ env: { MODEL_API_KEY: "k", EXPLANIMATE_LLM_PROVIDER: "openrouter" } }));
  assert.match(want.problems.join(" "), /OPENROUTER_API_KEY is not set/);
  const bad = checkHealth("/j", true, probe({ env: { MODEL_API_KEY: "k", EXPLANIMATE_LLM_PROVIDER: "acme" } }));
  assert.match(bad.problems.join(" "), /must be "openrouter" or "meta"/);
});
