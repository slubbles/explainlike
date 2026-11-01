import { test } from "node:test";
import assert from "node:assert/strict";
import { planCacheDir } from "../src/pipeline.ts";

const sha = "a".repeat(40);

test("plans are shared per repo commit and ask, and never for a local folder", () => {
  const a = planCacheDir({ url: "https://github.com/openai/swarm", commit: sha });
  assert.ok(a);
  assert.equal(planCacheDir({ url: "https://github.com/OpenAI/swarm.git", commit: sha }), a);
  assert.notEqual(planCacheDir({ url: "https://github.com/openai/swarm", commit: "b".repeat(40) }), a);
  assert.notEqual(planCacheDir({ url: "https://github.com/openai/swarm", commit: sha, ask: { audience: "a five year old" } }), a);
  assert.equal(planCacheDir({ url: "/home/me/project", commit: sha }), undefined);
  assert.equal(planCacheDir({ url: "https://github.com/openai/swarm", commit: "local" }), undefined);
});

test("EXPLAINLIKE_PLAN_CACHE=0 turns the shared plan cache off", () => {
  process.env.EXPLAINLIKE_PLAN_CACHE = "0";
  try { assert.equal(planCacheDir({ url: "https://github.com/openai/swarm", commit: sha }), undefined); }
  finally { delete process.env.EXPLAINLIKE_PLAN_CACHE; }
});
