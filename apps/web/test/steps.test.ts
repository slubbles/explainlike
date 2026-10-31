import { test } from "node:test";
import assert from "node:assert/strict";
import { stepsFor, stepStates } from "../lib/steps.ts";

const repo = { kind: "video", input: "https://github.com/karpathy/minbpe", voice: "deepgram" };

test("a repo video lists the same steps the pipeline reports, in order", () => {
  assert.deepEqual(stepsFor(repo).map((s) => s.stage), ["ingest", "architecture", "review", "plan", "voice", "compose", "render", "encode", "qa"]);
});

test("posts, articles, silent videos and follow-up clips only list the steps they run", () => {
  assert.equal(stepsFor({ ...repo, input: "https://x.com/a/status/1" })[0].label, "reading the post");
  assert.equal(stepsFor({ ...repo, input: "https://blog.vllm.ai/x" })[1].label, "Muse Spark is planning the explainer");
  assert.ok(!stepsFor({ ...repo, voice: "silent" }).some((s) => s.stage === "qa"));
  assert.deepEqual(stepsFor({ ...repo, kind: "what-if", whatIf: "10x" }).map((s) => s.stage), ["ingest", "plan", "voice", "compose", "render", "encode"]);
});

test("steps before the current stage are done, later ones wait, and a failure marks its own step", () => {
  const s = stepsFor(repo);
  assert.deepEqual(stepStates(s, "render", "running"), ["ok", "ok", "ok", "ok", "ok", "ok", "now", "todo", "todo"]);
  assert.deepEqual(stepStates(s, "start", "running").slice(0, 2), ["now", "todo"]);
  assert.equal(stepStates(s, "review", "error")[2], "fail");
  assert.ok(stepStates(s, "qa", "done").every((x) => x === "ok"));
});
