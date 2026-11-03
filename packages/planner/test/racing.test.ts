import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BRIEF, specFromBrief, type Architecture } from "@explanimate/core";
import { CostLedger } from "@explanimate/models";
import { planBrief, reviewArchitecture, fixArchitecture, polishNarration } from "@explanimate/planner";

// these tests fake the Meta API, so they pin the provider instead of following whichever key the machine has
process.env.EXPLANIMATE_LLM_PROVIDER = "meta";

// a fake API that answers every request with JSON no schema accepts, and counts the requests by schema name
async function requestsFor(run: () => Promise<unknown>): Promise<Record<string, number>> {
  const sent: Record<string, number> = {};
  const saved = { fetch: globalThis.fetch, key: process.env.MODEL_API_KEY, hedge: process.env.EXPLANIMATE_HEDGE };
  process.env.MODEL_API_KEY = "test-key";
  delete process.env.EXPLANIMATE_HEDGE;
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const name = JSON.parse(String(init.body)).response_format.json_schema.name;
    sent[name] = (sent[name] ?? 0) + 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"nope":1}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    await run().catch(() => undefined);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [
      ["MODEL_API_KEY", saved.key],
      ["EXPLANIMATE_HEDGE", saved.hedge],
    ] as const)
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
  return sent;
}

const spec = specFromBrief(DEFAULT_BRIEF);
const arch = {
  product: "demo",
  one_liner: "a demo",
  components: [
    { id: "ui", name: "UI", kind: "client", layer: "client", keyword: "chat ui", what: "the window", icon: "", evidence: "", files: [] },
  ],
  connections: [],
  walkthrough: { name: "send", steps: [] },
  scale: [],
} as unknown as Architecture;

test("the map review and its fix send one request, so the review is never the faster, shorter-thinking of two", async () => {
  const review = await requestsFor(() =>
    reviewArchitecture({ ledger: new CostLedger(), arch, evidence: "", digest: "", name: "demo", spec, icons: "" }),
  );
  assert.deepEqual(review, { review: 1 });
  const fix = await requestsFor(() =>
    fixArchitecture({ ledger: new CostLedger(), arch, open: [{ target: "ui", problem: "wrong" }] as any, read: () => "", spec, icons: "" }),
  );
  assert.deepEqual(fix, { review: 1 });
});

test("the brief sends one request", async () => {
  assert.deepEqual(
    await requestsFor(() => planBrief({ ledger: new CostLedger(), kind: "topic", name: "demo", text: "how dns works" } as any)),
    { brief: 1 },
  );
});

test("the narration polish races two copies of each request", async () => {
  const plan = {
    title: "demo",
    scenes: [{ id: "s1", kind: "hook", heading: "a demo", narration: "What if a demo worked?", add_components: [] }],
  } as any;
  const sent = await requestsFor(() => polishNarration({ ledger: new CostLedger(), plan, arch, audience: "anyone" }));
  assert.ok(sent.narration_polish! >= 2 && sent.narration_polish! % 2 === 0, `got ${JSON.stringify(sent)}`);
});
