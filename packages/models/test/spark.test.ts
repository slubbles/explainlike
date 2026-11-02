import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CostLedger, firstOf, hedgeCopies, sparkJson } from "../src/index.ts";

// a fake Meta API: answers in turn, and records each request body
function fakeApi(replies: { content?: string; finish?: string; slow?: boolean }[]) {
  const bodies: any[] = [];
  const saved = { fetch: globalThis.fetch, key: process.env.MODEL_API_KEY };
  process.env.MODEL_API_KEY = "test-key";
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const r = replies[bodies.length - 1]!;
    if (r.slow) return new Promise<Response>((_, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason)));
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

test("a try that does not answer in time is dropped and tried once more with less effort, not four more times", async () => {
  const api = fakeApi([{ slow: true }, { content: '{"a":2}' }]);
  try {
    const ledger = new CostLedger();
    const r = await sparkJson({ ledger, step: "architecture", schema: z.object({ a: z.number() }), name: "t", messages: [{ role: "user", content: "x" }], effort: "medium", maxTokens: 8000, timeoutMs: 40 });
    assert.deepEqual(r, { a: 2 });
    assert.deepEqual(api.bodies.map((b) => b.reasoning_effort), ["medium", "low"]);
    assert.deepEqual(ledger.entries.map((e) => e.detail?.timedOut ?? false), [true, false], "the dropped try shows in the profile");
  } finally { api.restore(); }
});

test("two slow tries fail with a plain timeout instead of hanging", async () => {
  const api = fakeApi([{ slow: true }, { slow: true }]);
  try {
    await assert.rejects(sparkJson({ ledger: new CostLedger(), step: "architecture", schema: z.object({ a: z.number() }), name: "t", messages: [{ role: "user", content: "x" }], effort: "low", timeoutMs: 30 }), /did not answer within/);
    assert.equal(api.bodies.length, 2);
  } finally { api.restore(); }
});

test("the wire schema carries limits to the API while the answer is parsed with the plain schema", async () => {
  const api = fakeApi([{ content: '{"a":[1,2,3]}' }]);
  try {
    const r = await sparkJson({ ledger: new CostLedger(), step: "t", schema: z.object({ a: z.array(z.number()) }), wire: z.object({ a: z.array(z.number()).max(2) }), name: "t", messages: [{ role: "user", content: "x" }] });
    assert.deepEqual(r, { a: [1, 2, 3] }, "an answer over the limit is trimmed by the caller, not thrown away");
    assert.equal(api.bodies[0].response_format.json_schema.schema.properties.a.maxItems, 2);
  } finally { api.restore(); }
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("firstOf settles with the first copy that succeeds, even when an earlier one fails", async () => {
  const started: number[] = [];
  const r = await firstOf(3, async (i) => {
    started.push(i);
    if (i === 0) throw new Error("bad answer");
    await wait(i === 1 ? 30 : 5);
    return `copy ${i}`;
  });
  assert.equal(r, "copy 2");
  assert.deepEqual(started, [0, 1, 2], "all copies start at once");
});

test("firstOf fails only when every copy fails, with the first copy's error", async () => {
  await assert.rejects(firstOf(2, async (i) => { await wait(i ? 1 : 10); throw new Error(`copy ${i} failed`); }), /copy 0 failed/);
});

test("firstOf with one copy is the plain call", async () => {
  let calls = 0;
  assert.equal(await firstOf(1, async () => ++calls), 1);
  assert.equal(calls, 1);
});

test("hedge copies default to two, can be turned off, and are capped at three", () => {
  assert.equal(hedgeCopies({}), 2);
  assert.equal(hedgeCopies({ EXPLANIMATE_HEDGE: "1" }), 1);
  assert.equal(hedgeCopies({ EXPLANIMATE_HEDGE: "0" }), 1);
  assert.equal(hedgeCopies({ EXPLANIMATE_HEDGE: "9" }), 3);
  assert.equal(hedgeCopies({ EXPLANIMATE_HEDGE: "lots" }), 2);
});

// a fake API where each request answers after its own delay
function timedApi(replies: { ms: number; content: string }[]) {
  const bodies: any[] = [];
  const saved = { fetch: globalThis.fetch, key: process.env.MODEL_API_KEY, hedge: process.env.EXPLANIMATE_HEDGE };
  process.env.MODEL_API_KEY = "test-key";
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const r = replies[bodies.length - 1]!;
    await wait(r.ms);
    return new Response(JSON.stringify({ choices: [{ message: { content: r.content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  }) as typeof fetch;
  const restore = () => {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [["MODEL_API_KEY", saved.key], ["EXPLANIMATE_HEDGE", saved.hedge]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  };
  return { bodies, restore };
}
const hedged = (ledger: CostLedger) => sparkJson({ ledger, step: "architecture", schema: z.object({ a: z.number() }), name: "t", messages: [{ role: "user", content: "x" }], hedge: true });

test("a hedged call sends the same request twice and keeps the first good answer", async () => {
  const api = timedApi([{ ms: 60, content: '{"a":1}' }, { ms: 5, content: '{"a":2}' }]);
  try {
    const ledger = new CostLedger();
    assert.deepEqual(await hedged(ledger), { a: 2 });
    assert.equal(api.bodies.length, 2);
    assert.deepEqual(api.bodies[0], api.bodies[1], "both copies ask exactly the same thing");
    await wait(80);
    assert.deepEqual(ledger.entries.map((e) => e.step), ["architecture", "architecture-hedge"], "the copy that lost is still paid for and logged apart");
  } finally { api.restore(); }
});

test("a hedged call keeps waiting when the faster copy's answer does not parse", async () => {
  const api = timedApi([{ ms: 5, content: '{"a":"not a number"}' }, { ms: 30, content: '{"a":3}' }]);
  try {
    assert.deepEqual(await hedged(new CostLedger()), { a: 3 });
  } finally { api.restore(); }
});

test("EXPLANIMATE_HEDGE=1 sends a hedged call once", async () => {
  const api = timedApi([{ ms: 1, content: '{"a":4}' }]);
  process.env.EXPLANIMATE_HEDGE = "1";
  try {
    assert.deepEqual(await hedged(new CostLedger()), { a: 4 });
    assert.equal(api.bodies.length, 1);
  } finally { api.restore(); }
});
