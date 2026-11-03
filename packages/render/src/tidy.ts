import type { Box } from "./layout.js";
import type { Sketch } from "./compose.js";
import { textWidth } from "./measure.js";
import { overlaps, polyBox } from "./annotate.js";

/** Box a sketch text covers, matching how the Excalidraw export places it. */
export function textBox(t: { x: number; y: number; size: number; text: string; anchor: "start" | "middle" }): Box {
  const w = textWidth(t.text, t.size),
    h = t.size * 1.25;
  return { x: t.anchor === "middle" ? t.x - w / 2 : t.x, y: t.y - t.size * 0.95, w, h };
}

/**
 * The video shows one scene at a time, so notes from different scenes can sit on top of each other
 * once everything is drawn together. Move each note (and edge label) the least it takes to clear
 * the boxes, rings, arrows and every note placed before it.
 */
export function separateNotes(sk: Sketch, pad = 4): Sketch {
  const out: Sketch = structuredClone(sk);
  const fixed: Box[] = [...out.nodes.map((n) => n.box), ...out.polygons.map((p) => polyBox(p.points)), ...out.images.map((i) => i.box)];
  const placed: Box[] = [];
  const clear = (b: Box, skipFixed = false) =>
    (skipFixed || !fixed.some((o) => overlaps(b, o, pad))) && !placed.some((o) => overlaps(b, o, pad));
  const nudge = (b: Box): [number, number] => {
    if (clear(b)) return [0, 0];
    const step = b.h + pad;
    for (let k = 1; k <= 8; k++)
      for (const [dx, dy] of [
        [0, k * step],
        [0, -k * step],
        [k * step * 2, 0],
        [-k * step * 2, 0],
      ]) {
        if (clear({ ...b, x: b.x + dx, y: b.y + dy })) return [dx, dy];
      }
    return [0, 0];
  };
  for (const e of out.edges) {
    if (!e.label || !e.labelBox) continue;
    const [dx, dy] = nudge(e.labelBox);
    e.labelBox = { ...e.labelBox, x: e.labelBox.x + dx, y: e.labelBox.y + dy };
    placed.push(e.labelBox);
  }
  // notes also keep off the red rings; edge labels may sit inside one, since the ring circles their box
  fixed.push(...out.ellipses.map((e) => e.box));
  for (const t of out.texts) {
    const b = textBox(t);
    const [dx, dy] = nudge(b);
    t.x += dx;
    t.y += dy;
    placed.push({ ...b, x: b.x + dx, y: b.y + dy });
  }
  return out;
}

/** Every item in the sketch with its box and a way to move it. */
function items(sk: Sketch) {
  const all: { box: Box; move: (dx: number, dy: number) => void }[] = [];
  const mvBox = (b: Box) => (dx: number, dy: number) => {
    b.x += dx;
    b.y += dy;
  };
  for (const n of sk.nodes) all.push({ box: n.box, move: mvBox(n.box) });
  for (const i of sk.images) all.push({ box: i.box, move: mvBox(i.box) });
  for (const e of sk.ellipses) all.push({ box: e.box, move: mvBox(e.box) });
  for (const p of sk.polygons)
    all.push({
      box: polyBox(p.points),
      move: (dx, dy) => {
        p.points = p.points.map(([x, y]) => [x + dx, y + dy]);
      },
    });
  for (const e of sk.edges) {
    const boxes = [polyBox(e.points), ...(e.labelBox ? [e.labelBox] : [])];
    const u = boxes.reduce((a, b) => ({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
      h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
    }));
    all.push({
      box: u,
      move: (dx, dy) => {
        e.points = e.points.map(([x, y]) => [x + dx, y + dy]);
        if (e.labelBox) e.labelBox = { ...e.labelBox, x: e.labelBox.x + dx, y: e.labelBox.y + dy };
      },
    });
  }
  for (const t of sk.texts)
    all.push({
      box: textBox(t),
      move: (dx, dy) => {
        t.x += dx;
        t.y += dy;
      },
    });
  return all;
}

/** Close any empty band wider than `gap` along one axis, sliding everything after it back. */
function closeGaps(sk: Sketch, axis: "x" | "y", gap: number) {
  const its = items(sk);
  const lo = (b: Box) => (axis === "x" ? b.x : b.y),
    hi = (b: Box) => (axis === "x" ? b.x + b.w : b.y + b.h);
  const order = [...its].sort((a, b) => lo(a.box) - lo(b.box));
  let reach = -Infinity,
    shift = 0;
  for (const it of order) {
    const s = lo(it.box),
      e = hi(it.box);
    if (reach > -Infinity && s - reach > gap) shift += s - reach - gap;
    reach = Math.max(reach, e);
    if (shift) it.move(axis === "x" ? -shift : 0, axis === "y" ? -shift : 0);
  }
}

/** Make the exported whiteboard read well on its own: no stacked notes, no big empty bands. */
export function tidySketch(sk: Sketch, gap = 160): Sketch {
  const out = separateNotes(sk);
  closeGaps(out, "y", gap);
  closeGaps(out, "x", gap);
  return out;
}

/** Widest empty band along an axis, for tests. */
export function widestGap(sk: Sketch, axis: "x" | "y"): number {
  const bs = items(structuredClone(sk))
    .map((i) => i.box)
    .sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
  let reach = -Infinity,
    widest = 0;
  for (const b of bs) {
    const s = axis === "x" ? b.x : b.y,
      e = axis === "x" ? b.x + b.w : b.y + b.h;
    if (reach > -Infinity) widest = Math.max(widest, s - reach);
    reach = Math.max(reach, e);
  }
  return widest;
}
