import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ServiceError } from "@explanimate/core";
import { CostLedger, llmFallbackable, sparkJson } from "../src/index.ts";

const schema = z.object({ a: z.number() });
const ok = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  );

type Reply = { content?: string } | { status: number } | { slow: true };

// a fake internet with two providers: each request is answered from its host's script
function routedApi(metaReplies: Reply[], orReplies: Reply[], env: Record<string, string | undefined>) {
  const seen: { host: string; auth: string; body: any }[] = [];
  const saved = {
    fetch: globalThis.fetch,
    provider: process.env.EXPLANIMATE_LLM_PROVIDER,
    meta: process.env.MODEL_API_KEY,
    or: process.env.OPENROUTER_API_KEY,
  };
  for (const [k, v] of Object.entries({ EXPLANIMATE_LLM_PROVIDER: "meta", MODEL_API_KEY: "test-meta-key", ...env }))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  const scripts: Record<string, Reply[]> = { "api.meta.ai": metaReplies, "openrouter.ai": orReplies };
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    const host = new URL(String(u)).host;
    seen.push({ host, auth: String((init.headers as Record<string, string>).Authorization), body: JSON.parse(String(init.body)) });
    const r = scripts[host]!.filter(Boolean)[seen.filter((s) => s.host === host).length - 1] ?? {};
    if ("slow" in r && r.slow)
      return new Promise<Response>((_, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason)));
    if ("status" in r && r.status !== undefined) return new Response("no", { status: r.status });
    return ok("content" in r ? (r.content ?? "") : "");
  }) as typeof fetch;
  return {
    seen,
    restore: () => {
      globalThis.fetch = saved.fetch;
      for (const [k, v] of [
        ["EXPLANIMATE_LLM_PROVIDER", saved.provider],
        ["MODEL_API_KEY", saved.meta],
        ["OPENROUTER_API_KEY", saved.or],
      ] as const)
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    },
  };
}

function captureWarn() {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  };
  return { lines, restore: () => (console.warn = orig) };
}

const call = (ledger: CostLedger, timeoutMs?: number) =>
  sparkJson({ ledger, step: "architecture", schema, name: "t", messages: [{ role: "user", content: "x" }], timeoutMs });

test("a Meta call that answers empty twice is tried once on OpenRouter, and both tries are paid for", async () => {
  const api = routedApi([{ content: "" }, { content: "" }], [{ content: '{"a":7}' }], { OPENROUTER_API_KEY: "test-or-key" });
  const warn = captureWarn();
  try {
    const ledger = new CostLedger();
    assert.deepEqual(await call(ledger), { a: 7 });
    assert.deepEqual(
      api.seen.map((s) => s.host),
      ["api.meta.ai", "api.meta.ai", "openrouter.ai"],
    );
    const or = api.seen[2]!;
    assert.equal(or.body.model, "meta/muse-spark-1.3");
    assert.equal(or.auth, "Bearer test-or-key");
    assert.deepEqual(
      ledger.entries.map((e) => e.model),
      ["muse-spark-1.3-contributor", "muse-spark-1.3-contributor", "meta/muse-spark-1.3"],
    );
    assert.equal(warn.lines.length, 1);
    assert.match(warn.lines[0]!, /falling back to OpenRouter/);
    assert.doesNotMatch(warn.lines.join("\n"), /test-(meta|or)-key/, "no key in the log line");
  } finally {
    api.restore();
    warn.restore();
  }
});

test("without an OpenRouter key the Meta error surfaces as before", async () => {
  const api = routedApi([{ content: "" }, { content: "" }], [{ content: '{"a":1}' }], { OPENROUTER_API_KEY: undefined });
  const warn = captureWarn();
  try {
    await assert.rejects(call(new CostLedger()), /returned no content on architecture, twice/);
    assert.deepEqual(
      api.seen.map((s) => s.host),
      ["api.meta.ai", "api.meta.ai"],
    );
    assert.equal(warn.lines.length, 0);
  } finally {
    api.restore();
    warn.restore();
  }
});

test("a Meta call that does not answer in time falls back to OpenRouter", async () => {
  const api = routedApi([{ slow: true }, { slow: true }], [{ content: '{"a":8}' }], { OPENROUTER_API_KEY: "test-or-key" });
  const warn = captureWarn();
  try {
    assert.deepEqual(await call(new CostLedger(), 30), { a: 8 });
    assert.deepEqual(
      api.seen.map((s) => s.host),
      ["api.meta.ai", "api.meta.ai", "openrouter.ai"],
    );
    assert.equal(warn.lines.length, 1);
  } finally {
    api.restore();
    warn.restore();
  }
});

test("a rejected Meta key does not fall back: the same call would fail the same way there", async () => {
  const api = routedApi([{ status: 401 }], [{ content: '{"a":1}' }], { OPENROUTER_API_KEY: "test-or-key" });
  const warn = captureWarn();
  try {
    await assert.rejects(call(new CostLedger()), /rejected the API key/);
    assert.deepEqual(
      api.seen.map((s) => s.host),
      ["api.meta.ai"],
    );
    assert.equal(warn.lines.length, 0);
  } finally {
    api.restore();
    warn.restore();
  }
});

test("OpenRouter as primary never falls back to Meta", async () => {
  const api = routedApi([{ content: '{"a":1}' }], [{ content: "" }, { content: "" }], {
    EXPLANIMATE_LLM_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "test-or-key",
  });
  try {
    await assert.rejects(call(new CostLedger()), /twice/);
    assert.deepEqual(
      api.seen.map((s) => s.host),
      ["openrouter.ai", "openrouter.ai"],
    );
  } finally {
    api.restore();
  }
});

test("only Meta-side failures fall back, never key, credit or request errors", () => {
  const svc = (status?: number, timedOut = false) => new ServiceError("x", "Meta Muse", status, undefined, timedOut);
  for (const e of [svc(500), svc(503), svc(429), svc(undefined), svc(undefined, true), svc(200)]) assert.equal(llmFallbackable(e), true);
  for (const e of [svc(400), svc(401), svc(402), svc(403), svc(404), svc(413)]) assert.equal(llmFallbackable(e), false);
  assert.equal(llmFallbackable(new SyntaxError("not json")), true, "an answer that was not JSON");
  let zod: unknown;
  try {
    schema.parse({ a: "not a number" });
  } catch (e) {
    zod = e;
  }
  assert.equal(llmFallbackable(zod), true, "an answer that missed the schema");
  assert.equal(llmFallbackable(new Error("Muse Spark returned no content on architecture, twice")), true);
  assert.equal(llmFallbackable(new Error("MODEL_API_KEY is not set. Get one at https://dev.meta.ai and put it in .env")), false);
  assert.equal(llmFallbackable(new Error("another copy of architecture already answered")), false);
  assert.equal(llmFallbackable(new Error("boom")), false);
});

test("a hedged copy that lost does not pay for a fallback nobody waits on", async () => {
  // the winner answers well; the loser misses the schema on its first try (immediate, still fallbackable)
  const api = routedApi([{ content: `{"a":1}` }, { content: `{"a":"nope"}` }], [{ content: `{"a":2}` }], {
    OPENROUTER_API_KEY: "test-or-key",
  });
  const warn = captureWarn();
  const hedge = process.env.EXPLANIMATE_HEDGE;
  process.env.EXPLANIMATE_HEDGE = "2";
  try {
    const ledger = new CostLedger();
    assert.deepEqual(
      await sparkJson({ ledger, step: "architecture", schema, name: "t", messages: [{ role: "user", content: "x" }], hedge: true }),
      { a: 1 },
    );
    assert.deepEqual(
      api.seen.map((s) => s.host),
      ["api.meta.ai", "api.meta.ai"],
      "the losing copy never reaches OpenRouter",
    );
  } finally {
    api.restore();
    warn.restore();
    if (hedge === undefined) delete process.env.EXPLANIMATE_HEDGE;
    else process.env.EXPLANIMATE_HEDGE = hedge;
  }
});
