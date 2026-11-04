import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPoolSize, poolSize, renderSlots } from "../lib/pool.ts";

const GB = 1024 ** 3;

test("the old machine-fit default is kept for old callers", () => {
  assert.equal(defaultPoolSize({ cpus: 8, freeBytes: 16 * GB }), 7);
  assert.equal(defaultPoolSize({ cpus: 4, freeBytes: 3 * GB }), 2);
  assert.equal(defaultPoolSize({ cpus: 1, freeBytes: 32 * GB }), 1);
});

test("API stages run 10 jobs at once; the new name wins, then the old job-slot names", () => {
  assert.equal(poolSize({}), 10);
  assert.equal(poolSize({ API_CONCURRENCY: "3" }), 3);
  assert.equal(poolSize({ EXPLANIMATE_API_CONCURRENCY: "5", API_CONCURRENCY: "3" }), 5);
  assert.equal(poolSize({ JOB_CONCURRENCY: "3" }), 3);
  assert.equal(poolSize({ EXPLANIMATE_MAX_CONCURRENT: "5", JOB_CONCURRENCY: "3" }), 5);
  assert.equal(poolSize({ EXPLANIMATE_CONCURRENCY: "2" }), 2);
  assert.equal(poolSize({ API_CONCURRENCY: "7", JOB_CONCURRENCY: "3" }), 7);
  assert.equal(poolSize({ JOB_CONCURRENCY: "many" }), 10, "garbage falls through to the default");
  assert.equal(poolSize({ JOB_CONCURRENCY: "0" }), 10, "zero is not a pool");
  assert.equal(poolSize({ API_CONCURRENCY: "2.9" }), 2, "fractions round down to whole slots");
});

test("render slots default to max(1, cpus - 2): two on a 4-core server", () => {
  assert.equal(renderSlots({}, { cpus: 4 }), 2);
  assert.equal(renderSlots({}, { cpus: 8 }), 6);
  assert.equal(renderSlots({}, { cpus: 1 }), 1);
  assert.equal(renderSlots({ RENDER_CONCURRENCY: "1" }, { cpus: 8 }), 1);
  assert.equal(renderSlots({ RENDER_CONCURRENCY: "1", EXPLANIMATE_RENDER_CONCURRENCY: "3" }, { cpus: 8 }), 3);
  assert.equal(renderSlots({ RENDER_CONCURRENCY: "many" }, { cpus: 4 }), 2, "garbage keeps the default");
});
