import fs from "node:fs";
import rough from "roughjs";
import { agreementSlips, phraseAt } from "@explainlike/core";
import type { Architecture, ScenePlan, Scene, SceneAudio, Theme, ExplainSpec, Color, WordTiming, NoteItem } from "@explainlike/core";
import type { Film, FElement, CamKey, Caption, Heading } from "./film.js";
import { applyTempo, readableWidth, type PaceReport } from "./pace.js";
import { placementPass, type Mark, type PlacementReport } from "./placement.js";
import { layoutGraph, unionBox, shiftLayout, wrapText, NODE, type Box, type GNode, type GEdge, type Layout, type PlacedNode, type PlacedEdge } from "./layout.js";
import { textWidth, fontDataUrl, useHandFont, HAND_FONTS } from "./measure.js";
import { penOutline } from "./draw.js";
import type { IconPack } from "./icons.js";
import { resolveIcon } from "./icons.js";
import { ringOf, scaleArrow, placeFix, placeRingLabel, polyBox } from "./annotate.js";
import path from "node:path";

export const W = 1920, H = 1080, FPS = 30;
const LEAD = 0.3;
const SAFE = { top: 160, bottom: 180, side: 110 };
let gen = rough.generator();

/** Concept board nodes are big: a large doodle (or an icon grid), a big keyword, the source quote underneath. */
export const BOARD = { boxH: 260, icon: 150, kw: 54, quote: 28, qLine: 38, qMaxW: 430, label: 34 };
function gridOf(count: number) {
  const cols = count <= 3 ? count : count === 4 ? 2 : 3, rows = Math.ceil(count / cols);
  const size = Math.min(92, Math.floor(178 / rows) - 10);
  return { cols, rows, size };
}
export function boardSize(n: GNode) {
  const g = (n.count ?? 1) > 1 ? gridOf(n.count!) : undefined;
  const qw = Math.max(0, ...(n.quote ?? []).map((l) => textWidth(l, BOARD.quote)));
  const w = Math.max(340, textWidth(n.keyword, BOARD.kw) + 90, g ? g.cols * (g.size + 14) + 70 : 0, qw + 40);
  const h = BOARD.boxH + (n.quote?.length ? 22 + n.quote.length * BOARD.qLine : 0);
  return { w, h };
}

/** Notes: a whiteboard list (panel) or labels pinned on the canvas. */
const NOTE = { row: 128, icon: 96, size: 54, gap: 34, tag: 30 };
function panelSize(items: NoteItem[]) {
  const w = Math.max(...items.map((i) => NOTE.icon + 40 + textWidth(i.text, NOTE.size) + (i.estimate ? textWidth("estimate", NOTE.tag) + 70 : 0)));
  const foot = items.some((i) => i.estimate) ? 90 : 0;
  return { w: Math.max(900, w + 40), h: items.length * NOTE.row + foot + 40 };
}

/** What the .excalidraw writer needs: the final state of every drawn object. */
export interface Sketch {
  nodes: { id: string; box: Box; color: string; keyword: string; sub?: string; icon?: string; iconSize?: number; kwY?: number; kwSize?: number; t0?: number; board?: boolean }[];
  edges: { points: [number, number][]; label?: string; labelBox?: Box; both?: boolean; color: string; from?: string; to?: string; labelSize?: number }[];
  ellipses: { box: Box; color: string }[];
  polygons: { points: [number, number][]; color: string }[];
  texts: { x: number; y: number; text: string; size: number; color: string; anchor: "start" | "middle" }[];
  images: { box: Box; file: string }[];
}

export interface SourceShot { file: string; width: number; height: number; rects: Record<string, Box[]> }

export interface ComposeInput {
  plan: ScenePlan;
  audio: SceneAudio[];
  theme: Theme;
  spec: ExplainSpec;
  pack: IconPack;
  /** short label of the source for the end card, e.g. "github.com/umami-software/umami" */
  sourceLabel: string;
  arch?: Architecture;
  colorOf?: (c: Architecture["components"][number]) => Color;
  shot?: SourceShot;
}

const normW = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
function iconHref(pack: IconPack, name: string | undefined, cache: Map<string, string>): { href?: string; file?: string } {
  const k = name ? resolveIcon(pack, name) : undefined;
  if (!k) return {};
  const file = path.resolve(pack.dir, pack.icons[k].file);
  if (!cache.has(file)) cache.set(file, `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`);
  return { href: cache.get(file), file };
}

class Builder {
  els: FElement[] = [];
  groups: Record<string, [number, number][]> = {};
  cur = new Map<string, number>();
  cam: CamKey[] = [];
  sketch: Sketch = { nodes: [], edges: [], ellipses: [], polygons: [], texts: [], images: [] };
  /** every ring, arrow and wire with what it points at, for the placement check */
  marks: Mark[] = [];
  seed = 7;
  n = 0;
  icons = new Map<string, string>();
  constructor(public theme: Theme, public pack: IconPack) {}
  id(p: string) { return `${p}${this.n++}`; }

  rough(drawable: any, t0: number, dur: number, g?: string, anim: "draw" | "pop" | "fade" = "draw", origin?: [number, number]) {
    const ps = gen.toPaths(drawable);
    const pen = this.theme.stroke === "pen";
    ps.forEach((p: any, i: number) => {
      const set = drawable.sets[i];
      const outline = pen && set?.type !== "fillPath" && p.stroke !== "none" ? penOutline(set.ops, set.type === "fillSketch" ? p.strokeWidth * 0.8 : p.strokeWidth) || undefined : undefined;
      this.els.push({ k: "path", id: this.id("p"), d: p.d, stroke: p.stroke === "none" ? "none" : p.stroke, sw: p.strokeWidth, fill: p.fill && p.fill !== "none" ? p.fill : undefined, outline, t0: t0 + i * dur * 0.15, dur: dur * (ps.length > 1 ? 0.85 : 1), g, anim, origin });
    });
  }
  /** a ring, arrow or highlight: drawn like rough(), and the camera holds still while it draws */
  ring(drawable: any, t0: number, dur: number, g?: string) {
    const n = this.els.length;
    this.rough(drawable, t0, dur, g);
    for (const e of this.els.slice(n)) e.mark = true;
  }
  text(o: { text: string; x: number; y: number; size: number; color: string; anchor?: "start" | "middle"; t0: number; dur?: number; g?: string; bg?: boolean; font?: "hand" | "sans"; weight?: number; anim?: "wipe" | "fade"; sketch?: boolean }) {
    this.els.push({ k: "text", id: this.id("t"), text: o.text, x: o.x, y: o.y, size: o.size, color: o.color, anchor: o.anchor ?? "start", t0: o.t0, dur: o.dur ?? Math.min(0.9, 0.25 + o.text.length * 0.025), g: o.g, bg: o.bg ? this.theme.background : undefined, font: o.font, weight: o.weight, anim: o.anim });
    if (o.sketch !== false) this.sketch.texts.push({ x: o.x, y: o.y, text: o.text, size: o.size, color: o.color, anchor: o.anchor ?? "start" });
  }
  setOp(g: string, t: number, v: number, dur = 0.5) {
    const k = (this.groups[g] ??= []);
    const c = this.cur.get(g) ?? 1;
    if (c === v) return;
    k.push([t, c], [t + dur, v]);
    this.cur.set(g, v);
  }
  node(n: PlacedNode, t0: number, g: string) {
    const c = n.color;
    this.rough(gen.rectangle(n.x, n.y, n.w, n.h, { seed: this.seed++, stroke: c, strokeWidth: 3.2, roughness: 1.1, bowing: 1.2 }), t0, 0.6, g);
    const ic = iconHref(this.pack, n.icon, this.icons);
    this.img({ href: ic.href, x: n.x + n.w / 2 - NODE.icon / 2, y: n.y + 16, w: NODE.icon, h: NODE.icon, t0: t0 + 0.3, dur: 0.45, g });
    this.text({ text: n.keyword, x: n.x + n.w / 2, y: n.y + 160, size: NODE.kwSize, color: this.theme.ink, anchor: "middle", t0: t0 + 0.5, dur: 0.45, g, sketch: false });
    if (n.sub) this.text({ text: n.sub, x: n.x + n.w / 2, y: n.y + 194, size: NODE.subSize, color: this.theme.edgeLabel, anchor: "middle", t0: t0 + 0.9, dur: 0.4, g, anim: "fade", sketch: false });
    this.sketch.nodes.push({ id: n.id, box: { x: n.x, y: n.y, w: n.w, h: n.h }, color: c, keyword: n.keyword, sub: n.sub, icon: ic.file, t0 });
    return t0 + 1.0;
  }
  img(o: { href?: string; x: number; y: number; w: number; h: number; t0: number; dur: number; g?: string; anim?: "pop" | "fade" }) {
    if (!o.href) return;
    this.els.push({ k: "img", id: this.id("i"), href: o.href, x: o.x, y: o.y, w: o.w, h: o.h, t0: o.t0, dur: o.dur, g: o.g, anim: o.anim, invert: this.theme.invertIcons || undefined });
  }
  /** Big concept-board node: doodle or icon grid, large keyword, quote below the box. */
  boardNode(n: PlacedNode, t0: number, g: string) {
    const c = n.color, bh = BOARD.boxH;
    this.rough(gen.rectangle(n.x, n.y, n.w, bh, { seed: this.seed++, stroke: c, strokeWidth: 4, roughness: 1.2, bowing: 1.3 }), t0, 0.6, g);
    const ic = iconHref(this.pack, n.icon, this.icons);
    const cx = n.x + n.w / 2;
    if ((n.count ?? 1) > 1) {
      const gr = gridOf(n.count!), cell = gr.size + 14;
      const gx = cx - (gr.cols * cell) / 2 + 7, gy = n.y + 20 + (190 - gr.rows * cell) / 2;
      for (let i = 0; i < n.count!; i++) {
        const r = Math.floor(i / gr.cols), col = i % gr.cols;
        const rowN = Math.min(gr.cols, n.count! - r * gr.cols);
        const off = ((gr.cols - rowN) * cell) / 2;
        this.img({ href: ic.href, x: gx + off + col * cell, y: gy + r * cell, w: gr.size, h: gr.size, t0: t0 + 0.25 + i * 0.07, dur: 0.35, g });
      }
    } else this.img({ href: ic.href, x: cx - BOARD.icon / 2, y: n.y + 18, w: BOARD.icon, h: BOARD.icon, t0: t0 + 0.3, dur: 0.5, g });
    this.text({ text: n.keyword, x: cx, y: n.y + bh - 40, size: BOARD.kw, color: this.theme.ink, anchor: "middle", t0: t0 + 0.55, dur: 0.5, g, sketch: false });
    (n.quote ?? []).forEach((l, i) => this.text({ text: l, x: cx, y: n.y + bh + 22 + (i + 0.8) * BOARD.qLine, size: BOARD.quote, color: this.theme.colors.gray, anchor: "middle", t0: t0 + 0.9 + i * 0.15, dur: 0.5, g, anim: "fade" }));
    this.sketch.nodes.push({ id: n.id, box: { x: n.x, y: n.y, w: n.w, h: bh }, color: c, keyword: n.keyword, icon: ic.file, iconSize: (n.count ?? 1) > 1 ? 120 : BOARD.icon, kwY: bh - 40, kwSize: BOARD.kw, t0, board: true });
    return t0 + 1.0;
  }
  /** A tag like "estimate" so assumed numbers can never pass as facts. */
  tag(text: string, x: number, y: number, size: number, color: string, t0: number, g: string) {
    const w = textWidth(text, size) + 28, h = size * 1.5;
    this.rough(gen.rectangle(x, y - h * 0.72, w, h, { seed: this.seed++, stroke: color, strokeWidth: 2.4, roughness: 1.0 }), t0, 0.3, g);
    this.text({ text, x: x + 14, y: y, size, color, t0: t0 + 0.1, dur: 0.3, g, anim: "fade" });
    return w;
  }
  edge(e: PlacedEdge, t0: number, g: string, color = this.theme.edge, labelSize = NODE.labelSize) {
    if (e.points.length < 2) return t0;
    let len = 0;
    for (let i = 1; i < e.points.length; i++) len += Math.hypot(e.points[i][0] - e.points[i - 1][0], e.points[i][1] - e.points[i - 1][1]);
    const dur = Math.max(0.35, Math.min(0.9, len / 900));
    this.ring(gen.linearPath(e.points, { seed: this.seed++, stroke: color, strokeWidth: 2.6, roughness: 0.7, bowing: 0.5 }), t0, dur, g);
    const head = (a: [number, number], b: [number, number], t: number) => {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 20;
      const p1: [number, number] = [b[0] - L * Math.cos(ang - 0.5), b[1] - L * Math.sin(ang - 0.5)];
      const p2: [number, number] = [b[0] - L * Math.cos(ang + 0.5), b[1] - L * Math.sin(ang + 0.5)];
      this.ring(gen.linearPath([p1, b, p2], { seed: this.seed++, stroke: color, strokeWidth: 2.8, roughness: 0.5 }), t, 0.2, g);
    };
    const P = e.points;
    head(P[P.length - 2], P[P.length - 1], t0 + dur);
    if (e.both) head(P[1], P[0], t0 + dur);
    if (e.label && e.labelBox) {
      const lb = e.labelBox;
      this.text({ text: e.label, x: lb.x + lb.w / 2, y: lb.y + lb.h * 0.72, size: labelSize, color: this.theme.edgeLabel, anchor: "middle", t0: t0 + dur * 0.6, dur: 0.4, g, bg: true, sketch: false });
    }
    this.sketch.edges.push({ points: e.points, label: e.label, labelBox: e.labelBox, both: e.both, color, from: e.from, to: e.to, labelSize });
    this.marks.push({ kind: "wire", g, t0, dur, points: e.points, from: e.from, to: e.to });
    return t0 + dur + 0.25;
  }
  fit(b: Box, t: number, move: number, maxScale = 1.15, whole: Box[] = []) {
    // a box the shot would slice through at its edge is taken in whole, unless that widens the shot by half again
    for (let pass = 0; pass < 2 && whole.length; pass++) {
      const r = this.frame(b, maxScale);
      const cut = whole.filter((o) => o.x < r.x + r.w && o.x + o.w > r.x && o.y < r.y + r.h && o.y + o.h > r.y && !(o.x >= r.x && o.y >= r.y && o.x + o.w <= r.x + r.w && o.y + o.h <= r.y + r.h));
      if (!cut.length) break;
      const nb = unionBox([b, ...cut], 0);
      if (this.frame(nb, maxScale).w > r.w * 1.5) break;
      b = nb;
    }
    const r = this.frame(b, maxScale);
    this.cam.push({ t, ...r, move });
  }
  private frame(b: Box, maxScale: number) {
    const minW = 900, minH = 480;
    const bw = Math.max(b.w, minW), bh = Math.max(b.h, minH);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const s = Math.min((W - 2 * SAFE.side) / bw, (H - SAFE.top - SAFE.bottom) / bh, maxScale);
    const cw = W / s, ch = H / s;
    const screenCy = SAFE.top + (H - SAFE.top - SAFE.bottom) / 2;
    return { x: cx - cw / 2, y: cy - screenCy / s, w: cw, h: ch };
  }
}

/**
 * How many leading words of the hook to draw as kinetic type: its first sentence, when it is a short
 * question or claim (3 to 16 words), the recogniser timed it word for word, and more narration follows.
 */
export function kineticLine(narration: string, words: WordTiming[]): number {
  const first = narration.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  const n = first.split(/\s+/).filter(Boolean).length;
  if (n < 3 || n > 16 || words.length < n + 6) return 0;
  return words.slice(0, n).map((w) => w.word).join(" ") === first.replace(/\s+/g, " ") ? n : 0;
}
const FLAT = /^(the|and|of|a|an|to|in|on|for|at|is|it|its|by|with|you|your|does|do|how|why|what|when|that|this|from|into|just|every|ever|can|will|would|could|be|are|was|were|has|have|had|own)$/;
/** The word the hook line lands on: its last content word, drawn in the accent colour and underlined. */
export function keyWordIndex(words: string[]): number {
  for (let i = words.length - 1; i >= 0; i--) { const w = normW(words[i]); if (w.length >= 4 && !FLAT.test(w)) return i; }
  return words.length - 1;
}
/** Greedy rows of word indices that fit maxW at this size. */
function wordRows(words: string[], size: number, maxW: number): number[][] {
  const rows: number[][] = [[]];
  let w = 0;
  const sp = textWidth(" ", size);
  words.forEach((t, i) => {
    const tw = textWidth(t, size);
    if (rows[rows.length - 1].length && w + sp + tw > maxW) { rows.push([]); w = 0; }
    w += (rows[rows.length - 1].length ? sp : 0) + tw;
    rows[rows.length - 1].push(i);
  });
  return rows;
}

const STOP = new Set(["the", "and", "of", "a", "an", "to", "in", "on", "for", "at", "is", "it", "its", "by", "with", "vs", "in", "x"]);
const sameWord = (a: string, b: string) => a === b || (b.length >= 4 && a.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))));
/** Content words of `phrase` that the narration does not say. */
export function unspokenWords(phrase: string, narration: string): string[] {
  const said = narration.split(/[\s\-_/]+/).map(normW).filter(Boolean);
  return phrase.split(/[\s\-_/]+/).map(normW).filter((w) => w && !STOP.has(w) && !/^\d+x?$/.test(w)).filter((w) => !said.some((s) => sameWord(s, w)));
}
/**
 * The heading the viewer reads while hearing the scene: the planned heading when the
 * narration says every word of it, else the first alternative it does say
 * (a scale scene's problem), else the planned heading.
 */
export function spokenHeading(heading: string, narration: string, alts: string[] = []): string {
  const h = heading.toLowerCase();
  if (!unspokenWords(h, narration).length) return h;
  const alt = alts.map((a) => a.toLowerCase()).find((a) => a.trim() && !unspokenWords(a, narration).length);
  return alt ?? h;
}

/** Find when a phrase is spoken: index into words at or after `from`. */
function spokenAt(words: WordTiming[], phrase: string, from = 0): number {
  const toks = phrase.split(/[\s\-_/]+/).map(normW).filter(Boolean);
  if (!toks.length) return -1;
  const m = (a: string, b: string) => a === b || (b.length >= 4 && a.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))));
  // the phrase as said, allowing "sends the message" for "send message"
  const at = phraseAt(words.map((w) => w.word), phrase, from);
  if (at >= 0) return at;
  if (toks.length > 1) for (let i = from; i < words.length; i++) if (toks.some((t) => t.length > 3 && m(normW(words[i].word), t))) return i;
  return -1;
}

/** Longest wait, in seconds, from a scene opening to its first new element. */
export const FIRST_WITHIN = 1.0;

/** Times for a sequence of events: keyword-synced when spoken, else spread evenly; always ordered and spaced. */
/**
 * Camera shots that follow a run of events, each with the box it needs ("box") and the box it would
 * share with the event before it in the same shot ("wide"). Every way to split the run into consecutive
 * shots is tried (a scene has a handful of events); the one whose widest shot is narrowest wins, then the
 * one with fewer cuts. A shot starts one move before its first event and holds at least a full beat.
 * `holdUntilSettled` moves each event's time to no earlier than its shot has settled.
 */
function followShots(ev: { t: number; box: Box; wide: Box }[], start: number, end: number, tempo: { move: number; minBeat: number }, W: number, H: number): { t: number; box: Box; first: number }[] {
  const span = (b: Box) => Math.max(b.w, (b.h * W) / H);
  const n = Math.min(ev.length, 12);
  let shots: { t: number; box: Box; first: number }[] = [], best = Infinity;
  for (let mask = 0; n > 0 && mask < 1 << (n - 1); mask++) {
    const cand: { t: number; box: Box; first: number }[] = [];
    for (let i = 0; i < n; i++) {
      const cut = i === 0 || (mask >> (i - 1)) & 1;
      if (!cut) { const cur = cand[cand.length - 1], u = unionBox([cur.box, ev[i].wide], 0); cur.box = span(u) <= span(unionBox([cur.box, ev[i].box], 0)) * 1.25 ? u : unionBox([cur.box, ev[i].box], 0); continue; }
      cand.push({ t: start, box: ev[i].box, first: i });
    }
    // each cut lands one move before its first event, a full beat after the cut before it,
    // and never before the last event of the shot before it has been drawn for a moment
    const lo = (k: number) => Math.max(cand[k - 1].t + tempo.minBeat, ev[cand[k].first - 1].t + 1.2);
    for (let k = 1; k < cand.length; k++) cand[k].t = Math.max(ev[cand[k].first].t - tempo.move - 0.15, lo(k));
    // the last shot must still hold a full beat: pull the cuts earlier where there is room (the camera then
    // arrives a little before the voice reaches it, which reads better than a cramped last shot)
    let cap = end - tempo.minBeat;
    for (let k = cand.length - 1; k >= 1; k--) { if (cand[k].t > cap) cand[k].t = cap; cap = cand[k].t - tempo.minBeat; }
    let ok = true, late = 0;
    for (let k = 1; k < cand.length && ok; k++) {
      const e = ev[cand[k].first], t = cand[k].t;
      // a shot may settle up to 2 s (2.6 at the slow tempo) after its first event was due; the caller holds that drawing until it has
      // (a late drawing costs, so a shot that keeps pace with the voice wins a tie)
      ok = t >= lo(k) - 1e-6 && t + tempo.move <= e.t + Math.max(2.0, tempo.minBeat - 2.2) && t + tempo.minBeat <= end + 1e-6;
      late += Math.max(0, t + tempo.move - e.t);
    }
    if (!ok) continue;
    const score = Math.max(...cand.map((c) => span(c.box))) + cand.length * 40 + late * 300;
    if (score < best) { best = score; shots = cand; }
  }
  for (let i = n; i < ev.length && shots.length; i++) { const cur = shots[shots.length - 1]; cur.box = unionBox([cur.box, ev[i].box], 0); }
  return shots;
}
function holdUntilSettled(times: number[], shots: { t: number; first: number }[], move: number) {
  for (const sh of shots) if (sh.first > 0) times[sh.first] = Math.max(times[sh.first], sh.t + move + 0.05);
  for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1]);
}

function eventTimes(words: WordTiming[], phrases: string[][], start: number, end: number, gap = 0.9): number[] {
  const raw: (number | null)[] = [];
  let from = 0;
  for (const alts of phrases) {
    let idx = -1;
    for (const p of alts) { idx = spokenAt(words, p, from); if (idx >= 0) break; }
    if (idx >= 0) { raw.push(words[idx].start); from = idx + 1; } else raw.push(null);
  }
  const n = raw.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = raw[i] ?? start + ((end - start) * (i + 0.5)) / n;
    if (raw[i] == null) {
      // keep unsynced events between synced neighbours
      const prev = out[i - 1] ?? start - gap;
      const next = raw.slice(i + 1).find((x) => x != null);
      if (next != null) t = Math.min(Math.max(t, prev + gap), next - gap);
    }
    out.push(t);
  }
  // the first thing is drawn soon after the scene opens, so the board never sits empty while the narrator warms up
  if (n && out[0] > start + FIRST_WITHIN) out[0] = start + FIRST_WITHIN;
  for (let i = 0; i < n; i++) out[i] = Math.max(out[i], (out[i - 1] ?? start - gap) + gap, start);
  return out.map((t) => Math.min(t, Math.max(start, end)));
}

/** Words that lead into what follows; a caption phrase does not end on one. */
const LEADS_ON = /^(how|why|what|which|because|than|not|a|an|the|of|on|to|in|at|for|with|by|from|into|onto|about|just|and|or|but|its|their|your|my|our|his|her|this|that|these|those|every|each)$/;
/** Words that open a noun phrase (or a number in one): a break between one of them and its noun splits the thing being named. */
const DETERMINER = /^(a|an|the|its|their|your|my|our|his|her|this|these|those|every|each|any|some|with|of|for|from|into|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)$/;
/** Helper verbs: "that box was", "that it is". */
const AUX = /^(is|was|are|were|has|have|had|does|did|can|will|would|could|should|gets|got)$/;
/** Words a phrase can start on: a break just before one falls between two parts of a sentence. */
const OPENS = /^(a|an|the|and|or|but|so|then|to|on|in|at|for|with|by|from|into|onto|about|where|which|who|when|while|because|if|against|without|citing|its|their|your|this|that|these|those|every|each|any|it|you|we|they)$/;

/** Shortest time a short phrase can stay up and still be read (the demo's caption check uses the same bound). */
const READ_S = 0.7;

/** Shortest time a caption phrase stays up before the next one replaces it (seconds of speech). */
const MIN_PHRASE_S = 0.85;

const bare = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");

/** What it costs to end a phrase after word j: low between parts of a sentence, high inside a noun phrase. */
function breakCost(words: WordTiming[], from: number, j: number) {
  const lw = words[j].word, nw = bare(words[j + 1].word);
  if (/[.!?,;:]$/.test(lw)) return 0;
  if (LEADS_ON.test(bare(lw))) return 15;
  // "the back | of the envelope", "a piece | of code": "of" binds the two nouns into one thing
  if (nw === "of") return 10;
  // "the files | that box was built from.": alone, "that box was built from" reads as a sentence about a box, so
  // a relative clause like it stays whole and with the noun it describes
  const relative = (k: number) => k + 2 < words.length && bare(words[k].word) === "that" && !OPENS.test(bare(words[k + 1].word)) && AUX.test(bare(words[k + 2].word));
  if (relative(j + 1)) return 15;
  for (let k = j; k >= from && !/[.!?,;:]$/.test(words[k].word); k--) if (relative(k)) return 15;
  // "an X | post,": the word that closes a clause stays with it
  if (/[.!?,;:]$/.test(words[j + 1].word)) return 9;
  // "the resulting | video", "a second Muse Spark | pass": after a determiner the noun is still to come, unless the
  // next word starts a new part ("and", "with") or reads as a verb ("the live chat | fans out" stays apart from "checks")
  let k = j;
  while (k >= from && !DETERMINER.test(bare(words[k].word)) && !OPENS.test(bare(words[k].word)) && !/[,;:]$/.test(words[k].word)) k--;
  if (k >= from && DETERMINER.test(bare(words[k].word)) && !OPENS.test(nw) && !/[^s]s$/.test(nw)) return 10;
  return OPENS.test(nw) ? 1 : 4;
}

/**
 * Cuts a scene's spoken words into caption phrases. Every way of cutting a sentence is weighed and the cheapest
 * kept: phrases near the size limits, up long enough to read, breaking between parts of a sentence rather
 * than inside a noun phrase ("the back of the envelope math"), and never reading as a grammar slip alone.
 */
export function captionsFor(scene: string, words: WordTiming[], offset: number, sceneEnd: number, maxWords = 8, maxChars = 46): Caption[] {
  const n = words.length;
  const text = (i: number, j: number) => words.slice(i, j + 1).map((w) => w.word).join(" ");
  const lineSlips = new Set(agreementSlips(text(0, n - 1)).map((x) => x.phrase));
  const phraseCost = (i: number, j: number) => {
    const len = j - i + 1, chars = text(i, j).length;
    if (len > 1 && (len > maxWords + 3 || chars > maxChars + 8)) return Infinity;
    let c = 2 * Math.max(0, len - maxWords) + 0.5 * Math.max(0, chars - maxChars);
    // a sentence ending inside the phrase ("pipeline. Explain Like.") only when the phrase is a single word long otherwise
    for (let k = i; k < j; k++) if (/[.!?]$/.test(words[k].word)) c += k === i ? 5 : 50;
    const whole = (i === 0 || /[.!?]$/.test(words[i - 1].word)) && (j === n - 1 || /[.!?]$/.test(words[j].word));
    if (len === 1 && !whole) c += 6;
    else if (len === 2 && !whole) c += 1.5;
    const up = (j + 1 < n ? words[j + 1].start : words[j].end + 0.6) - words[i].start;
    if (up < READ_S) c += 20;
    else if (up < MIN_PHRASE_S) c += 3;
    // "how does | a pasted link become" reads as "a pasted link become": a phrase must not read as a slip alone
    // (a reading the whole line already has, "a second Muse Spark pass checks", is not one the cut made)
    if (agreementSlips(text(i, j)).some((x) => !lineSlips.has(x.phrase))) c += 30;
    if (j + 1 < n) c += breakCost(words, i, j);
    return c;
  };
  const best: number[] = Array(n + 1).fill(Infinity), from: number[] = Array(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = Math.max(0, j - maxWords - 3); i < j; i++) {
      const c = best[i] + phraseCost(i, j - 1);
      if (c < best[j]) { best[j] = c; from[j] = i; }
    }
  }
  const cuts: [number, number][] = [];
  for (let j = n; j > 0; j = from[j]) cuts.unshift([from[j], j]);
  const caps: Caption[] = cuts.map(([i, j]) => ({ scene, t0: offset + words[i].start - 0.08, t1: 0, words: words.slice(i, j).map((w) => ({ w: w.word, s: offset + w.start, e: offset + w.end })) }));
  for (let i = 0; i < caps.length; i++) {
    // a phrase never replaces the one before while that one's last word is still being said
    if (i > 0) caps[i].t0 = Math.max(caps[i].t0, Math.min(caps[i - 1].words[caps[i - 1].words.length - 1].e, caps[i].words[0].s));
  }
  for (let i = 0; i < caps.length; i++) {
    const last = caps[i].words[caps[i].words.length - 1];
    caps[i].t1 = Math.min(caps[i + 1]?.t0 ?? Infinity, last.e + 0.6, sceneEnd);
  }
  return caps;
}

/**
 * Shorten a box description to n characters by dropping whole trailing words, so it never
 * ends in a cut-off word or an ellipsis that reads as clipped. One over-long word is cut as a last resort.
 */
/** Lower-cases ordinary words but keeps names as the code writes them: ChatLive, OpenNext, D1, FEEDBACK_DB. */
export function plainCase(s: string) {
  return s.replace(/\S+/g, (w) => (/[a-z][A-Z]|[A-Z]{2}|[0-9_]/.test(w) ? w : w.toLowerCase()));
}

export function shortSub(s: string, n: number) {
  if (s.length <= n) return s;
  const ws = s.split(/\s+/);
  while (ws.length > 1 && ws.join(" ").length > n) ws.pop();
  // a description should not end on a joining word ("... via", "... the")
  while (ws.length > 1 && /^(via|and|or|with|for|of|to|the|a|an|on|in|from|by|\+|&|\/|-|–)$/i.test(ws[ws.length - 1])) ws.pop();
  const out = ws.join(" ").replace(/[\s,;:–-]+$/, "");
  return out.length <= n ? out : out.slice(0, n - 1) + "…";
}

/** Fix node icon: a pack icon named in the fix, else a check mark style fallback. */
function fixIcon(pack: IconPack, fix: string) {
  for (const w of fix.split(/\s+/)) { const k = resolveIcon(pack, w); if (k) return k; }
  return resolveIcon(pack, "check") ?? resolveIcon(pack, "bolt");
}

/** Point and unit direction a fraction of the way along a polyline. */
function along(pts: [number, number][], f: number): [number, number, number, number] {
  const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  let left = len * f;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0);
    if (d > 0 && (left <= d || i === pts.length - 1)) { const k = Math.min(1, left / d); return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, (x1 - x0) / d, (y1 - y0) / d]; }
    left -= d;
  }
  return [pts[0][0], pts[0][1], 1, 0];
}

export interface Composed { film: Film; sketch: Sketch; marks: Mark[]; timeline: { id: string; kind: string; start: number; end: number }[]; pace: PaceReport; placement: PlacementReport }

export async function compose(inp: ComposeInput): Promise<Composed> {
  const { plan, theme } = inp;
  useHandFont(theme.hand ?? "excalifont");
  // pen lines are drawn once, not twice, so they read as one confident marker stroke
  gen = rough.generator(theme.stroke === "pen" ? { options: { disableMultiStroke: true, disableMultiStrokeFill: true } } : undefined);
  const B = new Builder(theme, inp.pack);
  const audio = new Map(inp.audio.map((a) => [a.sceneId, a]));
  const timeline: Composed["timeline"] = [];
  const headings: Heading[] = [];
  const captions: Caption[] = [];
  const fades: { t: number; dur: number }[] = [];
  const C = (c: Color) => theme.colors[c];

  // ---------- world layout ----------
  let graph: Layout | undefined;
  const fixIds: string[] = [];
  if (inp.arch) {
    const a = inp.arch;
    const order = new Map<string, number>();
    plan.scenes.forEach((s) => s.add_components.forEach((id) => { if (!order.has(id)) order.set(id, order.size); }));
    const comps = [...a.components].sort((x, y) => (order.get(x.id) ?? 99) - (order.get(y.id) ?? 99));
    const gnodes: GNode[] = comps.map((c) => ({ id: c.id, keyword: c.keyword, sub: shortSub(plainCase(c.name), 36), icon: c.icon, color: C(inp.colorOf ? inp.colorOf(c) : "white") }));
    const gedges: GEdge[] = a.connections.map((c) => ({ from: c.from, to: c.to, label: c.label }));
    a.scale.forEach((r, i) => {
      const id = `fix-${i}`;
      fixIds.push(id);
      gnodes.push({ id, keyword: r.fix, sub: r.at === "100x" ? "at 100x" : "at 10x", icon: fixIcon(inp.pack, r.fix), color: C("green") });
      gedges.push({ from: r.component, to: id });
    });
    graph = await layoutGraph(gnodes, gedges);
    // fix boxes get room for the ring and the big arrow, clear of every other box (their link is never drawn as an edge)
    a.scale.forEach((r, i) => {
      const f = graph!.nodes.get(`fix-${i}`), c = graph!.nodes.get(r.component);
      if (!f || !c) return;
      const others = [...graph!.nodes.values()].filter((n) => n.id !== f.id && n.id !== c.id);
      // lines and their labels count too, so the fix box never lands on top of a wire
      const wires = graph!.edges.filter((e) => e.from !== f.id && e.to !== f.id).flatMap((e) => [
        ...(e.labelBox ? [e.labelBox] : []),
        ...e.points.slice(1).map(([x, y], j) => { const [px, py] = e.points[j]; return { x: Math.min(x, px) - 2, y: Math.min(y, py) - 2, w: Math.abs(x - px) + 4, h: Math.abs(y - py) + 4 }; }),
      ]);
      const nb = placeFix(c, f, [...others, ringOf(c).box], wires);
      Object.assign(f, { x: nb.x, y: nb.y });
    });
    graph.bbox = unionBox([graph.bbox, ...graph.nodes.values()], 0);
  }
  const gb = graph?.bbox ?? { x: 0, y: 0, w: 1600, h: 900 };

  // hook region sits above the graph so the camera pans down into it
  const hookCx = gb.x + gb.w / 2, hookCy = gb.y - 1300;

  // concept regions (source shot, boards, list panels) laid out as one whiteboard right of the hook
  let regionX = gb.x, regionY = gb.y;
  const boards: { scene: Scene; layout: Layout }[] = [];
  const panels = new Map<string, Box>();
  type Region = { id: string; w: number; h: number; place: (x: number, y: number) => void };
  const regions: Region[] = [];
  for (const s of plan.scenes) {
    if (s.kind === "board") {
      const l = await layoutGraph(
        s.board_nodes.map((n) => ({ id: n.id, keyword: n.keyword, icon: n.icon, color: C(n.color), count: n.count ?? 1, quote: n.evidence ? wrapText(`“${n.evidence}”`, BOARD.quote, BOARD.qMaxW, 3) : [] })),
        s.board_edges.map((e) => ({ from: e.from, to: e.to, label: e.label || undefined })),
        { size: boardSize, labelSize: BOARD.label, layerGap: 130, nodeGap: 90 },
      );
      const top = s.callouts.length ? 130 : 0;
      regions.push({ id: s.id, w: l.bbox.w, h: l.bbox.h + top, place: (x, y) => boards.push({ scene: s, layout: shiftLayout(l, x, y + top) }) });
    } else if (s.kind === "notes" && (s.items ?? []).length && !(graph && s.items.every((i) => i.target && graph!.nodes.has(i.target)))) {
      const z = panelSize(s.items);
      if (graph) { panels.set(s.id, { x: gb.x + gb.w + 500, y: gb.y + [...panels.values()].reduce((a, b) => a + b.h + 300, 0), ...z }); continue; }
      regions.push({ id: s.id, ...z, place: (x, y) => panels.set(s.id, { x, y, ...z }) });
    }
  }
  let shotBox: Box | undefined;
  if (inp.shot) {
    const sw = 1500, sh = (inp.shot.height / inp.shot.width) * sw;
    shotBox = { x: regionX, y: regionY, w: sw, h: sh };
    regionX += sw + 900;
  }
  // tight grid: 2 columns (3 when there are many), each row as tall as its tallest region
  const cols = regions.length <= 2 ? Math.max(1, regions.length) : regions.length <= 4 ? 2 : 3;
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...regions.filter((_, i) => i % cols === c).map((r) => r.w)));
  const rowsN = Math.ceil(regions.length / cols);
  const rowH = Array.from({ length: rowsN }, (_, r) => Math.max(0, ...regions.slice(r * cols, r * cols + cols).map((x) => x.h)));
  const GAPX = 520, GAPY = 420;
  regions.forEach((r, i) => {
    const c = i % cols, row = Math.floor(i / cols);
    const x = regionX + colW.slice(0, c).reduce((a, b) => a + b + GAPX, 0) + (colW[c] - r.w) / 2;
    const y = regionY + rowH.slice(0, row).reduce((a, b) => a + b + GAPY, 0) + (rowH[row] - r.h) / 2;
    r.place(x, y);
  });
  const boardPos = new Map(boards.map((b) => [b.scene.id, b.layout]));
  const regionBox = (id: string): Box | undefined => { const l = boardPos.get(id); return l ? unionBox([...l.nodes.values()], 0) : panels.get(id); };

  // ---------- timeline ----------
  let T = 0;
  const present = new Set<string>();
  const nodeGroup = (id: string) => `n:${id}`;
  const edgeKey = (e: PlacedEdge) => `e:${e.from}>${e.to}`;
  const findEdge = (f: string, t: string) => graph?.edges.find((e) => e.from === f && e.to === t) ?? graph?.edges.find((e) => e.from === t && e.to === f);
  const drawnEdges = new Set<string>();
  const dim = theme.dimOpacity;
  const boardShown: { id: string; heading: string; keys: string[]; g: string }[] = [];

  const tempo = inp.spec.tempo;
  for (const [si, s] of plan.scenes.entries()) {
    const au = audio.get(s.id) ?? { sceneId: s.id, duration: Math.max(2.5, s.narration.split(/\s+/).length / 2.6), words: [] };
    // every scene holds at least one beat of the chosen tempo, and breathes for the tempo's tail after the voice
    const minD = s.kind === "hook" || s.kind === "recap" ? Math.max(5, tempo.minBeat) : tempo.minBeat;
    let D = Math.max(minD, LEAD + au.duration + tempo.tail);
    const words = au.words.map((w) => ({ ...w, start: T + LEAD + w.start, end: T + LEAD + w.end }));
    const t0 = T + LEAD + 0.15, tEnd = T + D - 0.9;
    timeline.push({ id: s.id, kind: s.kind, start: T, end: T + D });
    const scaleRisk = s.kind === "scale" ? inp.arch?.scale[plan.scenes.filter((x) => x.kind === "scale").indexOf(s)] : undefined;
    // one title on screen at a time: the concept recap titles every board on the wall, so it gets no heading of its own
    const worldTitles = (s.kind === "recap" || s.kind === "outro") && !graph && boardShown.length > 0;
    if (s.kind !== "hook" && !worldTitles) headings.push({ t0: T, t1: T + D, text: spokenHeading(s.heading, s.narration, scaleRisk ? [scaleRisk.problem] : []) });
    // the hook line is drawn big as it is said, so its words skip the subtitle bar
    const kin = s.kind === "hook" ? kineticLine(s.narration, au.words) : 0;
    if (kin) {
      const lineEnd = T + LEAD + au.words[kin - 1].end;
      captions.push(...captionsFor(s.id, au.words.slice(0, kin), T + LEAD, Math.min(lineEnd + 0.5, T + LEAD + au.words[kin].start)).map((c) => ({ ...c, hidden: true })));
      captions.push(...captionsFor(s.id, au.words.slice(kin), T + LEAD, T + D));
    } else captions.push(...captionsFor(s.id, au.words, T + LEAD, T + D));

    if (s.kind === "hook") {
      const title = plan.title.toLowerCase();
      let Th = T;
      if (kin) {
        const line = au.words.slice(0, kin);
        const key = keyWordIndex(line.map((w) => w.word));
        const maxW = 1500;
        let size = 104;
        let rows = wordRows(line.map((w) => w.word), size, maxW);
        while (rows.length > 2 && size > 72) { size -= 8; rows = wordRows(line.map((w) => w.word), size, maxW); }
        const lh = size * 1.3, y0 = hookCy + 120 - ((rows.length - 1) * lh) / 2;
        const sp = textWidth(" ", size);
        rows.forEach((row, r) => {
          const rw = row.reduce((a, i) => a + textWidth(line[i].word, size), 0) + sp * (row.length - 1);
          let x = hookCx - rw / 2;
          for (const i of row) {
            const w = line[i], ww = textWidth(w.word, size), at = T + LEAD + w.start - 0.04;
            B.text({ text: w.word, x, y: y0 + r * lh, size, color: i === key ? C("orange") : theme.ink, t0: at, dur: 0.22, g: "hookline", anim: "fade", sketch: false });
            const uw = textWidth(w.word.replace(/[^\p{L}\p{N}]+$/u, ""), size);
            if (i === key) B.rough(gen.line(x, y0 + r * lh + size * 0.2, x + uw, y0 + r * lh + size * 0.24, { seed: B.seed++, stroke: C("orange"), strokeWidth: 6, roughness: 1.3 }), T + LEAD + w.end, 0.4, "hookline");
            x += ww + sp;
          }
        });
        const lineEnd = T + LEAD + line[kin - 1].end;
        B.setOp("hookline", lineEnd + 0.45, 0, 0.4);
        Th = lineEnd + 0.6;
      }
      const ts = Math.min(150, 2400 / Math.max(6, title.length) * 1.6);
      const tw = textWidth(title, ts);
      B.text({ text: title, x: hookCx, y: hookCy - 40, size: ts, color: theme.ink, anchor: "middle", t0: Th + 0.3, dur: 1.0, g: "hook" });
      B.rough(gen.line(hookCx - tw / 2, hookCy + 0, hookCx + tw / 2, hookCy + 6, { seed: B.seed++, stroke: C("orange"), strokeWidth: 7, roughness: 1.4 }), Th + 1.1, 0.5, "hook");
      B.text({ text: plan.subtitle.toLowerCase(), x: hookCx, y: hookCy + 80, size: 46, color: theme.colors.gray, anchor: "middle", t0: Th + 1.5, dur: 0.8, g: "hook" });
      // preview icons of what is coming
      const prev = inp.arch ? inp.arch.components.slice(0, 5).map((c) => ({ icon: c.icon, color: C(inp.colorOf ? inp.colorOf(c) : "white"), kw: c.keyword }))
        : plan.scenes.flatMap((x) => x.board_nodes).slice(0, 5).map((n) => ({ icon: n.icon, color: C(n.color), kw: n.keyword }));
      const ts2 = eventTimes(words, prev.map((p) => [p.kw]), Math.min(Th + 2.4, tEnd - prev.length * 0.6), tEnd, 0.6);
      const gap = 260, x0 = hookCx - ((prev.length - 1) * gap) / 2;
      prev.forEach((p, i) => {
        const cx = x0 + i * gap, cy = hookCy + 260;
        B.ring(gen.circle(cx, cy, 170, { seed: B.seed++, stroke: p.color, strokeWidth: 3, roughness: 1.2 }), ts2[i], 0.5, "hook");
        B.marks.push({ kind: "ring", g: "hook", t0: ts2[i], dur: 0.5, shape: { k: "circle", cx, cy, r: 85 }, target: { x: cx - 50, y: cy - 50, w: 100, h: 100 } });
        const ic = iconHref(inp.pack, p.icon, B.icons);
        B.img({ href: ic.href, x: cx - 50, y: cy - 50, w: 100, h: 100, t0: ts2[i] + 0.2, dur: 0.4, g: "hook" });
      });
      const hw = Math.max(tw, prev.length * gap, kin ? 1500 : 0);
      B.fit({ x: hookCx - hw / 2, y: hookCy - 40 - ts, w: hw, h: ts + 480 }, T, 0, 1.0);
      B.setOp("hook", T + D - 0.2, 0, 0.6);
    } else if (s.kind === "layer" && graph) {
      const adds = s.add_components.filter((id) => graph!.nodes.has(id) && !present.has(id));
      // a wire whose far end is not on the board yet waits for its layer, so the camera never frames empty space for it
      const can = (id: string) => present.has(id) || adds.includes(id);
      const conns = s.add_connections.map((c) => c.split(">")).map(([f, t]) => findEdge(f, t)).filter((e, i, all): e is PlacedEdge => !!e && all.indexOf(e) === i && !drawnEdges.has(edgeKey(e)) && can(e.from) && can(e.to));
      const focusIds = new Set(adds);
      for (const e of conns) { focusIds.add(e.from); focusIds.add(e.to); }
      const focus = [...focusIds].map((id) => graph!.nodes.get(id)!).filter(Boolean);
      // include already-drawn neighbours so the camera never slices a box in half
      const ctx = new Set(focusIds);
      for (const k of drawnEdges) { const [f, t] = k.slice(2).split(">"); if (focusIds.has(f)) ctx.add(t); if (focusIds.has(t)) ctx.add(f); }
      const ctxNodes = [...ctx].filter((id) => present.has(id) || focusIds.has(id)).map((id) => graph!.nodes.get(id)!).filter(Boolean);
      const fb = unionBox(focus, 60), cb = unionBox(ctxNodes, 60);
      const comp = (id: string) => inp.arch!.components.find((c) => c.id === id)!;
      const times = eventTimes(words, adds.map((id) => [comp(id).keyword, comp(id).name.split(/[\s(]/)[0]]), t0, tEnd - 0.6, 1.1);
      const whole = cb.w <= fb.w * 2.4 && cb.h <= fb.h * 2.4 + 400 ? cb : fb;
      const RW = readableWidth({ width: W, height: H });
      const fitsRW = (b: Box) => b.w <= RW * 0.8 && b.h <= RW * 0.8 * (H / W);
      // the whole layer in one shot whenever its words stay readable; follow shots only past that
      if ((whole.w <= RW && whole.h <= (RW * H) / W) || !adds.length) B.fit(whole, T, si === 1 ? 1.4 : 1.0);
      else {
        // too much board to read in one shot: follow the new parts as they are drawn, each with its wires if they fit
        const ev = adds.map((id, i) => {
          const near = new Set([id]);
          for (const e of conns) { if (e.from === id) near.add(e.to); if (e.to === id) near.add(e.from); }
          const wide = unionBox([...near].map((n) => graph!.nodes.get(n)!).filter(Boolean), 60);
          return { t: times[i], box: fitsRW(wide) ? wide : unionBox([graph!.nodes.get(id)!], 60), wide };
        });
        const shots = followShots(ev, T, T + D + 0.3, tempo, W, H);
        holdUntilSettled(times, shots, tempo.move);
        shots.forEach((sh, i) => B.fit(sh.box, sh.t, i === 0 ? (si === 1 ? 1.4 : 1.0) : tempo.move, 1.0, focus));
      }
      for (const id of present) B.setOp(nodeGroup(id), T, focusIds.has(id) ? 1 : dim);
      for (const k of drawnEdges) { const [f, t] = k.slice(2).split(">"); B.setOp(k, T, focusIds.has(f) && focusIds.has(t) ? 1 : dim); }
      const ready = new Map<string, number>();
      for (const id of present) ready.set(id, T);
      adds.forEach((id, i) => { const done = B.node(graph!.nodes.get(id)!, times[i], nodeGroup(id)); present.add(id); ready.set(id, done); });
      let te = 0;
      for (const e of conns) {
        const at = Math.max(ready.get(e.from) ?? Infinity, ready.get(e.to) ?? Infinity, te);
        if (!isFinite(at)) continue;
        te = B.edge(e, at, edgeKey(e)) - 0.1;
        drawnEdges.add(edgeKey(e));
      }
    } else if (s.kind === "walkthrough" && graph && inp.arch) {
      const steps = inp.arch.walkthrough.steps;
      const on = new Set(steps.flatMap((x) => [x.from, x.to]));
      // the walk needs its own path on the board; side parts may still come later in their own layer scenes
      for (const id of on) if (graph.nodes.has(id) && !present.has(id)) { B.node(graph.nodes.get(id)!, T, nodeGroup(id)); present.add(id); }
      for (const e of graph.edges) if (!drawnEdges.has(edgeKey(e)) && present.has(e.from) && present.has(e.to)) { B.edge(e, T + 0.5, edgeKey(e)); drawnEdges.add(edgeKey(e)); }
      for (const id of present) B.setOp(nodeGroup(id), T, on.has(id) ? 1 : dim);
      for (const k of drawnEdges) { const [f, t] = k.slice(2).split(">"); B.setOp(k, T, on.has(f) && on.has(t) ? 1 : dim); }
      // the placement check enlarges the step numbers if the walk ends up in one wide shot
      const stepSize = 34;
      const times = eventTimes(words, steps.map((x) => [x.label]), t0 + 0.3, tEnd - 0.4, 1.3);
      // the camera follows the walk: consecutive steps share a readable shot, and a new shot starts
      // only after a full beat (it may glide along with a travelling dot, which is the walk's motion anyway)
      const RW = readableWidth({ width: W, height: H });
      const fitsRW = (b: Box) => b.w <= RW * 0.8 && b.h <= RW * 0.8 * (H / W);
      // a step whose ends are too far apart to read in one shot frames where the dot lands; it travels in from off screen
      // the previous hop stays in frame too, so the part the dot just left is never cut off
      const stepBox = (i: number) => {
        const ends = unionBox([steps[i].from, steps[i].to].map((id) => graph!.nodes.get(id)!).filter(Boolean), 70);
        const both = i > 0 ? unionBox([steps[i - 1].from, steps[i - 1].to, steps[i].from, steps[i].to].map((id) => graph!.nodes.get(id)!).filter(Boolean), 70) : ends;
        // two hops may use the whole readable width; labels still meet the minimum size there
        if (both.w <= RW && both.h <= RW * (H / W)) return both;
        const to = graph!.nodes.get(steps[i].to);
        return fitsRW(ends) || !to ? ends : unionBox([to], 70);
      };
      const shots = followShots(steps.map((_, i) => ({ t: times[i], box: stepBox(i), wide: unionBox([steps[i].from, steps[i].to].map((id) => graph!.nodes.get(id)!).filter(Boolean), 70) })), T, T + D + 0.3, tempo, W, H);
      holdUntilSettled(times, shots, tempo.move);
      if (!shots.length) shots.push({ t: T, first: 0, box: unionBox([...on].map((id) => graph!.nodes.get(id)!).filter(Boolean), 70) });
      const lit = [...on].map((id) => graph!.nodes.get(id)!).filter(Boolean);
      shots.forEach((sh, i) => B.fit(sh.box, sh.t, i === 0 ? 1.0 : tempo.move, 1.0, lit));
      steps.forEach((st, i) => {
        const e = findEdge(st.from, st.to);
        if (!e) return;
        const fwd = e.from === st.from;
        const pts = fwd ? e.points : [...e.points].reverse();
        const dur = Math.min(1.5, Math.max(0.7, (times[i + 1] ?? tEnd + 0.6) - times[i] - 0.25));
        B.els.push({ k: "dot", id: B.id("d"), pts, color: C("yellow"), r: 13, trail: C("yellow"), t0: times[i], dur, g: "walk" });
        const tgt = graph!.nodes.get(st.to)!;
        B.ring(gen.rectangle(tgt.x - 12, tgt.y - 12, tgt.w + 24, tgt.h + 24, { seed: B.seed++, stroke: C("yellow"), strokeWidth: 4, roughness: 1.4 }), times[i] + dur * 0.8, 0.4, `w:${i}`);
        B.marks.push({ kind: "ring", g: `w:${i}`, t0: times[i] + dur * 0.8, dur: 0.4, shape: { k: "rect", box: { x: tgt.x - 12, y: tgt.y - 12, w: tgt.w + 24, h: tgt.h + 24 } }, target: tgt });
        B.setOp(`w:${i}`, times[i] + dur + 1.0, 0, 0.5);
        const lab = `${i + 1}`;
        // the number rides beside the wire a third of the way along, clear of both boxes and their rings
        const [ax, ay, ux, uy] = along(pts, 0.3), side = uy > 0.2 ? 1 : -1;
        B.text({ text: lab, x: ax - uy * (stepSize * 0.9) * side, y: ay + ux * (stepSize * 0.9) * side + stepSize * 0.35, size: stepSize, color: C("yellow"), anchor: "middle", t0: times[i], dur: 0.3, g: "walk", sketch: false });
      });
      B.setOp("walk", T + D - 0.3, 0, 0.5);
    } else if (s.kind === "scale" && graph && inp.arch) {
      const k = plan.scenes.filter((x) => x.kind === "scale").indexOf(s);
      const r = inp.arch.scale[k];
      const c = r && graph.nodes.get(r.component);
      const f = graph.nodes.get(`fix-${k}`);
      if (r && c && f) {
        for (const id of present) B.setOp(nodeGroup(id), T, id === c.id ? 1 : dim);
        for (const kk of drawnEdges) B.setOp(kk, T, dim);
        for (let j = 0; j < k; j++) { B.setOp(`s:${j}`, T, 0); B.setOp(nodeGroup(`fix-${j}`), T, dim); }
        const [t1, t2] = eventTimes(words, [[r.problem, r.at], [r.fix]], t0 + 0.2, tEnd - 0.4, 1.6);
        const ring = ringOf(c);
        B.ring(gen.curve(ring.points, { seed: B.seed++, stroke: C("red"), strokeWidth: 5, roughness: 1.2 }), t1, 0.8, `s:${k}`);
        B.sketch.ellipses.push({ box: ring.box, color: C("red") });
        B.marks.push({ kind: "ring", g: `s:${k}`, t0: t1, dur: 0.8, shape: { k: "super", cx: ring.cx, cy: ring.cy, rx: ring.rx, ry: ring.ry }, target: c });
        // big blocky red arrow from the ring to the fix (placeFix made room for it)
        const poly = scaleArrow(c, f);
        if (poly) {
          B.ring(gen.polygon(poly, { seed: B.seed++, stroke: C("red"), strokeWidth: 4, roughness: 1.1, fill: C("red"), fillStyle: "hachure", hachureGap: 9, fillWeight: 3 }), t2, 0.6, `s:${k}`);
          B.sketch.polygons.push({ points: poly, color: C("red") });
          B.marks.push({ kind: "arrow", g: `s:${k}`, t0: t2, dur: 0.6, points: poly, fromShape: { k: "super", cx: ring.cx, cy: ring.cy, rx: ring.rx, ry: ring.ry }, toBox: f });
        }
        // problem label: first spot around the ring that hits no box, wire label, the fix, the arrow or the ring
        const lab = `${r.at}: ${r.problem}`, lw = textWidth(lab, 44) + 24;
        const others = [...graph.nodes.values()].filter((n) => n.id !== c.id && n.id !== f.id);
        // wires count as obstacles segment by segment, so the label never sits on a line
        const segs = graph.edges.flatMap((e) => e.points.slice(1).map(([x, y], j) => { const [px, py] = e.points[j]; return { x: Math.min(x, px), y: Math.min(y, py), w: Math.abs(x - px), h: Math.abs(y - py) }; }));
        const L = placeRingLabel(ring.box, lw, 60, [...others, f, ...(poly ? [polyBox(poly)] : []), ...graph.edges.flatMap((e) => (e.labelBox ? [e.labelBox] : [])), ...segs]);
        B.text({ text: lab, x: L.x, y: L.y, size: 44, color: C("red"), anchor: L.anchor, t0: t1 + 0.5, dur: 0.6, g: `s:${k}`, bg: true });
        // the size of the jump counts up over the box's icon ("1x" to "10x"), then gets out of the way.
        // It covers only the icon, so the box's name and description stay readable.
        const mult = Number(/^(\d+)x$/i.exec(r.at.trim())?.[1]);
        if (mult > 1) {
          const back = { x: c.x + 8, y: c.y + 8, w: c.w - 16, h: NODE.icon + 12 };
          const size = Math.min(back.h / 1.25, (back.w - 16) / Math.max(1e-6, textWidth(`${mult}x`, 1)));
          B.els.push({ k: "text", id: B.id("t"), text: `${mult}x`, x: c.x + c.w / 2, y: back.y + size * 0.95 + (back.h - size * 1.25) / 2, size, color: C("red"), anchor: "middle", t0: t1, dur: 0.8, g: `cnt:${k}`, bg: theme.background, bgBox: back, anim: "count", count: { from: 1, to: mult, suffix: "x" } });
          B.setOp(`cnt:${k}`, t1 + 1.6, 0, 0.3);
        }
        // the camera holds everything this scene draws, label included
        B.fit(unionBox([c, f, ring.box, L.box, ...(poly ? [polyBox(poly)] : [])], 60), T, 1.0);
        B.node(f, t2 + 0.55, nodeGroup(f.id));
        present.add(f.id);
      }
    } else if (s.kind === "recap" && graph) {
      const all = [...present];
      B.fit(unionBox(all.map((id) => graph!.nodes.get(id)!).filter(Boolean), 60), T, 1.3, 1.0);
      for (const kk of drawnEdges) B.setOp(kk, T, 1);
      // the red scale ring has made its point; the recap shows the fixed system without it
      for (let j = 0; j < fixIds.length; j++) B.setOp(`s:${j}`, T, 0, 0.5);
      const comps = (inp.arch?.components ?? []).filter((c) => present.has(c.id));
      for (const id of all) B.setOp(nodeGroup(id), T, dim);
      const times = eventTimes(words, comps.map((c) => [c.keyword]), t0 + 0.3, tEnd - 1.2, 0.5);
      // a fix lights up together with the component it fixes, so the recap never shows the answers greyed out
      const fixesOf = (id: string) => (inp.arch?.scale ?? []).flatMap((r, j) => (r.component === id && present.has(fixIds[j]) ? [fixIds[j]] : []));
      comps.forEach((c, i) => { for (const id of [c.id, ...fixesOf(c.id)]) B.setOp(nodeGroup(id), times[i], 1, 0.35); });
      for (const id of all) B.setOp(nodeGroup(id), tEnd - 0.6, 1, 0.4);
    } else if (s.kind === "source" && inp.shot && shotBox) {
      const sb = shotBox;
      const gs = `src:${s.id}`;
      const sc = sb.w / inp.shot.width;
      B.els.push({ k: "img", id: B.id("i"), href: `data:image/png;base64,${fs.readFileSync(inp.shot.file).toString("base64")}`, x: sb.x, y: sb.y, w: sb.w, h: sb.h, t0: T, dur: 0.6, g: gs, anim: "fade" });
      B.sketch.images.push({ box: sb, file: inp.shot.file });
      B.fit({ x: sb.x, y: sb.y, w: sb.w, h: Math.min(sb.h, sb.w * 0.52) }, T, 0, 1.0);
      fades.push({ t: T, dur: 0.35 });
      const hs = s.highlights.filter((h) => inp.shot!.rects[h.quote]?.length);
      const noteYs: number[] = [];
      const times = eventTimes(words, hs.map((h) => [h.note, h.quote.split(" ").slice(0, 2).join(" ")]), t0 + 1.2, tEnd - 0.6, 2.0);
      hs.forEach((h, i) => {
        const rs = inp.shot!.rects[h.quote].map((r) => ({ x: sb.x + r.x * sc, y: sb.y + r.y * sc, w: r.w * sc, h: r.h * sc }));
        const u = unionBox(rs, 10);
        // notes live in the right margin of the screenshot so they never cover the text
        const nw = textWidth(h.note, 44) + 20;
        let ny = u.y + u.h / 2 + 15;
        for (const py of noteYs) if (Math.abs(py - ny) < 70) ny = py + 70;
        noteYs.push(ny);
        const nx = sb.x + sb.w + 70;
        const fx0 = Math.min(u.x - 60, sb.x - 20); // keep whole lines of the post in view
        B.fit({ x: fx0, y: Math.min(u.y, ny - 50) - 120, w: nx + nw + 40 - fx0, h: Math.max(u.y + u.h, ny) - Math.min(u.y, ny - 50) + 260 }, times[i] - 0.7, 0.8, 1.6);
        const col = C(h.color);
        for (const r of rs) {
          B.rough(gen.line(r.x, r.y + r.h + 4, r.x + r.w, r.y + r.h + 2, { seed: B.seed++, stroke: col, strokeWidth: 5, roughness: 1.2 }), times[i], 0.45, gs);
        }
        B.ring(gen.rectangle(u.x - 6, u.y - 6, u.w + 12, u.h + 12, { seed: B.seed++, stroke: col, strokeWidth: 4, roughness: 1.6 }), times[i] + 0.2, 0.6, gs);
        B.sketch.ellipses.push({ box: u, color: col });
        B.marks.push({ kind: "ring", g: gs, t0: times[i] + 0.2, dur: 0.6, shape: { k: "rect", box: { x: u.x - 6, y: u.y - 6, w: u.w + 12, h: u.h + 12 } }, target: u });
        B.ring(gen.line(sb.x + sb.w + 6, u.y + u.h / 2, nx - 8, ny - 15, { seed: B.seed++, stroke: col, strokeWidth: 3, roughness: 1.3 }), times[i] + 0.5, 0.3, gs);
        B.marks.push({ kind: "arrow", g: gs, t0: times[i] + 0.5, dur: 0.3, points: [[sb.x + sb.w + 6, u.y + u.h / 2], [nx - 8, ny - 15]], fromBox: sb, toBox: { x: nx, y: ny - 44 * 0.95, w: textWidth(h.note, 44), h: 44 * 1.25 }, line: true });
        B.text({ text: h.note, x: nx, y: ny, size: 44, color: col, anchor: "start", t0: times[i] + 0.7, dur: 0.5, g: gs, bg: true });
      });
      B.setOp(gs, T + D - 0.2, 0, 0.4);
    } else if (s.kind === "board" && boardPos.has(s.id)) {
      const l = boardPos.get(s.id)!;
      const g = `b:${s.id}`;
      fades.push({ t: T, dur: 0.35 });
      // earlier boards hide under the cut so their edges never peek into this frame; the recap brings them back
      for (const b of boardShown) B.setOp(b.g, T + 0.1, 0, 0.05);
      const nb = unionBox([...l.nodes.values()], 0);
      // draw doodles in the order the narration names them, and never leave the board empty for long
      // a keyword is "spoken" when the whole phrase is said, or failing that its longest word ("python tools" -> "python")
      const alts = (k: string) => [k, ...k.split(" ").filter((w) => w.length > 3).sort((a, b) => b.length - a.length)];
      const spoken = (k: string) => { for (const a of alts(k)) { const i = spokenAt(words, a, 0); if (i >= 0) return words[i].start; } return Infinity; };
      const nodes = s.board_nodes.filter((n) => l.nodes.has(n.id)).map((n, i) => ({ n, i, at: spoken(n.keyword) }))
        .sort((a, b) => a.at - b.at || a.i - b.i).map((x) => x.n);
      const times = eventTimes(words, nodes.map((n) => alts(n.keyword)), t0, tEnd - 0.6, 1.0);
      if (times.length && times[0] > t0 + 1.2) times[0] = t0 + 0.6;
      const first = nodes[0];
      const fb0 = first ? l.nodes.get(first.id)! : nb;
      B.fit(unionBox([fb0, ...(s.callouts.length ? [{ x: fb0.x, y: fb0.y - 150, w: fb0.w, h: 10 }] : [])], 60), T, 0, 1.7);
      // camera grows with the board: start close on the first doodle, pull back as each new one lands
      const pad = (b: Box) => ({ x: b.x, y: b.y - (s.callouts.length ? 150 : 0), w: b.w, h: b.h + (s.callouts.length ? 150 : 0) });
      nodes.forEach((n, i) => {
        if (i === 0) return;
        const sofar = unionBox(nodes.slice(0, i + 1).map((m) => l.nodes.get(m.id)!), 60);
        B.fit(pad(sofar), Math.max(T + 0.3, times[i] - 0.5), 0.7, 1.7);
      });
      const ready = new Map<string, number>();
      nodes.forEach((n, i) => ready.set(n.id, B.boardNode(l.nodes.get(n.id)!, times[i], g)));
      let te = 0;
      for (const e of l.edges) {
        const at = Math.max(ready.get(e.from) ?? T, ready.get(e.to) ?? T, te);
        te = B.edge(e, at, g, theme.edge, BOARD.label) - 0.1;
      }
      // a callout circles the node that matters most, with a short note above it
      s.callouts.forEach((co, i) => {
        const n = l.nodes.get(co.target);
        if (!n) return;
        const tt = Math.min(tEnd, Math.max(...ready.values()) + 0.4 + i * 1.2);
        const col = C(co.color), bh = BOARD.boxH;
        // the ring goes round the box and the quote lines under it
        const q = n.quote ?? [], qw = Math.max(n.w, ...q.map((l) => textWidth(l, BOARD.quote) + 16));
        const ring = ringOf({ x: n.x + n.w / 2 - qw / 2, y: n.y, w: qw, h: bh + (q.length ? 22 + (q.length + 0.3) * BOARD.qLine : 0) });
        B.ring(gen.curve(ring.points, { seed: B.seed++, stroke: col, strokeWidth: 5, roughness: 1.2 }), tt, 0.7, g);
        B.sketch.ellipses.push({ box: ring.box, color: col });
        B.marks.push({ kind: "ring", g, t0: tt, dur: 0.7, shape: { k: "super", cx: ring.cx, cy: ring.cy, rx: ring.rx, ry: ring.ry }, target: { x: n.x + n.w / 2 - qw / 2, y: n.y, w: qw, h: bh + (q.length ? 22 + (q.length + 0.3) * BOARD.qLine : 0) } });
        B.text({ text: co.text, x: n.x + n.w / 2, y: ring.box.y - 24, size: 50, color: col, anchor: "middle", t0: tt + 0.4, dur: 0.5, g, bg: true });
      });
      boardShown.push({ id: s.id, heading: s.heading, keys: nodes.map((n) => n.keyword), g });
    } else if (s.kind === "notes" && (s.items ?? []).length) {
      const items = s.items;
      const g = `nt:${s.id}`;
      const times = eventTimes(words, items.map((i) => [i.text.split(" ").slice(0, 2).join(" "), i.text.split(" ").slice(-1)[0]]), t0 + 0.2, tEnd - 0.5, 1.1);
      const pb = panels.get(s.id);
      // earlier scale callouts (red rings, labels) step aside so they never collide with these notes
      const scalesBefore = plan.scenes.slice(0, plan.scenes.indexOf(s)).filter((x) => x.kind === "scale").length;
      if (graph) for (let j = 0; j < scalesBefore; j++) { B.setOp(`s:${j}`, T, 0, 0.3); B.setOp(`s:${j}`, T + D - 0.2, 1, 0.4); }
      if (pb) {
        // whiteboard list: icon, text, "estimate" tag on anything assumed
        if (!graph) { fades.push({ t: T, dur: 0.35 }); for (const b of boardShown) B.setOp(b.g, T + 0.1, 0, 0.05); }
        if (graph) { for (const id of present) B.setOp(nodeGroup(id), T, dim); for (const k of drawnEdges) B.setOp(k, T, dim); }
        B.fit(pb, T, graph ? 1.1 : 0, 1.25);
        items.forEach((it, i) => {
          const y = pb.y + 20 + i * NOTE.row, col = C(it.color);
          B.img({ href: iconHref(inp.pack, it.icon, B.icons).href, x: pb.x, y: y + 6, w: NOTE.icon, h: NOTE.icon, t0: times[i], dur: 0.4, g });
          B.rough(gen.line(pb.x + NOTE.icon + 14, y + NOTE.row - 18, pb.x + NOTE.icon + 30, y + NOTE.row - 18, { seed: B.seed++, stroke: col, strokeWidth: 6 }), times[i], 0.2, g);
          const tx = pb.x + NOTE.icon + 40;
          B.text({ text: it.text, x: tx, y: y + 78, size: NOTE.size, color: col === C("white") ? theme.ink : col, t0: times[i] + 0.1, g });
          if (it.estimate) B.tag("estimate", tx + textWidth(it.text, NOTE.size) + 30, y + 74, NOTE.tag, C("orange"), times[i] + 0.6, g);
        });
        if (items.some((i) => i.estimate)) B.text({ text: "* assumed numbers for illustration, not measured from the real app", x: pb.x, y: pb.y + 40 + items.length * NOTE.row + 30, size: 32, color: theme.colors.gray, t0: times[0] + 0.8, dur: 0.6, g, anim: "fade" });
        if (graph) {
          B.setOp(g, T + D - 0.2, 0, 0.4);
          for (const id of present) B.setOp(nodeGroup(id), T + D - 0.2, 1, 0.4);
          for (const k of drawnEdges) B.setOp(k, T + D - 0.2, 1, 0.4);
        } else boardShown.push({ id: s.id, heading: s.heading, keys: items.map((i) => i.text.split(" ")[0]), g });
      } else if (graph) {
        // pinned labels on the canvas: ring the component, write the note beside it
        const targets = new Set(items.map((i) => i.target));
        for (const id of present) B.setOp(nodeGroup(id), T, targets.has(id) ? 1 : dim);
        for (const k of drawnEdges) B.setOp(k, T, dim);
        const placed: Box[] = [];
        const nodesAll = [...graph.nodes.values()].filter((n) => present.has(n.id));
        const hit = (b: Box) => [...nodesAll, ...placed].some((n) => b.x < n.x + n.w && b.x + b.w > n.x && b.y < n.y + n.h && b.y + b.h > n.y);
        // where each note goes first, so the camera can be planned before anything is drawn
        const pins: { i: number; it: (typeof items)[number]; n: PlacedNode; lb: Box; first: boolean }[] = [];
        items.forEach((it, i) => {
          const n = graph!.nodes.get(it.target);
          if (!n) return;
          const size = 44;
          const tw = textWidth(it.text, size) + (it.estimate ? textWidth("estimate", 26) + 46 : 0) + 20;
          const cx = n.x + n.w / 2;
          const sameTarget = items.slice(0, i).filter((x) => x.target === it.target).length;
          const cands: Box[] = [
            // stacked above in reading order: the first note sits highest
            { x: cx - tw / 2, y: n.y - 30 - 64 * (items.filter((x) => x.target === it.target).length - sameTarget), w: tw, h: 60 },
            { x: cx - tw / 2, y: n.y + n.h + 24 + 64 * sameTarget, w: tw, h: 60 },
            { x: n.x - tw - 40, y: n.y + n.h / 2 - 30 + 64 * sameTarget, w: tw, h: 60 },
            { x: n.x + n.w + 40, y: n.y + n.h / 2 - 30 + 64 * sameTarget, w: tw, h: 60 },
            { x: cx - tw / 2, y: n.y - 30 - 64 * (sameTarget + 2), w: tw, h: 60 },
          ];
          const lb = cands.find((b) => !hit(b)) ?? cands[0];
          placed.push(lb);
          pins.push({ i, it, n, lb, first: !sameTarget });
        });
        // the whole set in one shot when its words stay readable; past that the camera follows the notes
        // as they are pinned, and each note waits until its shot has settled
        const RW = readableWidth({ width: W, height: H });
        const all = pins.length ? unionBox(pins.flatMap((p) => [p.n, p.lb]), 70) : undefined;
        const at = pins.map((p) => times[p.i]);
        // each note is its own group, so a note the camera has moved away from can step back
        const pg = (k: number) => `${g}:${k}`;
        if (all && (pins.length < 2 || (all.w <= RW && all.h <= (RW * H) / W))) B.fit(all, T, 1.0, 1.15);
        else if (all) {
          // notes stacked on one box share its shot
          const own = (k: number) => unionBox([pins[k].n, ...pins.slice(0, k + 1).filter((q) => q.n === pins[k].n).map((q) => q.lb)], 70);
          const ev = pins.map((_, k) => ({ t: at[k], box: own(k), wide: own(k) }));
          const shots = followShots(ev, T, T + D + 0.3, tempo, W, H);
          holdUntilSettled(at, shots, tempo.move);
          shots.forEach((sh, k) => B.fit(sh.box, sh.t, k === 0 ? 1.0 : tempo.move, 1.15));
          // a note left behind by the camera dims as it moves on, so nothing lit is sliced by the frame edge
          const inBox = (o: Box, b: Box) => b.x >= o.x - 1 && b.y >= o.y - 1 && b.x + b.w <= o.x + o.w + 1 && b.y + b.h <= o.y + o.h + 1;
          pins.forEach((_, k) => {
            const later = shots.filter((sh) => sh.first > k && !inBox(sh.box, own(k)));
            if (later.length) B.setOp(pg(k), later[0].t, dim, 0.4);
          });
        }
        pins.forEach(({ it, n, lb, first }, k) => {
          const col = C(it.color), size = 44, t = at[k];
          if (first) B.ring(gen.rectangle(n.x - 14, n.y - 14, n.w + 28, n.h + 28, { seed: B.seed++, stroke: col, strokeWidth: 4.5, roughness: 1.5 }), t, 0.5, pg(k));
          B.text({ text: it.text, x: lb.x + 10, y: lb.y + 44, size, color: col === C("white") ? theme.ink : col, t0: t + 0.3, g: pg(k), bg: true });
          if (it.estimate) B.tag("estimate", lb.x + 10 + textWidth(it.text, size) + 20, lb.y + 40, 26, C("orange"), t + 0.7, pg(k));
        });
        pins.forEach((_, k) => B.setOp(pg(k), T + D - 0.2, 0, 0.4));
      }
    } else if (s.kind === "establish" && graph) {
      // draw the whole known system quickly (deep dives and what-ifs start here)
      const ids = [...graph.nodes.keys()].filter((id) => !fixIds.includes(id));
      B.fit(unionBox(ids.map((id) => graph!.nodes.get(id)!), 60), T, 0, 1.0);
      const step = Math.min(0.25, (D - 1.5) / Math.max(1, ids.length));
      ids.forEach((id, i) => { if (!present.has(id)) { B.node(graph!.nodes.get(id)!, T + 0.3 + i * step, nodeGroup(id)); present.add(id); } });
      for (const e of graph.edges) if (!drawnEdges.has(edgeKey(e)) && present.has(e.from) && present.has(e.to)) { B.edge(e, T + 0.6 + ids.length * step, edgeKey(e)); drawnEdges.add(edgeKey(e)); }
    } else if (s.kind === "recap" || s.kind === "outro") {
      // concept recap: one whiteboard with every board titled, then each lit in turn as it is recalled
      const all = boardShown.map((b) => regionBox(b.id)!).filter(Boolean);
      if (all.length) {
        fades.push({ t: T, dur: 0.35 });
        boardShown.forEach((b, i) => {
          const rb = regionBox(b.id)!;
          B.text({ text: b.heading, x: rb.x + rb.w / 2, y: rb.y - 110, size: 84, color: theme.ink, anchor: "middle", t0: T + 0.3 + i * 0.15, dur: 0.6, g: "recap-titles" });
          B.rough(gen.line(rb.x + rb.w / 2 - textWidth(b.heading, 84) / 2, rb.y - 86, rb.x + rb.w / 2 + textWidth(b.heading, 84) / 2, rb.y - 82, { seed: B.seed++, stroke: theme.accent, strokeWidth: 6, roughness: 1.2 }), T + 0.6 + i * 0.15, 0.4, "recap-titles");
        });
        B.fit(unionBox(all.map((b) => ({ x: b.x, y: b.y - 200, w: b.w, h: b.h + 200 })), 80), T, 0, 1.0);
        for (const b of boardShown) B.setOp(b.g, T, 1, 0.01);
        const times = eventTimes(words, boardShown.map((b) => [b.heading, ...b.keys]), t0 + 0.8, tEnd - 1.4, 1.2);
        // overview first, then the camera visits each board as it is recalled, then pulls back to the whole wall
        boardShown.forEach((b, i) => {
          for (const o of boardShown) B.setOp(o.g, times[i], o === b ? 1 : dim, 0.35);
          const rb = regionBox(b.id)!;
          if (boardShown.length > 1) B.fit({ x: rb.x, y: rb.y - 200, w: rb.w, h: rb.h + 200 }, times[i] - 0.2, 0.8, 1.2);
        });
        for (const b of boardShown) B.setOp(b.g, tEnd - 0.8, 1, 0.4);
        if (boardShown.length > 1) B.fit(unionBox(all.map((b) => ({ x: b.x, y: b.y - 200, w: b.w, h: b.h + 200 })), 80), tEnd - 1.2, 1.0, 1.0);
      }
    }
    // a scene ends only after its last ring or arrow finishes, so the next scene's camera move never cuts one off
    const drawnTo = Math.max(0, ...B.els.filter((e) => e.mark && e.t0 >= T).map((e) => e.t0 + e.dur));
    if (drawnTo + 0.15 > T + D) { D = drawnTo + 0.15 - T; timeline[timeline.length - 1].end = T + D; }
    T += D;
  }

  const brand = "Explain Like";
  const film: Film = {
    width: W, height: H, fps: FPS, duration: T + 4.2,
    theme: { background: theme.background, ink: theme.ink, accent: theme.accent, caption: theme.caption },
    fonts: { hand: fontDataUrl(HAND_FONTS[theme.hand ?? "excalifont"].woff2, "font/woff2"), sans: fontDataUrl("Nunito-Variable.ttf", "font/ttf") },
    elements: B.els, groups: B.groups, camera: B.cam.length ? B.cam : [{ t: 0, x: 0, y: 0, w: W, h: H, move: 0 }],
    headings, captions, fades,
    end: { t0: T, title: plan.title.toLowerCase(), lines: [inp.sourceLabel, `explained for ${inp.spec.audience.toLowerCase()}`], credit: "Powered by Meta Muse models" },
    brand,
  };
  const pace = applyTempo(film, timeline, tempo);
  // every ring, arrow and label checked against the final camera, with a few fix passes
  const placement = placementPass({ film, sketch: B.sketch, marks: B.marks });
  return { film, sketch: B.sketch, marks: B.marks, timeline, pace, placement };
}
