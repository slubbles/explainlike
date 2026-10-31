import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, getLevel, type Architecture, type ScenePlan } from "@metual/core";
import { compose, loadIconPack, offFrameTexts, textWidth, overlaps, polyBox, placeRingLabel, ringOf, scaleArrow } from "@metual/render";

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const plan = JSON.parse(fs.readFileSync(path.join(fx, "example-app.plan.json"), "utf8")) as ScenePlan;
const arch = JSON.parse(fs.readFileSync(path.join(fx, "example-app.architecture.json"), "utf8")) as Architecture;
const composed = compose({ plan, audio: [], theme: getTheme("caleb-dark"), level: getLevel("interviewing"), pack: loadIconPack(), sourceLabel: "github.com/karpathy/minbpe", arch, colorOf: (c) => (c.kind === "database" ? "blue" : "white") as any });

test("every text is fully inside the frame when it finishes appearing", async () => {
  const { film } = await composed;
  assert.deepEqual(offFrameTexts(film), []);
});

test("scale annotations: label, ring and arrow clear every box", async () => {
  const { sketch } = await composed;
  const boxes = sketch.nodes.map((n) => ({ id: n.id, ...n.box }));
  assert.ok(sketch.ellipses.length >= 1 && sketch.polygons.length >= 1);
  for (const p of sketch.polygons) {
    const pb = polyBox(p.points);
    for (const b of boxes) assert.ok(!overlaps(pb, b), `arrow overlaps ${b.id}`);
    for (const e of sketch.ellipses) assert.ok(!overlaps(pb, e.box), "arrow overlaps the ring");
  }
  const labels = sketch.texts.filter((t) => /^\d+x: /.test(t.text));
  assert.equal(labels.length, arch.scale.length);
  for (const l of labels) {
    const lb = { x: l.x - 12, y: l.y - 46, w: textWidth(l.text, 44) + 24, h: 60 };
    for (const b of boxes) assert.ok(!overlaps(lb, b), `label "${l.text}" overlaps box ${b.id}`);
    for (const e of sketch.ellipses) assert.ok(!overlaps(lb, e.box), `label "${l.text}" overlaps a ring`);
    for (const p of sketch.polygons) assert.ok(!overlaps(lb, polyBox(p.points)), `label "${l.text}" overlaps an arrow`);
  }
});

test("ring label avoids the ring, the arrow and nearby boxes", () => {
  const c = { x: 0, y: 0, w: 300, h: 230 }, f = { x: 700, y: 0, w: 300, h: 230 };
  const ring = ringOf(c), arrow = scaleArrow(c, f)!;
  assert.ok(arrow, "room for the arrow");
  const above = { x: 0, y: -400, w: 300, h: 230 }, below = { x: 0, y: 400, w: 300, h: 230 };
  const L = placeRingLabel(ring.box, 420, 60, [above, below, f, polyBox(arrow)]);
  for (const o of [ring.box, above, below, f, polyBox(arrow)]) assert.ok(!overlaps(L.box, o), JSON.stringify({ L: L.box, o }));
});

test("scale fixes never land on a wire or its label", async () => {
  const { sketch } = await composed;
  const fixes = sketch.nodes.filter((n) => n.id.startsWith("fix-"));
  assert.ok(fixes.length >= 1);
  for (const e of sketch.edges) {
    if (fixes.some((f) => f.id === e.from || f.id === e.to)) continue;
    const parts = [...(e.labelBox ? [e.labelBox] : []), ...e.points.slice(1).map(([x, y], j) => { const [px, py] = e.points[j]; return { x: Math.min(x, px), y: Math.min(y, py), w: Math.abs(x - px), h: Math.abs(y - py) }; })];
    for (const f of fixes) for (const p of parts) assert.ok(!overlaps(f.box, p), `${f.id} sits on the ${e.from}->${e.to} wire`);
  }
});

test("scale labels do not cover the small labels on wires", async () => {
  const { sketch } = await composed;
  const wireLabels = sketch.edges.flatMap((e) => (e.labelBox ? [e.labelBox] : []));
  for (const l of sketch.texts.filter((t) => /^\d+x: /.test(t.text))) {
    const w = textWidth(l.text, l.size), b = { x: l.anchor === "middle" ? l.x - w / 2 : l.x, y: l.y - l.size * 0.95, w, h: l.size * 1.25 };
    for (const wl of wireLabels) assert.ok(!overlaps(b, wl), `"${l.text}" covers a wire label`);
  }
});
