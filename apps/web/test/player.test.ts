import { test } from "node:test";
import assert from "node:assert/strict";
import { chipClass } from "../components/Player";

test("a centered box keeps the plain label above it", () => {
  assert.equal(chipClass({ l: 40, tp: 40, w: 20 }), "hit");
});

test("a box near the top shows its label below it instead of off the video", () => {
  assert.equal(chipClass({ l: 40, tp: 5, w: 20 }), "hit below");
});

test("a box near the left pins its label to its own left edge", () => {
  assert.equal(chipClass({ l: 2, tp: 40, w: 12 }), "hit rl");
});

test("a box near the right pins its label to its own right edge", () => {
  assert.equal(chipClass({ l: 80, tp: 40, w: 12 }), "hit rr");
});

test("a corner box flips down and pins sideways at once", () => {
  assert.equal(chipClass({ l: 2, tp: 5, w: 12 }), "hit below rl");
});

test("a box spanning edge to edge keeps its label centered", () => {
  assert.equal(chipClass({ l: 5, tp: 40, w: 90 }), "hit");
});
