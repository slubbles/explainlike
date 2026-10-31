import { test } from "node:test";
import assert from "node:assert/strict";
import { formFromJob, sourceKind, shortLink } from "../lib/form.ts";

test("reopening a saved job brings back its own link and voice", () => {
  assert.deepEqual(formFromJob({ input: "https://github.com/karpathy/minbpe", voice: "silent" }),
    { input: "https://github.com/karpathy/minbpe", voice: "silent" });
});

test("an old or broken job falls back to the defaults, and an old level is ignored", () => {
  assert.deepEqual(formFromJob({ input: "https://blog.vllm.ai/x", level: "senior", voice: "wizard" } as never), { input: "https://blog.vllm.ai/x", voice: "deepgram" });
  assert.deepEqual(formFromJob({}), { input: "", voice: "deepgram" });
});

test("links are named and shortened the way the gallery shows them", () => {
  assert.equal(sourceKind("https://github.com/umami-software/umami"), "repo");
  assert.equal(sourceKind("https://x.com/karpathy/status/1977755427569111362"), "X post");
  assert.equal(sourceKind("https://blog.vllm.ai/2023/06/20/vllm.html"), "article");
  assert.equal(shortLink("https://www.github.com/slubbles/explainlike/"), "github.com/slubbles/explainlike");
});
