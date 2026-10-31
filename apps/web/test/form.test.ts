import { test } from "node:test";
import assert from "node:assert/strict";
import { formFromJob, sourceKind, shortLink } from "../lib/form.ts";

test("reopening a saved job brings back its own link, level and voice", () => {
  assert.deepEqual(formFromJob({ input: "https://github.com/karpathy/minbpe", level: "interviewing", voice: "silent" }),
    { input: "https://github.com/karpathy/minbpe", level: "interviewing", voice: "silent" });
  assert.deepEqual(formFromJob({ input: "https://x.com/a/status/1", level: "senior", voice: "deepgram" }).level, "senior");
});

test("an old or broken job falls back to the defaults instead of an unknown choice", () => {
  assert.deepEqual(formFromJob({ input: "https://blog.vllm.ai/x", level: "wizard" }), { input: "https://blog.vllm.ai/x", level: "new", voice: "deepgram" });
  assert.deepEqual(formFromJob({}), { input: "", level: "new", voice: "deepgram" });
});

test("links are named and shortened the way the gallery shows them", () => {
  assert.equal(sourceKind("https://github.com/umami-software/umami"), "repo");
  assert.equal(sourceKind("https://x.com/karpathy/status/1977755427569111362"), "X post");
  assert.equal(sourceKind("https://blog.vllm.ai/2023/06/20/vllm.html"), "article");
  assert.equal(shortLink("https://www.github.com/slubbles/metual/"), "github.com/slubbles/metual");
});
