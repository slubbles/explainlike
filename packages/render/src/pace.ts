import type { Film, FElement, CamKey } from "./film.js";
import type { Box } from "./layout.js";
import { textWidth } from "./measure.js";
import { cameraAt } from "./check.js";

/**
 * How busy the video feels. "calm" is the original slow explainer.
 * "lively" follows the short-form explainer rules: a new shot every ~2.7 s,
 * something new on screen at least every ~1.2 s, black section cards,
 * captions next to the thing being talked about.
 */
export type Pace = "calm" | "lively";
export const LIVELY = { shot: 2.7, hold: 1.2, punch: 0, push: 0.6, card: 1.0, capWords: 4, capChars: 26 };

export interface Span { start: number; end: number; kind: string }

/** World-space box an element covers. */
export function boxOf(e: FElement): Box | undefined {
  if (e.k === "img") return { x: e.x, y: e.y, w: e.w, h: e.h };
  if (e.k === "text") {
    const w = textWidth(e.text, e.size), a = e.anchor ?? "start";
    return { x: a === "middle" ? e.x - w / 2 : a === "end" ? e.x - w : e.x, y: e.y - e.size * 0.95, w, h: e.size * 1.25 };
  }
  const pts: number[] = e.k === "dot" ? e.pts.flat() : (e.d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  if (pts.length < 2) return undefined;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const union = (bs: Box[]): Box | undefined => {
  if (!bs.length) return undefined;
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
};
const overlaps = (b: Box, v: Box) => b.x < v.x + v.w && v.x < b.x + b.w && b.y < v.y + v.h && v.y < b.y + b.h;
const inside = (b: Box, v: Box) => b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h;

/** Camera view that frames b below the heading and above the captions (same margins as the composer). */
function fitView(film: Film, b: Box, minW: number): Omit<CamKey, "t" | "move"> {
  const W = film.width, H = film.height, SAFE = { top: 160, bottom: 120, side: 110 };
  const bw = Math.max(b.w + 120, minW), bh = Math.max(b.h + 120, (minW * (H - SAFE.top - SAFE.bottom)) / (W - 2 * SAFE.side));
  const s = Math.min((W - 2 * SAFE.side) / bw, (H - SAFE.top - SAFE.bottom) / bh);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, screenCy = SAFE.top + (H - SAFE.top - SAFE.bottom) / 2;
  return { x: cx - W / s / 2, y: cy - screenCy / s, w: W / s, h: H / s };
}

const PUNCH_KINDS = new Set(["layer", "walkthrough", "scale", "recap", "notes", "board", "establish"]);

/**
 * Every moment something changes on screen: an element starting to appear,
 * the camera moving, a new caption phrase, a heading or a section card.
 */
export function changes(film: Film): [number, number][] {
  const out: [number, number][] = [];
  for (const e of film.elements) out.push([e.t0, e.t0 + e.dur]);
  for (const k of film.camera) out.push([k.t, k.t + k.move]);
  for (const c of film.captions) out.push([c.t0, c.t0 + 0.15]);
  for (const h of film.headings) out.push([h.t0, h.t0 + 0.5]);
  for (const c of film.cards ?? []) out.push([c.t0, c.t1]);
  for (const f of film.fades) out.push([f.t - f.dur, f.t + f.dur]);
  return out.sort((a, b) => a[0] - b[0]);
}

/** Stretches inside [from, to] where nothing at all changes. */
export function stillGaps(film: Film, from: number, to: number): { t0: number; t1: number }[] {
  const gaps: { t0: number; t1: number }[] = [];
  let busy = from;
  for (const [a, b] of changes(film)) {
    if (b < from || a > to) continue;
    if (a > busy) gaps.push({ t0: busy, t1: a });
    busy = Math.max(busy, b);
  }
  if (to > busy) gaps.push({ t0: busy, t1: to });
  return gaps;
}

const bigChange = (a: Omit<CamKey, "t" | "move">, b: Omit<CamKey, "t" | "move">) =>
  Math.abs(Math.log(b.w / a.w)) > 0.15 || Math.hypot(b.x + b.w / 2 - a.x - a.w / 2, b.y + b.h / 2 - a.y - a.h / 2) / a.w > 0.15;

/** Times a new shot starts: section cards, and camera moves that change the framing a lot. */
export function shotStarts(film: Film): number[] {
  const out = (film.cards ?? []).flatMap((c) => [c.t0, c.t1]);
  let prev = film.camera[0];
  for (const k of film.camera.slice(1)) {
    if (bigChange(prev, k)) out.push(k.t);
    prev = k;
  }
  return out.sort((a, b) => a - b);
}

/**
 * Turn a calm film into a lively one, in place.
 * 1. quicker slide/push moves between scenes
 * 2. a hard cut to a close-up of what is being drawn, or back out, whenever a shot runs long
 * 3. a slow push wherever the picture would otherwise sit still
 * 4. captions placed next to what they talk about
 */
/** Slide view v so it lies inside outer (when it is smaller). */
function within(v: Box, outer: Box): Box {
  const x = v.w <= outer.w ? Math.min(Math.max(v.x, outer.x), outer.x + outer.w - v.w) : v.x;
  const y = v.h <= outer.h ? Math.min(Math.max(v.y, outer.y), outer.y + outer.h - v.h) : v.y;
  return { ...v, x, y };
}

export function applyPace(film: Film, scenes: Span[]) {
  film.camera.sort((a, b) => a.t - b.t);
  for (const k of film.camera) if (k.move > LIVELY.push && scenes.some((s) => Math.abs(k.t - s.start) < 0.05)) k.move = LIVELY.push;
  const home = film.camera.map((k) => ({ ...k }));
  const homeAt = (t: number) => cameraAt({ ...film, camera: home }, t);
  const boxes = film.elements.map((e) => ({ e, b: boxOf(e) })).filter((x): x is { e: FElement; b: Box } => !!x.b);

  // 2. shots
  for (const s of scenes) {
    if (!PUNCH_KINDS.has(s.kind)) continue;
    let cut = s.start, punched = false;
    while (cut + LIVELY.shot < s.end - 1.0) {
      const tp = cut + LIVELY.shot;
      // the scene's own camera move only counts as a new shot when it changes the framing a lot
      const own = home.find((k, i) => k.t > cut + 0.05 && k.t <= tp + 0.8 && i > 0 && bigChange(home[i - 1], k));
      if (own) { cut = own.t; punched = false; continue; }
      const base = homeAt(tp + 0.01);
      const next = Math.min(tp + LIVELY.shot, s.end);
      const soon = boxes.filter(({ e, b }) => e.t0 + e.dur >= tp - 0.3 && e.t0 < next && inside(b, base)).map((x) => x.b);
      const recent = boxes.filter(({ e, b }) => e.t0 >= tp - 1.6 && e.t0 < tp && e.k !== "path" && inside(b, base)).map((x) => x.b);
      const focus = union(soon.length ? soon : recent);
      // boxes and words already on screen: a close-up may leave them out, but never slice one in half
      const shown = boxes.filter(({ e, b }) => e.k !== "path" && e.t0 < next && inside(b, base)).map((x) => x.b);
      const sliced = (v: Box) => shown.filter((b) => overlaps(b, v) && !inside(b, v));
      let view: Omit<CamKey, "t" | "move"> | undefined;
      if (punched) view = { x: base.x, y: base.y, w: base.w, h: base.h };
      else if (focus) {
        let f: Box = focus;
        for (let i = 0; i < 4 && f.w < base.w * 0.6 && f.h < base.h * 0.6; i++) {
          // a close-up stays inside the wide shot, so cutting back out never slices what it showed
          const v = within(fitView(film, f, base.w * 0.55), base), cut = sliced(v);
          if (!cut.length) { view = v; break; }
          f = union([f, ...cut])!;
        }
      }
      if (!view && !punched && !soon.length) {
        const z = 0.88, v = { x: base.x + (base.w * (1 - z)) / 2, y: base.y + (base.h * (1 - z)) / 2, w: base.w * z, h: base.h * z };
        if (!sliced(v).length) view = v;
      }
      if (view && soon.every((b) => inside(b, view!))) {
        film.camera.push({ t: tp, ...view, move: LIVELY.punch });
        film.camera.sort((a, b) => a.t - b.t);
        punched = !punched;
      }
      cut = tp;
    }
    // end each scene on its own framing so the next scene starts from a known view
    if (punched) { const b = homeAt(s.end - 0.6); film.camera.push({ t: s.end - 0.6, ...b, move: 0.4 }); film.camera.sort((a, b) => a.t - b.t); }
  }

  // 3. no dead holds: a slow push through any still stretch
  for (const s of scenes) {
    for (const g of stillGaps(film, s.start, s.end)) {
      if (g.t1 - g.t0 <= LIVELY.hold) continue;
      const cur = cameraAt(film, g.t0), z = 0.96;
      film.camera.push({ t: g.t0, x: cur.x + (cur.w * (1 - z)) / 2, y: cur.y + (cur.h * (1 - z)) / 2, w: cur.w * z, h: cur.h * z, move: g.t1 - g.t0 - 0.05 });
      film.camera.sort((a, b) => a.t - b.t);
    }
  }

  // 4. captions sit by the thing being said
  for (const c of film.captions) {
    const sc = scenes.find((s) => c.t0 >= s.start && c.t0 < s.end);
    if (!sc || !PUNCH_KINDS.has(sc.kind)) continue;
    const near = boxes.filter(({ e }) => e.k !== "path" && e.k !== "dot" && e.t0 >= Math.max(sc.start, c.t0 - 1.5) && e.t0 < c.t1);
    const last = boxes.filter(({ e }) => e.k !== "path" && e.k !== "dot" && e.t0 >= sc.start && e.t0 < c.t1).at(-1);
    const u = union(near.map((x) => x.b));
    const v = cameraAt(film, c.t0);
    const at = u && u.w < v.w * 0.5 ? u : last?.b;
    if (at) c.at = at;
  }
}
