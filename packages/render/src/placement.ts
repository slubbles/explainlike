import type { Film, FText, CamKey } from "./film.js";
import type { Box } from "./layout.js";
import type { Sketch } from "./compose.js";
import { cameraAt } from "./check.js";
import { boxOf, readableWidth, bigChange, TITLE_BAND, CAPTION_BAND } from "./pace.js";
import { RING_PAD, ringReach } from "./annotate.js";

/**
 * The placement check that runs before a single frame is drawn: rings clear the box they circle and
 * cross no other box or word, labels sit clear of lines, arrows and other words, arrows and wires touch
 * what they join, rings sit centred on their target, nothing is cut off by the frame edge, and no word
 * is too small to read. Fix passes repeat until the plan is clean or stops improving; each fix is kept only
 * when a fresh check scores better. Slips a viewer barely notices are kept as warnings, and only a layout
 * that stays broken after a degraded fallback fails.
 */

export type RingShape = { k: "super"; cx: number; cy: number; rx: number; ry: number } | { k: "circle"; cx: number; cy: number; r: number } | { k: "rect"; box: Box };
interface MarkBase { g?: string; t0: number; dur: number }
export type Mark =
  | (MarkBase & { kind: "ring"; shape: RingShape; target: Box })
  | (MarkBase & { kind: "arrow"; points: [number, number][]; fromShape?: RingShape; fromBox?: Box; toBox: Box; line?: boolean })
  | (MarkBase & { kind: "wire"; points: [number, number][]; from?: string; to?: string; label?: Box });

export type Rule = "ring-pad" | "ring-centre" | "ring-crosses" | "label-overlap" | "arrow-touch" | "cropped" | "text-small";
export interface PlacementIssue { rule: Rule; t: number; what: string }
export interface PlacementReport {
  /** false only when something is still broken after the fallback: the video should not be drawn */
  ok: boolean;
  passes: number;
  checked: Record<string, number>;
  fixed: { pass: number; rule: Rule; what: string; how: string; fallback?: boolean }[];
  /** what still breaks the picture (a word mostly off screen, text far too small to read) */
  issues: PlacementIssue[];
  /** small slips left after the fixes (text just under the minimum, a sliver past the edge): recorded, not fatal */
  warnings: PlacementIssue[];
}
/** An issue with what the fixes need: the item, and how bad it is. */
export type Found = PlacementIssue & { item?: Item; px?: number; need?: number; seen?: number; later?: boolean; shot?: CamKey };

/** Gap, in world units, at which an arrow or wire end still reads as touching what it points at. */
export const TOUCH = 10;
/** Longest a lit word may sit half off the frame while the camera pans past it, in seconds. */
export const MID_MOVE_CUT = 0.5;
/** Smallest a word may be on a 1080p frame when it finishes appearing (a box name at 1.5x readable width). */
export const MIN_TEXT_PX = 17;
/** Smallest a secondary word (a description, a wire label, a quote) may be. */
export const MIN_SMALL_TEXT_PX = 12;

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inset = (b: Box, m: number): Box => ({ x: b.x + m, y: b.y + m, w: b.w - 2 * m, h: b.h - 2 * m });
const inBox = (p: [number, number], b: Box) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;
/** Share of b inside the frame f (a line with no height counts by its length). */
const seen = (f: Box, b: Box) => {
  const part = (f0: number, fl: number, b0: number, bl: number) => bl > 0 ? Math.max(0, Math.min(f0 + fl, b0 + bl) - Math.max(f0, b0)) / bl : b0 >= f0 && b0 <= f0 + fl ? 1 : 0;
  return Math.min(part(f.x, f.w, b.x, b.w), part(f.y, f.h, b.y, b.h));
};
const contains = (o: Box, b: Box, m = 0) => b.x >= o.x - m && b.y >= o.y - m && b.x + b.w <= o.x + o.w + m && b.y + b.h <= o.y + o.h + m;
/** Distance from p to the outline of b: positive outside, negative inside. */
function boxDist(p: [number, number], b: Box) {
  const dx = Math.max(b.x - p[0], 0, p[0] - b.x - b.w), dy = Math.max(b.y - p[1], 0, p[1] - b.y - b.h);
  if (dx || dy) return Math.hypot(dx, dy);
  return -Math.min(p[0] - b.x, b.x + b.w - p[0], p[1] - b.y, b.y + b.h - p[1]);
}
/** Does segment a-b pass through box? (Liang-Barsky clip) */
function segHits(a: [number, number], b: [number, number], box: Box) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - box.x], [dx, box.x + box.w - a[0]], [-dy, a[1] - box.y], [dy, box.y + box.h - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function inPoly(p: [number, number], poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const polyHits = (poly: [number, number][], box: Box, closed: boolean) =>
  poly.some((p, i) => (closed || i + 1 < poly.length) && segHits(p, poly[(i + 1) % poly.length], box))
  || (closed && [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].some((c) => inPoly(c as [number, number], poly)));

export function ringCentre(s: RingShape): [number, number] {
  return s.k === "rect" ? [s.box.x + s.box.w / 2, s.box.y + s.box.h / 2] : [s.cx, s.cy];
}
/** Distance from the ring centre to its line along the unit direction. */
function reach(s: RingShape, ux: number, uy: number) {
  if (s.k === "super") return ringReach(s.rx, s.ry, ux, uy);
  if (s.k === "circle") return s.r;
  return Math.min(Math.abs(s.box.w / 2 / (ux || 1e-9)), Math.abs(s.box.h / 2 / (uy || 1e-9)));
}
function ringPoints(s: RingShape, n = 120): [number, number][] {
  const [cx, cy] = ringCentre(s);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a), r = reach(s, ux, uy);
    return [cx + ux * r, cy + uy * r] as [number, number];
  });
}
const ringBox = (s: RingShape): Box => s.k === "rect" ? s.box : s.k === "circle" ? { x: s.cx - s.r, y: s.cy - s.r, w: 2 * s.r, h: 2 * s.r } : { x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry };
const MIN_PAD = { super: RING_PAD * 0.5, circle: 8, rect: 4 } as const;

export interface Placed { film: Film; sketch: Sketch; marks: Mark[] }

function opacity(film: Film, g: string | undefined, t: number) {
  const k = g ? film.groups[g] : undefined;
  if (!k?.length) return 1;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) { const [t0, v0] = k[i - 1], [t1, v1] = k[i]; return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0); }
  return k[k.length - 1][1];
}
/** When the camera has settled after t (a move under way finishes first). */
function settled(film: Film, t: number) {
  for (const k of film.camera) if (k.t <= t && k.t + k.move > t) t = k.t + k.move;
  return t + 0.01;
}

/**
 * The first camera move after t that drags a lit word half off the frame for longer than
 * MID_MOVE_CUT: a slow pan that slides a word out over a second or more reads as a cut-off label
 * even though both shots it moves between are clean.
 */
function cutMidMove(film: Film, box: Box, g: string | undefined, t: number, only?: CamKey): { k: CamKey; t: number; dur: number; seen: number } | undefined {
  const end = film.end?.t0 ?? film.duration, dt = 0.1;
  for (const k of film.camera) {
    if ((only && k !== only) || k.move <= 0 || k.t < t - 0.01 || k.t >= end) continue;
    let dur = 0, low = 1, at = 0;
    for (let s = k.t + dt / 2; s < Math.min(end, k.t + k.move); s += dt) {
      if (opacity(film, g, s) < 0.6) continue;
      const c = cameraAt(film, s), v = seen(c, box);
      if (v > 0 && !contains(c, box, -(4 * c.w) / film.width)) { if (!dur) at = s; dur += dt; low = Math.min(low, v); }
    }
    if (dur > MID_MOVE_CUT) return { k, t: at, dur, seen: low };
  }
  return undefined;
}

/** How much of the box at each end of a board arrow must be in shot with it (world px). */
const END_SLICE = 120;
const clipBox = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
};
const unionOf = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export interface Item { kind: "text" | "node" | "ring" | "arrow" | "wire"; box: Box; t0: number; g?: string; owner?: number; el?: FText; mark?: Mark; label: string }

function items(p: Placed): Item[] {
  const out: Item[] = [];
  const nodes = p.sketch.nodes;
  for (const e of p.film.elements) {
    if (e.k !== "text" || e.anim === "count") continue;
    // the glyphs themselves: ascenders to descenders, not the roomy line box
    const lb = boxOf(e)!, b = { x: lb.x, y: e.y - e.size * 0.8, w: lb.w, h: e.size * 1.05 };
    const c: [number, number] = [b.x + b.w / 2, b.y + b.h / 2];
    // a word belongs to a box when it sits in it and is written as the box is drawn; a later label over it does not
    const owner = nodes.findIndex((n) => inBox(c, n.box) && (n.t0 === undefined || (e.t0 >= n.t0 - 0.05 && e.t0 <= n.t0 + 2.5)));
    out.push({ kind: "text", box: b, t0: e.t0 + e.dur, g: e.g, owner: owner >= 0 ? owner : undefined, el: e, label: `"${e.text}"` });
  }
  nodes.forEach((n, i) => {
    const own = out.find((x) => x.kind === "text" && x.owner === i);
    out.push({ kind: "node", box: n.box, t0: n.t0 ?? own?.t0 ?? 0, g: own?.g, owner: i, label: `box "${n.keyword}"` });
  });
  for (const m of p.marks) {
    const box = m.kind === "ring" ? ringBox(m.shape) : (() => {
      const xs = m.points.map((q) => q[0]), ys = m.points.map((q) => q[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    })();
    // a board's arrow reads only with a piece of the box at each end in shot, or it seems to come from nowhere
    const shown = m.kind === "wire" && m.g && !m.g.startsWith("e:") && m.points.length > 1
      ? [box, ...([[m.from, m.points[0]], [m.to, m.points[m.points.length - 1]]] as const).flatMap(([id, q]) => {
        const nb = nodes.filter((n) => n.id === id).sort((a, b) => Math.abs(boxDist(q, a.box)) - Math.abs(boxDist(q, b.box)))[0]?.box;
        return nb && Math.abs(boxDist(q, nb)) <= TOUCH * 4 ? [clipBox({ x: q[0] - END_SLICE, y: q[1] - END_SLICE, w: 2 * END_SLICE, h: 2 * END_SLICE }, nb)] : [];
      })].reduce(unionOf)
      : box;
    out.push({ kind: m.kind, box: shown, t0: m.t0 + m.dur, g: m.g, mark: m, label: m.kind === "wire" ? `wire ${m.from}>${m.to}` : `${m.kind} at ${(m.t0).toFixed(1)}s` });
  }
  return out;
}

/** The first time both stay on screen together (each at least faintly) for half a second, or undefined;
 * a crossfade between scenes is not "together". */
function together(film: Film, a: Item, b: Item): number | undefined {
  const end = film.end?.t0 ?? film.duration;
  let run = 0;
  for (let t = Math.max(a.t0, b.t0); t < end; t += 0.25) {
    run = opacity(film, a.g, t) > 0.2 && opacity(film, b.g, t) > 0.2 ? run + 1 : 0;
    if (run >= 3) return t - 0.5;
  }
  return undefined;
}

export function checkPlacement(p: Placed, counts: Record<string, number> = {}): Found[] {
  const { film } = p, out: Found[] = [];
  const all = items(p);
  const count = (r: Rule) => (counts[r] = (counts[r] ?? 0) + 1);
  const texts = all.filter((i) => i.kind === "text"), nodes = all.filter((i) => i.kind === "node");
  const nodeBox = (id: string | undefined, near: [number, number]) => {
    const cs = p.sketch.nodes.filter((n) => n.id === id);
    return cs.sort((a, b) => Math.abs(boxDist(near, a.box)) - Math.abs(boxDist(near, b.box)))[0]?.box;
  };

  for (const it of all) {
    const m = it.mark;
    if (m?.kind === "ring") {
      const [cx, cy] = ringCentre(m.shape), tc: [number, number] = [m.target.x + m.target.w / 2, m.target.y + m.target.h / 2];
      count("ring-centre");
      if (Math.hypot(cx - tc[0], cy - tc[1]) > 2) out.push({ rule: "ring-centre", t: m.t0, what: `${it.label} is ${Math.hypot(cx - tc[0], cy - tc[1]).toFixed(0)} off the centre of what it circles` });
      count("ring-pad");
      const gap = Math.min(...[[m.target.x, m.target.y], [m.target.x + m.target.w, m.target.y], [m.target.x, m.target.y + m.target.h], [m.target.x + m.target.w, m.target.y + m.target.h]].map(([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) || 1e-9;
        return reach(m.shape, (x - cx) / d, (y - cy) / d) - d;
      }));
      if (gap < MIN_PAD[m.shape.k] - 0.5) out.push({ rule: "ring-pad", t: m.t0, what: `${it.label} clears what it circles by ${gap.toFixed(0)} (needs ${MIN_PAD[m.shape.k]})` });
      const pts = ringPoints(m.shape);
      for (const o of [...texts, ...nodes]) {
        if (contains(m.target, o.box, 2) || (o.kind === "node" && contains(o.box, m.target, 2))) continue;
        const when = together(film, it, o);
        if (when === undefined) continue;
        count("ring-crosses");
        const hit = o.kind === "text" ? pts.some((q) => inBox(q, inset(o.box, -3))) : pts.some((q) => inBox(q, o.box));
        if (hit) out.push({ rule: "ring-crosses", t: when, what: `${it.label} crosses ${o.label}` });
      }
    }
    if (m?.kind === "arrow") {
      count("arrow-touch");
      const tip = m.line ? m.points[m.points.length - 1] : m.points[0];
      const tail: [number, number] = m.line ? m.points[0] : [(m.points[3][0] + m.points[4][0]) / 2, (m.points[3][1] + m.points[4][1]) / 2];
      const dTip = boxDist(tip, m.toBox);
      let dTail = m.fromBox ? boxDist(tail, m.fromBox) : 0;
      if (m.fromShape) {
        const [cx, cy] = ringCentre(m.fromShape), d = Math.hypot(tail[0] - cx, tail[1] - cy) || 1e-9;
        dTail = d - reach(m.fromShape, (tail[0] - cx) / d, (tail[1] - cy) / d);
      }
      if (Math.abs(dTip) > TOUCH || Math.abs(dTail) > TOUCH) out.push({ rule: "arrow-touch", t: m.t0, what: `${it.label} stops ${dTail.toFixed(0)} from where it starts and ${dTip.toFixed(0)} from what it points at` });
    }
    if (m?.kind === "wire" && m.points.length > 1) {
      count("arrow-touch");
      const a = m.points[0], b = m.points[m.points.length - 1], fb = nodeBox(m.from, a), tb = nodeBox(m.to, b);
      const da = fb ? boxDist(a, fb) : 0, db = tb ? boxDist(b, tb) : 0;
      if (Math.abs(da) > TOUCH || Math.abs(db) > TOUCH) out.push({ rule: "arrow-touch", t: m.t0, what: `${it.label} ends ${da.toFixed(0)} from ${m.from} and ${db.toFixed(0)} from ${m.to}` });
    }
  }

  // labels: clear of other words, of boxes they are not part of, of wires, arrows and lines
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    const near = (o: Item) => area(inset(a.box, -4), inset(o.box, -1)) > 0; // a straight wire has a box with no height
    for (const o of [...texts.slice(i + 1), ...nodes, ...all.filter((x) => x.kind === "arrow" || x.kind === "wire")]) {
      if (o === a || !near(o)) continue;
      if (o.kind === "node" && a.owner === o.owner) continue;
      if (o.kind === "text" && a.owner !== undefined && a.owner === o.owner) { count("label-overlap"); if (area(a.box, o.box) > 4) out.push({ rule: "label-overlap", t: a.t0, what: `${a.label} overlaps ${o.label}`, item: a }); continue; }
      const when = together(film, a, o);
      if (when === undefined) continue;
      count("label-overlap");
      let hit = false;
      if (o.kind === "text") hit = area(a.box, o.box) > 4;
      else if (o.kind === "node") hit = a.owner === undefined && area(a.box, o.box) > 4 && !contains(o.box, a.box);
      else if (o.mark?.kind === "wire") hit = !(o.mark.label && area(a.box, o.mark.label) > 0) && polyHits(o.mark.points, inset(a.box, 2), false);
      else if (o.mark?.kind === "arrow") hit = polyHits(o.mark.points, inset(a.box, 2), !o.mark.line);
      if (hit) out.push({ rule: "label-overlap", t: when, what: `${a.label} overlaps ${o.label}`, item: a.owner === undefined ? a : o.kind === "text" && o.owner === undefined ? o : undefined });
    }
  }

  // the frame: every word, ring and arrow whole on screen as it finishes, and words big enough to read
  for (const it of all) {
    // a system wire may lead off screen to a box out of shot; a board's own arrows are whole, like its words
    if (it.kind === "node" || (it.kind === "wire" && (!it.g || it.g.startsWith("e:")))) continue;
    const t = settled(film, it.t0);
    if (t >= (film.end?.t0 ?? film.duration) || opacity(film, it.g, t) < 0.6) continue;
    const cam = cameraAt(film, t), m = (4 * cam.w) / film.width;
    count("cropped");
    if (!contains(cam, it.box, -m)) out.push({ rule: "cropped", t, what: `${it.label} is cut off by the frame edge`, item: it, seen: seen(cam, it.box) });
    else {
      // it stays whole while it is lit, through every later shot that comes to rest on part of it
      // (a word a later shot slices is a slip to fix, never a reason to stop the video)
      const end = film.end?.t0 ?? film.duration;
      for (const k of film.camera) {
        const r = k.t + k.move + 0.01;
        if (k.t <= t || r >= end || opacity(film, it.g, r) < 0.6) continue;
        const c = cameraAt(film, r);
        if (!contains(c, it.box, -m) && seen(c, it.box) > 0) { out.push({ rule: "cropped", t: r, what: `${it.label} is cut off by the frame edge at ${r.toFixed(1)}s`, item: it, seen: seen(c, it.box), later: it.kind === "text" }); break; }
      }
      // and no pan drags it half off the frame for long on the way between two clean shots
      const last = out[out.length - 1];
      if (it.kind === "text" && !(last?.item === it && last.rule === "cropped")) {
        const cut = cutMidMove(film, it.box, it.g, t);
        if (cut) out.push({ rule: "cropped", t: cut.t, what: `${it.label} is cut off by the frame edge for ${cut.dur.toFixed(1)}s while the camera moves at ${cut.t.toFixed(1)}s`, item: it, seen: cut.seen, later: true, shot: cut.k });
      }
    }
    if (it.el) {
      // a word may first appear in a wide overview, but the camera must bring it to a readable size while it is lit
      count("text-small");
      let px = 0;
      for (let s = t; s < (film.end?.t0 ?? film.duration) && opacity(film, it.g, s) > 0.6; s += 0.25) px = Math.max(px, (it.el.size * film.width) / cameraAt(film, s).w);
      const min = it.el.size >= 34 ? MIN_TEXT_PX : MIN_SMALL_TEXT_PX;
      if (px < min - 0.05) out.push({ rule: "text-small", t, what: `${it.label} is at most ${px.toFixed(1)} px tall on screen (needs ${min})`, item: it, px, need: min });
    }
  }
  return out;
}

/** Move a free label to the nearest spot where it overlaps nothing; true when it moved. */
function nudge(p: Placed, it: Item): string | undefined {
  const e = it.el!, b = it.box, step = Math.max(12, b.h * 0.5);
  const others = items(p).filter((o) => o.el !== e);
  const clear = (nb: Box) => others.every((o) => {
    if (o.kind === "wire" && o.mark?.kind === "wire") return !polyHits(o.mark.points, inset(nb, -2), false) || (o.mark.label && area(b, o.mark.label) > 0);
    if (o.kind === "arrow" && o.mark?.kind === "arrow") return !polyHits(o.mark.points, inset(nb, -2), !o.mark.line);
    // rings and boxes get a wide berth, so a moved label never reads as part of them
    if (o.kind === "ring") return area(inset(nb, -12), o.box) === 0 || together(p.film, it, o) === undefined;
    return area(inset(nb, o.kind === "node" ? -12 : -6), o.box) === 0 || together(p.film, it, o) === undefined;
  });
  const dirs = Array.from({ length: 16 }, (_, i) => [Math.round(Math.sin((i * Math.PI) / 8) * 100) / 100, -Math.round(Math.cos((i * Math.PI) / 8) * 100) / 100]);
  for (let r = 1; r <= 12; r++) for (const [dx, dy] of dirs) {
    const nb = { ...b, x: b.x + dx * r * step, y: b.y + dy * r * step };
    if (!clear(nb)) continue;
    const s = p.sketch.texts.find((x) => x.x === e.x && x.y === e.y && x.text === e.text);
    e.x += dx * r * step; e.y += dy * r * step;
    if (s) { s.x = e.x; s.y = e.y; }
    return `moved ${Math.round(Math.hypot(dx, dy) * r * step)} world px`;
  }
  return undefined;
}

/** Enlarge a free label (not part of a box) until it reads at the minimum size; the next pass rechecks its room. */
function enlarge(p: Placed, it: Item, what: string): string | undefined {
  const m = /at most ([\d.]+) px tall on screen \(needs (\d+)\)/.exec(what);
  if (!m || it.owner !== undefined || !it.el) return undefined;
  const e = it.el, from = e.size;
  e.size = Math.ceil((from * (Number(m[2]) + 0.5)) / Number(m[1]));
  const s = p.sketch.texts.find((x) => x.x === e.x && x.y === e.y && x.text === e.text);
  if (s && "size" in s) (s as { size: number }).size = e.size;
  return `enlarged from ${from} to ${e.size}`;
}


/** The shots that cut an item off while it is lit: the one it finishes in, and every later shot that
 * comes to rest on part of it, so one fix covers the whole time it is on screen. */
function cropShots(p: Placed, it: Item): { k: CamKey; r: number }[] {
  const { film } = p, K = film.camera, end = film.end?.t0 ?? film.duration, start = settled(film, it.t0);
  let i0 = 0;
  for (let i = 0; i < K.length; i++) if (K[i].t <= start) i0 = i;
  const out: { k: CamKey; r: number }[] = [];
  for (let i = i0; i < K.length; i++) {
    const k = K[i], r = i === i0 ? start : k.t + k.move + 0.01;
    if (i > i0 && r >= end) break;
    if (opacity(film, it.g, r) < 0.6) continue;
    const m = (4 * k.w) / film.width;
    if (!contains(k, it.box, -m) && (i === i0 || seen(k, it.box) > 0)) out.push({ k, r });
  }
  return out;
}

/** Does the new frame cut through something lit that the old frame showed whole or left out entirely? */
function slices(p: Placed, before: Box, after: Box, r: number, skip: Item) {
  return sliced(p, before, after, r, skip).length > 0;
}
function sliced(p: Placed, before: Box, after: Box, r: number, skip: Item): Item[] {
  const cut = (f: Box, b: Box) => !contains(f, b) && area(f, b) > 0;
  return items(p).filter((o) => o.kind !== "wire" && o.kind !== "node" && o.label !== skip.label && o.t0 <= r && opacity(p.film, o.g, r) > 0.6
    && cut(after, o.box) && !cut(before, o.box));
}

/** Slide one shot, same size, so the item sits whole inside it (clear of the title, and of the captions when there is room). */
function pan(p: Placed, it: Item, k: CamKey, r: number): boolean {
  const { film } = p, b = it.box, m = (4 * k.w) / film.width;
  const top = film.headings.some((x) => r >= x.t0 && r < x.t1) ? (TITLE_BAND * k.h) / film.height : 0;
  for (const [pad, bottom] of [[30, (CAPTION_BAND * k.h) / film.height], [30, 0], [8, 0]]) {
    const lx = b.x + b.w + pad + m - k.w, hx = b.x - pad - m, ly = b.y + b.h + pad + m + bottom - k.h, hy = b.y - pad - m - top;
    if (lx > hx || ly > hy) continue;
    const nf = { ...k, x: Math.min(hx, Math.max(lx, k.x)), y: Math.min(hy, Math.max(ly, k.y)) };
    if (slices(p, k, nf, r, it)) continue;
    reframe(film, k, { x: nf.x, y: nf.y, w: k.w, h: k.h });
    return true;
  }
  return false;
}

/** Widen one shot just enough to take the item in. Capped: never past the width where box names stay readable. */
function widen(p: Placed, it: Item, k: CamKey, r: number, capped: boolean, depth = 0): boolean {
  const { film } = p, pad = 30, b = it.box;
  // a mark's own label (same group, already written) rides along so the title never covers it either
  const top = Math.min(b.y, ...items(p).filter((o) => o.kind === "text" && it.kind !== "text" && it.g && o.g === it.g && o.t0 <= r).map((o) => o.box.y));
  const x0 = Math.min(k.x, b.x - pad), x1 = Math.max(k.x + k.w, b.x + b.w + pad), y1 = Math.max(k.y + k.h, b.y + b.h + pad);
  let y0 = Math.min(k.y, b.y - pad), w = 0, h = 0;
  // when the shot grows upward to reach the item while a scene title is up, leave the title its band
  const titled = film.headings.some((x) => r >= x.t0 && r < x.t1), up = top - pad < k.y;
  for (let i = 0; i < (titled && up ? 4 : 1); i++) {
    w = Math.max(x1 - x0, ((y1 - y0) * film.width) / film.height);
    h = (w * film.height) / film.width;
    if (titled && up) y0 = top - pad - (TITLE_BAND * h) / film.height;
  }
  // unless that room would slice something already lit on the board: then reach just the item
  const cut = (f: Box) => items(p).some((o) => o.kind !== "wire" && o.t0 <= r && opacity(film, o.g, r) > 0.6 && area(f, o.box) > 0 && area(f, o.box) < o.box.w * o.box.h - 1);
  if (titled && up && cut({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h })) {
    y0 = Math.min(k.y, b.y - pad);
    w = Math.max(x1 - x0, ((y1 - y0) * film.width) / film.height);
    h = (w * film.height) / film.width;
  }
  if (capped && w > readableWidth(film) * 1.5 && w > k.w * 1.05) return false;
  const nf = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  // the wider shot must not newly slice a lit word or mark at its edge: it takes those in too, within the same cap
  const hit = sliced(p, k, nf, r, it);
  if (hit.length) {
    const xs = [b, ...hit.map((o) => o.box)];
    const all = { x: Math.min(...xs.map((q) => q.x)), y: Math.min(...xs.map((q) => q.y)), w: 0, h: 0 };
    all.w = Math.max(...xs.map((q) => q.x + q.w)) - all.x; all.h = Math.max(...xs.map((q) => q.y + q.h)) - all.y;
    return depth < 2 && widen(p, { ...it, box: all }, k, r, capped, depth + 1);
  }
  reframe(film, k, nf);
  return true;
}

/**
 * Give a shot a new frame. Keys right after it that the viewer cannot tell apart from it (a pace fix
 * may leave a small drift inside one hold) are the same shot on screen, so they take the new frame too:
 * changing only the first would turn one long hold into a cut the beat check never saw.
 */
function reframe(film: Placed["film"], k: CamKey, nf: Box) {
  const K = film.camera, was = { x: k.x, y: k.y, w: k.w, h: k.h };
  for (let j = K.indexOf(k) + 1; j > 0 && j < K.length && !bigChange(was, K[j]); j++) Object.assign(K[j], { x: nf.x, y: nf.y, w: nf.w, h: nf.h });
  Object.assign(k, { x: nf.x, y: nf.y, w: nf.w, h: nf.h });
}

/** Ways to bring a cut-off item whole into every shot that cuts it, gentlest first: slide, slide or widen, widen. */
function reframes(p: Placed, it: Item, fallback: boolean): (() => string | undefined)[] {
  const all = (verb: string, f: (k: CamKey, r: number) => boolean) => () => {
    const shots = cropShots(p, it);
    if (!shots.length || !shots.every(({ k, r }) => f(k, r))) return undefined;
    return `${verb} the shot${shots.length > 1 ? "s" : ""} at ${shots.map(({ k }) => `${k.t.toFixed(1)}s`).join(", ")}${verb === "panned" ? "" : ` (now ${shots.map(({ k }) => Math.round(k.w)).join(", ")} wide)`}`;
  };
  const out = [
    all("panned", (k, r) => pan(p, it, k, r)),
    all("panned or widened", (k, r) => pan(p, it, k, r) || widen(p, it, k, r, true)),
    all("widened", (k, r) => widen(p, it, k, r, true)),
  ];
  if (fallback) out.push(all("widened past the readable size", (k, r) => widen(p, it, k, r, false)));
  return out;
}

/**
 * Fixes for a word a pan drags half off the frame: frame the shot the pan lands on so the word
 * stays whole, or, when that shot cannot take it in, pan quicker so the word leaves at once.
 */
function passing(p: Placed, it: Item, k: CamKey): (() => string | undefined)[] {
  const r = k.t + k.move + 0.01, at = `the shot at ${k.t.toFixed(1)}s`;
  const quicker = () => {
    const was = k.move;
    for (const f of [0.75, 0.6, 0.45]) {
      k.move = Math.max(0.5, was * f);
      if (!cutMidMove(p.film, it.box, it.g, it.t0, k)) return `panned quicker into ${at} (${was.toFixed(1)}s to ${k.move.toFixed(1)}s) so the word leaves at once`;
    }
    k.move = was;
    return undefined;
  };
  return [
    () => (pan(p, it, k, r) ? `panned ${at} to keep it whole` : undefined),
    () => (widen(p, it, k, r, true) ? `widened ${at} to keep it whole (now ${Math.round(k.w)} wide)` : undefined),
    quicker,
  ];
}

/** Left after the fixes, does this break the picture, or is it a slip worth a warning? */
export function severe(i: Found): boolean {
  if (i.rule === "cropped") return !i.later && (i.seen ?? 0) < 0.75;
  if (i.rule === "text-small") return (i.px ?? 0) < (i.need ?? 0) * 0.6;
  return false;
}
/** Lower is better: breaks weigh most, then crops, then the rest. */
// (a word sliding off during a pan weighs a little less than one cut at rest, so a fix that trades the second for the first is kept and the pan is fixed next)
const score = (fs: Found[]) => fs.reduce((s, i) => s + (severe(i) ? 10 : i.rule === "cropped" ? (i.shot ? 3 : 4) : i.rule === "text-small" ? 1 : 2), 0);

/** Everything a fix may change, so a fix that makes things worse can be undone. */
function snapshot(p: Placed) {
  const cam = p.film.camera.map((k) => ({ ...k }));
  const els = p.film.elements.map((e) => (e.k === "text" ? { x: e.x, y: e.y, size: e.size } : undefined));
  const texts = p.sketch.texts.map((t) => ({ x: t.x, y: t.y, size: (t as { size?: number }).size }));
  return () => {
    p.film.camera.forEach((k, i) => Object.assign(k, cam[i]));
    p.film.elements.forEach((e, i) => { if (e.k === "text") Object.assign(e, els[i]); });
    p.sketch.texts.forEach((t, i) => Object.assign(t, texts[i]));
  };
}

/** Try each fix on its own; keep the one a fresh check scores best, if it beats what is there now. */
function bestFix(p: Placed, fixes: (() => string | undefined)[], now: number): string | undefined {
  const undo = snapshot(p);
  let best: { i: number; s: number } | undefined;
  fixes.forEach((f, i) => {
    if (f()) { const s = score(checkPlacement(p)); if (s < now && (!best || s < best.s)) best = { i, s }; }
    undo();
  });
  return best ? fixes[best.i]() : undefined;
}

export function placementPass(p: Placed, passes = 8): PlacementReport {
  const fixed: PlacementReport["fixed"] = [];
  let found = checkPlacement(p), n = 0;
  const same = (a: Found, b: Found) => a.rule === b.rule && a.item?.el === b.item?.el && a.item?.mark === b.item?.mark;
  // repeat until clean or a whole pass gains nothing; the fallback may widen past the readable size
  const run = (fallback: boolean) => {
    for (let i = 0; i < passes && found.length; i++) {
      const before = score(found);
      let any = false;
      n++;
      for (const is of [...found]) {
        if (!is.item || !found.some((f) => same(f, is)) || (fallback && !last(is))) continue;
        const fixes = is.rule === "label-overlap" && is.item.el ? [() => nudge(p, is.item!)]
          : is.rule === "cropped" ? (is.shot ? passing(p, is.item, is.shot) : reframes(p, is.item, fallback))
          : is.rule === "text-small" ? [() => enlarge(p, is.item!, is.what)] : [];
        const how = fixes.length ? bestFix(p, fixes, score(found)) : undefined;
        if (!how) continue;
        found = checkPlacement(p);
        fixed.push({ pass: n, rule: is.rule, what: is.what, how, ...(fallback ? { fallback: true } : {}) });
        any = true;
      }
      if (!any || score(found) >= before) break;
    }
  };
  // a cut-off item is worth a smaller picture; anything else that is only a slip is left as a warning
  const last = (i: Found) => severe(i) || i.rule === "cropped";
  run(false);
  if (found.some(last)) run(true);
  const checked: Record<string, number> = {};
  checkPlacement(p, checked);
  const plain = ({ rule, t, what }: Found): PlacementIssue => ({ rule, t: Math.round(t * 100) / 100, what });
  const issues = found.filter(severe).map(plain), warnings = found.filter((i) => !severe(i)).map(plain);
  return { ok: !issues.length, passes: n, checked, fixed, issues, warnings };
}
