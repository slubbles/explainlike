import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CostLedger, sparkJson } from "../src/index.ts";

// a fake Meta API: answers in turn, and records each request body
function fakeApi(replies: { content?: string; finish?: string }[]) {
  const bodies: any[] = [];
  const saved = { fetch: globalThis.fetch, key: process.env.MODEL_API_KEY };
  process.env.MODEL_API_KEY = "test-key";
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const r = replies[bodies.length - 1]!;
    return new Response(JSON.stringify({ choices: [{ message: { content: r.content ?? "" }, finish_reason: r.finish ?? "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  }) as typeof fetch;
  return { bodies, restore: () => { globalThis.fetch = saved.fetch; if (saved.key === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = saved.key; } };
}
const call = (ledger: CostLedger) => sparkJson({ ledger, step: "architecture", schema: z.object({ a: z.number() }), name: "t", messages: [{ role: "user", content: "x" }], effort: "medium", maxTokens: 16000 });

test("an answer the reasoning ran out of room for is tried again with less effort and more room", async () => {
  const api = fakeApi([{ content: "", finish: "length" }, { content: '{"a":1}' }]);
  try {
    const ledger = new CostLedger();
    assert.deepEqual(await call(ledger), { a: 1 });
    assert.deepEqual(api.bodies.map((b) => [b.reasoning_effort, b.max_tokens]), [["medium", 16000], ["low", 24000]]);
    assert.equal(ledger.entries.length, 2, "both tries are paid for, so both are counted");
  } finally { api.restore(); }
});

test("a second empty answer fails with a plain reason, without a third paid try", async () => {
  const api = fakeApi([{ content: "" }, { content: '{"a":', finish: "length" }]);
  try {
    await assert.rejects(call(new CostLedger()), /ran out of room \(24000 tokens\) on architecture, twice/);
    assert.equal(api.bodies.length, 2);
  } finally { api.restore(); }
});
