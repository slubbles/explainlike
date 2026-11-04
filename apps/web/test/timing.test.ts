import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jobTiming, systemMetrics } from "../lib/metrics.ts";

// recordStage and mergeManifestStages live in the job store, whose import rebuilds the wait
// line on disk; point it at a scratch folder first (this file runs in its own process).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-timing-"));
Object.assign(process.env, { EXPLANIMATE_JOBS_DIR: dir, EXPLANIMATE_RESUME: "0" });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const jobs = () => import("../lib/jobs.ts");

const T = 1_000_000;
const base = { id: "a", kind: "video", input: "x", voice: "silent", state: "running", stage: "plan", message: "", pct: 0, started: T };

test("a stage starts at its first sighting and ends at its last", async () => {
  const { recordStage } = await jobs();
  const job: any = { ...base, stages: {} };
  recordStage(job, "plan", T + 1000);
  recordStage(job, "plan", T + 2000);
  recordStage(job, "voice", T + 3000);
  assert.deepEqual(job.stages, { plan: { start: T + 1000, end: T + 2000 }, voice: { start: T + 3000, end: T + 3000 } });
});

test("the renderer's own stage clock folds in, keeping the earliest start and latest end", async () => {
  const { mergeManifestStages } = await jobs();
  const job: any = { ...base, began: T, stages: { plan: { start: T + 900, end: T + 1100 } } };
  mergeManifestStages(job, { stages: [{ stage: "plan", at: 1, seconds: 2 }] });
  assert.deepEqual(job.stages.plan, { start: T + 900, end: T + 3000 });
  mergeManifestStages(job, { stages: [{ stage: "voice", at: 5, seconds: 1 }] });
  assert.deepEqual(job.stages.voice, { start: T + 5000, end: T + 6000 });
  mergeManifestStages({ ...base } as any, { stages: [{ stage: "plan", at: 1, seconds: 1 }] });
  mergeManifestStages(job, { stages: "soon" } as any, "bad entries are skipped");
});

test("timings carry accepted, the render wait and the stages", () => {
  const t = jobTiming({
    id: "a",
    state: "done",
    started: T,
    accepted: T,
    began: T + 2000,
    finished: T + 62000,
    renderWaitMs: 500,
    stages: { plan: { start: T + 2000, end: T + 5000 } },
  });
  assert.equal(t.accepted, T);
  assert.equal(t.renderWaitMs, 500);
  assert.deepEqual(t.stages, { plan: { start: T + 2000, end: T + 5000 } });
  assert.equal(t.waitMs, 2000);
  assert.equal(t.totalMs, 62000);
});

test("old jobs without the new fields still time out: accepted falls back, waits are null", () => {
  const t = jobTiming({ id: "o", state: "done", started: T, began: T, finished: T + 1000 });
  assert.equal(t.accepted, T);
  assert.equal(t.renderWaitMs, null);
  assert.equal(t.stages, undefined);
  assert.equal(jobTiming({ id: "n", state: "done", started: T, renderWaitMs: -5 }).renderWaitMs, null, "a negative wait is not a wait");
});

test("system metrics report load, process memory and free memory", () => {
  const m = systemMetrics();
  assert.equal(m.loadavg.length, 3);
  assert.ok(m.loadavg.every((n) => typeof n === "number" && n >= 0));
  assert.ok(m.cpus >= 1);
  assert.ok(m.freemem > 0 && m.totalmem >= m.freemem);
  assert.ok(m.process.rss > 0 && m.process.heapUsed > 0 && m.process.heapTotal >= m.process.heapUsed);
  assert.ok(m.uptime >= 0 && m.now > 0);
});
