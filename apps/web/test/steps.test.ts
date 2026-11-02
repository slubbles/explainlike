import { test } from "node:test";
import assert from "node:assert/strict";
import { asSeen, cap, stepsFor, stepStates } from "../lib/steps.ts";

const repo = { kind: "video", input: "https://github.com/slubbles/spotibai", voice: "deepgram" };

test("a repo video lists the same steps the pipeline reports, in order", () => {
  assert.deepEqual(stepsFor(repo).map((s) => s.stage), ["ingest", "brief", "architecture", "review", "plan", "voice", "compose", "render", "encode", "qa"]);
});

test("posts, articles, silent videos and follow-up clips only list the steps they run", () => {
  assert.equal(stepsFor({ ...repo, input: "https://x.com/a/status/1" })[0].label, "reading the post");
  assert.equal(stepsFor({ ...repo, input: "https://blog.vllm.ai/x" })[2].label, "Muse Spark is planning the explainer");
  assert.ok(!stepsFor({ ...repo, voice: "silent" }).some((s) => s.stage === "qa"));
  assert.deepEqual(stepsFor({ ...repo, kind: "what-if", whatIf: "10x" }).map((s) => s.stage), ["ingest", "plan", "voice", "compose", "render", "encode"]);
});

test("steps before the current stage are done, later ones wait, and a failure marks its own step", () => {
  const s = stepsFor(repo);
  assert.deepEqual(stepStates(s, "render", "running"), ["ok", "ok", "ok", "ok", "ok", "ok", "ok", "now", "todo", "todo"]);
  assert.deepEqual(stepStates(s, "start", "running").slice(0, 2), ["now", "todo"]);
  assert.equal(stepStates(s, "review", "error")[3], "fail");
  assert.ok(stepStates(s, "qa", "done").every((x) => x === "ok"));
  // deciding the brief happens before the map: it used to report as "plan" and tick the map and review steps early
  assert.deepEqual(stepStates(s, "brief", "running").slice(0, 4), ["ok", "now", "todo", "todo"]);
});

test("step labels show with a capital first letter", () => {
  assert.equal(cap("reading the repository"), "Reading the repository");
  assert.equal(cap("Muse Spark is mapping the architecture"), "Muse Spark is mapping the architecture");
  assert.equal(cap(""), "");
});

test("a job waiting for a render slot looks like one at its first step: no queue, no position, no fake progress", () => {
  const waiting = { ...repo, id: "abc", state: "queued", stage: "start", message: "starting", pct: 0 };
  const seen = asSeen(waiting);
  assert.equal(seen.state, "running");
  assert.equal(seen.pct, 0);
  assert.doesNotMatch(JSON.stringify(seen), /queued|in line|ahead/i);
  assert.deepEqual(stepStates(stepsFor(seen), seen.stage, seen.state as "running"), ["now", ...Array(9).fill("todo")]);
  // a running job passes through untouched, so the steps keep tracking the real pipeline
  const live = { ...waiting, state: "running", stage: "plan", message: "writing the scene plan", pct: 40 };
  assert.equal(asSeen(live), live);
});
