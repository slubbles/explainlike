import { test } from "node:test";
import assert from "node:assert/strict";
import { ProviderLimiter, providerConcurrency, rateLimitBackoffMs, ServiceError } from "@explanimate/core";

test("each provider has its own default lane, and the env overrides one lane or all of them", () => {
  assert.equal(providerConcurrency("deepgram", {}), 8);
  assert.equal(providerConcurrency("cartesia", {}), 8);
  assert.equal(providerConcurrency("openrouter", {}), 4);
  assert.equal(providerConcurrency("meta", {}), 4);
  assert.equal(providerConcurrency("something-new", {}), 4);
  assert.equal(providerConcurrency("deepgram", { EXPLANIMATE_RATE_LIMIT_DEEPGRAM: "2" }), 2);
  assert.equal(providerConcurrency("meta", { EXPLANIMATE_RATE_LIMIT_DEEPGRAM: "2" }), 4, "one lane stays untouched");
  assert.equal(providerConcurrency("meta", { EXPLANIMATE_PROVIDER_CONCURRENCY: "6" }), 6);
  assert.equal(
    providerConcurrency("meta", { EXPLANIMATE_PROVIDER_CONCURRENCY: "6", EXPLANIMATE_RATE_LIMIT_META: "1" }),
    1,
    "the lane wins over the global",
  );
  assert.equal(providerConcurrency("meta", { EXPLANIMATE_RATE_LIMIT_META: "many" }), 4, "garbage keeps the default");
  assert.equal(providerConcurrency("meta", { EXPLANIMATE_PROVIDER_CONCURRENCY: "99" }), 32, "a lane never exceeds 32");
});

test("the backoff doubles per consecutive rejection and stops at 30 s", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(rateLimitBackoffMs), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

test("a lane runs at most its limit at once", async () => {
  const limiter = new ProviderLimiter(() => 2);
  let active = 0,
    peak = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const task = () =>
    limiter.run("meta", async () => {
      active++;
      peak = Math.max(peak, active);
      await held;
      active--;
    });
  const runs = Promise.all([task(), task(), task()]);
  for (let i = 0; i < 200 && active < 2; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(active, 2);
  assert.equal(peak, 2);
  release();
  await runs;
  assert.equal(peak, 2, "the third call waited for a slot");
});

test("a 429 parks only its lane with backoff, and a success clears the count", async () => {
  let now = 1000;
  const slept: number[] = [];
  const limiter = new ProviderLimiter(
    () => 4,
    () => now,
    async (ms) => {
      slept.push(ms);
      now += ms;
    },
  );
  const fail = async (): Promise<void> => {
    throw new ServiceError("Deepgram is rate-limiting requests right now. Wait a minute and try again.", "Deepgram", 429);
  };
  await assert.rejects(limiter.run("deepgram", fail), /rate-limiting/);
  assert.deepEqual(slept, [], "the rejection itself does not wait; the next call does");
  await assert.rejects(limiter.run("deepgram", fail), /rate-limiting/);
  assert.deepEqual(slept, [1000]);
  await assert.rejects(limiter.run("deepgram", fail), /rate-limiting/);
  assert.deepEqual(slept, [1000, 2000], "the park doubles while rejections continue");
  await limiter.run("meta", async () => {});
  assert.deepEqual(slept, [1000, 2000], "another lane is not parked");
  now += 60_000;
  await limiter.run("deepgram", async () => {});
  assert.deepEqual(slept, [1000, 2000], "a call past the park does not wait");
  await assert.rejects(limiter.run("deepgram", fail), /rate-limiting/);
  await limiter.run("deepgram", async () => {});
  assert.deepEqual(slept, [1000, 2000, 1000], "a success resets the backoff to 1 s");
});

test("an error that is not a 429 does not park the lane", async () => {
  const slept: number[] = [];
  const limiter = new ProviderLimiter(
    () => 4,
    () => 5000,
    async (ms) => {
      slept.push(ms);
    },
  );
  await assert.rejects(
    limiter.run("meta", async () => {
      throw new ServiceError("Meta Muse is having trouble right now (HTTP 500). Try again in a few minutes.", "Meta Muse", 500);
    }),
    /trouble/,
  );
  await limiter.run("meta", async () => {});
  assert.deepEqual(slept, []);
});
