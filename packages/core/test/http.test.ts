import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRetry, ServiceError } from "../src/index.js";

const fake = (seq: (number | "net" | "slow")[], seen: string[] = []) =>
  (async (_u: string, init?: RequestInit) => {
    seen.push(String((init?.headers as Record<string, string>)?.Authorization ?? ""));
    const s = seq.shift() ?? 200;
    if (s === "net") throw new TypeError("fetch failed");
    if (s === "slow") return new Promise<Response>((_, rej) => init!.signal!.addEventListener("abort", () => rej(init!.signal!.reason)));
    return new Response(s === 200 ? "{}" : "Bearer abcdefghijklmnop leaked", {
      status: s,
      headers: s === 429 ? { "retry-after": "2" } : {},
    });
  }) as typeof fetch;

test("a call that fails on the network, then a 503, then a 429 succeeds on the fourth try with growing waits", async () => {
  const waits: number[] = [];
  const r = await fetchRetry("https://x.test/a", () => ({ method: "POST" }), {
    service: "Meta Muse",
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetchImpl: fake(["net", 503, 429, 200]),
  });
  assert.equal(r.status, 200);
  assert.equal(waits.length, 3);
  assert.ok(waits[1] > waits[0] * 1.2, `${waits}`);
  assert.ok(waits[2] >= 2000, "Retry-After is honoured");
});

test("a rejected key fails at once with a message naming the env var, and nothing secret in it", async () => {
  let tries = 0;
  const f = (async (...a: Parameters<typeof fetch>) => {
    tries++;
    return fake([401])(...a);
  }) as typeof fetch;
  await assert.rejects(
    fetchRetry("https://x.test/a", () => ({}), { service: "Deepgram", keyVar: "DEEPGRAM_API_KEY", sleep: async () => {}, fetchImpl: f }),
    (e: ServiceError) => {
      assert.equal(tries, 1);
      assert.match(e.message, /Deepgram rejected the API key: check that DEEPGRAM_API_KEY/);
      assert.equal(e.status, 401);
      assert.doesNotMatch(e.message + e.detail, /abcdefghijklmnop/);
      return true;
    },
  );
});

test("a service that never answers times out per attempt and says so after the last try", async () => {
  await assert.rejects(
    fetchRetry("https://x.test/a", () => ({}), {
      service: "Meta Muse",
      timeoutMs: 30,
      attempts: 2,
      sleep: async () => {},
      fetchImpl: fake(["slow", "slow"]),
    }),
    /Meta Muse did not answer within 0 s|Meta Muse did not answer/,
  );
});

test("a body is rebuilt for every attempt", async () => {
  let built = 0;
  await fetchRetry(
    "https://x.test/a",
    () => {
      built++;
      return { method: "POST", body: new FormData() };
    },
    { service: "s", sleep: async () => {}, fetchImpl: fake([500, 200]) },
  );
  assert.equal(built, 2);
});

test("with retryTimeouts off, a timeout fails after one try and says it timed out", async () => {
  let tries = 0;
  const f = (async (...a: Parameters<typeof fetch>) => {
    tries++;
    return fake(["slow"])(...a);
  }) as typeof fetch;
  await assert.rejects(
    fetchRetry("https://x.test/a", () => ({}), {
      service: "Meta Muse",
      timeoutMs: 20,
      retryTimeouts: false,
      sleep: async () => {},
      fetchImpl: f,
    }),
    (e: ServiceError) => {
      assert.equal(tries, 1);
      assert.equal(e.timedOut, true);
      return true;
    },
  );
});

test("attempts below 1 still tries once instead of throwing undefined", async () => {
  for (const attempts of [0, -2, Number.NaN]) {
    let tries = 0;
    const f = (async (...a: Parameters<typeof fetch>) => {
      tries++;
      return fake([200])(...a);
    }) as typeof fetch;
    const r = await fetchRetry("https://x.test/a", () => ({}), {
      service: "s",
      attempts,
      sleep: async () => {},
      fetchImpl: f,
    });
    assert.equal(r.status, 200, `attempts=${attempts}`);
    assert.equal(tries, 1, `attempts=${attempts}`);
  }
});
