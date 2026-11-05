import { test } from "node:test";
import assert from "node:assert/strict";
import type { Architecture, ScenePlan } from "@explanimate/core";
import { CostLedger } from "@explanimate/models";
import { fixWording } from "@explanimate/planner";

// these tests fake the Meta API, so they pin the provider and drop any OpenRouter key the machine has,
// which would otherwise turn on the OpenRouter fallback and reach the real network
process.env.EXPLANIMATE_LLM_PROVIDER = "meta";
delete process.env.OPENROUTER_API_KEY;

type Ask = { name: string; body: any };
// a fake API that answers by schema name from a script, and records every request
async function scripted(answers: Record<string, unknown[]>, run: () => Promise<unknown>): Promise<{ asks: Ask[]; out: any }> {
  const asks: Ask[] = [];
  const saved = { fetch: globalThis.fetch, key: process.env.MODEL_API_KEY, hedge: process.env.EXPLANIMATE_HEDGE };
  process.env.MODEL_API_KEY = "test-key";
  process.env.EXPLANIMATE_HEDGE = "1";
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const name = body.response_format.json_schema.name;
    asks.push({ name, body });
    const next = answers[name]?.shift();
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(next ?? {}) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    return { asks, out: await run() };
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [
      ["MODEL_API_KEY", saved.key],
      ["EXPLANIMATE_HEDGE", saved.hedge],
    ] as const)
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}

const arch = {
  product: "demo",
  one_liner: "a demo",
  components: [
    {
      id: "edge",
      name: "Edge",
      kind: "service",
      layer: "cloud",
      keyword: "edge worker",
      what: "sign-in",
      icon: "",
      evidence: "",
      files: [],
    },
  ],
  connections: [],
  walkthrough: { name: "send", steps: [] },
  scale: [],
} as unknown as Architecture;
const layer = "The edge worker is optional better-auth Worker plus D1 for identity, installs and push devices.";
const plan = {
  title: "demo",
  subtitle: "",
  scenes: [
    {
      id: "s1-hook",
      kind: "hook",
      heading: "a demo",
      narration: "Why does a bot need a sign-in desk? It keeps who you are in one place.",
      add_components: [],
    },
    { id: "s2-layer", kind: "layer", heading: "the cloud", narration: layer, add_components: ["edge"] },
  ],
} as unknown as ScenePlan;
const issues = [
  '"better-auth" (s2-layer) is used without a plain-words explanation; explain it in the same sentence or drop it',
  '"D1" (s2-layer) is used without a plain-words explanation; explain it in the same sentence or drop it',
];
const run = () => fixWording({ ledger: new CostLedger(), plan, arch, issues, audience: "a developer" });

test("a rewrite too long for the board is sent back with the reason, and the next round's fix clears the terms", async () => {
  const long =
    "The edge worker is an optional helper in the cloud; better-auth, a sign-in library, and D1, a small cloud database, keep your identity, your installs and your push devices in one safe place.";
  const short = "The edge worker is an optional cloud helper that keeps your sign-in, installs and push devices.";
  const { asks, out } = await scripted(
    {
      narration_fix: [
        { scenes: [{ id: "s2-layer", narration: long }], renames: [] },
        { scenes: [{ id: "s2-layer", narration: short }], renames: [] },
      ],
    },
    run,
  );
  assert.deepEqual(
    asks.map((a) => a.name),
    ["narration_fix", "recheck", "narration_fix"],
    "once the terms are no longer said, no second look is needed",
  );
  assert.match(asks[2].body.messages[1].content, /s2-layer.*not used: it had \d+ words, over the \d+ allowed/);
  assert.equal(out.plan.scenes[1].narration, short);
  assert.deepEqual(out.issues, []);
});

test("terms the second look still finds are fixed again, at most three rounds", async () => {
  const { asks, out } = await scripted({ recheck: [{ open: ["1", "2"] }, { open: ["1"] }, { open: ["1"] }] }, run);
  assert.deepEqual(
    asks.map((a) => a.name),
    ["narration_fix", "recheck", "narration_fix", "recheck", "narration_fix", "recheck"],
  );
  assert.deepEqual(out.issues, [issues[0]]);
});

test("a structural problem left over does not stop the wording fix", async () => {
  const structural = "there is no 'walkthrough' scene telling the core flow end to end";
  const fixed = "The edge worker is an optional cloud helper that keeps your sign-in, installs and push devices.";
  const { asks, out } = await scripted({ narration_fix: [{ scenes: [{ id: "s2-layer", narration: fixed }], renames: [] }] }, () =>
    fixWording({ ledger: new CostLedger(), plan, arch, issues: [structural, ...issues], audience: "a developer" }),
  );
  assert.equal(asks[0].name, "narration_fix");
  assert.doesNotMatch(asks[0].body.messages[1].content, /walkthrough/);
  assert.equal(out.plan.scenes[1].narration, fixed);
  assert.equal(out.changed, true);
});
