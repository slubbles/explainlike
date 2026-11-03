import { test } from "node:test";
import assert from "node:assert/strict";
import { alignWords } from "../src/index.js";

test("caption words keep the script's text and spoken order, even when the recogniser skips a word", () => {
  // the recogniser heard "This is post" with no gap where "Karpathy's" was said
  const heard = [
    { word: "This", start: 0, end: 0.3 },
    { word: "is", start: 0.3, end: 0.46 },
    { word: "post", start: 0.46, end: 0.9 },
  ];
  const out = alignWords("This is Karpathy’s post", heard);
  assert.deepEqual(
    out.map((w) => w.word),
    ["This", "is", "Karpathy’s", "post"],
  );
  for (let i = 0; i < out.length; i++) {
    assert.ok(out[i].end >= out[i].start, `${out[i].word} ends before it starts`);
    if (i) assert.ok(out[i].start >= out[i - 1].start, `${out[i].word} starts before ${out[i - 1].word}`);
  }
});
