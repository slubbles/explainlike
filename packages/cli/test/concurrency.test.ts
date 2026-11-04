import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneConcurrency } from "../src/pipeline.ts";

test("scenes voice 8 at a time unless SCENE_CONCURRENCY bounds it, 1 to 16", () => {
  assert.equal(sceneConcurrency({}), 8);
  assert.equal(sceneConcurrency({ SCENE_CONCURRENCY: "4" }), 4);
  assert.equal(sceneConcurrency({ SCENE_CONCURRENCY: "4", EXPLANIMATE_SCENE_CONCURRENCY: "2" }), 2);
  assert.equal(sceneConcurrency({ SCENE_CONCURRENCY: "many" }), 8, "garbage keeps the default");
  assert.equal(sceneConcurrency({ SCENE_CONCURRENCY: "0" }), 1, "zero still voices one at a time");
  assert.equal(sceneConcurrency({ SCENE_CONCURRENCY: "99" }), 16, "a run never voices more than 16 at once");
});
