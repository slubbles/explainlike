import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { noBoxesNote } from "../lib/form.ts";

test("a topic, post or article video says why it has no boxes to tap", () => {
  assert.match(noBoxesNote("how DNS works"), /explains a topic, so it has no boxes to tap/);
  assert.match(noBoxesNote("https://x.com/karpathy/status/1"), /explains an X post/);
  assert.match(noBoxesNote("https://blog.vllm.ai/2023/06/20/vllm.html"), /explains an article/);
  assert.match(noBoxesNote("https://github.com/a/b"), /no box map/);
});

test("the landing page only promises tap-to-ask for repos", () => {
  const home = fs.readFileSync(path.join(import.meta.dirname, "../components/InputScreen.tsx"), "utf8");
  assert.match(home, /<b>Interactive on repos<\/b>/);
  assert.match(home, /On a repo video, tap a box/);
});
