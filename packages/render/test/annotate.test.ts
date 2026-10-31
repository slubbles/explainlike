import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, getLevel, type Architecture, type ScenePlan } from "@explainlike/core";
import { compose, loadIconPack, offFrameTexts, boxOf, textWidth, overlaps, polyBox, placeRingLabel, ringOf, scaleArrow } from "@explainlike/render";

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const plan = JSON.parse(fs.readFileSync(path.join(fx, "spotibai.plan.json"), "utf8")) as ScenePlan;
const arch = JSON.parse(fs.readFileSync(path.join(fx, "spotibai.architecture.json"), "utf8")) as Architecture;
const composed = compose({ plan, audio: [], theme: getTheme("caleb-dark"), level: getLevel("interviewing"), pack: loadIconPack(), sourceLabel: "github.com/slubbles/spotibai", arch, colorOf: (c) => (c.kind === "database" ? "blue" : "white") as any });

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

/** Points along a rough path: every move/line/curve end and samples along each cubic. */
function tracePath(d: string): [number, number][] {
  const out: [number, number][] = [];
  const toks = d.match(/[MLC]|-?\d+(\.\d+)?(e-?\d+)?/g) ?? [];
  let cmd = "", cur: [number, number] = [0, 0];
  for (let i = 0; i < toks.length;) {
    if (/[MLC]/.test(toks[i])) cmd = toks[i++];
    const n = (k: number) => Number(toks[i + k]);
    if (cmd === "C") {
      const [x1, y1, x2, y2, x, y] = [n(0), n(1), n(2), n(3), n(4), n(5)];
      for (let s = 1; s <= 12; s++) {
        const t = s / 12, u = 1 - t;
        out.push([u ** 3 * cur[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x, u ** 3 * cur[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y]);
      }
      cur = [x, y]; i += 6;
    } else { cur = [n(0), n(1)]; out.push(cur); i += 2; }
  }
  return out;
}

test("a ring around a box never runs through the box, its words, or any other word", async () => {
  const { film, sketch } = await composed;
  const texts = film.elements.filter((e) => e.k === "text").map((e) => ({ text: (e as any).text as string, t0: e.t0, g: e.g, ...boxOf(e)! }));
  const opAt = (g: string | undefined, t: number) => {
    const k = (g && film.groups[g]) || [];
    if (!k.length || t <= k[0][0]) return k[0]?.[1] ?? 1;
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (t - k[i - 1][0])) / (k[i][0] - k[i - 1][0] || 1);
    return k.at(-1)![1];
  };
  let rings = 0;
  for (const r of sketch.ellipses) {
    const paths = film.elements.filter((e) => {
      if (e.k !== "path" || e.stroke !== r.color || e.g?.startsWith("w:")) return false;
      const b = boxOf(e)!;
      return Math.abs(b.x - r.box.x) < 40 && Math.abs(b.y - r.box.y) < 40 && Math.abs(b.w - r.box.w) < 80 && Math.abs(b.h - r.box.h) < 80;
    });
    assert.ok(paths.length, "the ring is drawn");
    rings++;
    const ringed = sketch.nodes.filter((n) => n.box.x >= r.box.x && n.box.y >= r.box.y && n.box.x + n.box.w <= r.box.x + r.box.w && n.box.y + n.box.h <= r.box.y + r.box.h);
    assert.ok(ringed.length >= 1, "the ring encloses its box");
    for (const p of paths) for (const [x, y] of tracePath((p as any).d)) {
      for (const n of ringed) { const b = n.box; assert.ok(!(x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 8), `ring crosses its box ${n.id} at ${x.toFixed(0)},${y.toFixed(0)}`); }
      // every word on screen by the time the ring is drawn (later scenes draw over a cleared board)
      for (const b of texts.filter((b) => b.t0 < p.t0 + 2 && opAt(b.g, p.t0 + p.dur) > 0.05)) assert.ok(!(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h), `ring (${p.g} at ${p.t0.toFixed(1)}) crosses "${b.text}" (${b.g}) at ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
  assert.ok(rings >= 1);
});

test("ring geometry: every corner of the box sits well inside the loop", () => {
  for (const c of [{ x: 0, y: 0, w: 300, h: 230 }, { x: 10, y: 20, w: 620, h: 214 }, { x: 0, y: 0, w: 220, h: 400 }]) {
    const r = ringOf(c);
    for (const [px, py] of r.points) {
      const dx = Math.max(c.x - px, 0, px - c.x - c.w), dy = Math.max(c.y - py, 0, py - c.y - c.h);
      assert.ok(Math.hypot(dx, dy) >= 16, `loop point ${px.toFixed(0)},${py.toFixed(0)} is ${Math.hypot(dx, dy).toFixed(0)} from the box`);
    }
  }
});

test("every box's name and description fit inside the box, never cut off by its edge", async () => {
  const { film, sketch } = await composed;
  for (const n of sketch.nodes) {
    for (const t of [n.keyword, n.sub].filter(Boolean) as string[]) {
      const e = film.elements.find((x) => x.k === "text" && x.text === t && Math.abs(x.x - (n.box.x + n.box.w / 2)) < 2);
      assert.ok(e, `${n.id}: "${t}" is drawn`);
      const b = boxOf(e!)!;
      assert.ok(b.x >= n.box.x + 8 && b.x + b.w <= n.box.x + n.box.w - 8, `${n.id}: "${t}" runs past the box edge`);
    }
  }
});
