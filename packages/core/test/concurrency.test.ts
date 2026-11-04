import { test } from "node:test";
import assert from "node:assert/strict";
import { apiConcurrency, defaultRenderConcurrency, ffmpegThreads, renderConcurrency } from "@explanimate/core";

test("API stages run 10 jobs at once unless API_CONCURRENCY bounds them", () => {
  assert.equal(apiConcurrency({}), 10);
  assert.equal(apiConcurrency({ API_CONCURRENCY: "4" }), 4);
  assert.equal(apiConcurrency({ API_CONCURRENCY: "4", EXPLANIMATE_API_CONCURRENCY: "2" }), 2);
  assert.equal(apiConcurrency({ API_CONCURRENCY: "many" }), 10, "garbage keeps the default");
  assert.equal(apiConcurrency({ API_CONCURRENCY: "0" }), 10, "zero is not a pool");
  assert.equal(apiConcurrency({ API_CONCURRENCY: "2.9" }), 2, "fractions round down to whole slots");
});

test("the pre-split job-slot names still set the API pool", () => {
  assert.equal(apiConcurrency({ JOB_CONCURRENCY: "3" }), 3);
  assert.equal(apiConcurrency({ EXPLANIMATE_MAX_CONCURRENT: "5", JOB_CONCURRENCY: "3" }), 5);
  assert.equal(apiConcurrency({ EXPLANIMATE_CONCURRENCY: "2" }), 2);
  assert.equal(apiConcurrency({ API_CONCURRENCY: "7", JOB_CONCURRENCY: "3" }), 7, "the new name wins");
});

test("render slots default to max(1, cpus - 2): two on a 4-core server", () => {
  assert.equal(defaultRenderConcurrency({ cpus: 4 }), 2);
  assert.equal(defaultRenderConcurrency({ cpus: 8 }), 6);
  assert.equal(defaultRenderConcurrency({ cpus: 2 }), 1);
  assert.equal(defaultRenderConcurrency({ cpus: 1 }), 1, "one core still renders one at a time");
  assert.equal(renderConcurrency({}, { cpus: 4 }), 2);
  assert.equal(renderConcurrency({ RENDER_CONCURRENCY: "1" }, { cpus: 8 }), 1);
  assert.equal(renderConcurrency({ RENDER_CONCURRENCY: "1", EXPLANIMATE_RENDER_CONCURRENCY: "3" }, { cpus: 8 }), 3, "the long name wins");
  assert.equal(renderConcurrency({ RENDER_CONCURRENCY: "many" }, { cpus: 4 }), 2, "garbage keeps the default");
});

test("ffmpeg threads split the cores across the render slots", () => {
  assert.equal(ffmpegThreads({}, { cpus: 4 }), 2, "two renders on four cores get two threads each");
  assert.equal(ffmpegThreads({}, { cpus: 8 }), 1, "six renders on eight cores get one thread each");
  assert.equal(ffmpegThreads({ RENDER_CONCURRENCY: "1" }, { cpus: 4 }), 4);
  assert.equal(ffmpegThreads({ FFMPEG_THREADS: "3" }, { cpus: 4 }), 3, "an explicit pin wins");
  assert.equal(ffmpegThreads({ FFMPEG_THREADS: "3", EXPLANIMATE_FFMPEG_THREADS: "1" }, { cpus: 4 }), 1, "the long pin wins");
});
