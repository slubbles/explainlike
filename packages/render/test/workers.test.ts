import { test } from "node:test";
import assert from "node:assert/strict";
import { workerCount } from "@explanimate/render";

test("a garbage worker count falls back to the default instead of emptying the pool", () => {
  assert.equal(workerCount(4, 6, 100), 4);
  assert.equal(workerCount(undefined, 6, 100), 6);
  for (const want of [Number.NaN, 0, -2, 2.5, Number.POSITIVE_INFINITY]) {
    assert.equal(workerCount(want, 6, 100), 6, String(want));
  }
  assert.equal(workerCount(40, 6, 10), 10, "never more workers than frames");
  assert.equal(workerCount(4, 6, 0), 1, "always at least one worker");
});
