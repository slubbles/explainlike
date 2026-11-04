import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPoolSize, poolSize } from "../lib/pool.ts";

const GB = 1024 ** 3;

test("the default fits the machine: one slot per spare core and per 1.5 GB free, at least one", () => {
  assert.equal(defaultPoolSize({ cpus: 8, freeBytes: 16 * GB }), 7);
  assert.equal(defaultPoolSize({ cpus: 4, freeBytes: 3 * GB }), 2);
  assert.equal(defaultPoolSize({ cpus: 2, freeBytes: 1 * GB }), 1, "no free gigabyte still renders one at a time");
  assert.equal(defaultPoolSize({ cpus: 1, freeBytes: 32 * GB }), 1, "one core still renders one at a time");
});

test("an explicit setting wins, newest name first, and garbage falls through to the default", () => {
  const sys = { cpus: 8, freeBytes: 16 * GB };
  assert.equal(poolSize({}, sys), 7);
  assert.equal(poolSize({ JOB_CONCURRENCY: "3" }, sys), 3);
  assert.equal(poolSize({ EXPLANIMATE_MAX_CONCURRENT: "5", JOB_CONCURRENCY: "3" }, sys), 5);
  assert.equal(poolSize({ EXPLANIMATE_CONCURRENCY: "2" }, sys), 2);
  assert.equal(poolSize({ JOB_CONCURRENCY: "many", EXPLANIMATE_CONCURRENCY: "2" }, sys), 2);
  assert.equal(poolSize({ JOB_CONCURRENCY: "many" }, sys), 7);
  assert.equal(poolSize({ JOB_CONCURRENCY: "0" }, sys), 7, "zero is not a pool");
  assert.equal(poolSize({ JOB_CONCURRENCY: "-2" }, sys), 7, "neither is a negative");
  assert.equal(poolSize({ JOB_CONCURRENCY: "2.9" }, sys), 2, "fractions round down to whole slots");
});

test("the sampled default is stable, and an explicit machine always computes fresh", () => {
  const sampled = poolSize({});
  assert.ok(sampled >= 1);
  assert.equal(poolSize({}), sampled, "sampling twice gives the same pool");
  assert.equal(poolSize({}, { cpus: 8, freeBytes: 16 * GB }), 7, "an explicit machine ignores the sample");
});
