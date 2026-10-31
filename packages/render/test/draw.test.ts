import { test } from "node:test";
import assert from "node:assert/strict";
import rough from "roughjs";
import { penOutline } from "../src/draw.js";

const gen = rough.generator({ options: { disableMultiStroke: true } });

test("pen lines: one closed outline per stroke, the same every time, and wider in some places than others", () => {
  const box = gen.rectangle(0, 0, 300, 120, { seed: 4, strokeWidth: 3 });
  const a = penOutline(box.sets[0].ops as any, 3);
  assert.equal(a, penOutline(box.sets[0].ops as any, 3));
  assert.equal(a.match(/M/g)!.length, 4, "a rectangle is four pen strokes");
  assert.ok(a.trim().endsWith("Z"));
  // a long straight line: measure the outline's thickness at many points along it
  const line = gen.line(0, 0, 1200, 0, { seed: 1, strokeWidth: 3, roughness: 0 });
  const nums = penOutline(line.sets[0].ops as any, 3).match(/-?\d+\.\d/g)!.map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1).map(Math.abs);
  assert.ok(Math.max(...ys) - Math.min(...ys.filter((y) => y > 0.5)) > 0.8, "thickness varies");
  assert.equal(penOutline([], 3), "");
});
