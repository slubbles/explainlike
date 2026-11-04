import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbacksFromManifest, formatMs, jobMetrics, jobTiming, percentile } from "../lib/metrics.ts";

const T = 1_000_000;

test("a finished job reports its wait, render and total time from its own timestamps", () => {
  const t = jobTiming({ id: "a", state: "done", started: T, began: T + 2000, finished: T + 62000, durationSec: 41.6, costUsd: 0.05 });
  assert.deepEqual(
    { wait: t.waitMs, render: t.renderMs, total: t.totalMs, video: t.videoSec, cost: t.cost, kind: t.kind },
    { wait: 2000, render: 60000, total: 62000, video: 41.6, cost: 0.05, kind: "video" },
  );
});

test("a job still waiting has no render or total time, and a reversed clock gives none either", () => {
  const waiting = jobTiming({ id: "w", state: "queued", started: T });
  assert.equal(waiting.waitMs, null);
  assert.equal(waiting.renderMs, null);
  assert.equal(jobTiming({ id: "r", state: "done", started: T, began: T + 10, finished: T }).renderMs, null);
});

test("cost falls back to the live meter when the final cost is missing", () => {
  assert.equal(jobTiming({ id: "m", state: "error", started: T, usd: { total: 0.012 } }).cost, 0.012);
});

test("percentile uses the nearest rank and is null for no data", () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([10], 0.9), 10);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
});

test("metrics count states, success rate and medians only over the window", () => {
  const jobs = [
    { id: "1", state: "done", started: T, began: T, finished: T + 30000, costUsd: 0.1 },
    { id: "2", state: "done", started: T, began: T + 5000, finished: T + 95000, costUsd: 0.3 },
    { id: "3", state: "error", started: T, began: T, finished: T + 1000 },
    { id: "4", state: "running", started: T, began: T + 1000 },
    { id: "5", state: "queued", started: T },
    { id: "old", state: "done", started: T - 10, began: T - 10, finished: T + 999999, costUsd: 9 },
  ];
  const m = jobMetrics(jobs, T);
  assert.equal(m.total, 5);
  assert.deepEqual([m.done, m.failed, m.running, m.queued], [2, 1, 1, 1]);
  assert.equal(m.successRate, 2 / 3);
  assert.equal(m.medianRenderMs, 30000);
  assert.equal(m.p90RenderMs, 90000);
  assert.equal(m.medianWaitMs, 0);
  assert.ok(Math.abs((m.avgCostDone ?? 0) - 0.2) < 1e-9);
});

test("metrics with no jobs are empty, not zero", () => {
  const m = jobMetrics([]);
  assert.equal(m.successRate, null);
  assert.equal(m.medianRenderMs, null);
  assert.equal(m.p95RenderMs, null);
  assert.equal(m.avgCostDone, null);
});

test("render p50 and p95 come from the finished renders, slowest tail included", () => {
  const jobs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((s, i) => ({
    id: `r${i}`,
    state: "done",
    started: T,
    began: T,
    finished: T + s * 1000,
  }));
  const m = jobMetrics(jobs, T);
  assert.equal(m.medianRenderMs, 50000);
  assert.equal(m.p90RenderMs, 90000);
  assert.equal(m.p95RenderMs, 100000);
});

test("a fallback shows in the manifest as a second Spark model or a joined voice id", () => {
  const spark = "muse-spark-1.3-contributor";
  const plain = { cost: { voice: "deepgram", byModel: { [spark]: { calls: 3 } } } };
  assert.deepEqual(fallbacksFromManifest(plain), { llm: false, tts: false });
  assert.deepEqual(fallbacksFromManifest({ cost: { voice: "deepgram+cartesia", byModel: plain.cost.byModel } }), {
    llm: false,
    tts: true,
  });
  assert.deepEqual(
    fallbacksFromManifest({ cost: { voice: "deepgram", byModel: { [spark]: { calls: 2 }, "meta/muse-spark-1.3": { calls: 1 } } } }),
    { llm: true, tts: false },
  );
  // icons and the transcript check are other models, not a Spark fallback
  assert.deepEqual(
    fallbacksFromManifest({ cost: { voice: "silent", byModel: { [spark]: { calls: 1 }, "muse-image-1.0": { calls: 2 } } } }),
    { llm: false, tts: false },
  );
  // a manifest that predates the cost block records no fallback either way
  for (const m of [null, undefined, {}, { cost: {} }, { cost: { voice: "deepgram" } }]) {
    assert.deepEqual(fallbacksFromManifest(m), { llm: false, tts: false }, JSON.stringify(m));
  }
});

test("durations read plainly", () => {
  assert.equal(formatMs(null), "—");
  assert.equal(formatMs(4200), "4.2s");
  assert.equal(formatMs(83500), "1m 24s");
});

test("a cancelled job is neither a success nor a failure", () => {
  const jobs = [
    { id: "1", state: "done", started: T, began: T, finished: T + 1000 },
    { id: "2", state: "error", started: T, began: T, finished: T + 1000 },
    { id: "3", state: "error", cancelled: true, started: T, began: T, finished: T + 500 },
  ];
  const m = jobMetrics(jobs, T);
  assert.deepEqual([m.done, m.failed, m.cancelled], [1, 1, 1]);
  assert.equal(m.successRate, 1 / 2);
});
