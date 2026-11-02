import type { Film } from "./film.js";

/** Something on the wall that can sit in the background of a shot: a box, a board or an arrow's label. */
export interface Backdrop { g: string; t0: number; box: { x: number; y: number; w: number; h: number } }
export interface Hidden { g: string; from: number; to: number }

/** Below this a group is drawn as context (the dimmed rest of the board); at or above it, it is what the shot is about. */
const LIT = 0.9;
/** The top of the screen holds the heading and the band behind it; nothing in the background is drawn under them. */
export const HEADING_ZONE = 150;
const EDGE = 12;
const FADE_IN = 0.4;

function opAt(keys: [number, number][] | undefined, t: number): number {
  if (!keys?.length) return 1;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return va + ((vb - va) * (t - a)) / Math.max(1e-6, b - a); }
  return keys[keys.length - 1][1];
}
/**
 * The stretches of [a, b] where a group shows as background (below LIT). Opacity keys are straight lines,
 * so each stretch starts at the key where the group begins to dim and ends at the key where it begins to light.
 */
export function dimSpans(keys: [number, number][] | undefined, a: number, b: number): [number, number][] {
  if (!keys?.length) return [];
  const ts = [a, ...keys.map(([t]) => t).filter((t) => t > a && t < b), b];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const u = opAt(keys, ts[i]), v = opAt(keys, ts[i + 1] - 1e-6);
    const dim = Math.min(u, v) < LIT && Math.max(u, v) > 0.05 && !(v > u && v >= LIT);
    if (!dim) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - ts[i]) < 1e-6) last[1] = ts[i + 1];
    else out.push([ts[i], ts[i + 1]]);
  }
  return out;
}

/**
 * Multiply a group's opacity by a mask that is 0 over each hidden span: it fades out over `fade` at the
 * span's start and back in over FADE_IN after its end. The result is still plain opacity keys, so both
 * renderers draw it the same way.
 */
export function maskGroup(keys: [number, number][] | undefined, spans: { from: number; to: number; fade: number }[]): [number, number][] {
  const s = [...spans].sort((x, y) => x.from - y.from);
  const merged: typeof s = [];
  for (const x of s) {
    const last = merged[merged.length - 1];
    if (last && x.from <= last.to + 1e-6) { last.to = Math.max(last.to, x.to); continue; }
    merged.push({ ...x });
  }
  const mk: [number, number][] = merged.flatMap((x) => {
    const out = Math.min(x.fade, Math.max(0.01, x.to - x.from));
    return [[x.from, 1], [x.from + out, 0], [x.to, 0], [x.to + FADE_IN, 1]] as [number, number][];
  });
  const mask = (t: number) => {
    let v = 1;
    for (let i = 0; i < mk.length; i += 4) {
      const [a] = mk[i], [b] = mk[i + 1], [c] = mk[i + 2], [d] = mk[i + 3];
      if (t >= a && t <= d) v = Math.min(v, t < b ? 1 - (t - a) / Math.max(1e-6, b - a) : t <= c ? 0 : (t - c) / Math.max(1e-6, d - c));
    }
    return v;
  };
  const times = [...new Set([...(keys ?? []).map(([t]) => t), ...mk.map(([t]) => t)])].sort((a, b) => a - b);
  const out = times.map((t): [number, number] => [t, +(opAt(keys, t) * mask(t)).toFixed(4)]);
  // the original keys may jump at one instant (two keys with the same time): keep the value after the jump too
  return out.filter((k, i) => i === 0 || k[0] !== out[i - 1][0] || k[1] !== out[i - 1][1]);
}

/**
 * The background of a shot never looks like a mistake: a dimmed box or label that a held shot would
 * slice at the frame edge, or that would sit under the heading, fades out for that hold and comes back
 * after it. What the shot is about (anything lit) is left to the camera and the placement pass.
 */
export function clearShots(film: Film, backdrops: Backdrop[]): Hidden[] {
  const K = film.camera;
  const spans = new Map<string, { from: number; to: number; fade: number }[]>();
  const hidden: Hidden[] = [];
  for (let i = 0; i < K.length; i++) {
    const k = K[i], from = k.t, to = i + 1 < K.length ? K[i + 1].t : film.duration;
    if (to - from < 0.05) continue;
    const s = film.width / k.w;
    for (const o of backdrops) {
      if (o.t0 >= to) continue;
      const x0 = (o.box.x - k.x) * s, y0 = (o.box.y - k.y) * s, x1 = x0 + o.box.w * s, y1 = y0 + o.box.h * s;
      if (x1 <= 0 || y1 <= 0 || x0 >= film.width || y0 >= film.height) continue;
      if (x0 >= EDGE && x1 <= film.width - EDGE && y0 >= HEADING_ZONE && y1 <= film.height - EDGE) continue;
      for (const [a, b] of dimSpans(film.groups[o.g], Math.max(from, o.t0), to)) {
        const list = spans.get(o.g) ?? [];
        // a hold that starts on this framing fades the box out with the camera move; a box that dims mid-hold fades with it
        list.push({ from: a, to: b, fade: a === from ? Math.max(0.01, Math.min(k.move, 0.5)) : 0.4 });
        spans.set(o.g, list);
        hidden.push({ g: o.g, from: a, to: b });
      }
    }
  }
  for (const [g, list] of spans) film.groups[g] = maskGroup(film.groups[g], list);
  return hidden;
}

/**
 * Check of the finished film: each settled shot (after its move, sampled through the hold) and every
 * backdrop still showing faintly in it that the frame slices or that sits under the heading.
 */
export function backdropSlips(film: Film, backdrops: Backdrop[], step = 0.25): { g: string; t: number; why: string }[] {
  const K = film.camera, out: { g: string; t: number; why: string }[] = [];
  for (let i = 0; i < K.length; i++) {
    const k = K[i], to = i + 1 < K.length ? K[i + 1].t : film.duration, s = film.width / k.w;
    for (let t = k.t + k.move; t < to; t += step) {
      for (const o of backdrops) {
        const op = opAt(film.groups[o.g], t);
        if (o.t0 > t || op <= 0.05 || op >= LIT) continue;
        const x0 = (o.box.x - k.x) * s, y0 = (o.box.y - k.y) * s, x1 = x0 + o.box.w * s, y1 = y0 + o.box.h * s;
        if (x1 <= 0 || y1 <= 0 || x0 >= film.width || y0 >= film.height) continue;
        if (y0 < HEADING_ZONE) out.push({ g: o.g, t, why: "under the heading" });
        else if (x0 < EDGE || x1 > film.width - EDGE || y1 > film.height - EDGE) out.push({ g: o.g, t, why: "cut by the frame" });
      }
    }
  }
  return out;
}
