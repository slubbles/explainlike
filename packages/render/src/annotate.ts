import type { Box } from "./layout.js";

/**
 * Collision-aware placement for the red "what breaks at scale" annotations:
 * the circle around the busy box, its label and the big arrow to the fix.
 */
export const overlaps = (a: Box, b: Box, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
export const polyBox = (pts: [number, number][]): Box => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/** Gap between the ring and the corners of the box it circles, in world units. */
export const RING_PAD = 26;
const K = 2 ** 0.25;
/**
 * The loop drawn around a box: a rounded square-ish oval (|x/rx|^4 + |y/ry|^4 = 1).
 * It clears every corner of the box by RING_PAD, so it never runs through the box's
 * name or description, and stays closer to the box than a plain ellipse would.
 * points trace it once and a little more, like a hand closing a circle.
 */
export function ringOf(c: Box) {
  const rx = (c.w / 2) * K + RING_PAD, ry = (c.h / 2) * K + RING_PAD, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const points: [number, number][] = [];
  const sp = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
  for (let i = 0; i <= 52; i++) {
    const a = -Math.PI * 0.6 + (i / 48) * Math.PI * 2, grow = 1 + 0.035 * (i / 52);
    points.push([cx + rx * grow * sp(Math.cos(a)), cy + ry * grow * sp(Math.sin(a))]);
  }
  const g = 1 + 0.035;
  return { cx, cy, rx, ry, points, box: { x: cx - rx * g, y: cy - ry * g, w: rx * 2 * g, h: ry * 2 * g } };
}

/** Distance from the ring centre to its edge along the unit direction (ux, uy). */
export function ringReach(rx: number, ry: number, ux: number, uy: number) {
  return 1 / ((Math.abs(ux) / rx) ** 4 + (Math.abs(uy) / ry) ** 4) ** 0.25;
}

/** Distance from a box centre to its edge along the unit direction. */
export function boxReach(b: Box, ux: number, uy: number) {
  return Math.min(Math.abs(b.w / 2 / (ux || 1e-6)), Math.abs(b.h / 2 / (uy || 1e-6)));
}

/** Room the arrow needs: ring edge + gap, shaft and head, gap + fix box edge. */
export const ARROW = { gapStart: 26, gapEnd: 18, minLen: 120, half: 52, shaft: 22 };

/** Arrow polygon from the ring around `c` to box `f`; null when there is no room for a clean arrow. */
export function scaleArrow(c: Box, f: Box): [number, number][] | null {
  const ring = ringOf(c);
  const fx = f.x + f.w / 2, fy = f.y + f.h / 2;
  const ang = Math.atan2(fy - ring.cy, fx - ring.cx), ux = Math.cos(ang), uy = Math.sin(ang);
  const r0 = ringReach(ring.rx, ring.ry, ux, uy) + ARROW.gapStart;
  const r1 = Math.hypot(fx - ring.cx, fy - ring.cy) - boxReach(f, ux, uy) - ARROW.gapEnd;
  const L = r1 - r0;
  if (L < ARROW.minLen * 0.75) return null;
  const bx = ring.cx + ux * r1, by = ring.cy + uy * r1, hl = Math.min(80, L * 0.5);
  const local: [number, number][] = [[0, 0], [-hl, -ARROW.half], [-hl, -ARROW.shaft], [-L, -ARROW.shaft], [-L, ARROW.shaft], [-hl, ARROW.shaft], [-hl, ARROW.half]];
  return local.map(([x, y]) => [bx + x * ux - y * uy, by + x * uy + y * ux]);
}

/**
 * Where the fix box goes: where the layout put it if the arrow fits cleanly there,
 * else right of, below, above or left of the busy box, far enough for the ring and
 * arrow, on the first spot that does not hit another box.
 */
export function placeFix(c: Box, f: Box, others: Box[], wires: Box[] = []): Box {
  const ring = ringOf(c);
  const clear = (b: Box) => !others.some((o) => overlaps(b, o, 50)) && !wires.some((o) => overlaps(b, o, 12));
  const fits = (b: Box) => { const p = scaleArrow(c, b); return !!p && !others.some((o) => overlaps(polyBox(p), o, 10)); };
  if (fits(f) && clear(f)) return f;
  const dirs: [number, number][] = [[1, 0], [0, 1], [0, -1], [-1, 0]];
  for (const [ux, uy] of dirs) {
    const d = ringReach(ring.rx, ring.ry, ux, uy) + ARROW.gapStart + ARROW.minLen + ARROW.gapEnd + boxReach(f, ux, uy);
    const b = { ...f, x: ring.cx + ux * d - f.w / 2, y: ring.cy + uy * d - f.h / 2 };
    if (clear(b) && fits(b)) return b;
  }
  // nowhere clean: push it further right until clear
  for (let extra = 100; extra < 3000; extra += 100) {
    const d = ring.rx + ARROW.gapStart + ARROW.minLen + ARROW.gapEnd + f.w / 2 + extra;
    const b = { ...f, x: ring.cx + d - f.w / 2, y: ring.cy - f.h / 2 };
    if (clear(b)) return b;
  }
  return f;
}

/**
 * The label for the ring: the first spot around the ring that hits nothing
 * (other boxes, the fix, the arrow, the ring itself). Returns the text anchor point.
 */
export function placeRingLabel(ring: Box, lw: number, lh: number, obstacles: Box[]): { x: number; y: number; anchor: "middle" | "start"; box: Box } {
  const cx = ring.x + ring.w / 2, cy = ring.y + ring.h / 2;
  const boxes: Box[] = [];
  // nearest spots first; when all are taken, step a little further out and try again
  for (const m of [26, 26 + lh * 0.6, 26 + lh * 1.2]) for (const dy of [0, -lh * 0.8, lh * 0.8]) boxes.push(
    { x: cx - lw / 2, y: ring.y - m - lh, w: lw, h: lh },
    { x: cx - lw / 2, y: ring.y + ring.h + m, w: lw, h: lh },
    { x: ring.x - m - lw, y: cy - lh / 2 + dy, w: lw, h: lh },
    { x: ring.x + ring.w + m, y: cy - lh / 2 + dy, w: lw, h: lh },
    { x: ring.x - lw * 0.6, y: ring.y - m - lh, w: lw, h: lh },
    { x: ring.x + ring.w - lw * 0.4, y: ring.y - m - lh, w: lw, h: lh },
    { x: ring.x - lw * 0.6, y: ring.y + ring.h + m, w: lw, h: lh },
    { x: ring.x + ring.w - lw * 0.4, y: ring.y + ring.h + m, w: lw, h: lh },
  );
  const all = [ring, ...obstacles];
  const pick = boxes.find((b) => !all.some((o) => overlaps(b, o, 12))) ?? boxes.reduce((best, b) => {
    const cost = (x: Box) => all.filter((o) => overlaps(x, o, 12)).length;
    return cost(b) < cost(best) ? b : best;
  });
  return { x: pick.x + 12, y: pick.y + lh * 0.77, anchor: "start", box: pick };
}
