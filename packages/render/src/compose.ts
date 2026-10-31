import fs from "node:fs";
import rough from "roughjs";
import type { Architecture, ScenePlan, Scene, SceneAudio, Theme, LevelSpec, Color, WordTiming } from "@metual/core";
import type { Film, FElement, CamKey, Caption, Heading } from "./film.js";
import { layoutGraph, unionBox, shiftLayout, NODE, type Box, type GNode, type GEdge, type Layout, type PlacedNode, type PlacedEdge } from "./layout.js";
import { textWidth, fontDataUrl } from "./measure.js";
import type { IconPack } from "./icons.js";
import { resolveIcon } from "./icons.js";
import path from "node:path";

export const W = 1920, H = 1080, FPS = 30;
const LEAD = 0.3, TAIL = 0.7;
const SAFE = { top: 160, bottom: 220, side: 110 };
const gen = rough.generator();

/** What the .excalidraw writer needs: the final state of every drawn object. */
export interface Sketch {
  nodes: { id: string; box: Box; color: string; keyword: string; sub?: string; icon?: string }[];
  edges: { points: [number, number][]; label?: string; labelBox?: Box; both?: boolean; color: string; from?: string; to?: string }[];
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
  level: LevelSpec;
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
  seed = 7;
  n = 0;
  icons = new Map<string, string>();
  constructor(public theme: Theme, public pack: IconPack) {}
  id(p: string) { return `${p}${this.n++}`; }

  rough(drawable: any, t0: number, dur: number, g?: string, anim: "draw" | "pop" | "fade" = "draw", origin?: [number, number]) {
    const ps = gen.toPaths(drawable);
    ps.forEach((p: any, i: number) => {
      this.els.push({ k: "path", id: this.id("p"), d: p.d, stroke: p.stroke === "none" ? "none" : p.stroke, sw: p.strokeWidth, fill: p.fill && p.fill !== "none" ? p.fill : undefined, t0: t0 + i * dur * 0.15, dur: dur * (ps.length > 1 ? 0.85 : 1), g, anim, origin });
    });
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
    if (ic.href) this.els.push({ k: "img", id: this.id("i"), href: ic.href, x: n.x + n.w / 2 - NODE.icon / 2, y: n.y + 16, w: NODE.icon, h: NODE.icon, t0: t0 + 0.3, dur: 0.45, g });
    this.text({ text: n.keyword, x: n.x + n.w / 2, y: n.y + 160, size: NODE.kwSize, color: this.theme.ink, anchor: "middle", t0: t0 + 0.5, dur: 0.45, g, sketch: false });
    if (n.sub) this.text({ text: n.sub, x: n.x + n.w / 2, y: n.y + 194, size: NODE.subSize, color: this.theme.colors.gray, anchor: "middle", t0: t0 + 0.9, dur: 0.4, g, anim: "fade", sketch: false });
    this.sketch.nodes.push({ id: n.id, box: { x: n.x, y: n.y, w: n.w, h: n.h }, color: c, keyword: n.keyword, sub: n.sub, icon: ic.file });
    return t0 + 1.0;
  }
  edge(e: PlacedEdge, t0: number, g: string, color = this.theme.edge) {
    if (e.points.length < 2) return t0;
    let len = 0;
    for (let i = 1; i < e.points.length; i++) len += Math.hypot(e.points[i][0] - e.points[i - 1][0], e.points[i][1] - e.points[i - 1][1]);
    const dur = Math.max(0.35, Math.min(0.9, len / 900));
    this.rough(gen.linearPath(e.points, { seed: this.seed++, stroke: color, strokeWidth: 2.6, roughness: 0.7, bowing: 0.5 }), t0, dur, g);
    const head = (a: [number, number], b: [number, number], t: number) => {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 20;
      const p1: [number, number] = [b[0] - L * Math.cos(ang - 0.5), b[1] - L * Math.sin(ang - 0.5)];
      const p2: [number, number] = [b[0] - L * Math.cos(ang + 0.5), b[1] - L * Math.sin(ang + 0.5)];
      this.rough(gen.linearPath([p1, b, p2], { seed: this.seed++, stroke: color, strokeWidth: 2.8, roughness: 0.5 }), t, 0.2, g);
    };
    const P = e.points;
    head(P[P.length - 2], P[P.length - 1], t0 + dur);
    if (e.both) head(P[1], P[0], t0 + dur);
    if (e.label && e.labelBox) {
      const lb = e.labelBox;
      this.text({ text: e.label, x: lb.x + lb.w / 2, y: lb.y + lb.h * 0.72, size: NODE.labelSize, color: this.theme.edgeLabel, anchor: "middle", t0: t0 + dur * 0.6, dur: 0.4, g, bg: true, sketch: false });
    }
    this.sketch.edges.push({ points: e.points, label: e.label, labelBox: e.labelBox, both: e.both, color, from: e.from, to: e.to });
    return t0 + dur + 0.25;
  }
  fit(b: Box, t: number, move: number, maxScale = 1.15) {
    const minW = 900, minH = 480;
    const bw = Math.max(b.w, minW), bh = Math.max(b.h, minH);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const s = Math.min((W - 2 * SAFE.side) / bw, (H - SAFE.top - SAFE.bottom) / bh, maxScale);
    const cw = W / s, ch = H / s;
    const screenCy = SAFE.top + (H - SAFE.top - SAFE.bottom) / 2;
    this.cam.push({ t, x: cx - cw / 2, y: cy - screenCy / s, w: cw, h: ch, move });
  }
}

/** Find when a phrase is spoken: index into words at or after `from`. */
function spokenAt(words: WordTiming[], phrase: string, from = 0): number {
  const toks = phrase.split(/[\s\-_/]+/).map(normW).filter(Boolean);
  if (!toks.length) return -1;
  const m = (a: string, b: string) => a === b || (b.length >= 4 && a.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))));
  for (let i = from; i < words.length; i++) {
    if (!m(normW(words[i].word), toks[0])) continue;
    let ok = true;
    for (let j = 1; j < toks.length && ok; j++) ok = i + j < words.length && m(normW(words[i + j].word), toks[j]);
    if (ok) return i;
  }
  if (toks.length > 1) for (let i = from; i < words.length; i++) if (toks.some((t) => t.length > 3 && m(normW(words[i].word), t))) return i;
  return -1;
}

/** Times for a sequence of events: keyword-synced when spoken, else spread evenly; always ordered and spaced. */
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
  for (let i = 0; i < n; i++) out[i] = Math.max(out[i], (out[i - 1] ?? start - gap) + gap, start);
  return out.map((t) => Math.min(t, Math.max(start, end)));
}

function captionsFor(words: WordTiming[], offset: number, sceneEnd: number): Caption[] {
  const caps: Caption[] = [];
  let cur: WordTiming[] = [];
  const flush = () => { if (cur.length) caps.push({ t0: offset + cur[0].start - 0.08, t1: 0, words: cur.map((w) => ({ w: w.word, s: offset + w.start, e: offset + w.end })) }); cur = []; };
  for (const w of words) {
    cur.push(w);
    const chars = cur.map((x) => x.word).join(" ").length;
    if ((/[.!?]$/.test(w.word) && cur.length >= 2) || (/[,;:]$/.test(w.word) && cur.length >= 4) || cur.length >= 8 || chars > 46) flush();
  }
  flush();
  for (let i = 0; i < caps.length; i++) {
    const last = caps[i].words[caps[i].words.length - 1];
    caps[i].t1 = Math.min(caps[i + 1]?.t0 ?? Infinity, last.e + 0.6, sceneEnd);
  }
  return caps;
}

function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

/** Fix node icon: a pack icon named in the fix, else a check mark style fallback. */
function fixIcon(pack: IconPack, fix: string) {
  for (const w of fix.split(/\s+/)) { const k = resolveIcon(pack, w); if (k) return k; }
  return resolveIcon(pack, "check") ?? resolveIcon(pack, "bolt");
}

export interface Composed { film: Film; sketch: Sketch; timeline: { id: string; kind: string; start: number; end: number }[] }

export async function compose(inp: ComposeInput): Promise<Composed> {
  const { plan, theme } = inp;
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
    const gnodes: GNode[] = comps.map((c) => ({ id: c.id, keyword: c.keyword, sub: trunc(c.name.toLowerCase(), 30), icon: c.icon, color: C(inp.colorOf ? inp.colorOf(c) : "white") }));
    const gedges: GEdge[] = a.connections.map((c) => ({ from: c.from, to: c.to, label: c.label }));
    a.scale.forEach((r, i) => {
      const id = `fix-${i}`;
      fixIds.push(id);
      gnodes.push({ id, keyword: r.fix, sub: r.at === "100x" ? "at 100x" : "at 10x", icon: fixIcon(inp.pack, r.fix), color: C("green") });
      gedges.push({ from: r.component, to: id });
    });
    graph = await layoutGraph(gnodes, gedges);
  }
  const gb = graph?.bbox ?? { x: 0, y: 0, w: 1600, h: 900 };

  // hook region sits above the graph so the camera pans down into it
  const hookCx = gb.x + gb.w / 2, hookCy = gb.y - 1300;

  // concept regions (source shot + boards) laid out in a grid right of the hook
  let regionX = gb.x, regionY = gb.y;
  const boards: { scene: Scene; layout: Layout }[] = [];
  for (const s of plan.scenes.filter((s) => s.kind === "board")) {
    const l = await layoutGraph(
      s.board_nodes.map((n) => ({ id: n.id, keyword: n.keyword, icon: n.icon, color: C(n.color) })),
      s.board_edges.map((e) => ({ from: e.from, to: e.to, label: e.label || undefined })),
    );
    boards.push({ scene: s, layout: l });
  }
  let shotBox: Box | undefined;
  if (inp.shot) {
    const sw = 1500, sh = (inp.shot.height / inp.shot.width) * sw;
    shotBox = { x: regionX, y: regionY, w: sw, h: sh };
    regionX += sw + 1400;
  }
  const cell = Math.max(1800, ...boards.map((b) => b.layout.bbox.w + 700));
  const cellH = Math.max(1100, ...boards.map((b) => b.layout.bbox.h + 600));
  const boardPos = new Map<string, Layout>();
  boards.forEach((b, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const ox = regionX + col * cell + (cell - b.layout.bbox.w) / 2, oy = regionY + row * cellH + (cellH - b.layout.bbox.h) / 2;
    boardPos.set(b.scene.id, shiftLayout(b.layout, ox, oy));
  });

  // ---------- timeline ----------
  let T = 0;
  const present = new Set<string>();
  const nodeGroup = (id: string) => `n:${id}`;
  const edgeKey = (e: PlacedEdge) => `e:${e.from}>${e.to}`;
  const findEdge = (f: string, t: string) => graph?.edges.find((e) => e.from === f && e.to === t) ?? graph?.edges.find((e) => e.from === t && e.to === f);
  const drawnEdges = new Set<string>();
  const dim = theme.dimOpacity;

  for (const [si, s] of plan.scenes.entries()) {
    const au = audio.get(s.id) ?? { sceneId: s.id, duration: Math.max(2.5, s.narration.split(/\s+/).length / 2.6), words: [] };
    const minD = s.kind === "hook" ? 5 : s.kind === "recap" ? 5 : 3.2;
    const D = Math.max(minD, LEAD + au.duration + TAIL);
    const words = au.words.map((w) => ({ ...w, start: T + LEAD + w.start, end: T + LEAD + w.end }));
    const t0 = T + LEAD + 0.15, tEnd = T + D - 0.9;
    timeline.push({ id: s.id, kind: s.kind, start: T, end: T + D });
    if (s.kind !== "hook") headings.push({ t0: T + 0.05, t1: T + D, text: s.heading.toLowerCase() });
    captions.push(...captionsFor(au.words, T + LEAD, T + D));

    if (s.kind === "hook") {
      const title = plan.title.toLowerCase();
      const ts = Math.min(150, 2400 / Math.max(6, title.length) * 1.6);
      const tw = textWidth(title, ts);
      B.text({ text: title, x: hookCx, y: hookCy - 40, size: ts, color: theme.ink, anchor: "middle", t0: T + 0.3, dur: 1.0, g: "hook" });
      B.rough(gen.line(hookCx - tw / 2, hookCy + 0, hookCx + tw / 2, hookCy + 6, { seed: B.seed++, stroke: C("orange"), strokeWidth: 7, roughness: 1.4 }), T + 1.1, 0.5, "hook");
      B.text({ text: plan.subtitle.toLowerCase(), x: hookCx, y: hookCy + 80, size: 46, color: theme.colors.gray, anchor: "middle", t0: T + 1.5, dur: 0.8, g: "hook" });
      // preview icons of what is coming
      const prev = inp.arch ? inp.arch.components.slice(0, 5).map((c) => ({ icon: c.icon, color: C(inp.colorOf ? inp.colorOf(c) : "white"), kw: c.keyword }))
        : plan.scenes.flatMap((x) => x.board_nodes).slice(0, 5).map((n) => ({ icon: n.icon, color: C(n.color), kw: n.keyword }));
      const ts2 = eventTimes(words, prev.map((p) => [p.kw]), T + 2.4, tEnd, 0.6);
      const gap = 260, x0 = hookCx - ((prev.length - 1) * gap) / 2;
      prev.forEach((p, i) => {
        const cx = x0 + i * gap, cy = hookCy + 260;
        B.rough(gen.circle(cx, cy, 170, { seed: B.seed++, stroke: p.color, strokeWidth: 3, roughness: 1.2 }), ts2[i], 0.5, "hook");
        const ic = iconHref(inp.pack, p.icon, B.icons);
        if (ic.href) B.els.push({ k: "img", id: B.id("i"), href: ic.href, x: cx - 50, y: cy - 50, w: 100, h: 100, t0: ts2[i] + 0.2, dur: 0.4, g: "hook" });
      });
      B.fit({ x: hookCx - Math.max(tw, prev.length * gap) / 2, y: hookCy - 40 - ts, w: Math.max(tw, prev.length * gap), h: ts + 480 }, T, 0, 1.0);
      B.setOp("hook", T + D - 0.2, 0, 0.6);
    } else if (s.kind === "layer" && graph) {
      const adds = s.add_components.filter((id) => graph!.nodes.has(id) && !present.has(id));
      const conns = s.add_connections.map((c) => c.split(">")).map(([f, t]) => findEdge(f, t)).filter((e): e is PlacedEdge => !!e && !drawnEdges.has(edgeKey(e)));
      const focusIds = new Set(adds);
      for (const e of conns) { focusIds.add(e.from); focusIds.add(e.to); }
      const focus = [...focusIds].map((id) => graph!.nodes.get(id)!).filter(Boolean);
      // include already-drawn neighbours so the camera never slices a box in half
      const ctx = new Set(focusIds);
      for (const k of drawnEdges) { const [f, t] = k.slice(2).split(">"); if (focusIds.has(f)) ctx.add(t); if (focusIds.has(t)) ctx.add(f); }
      const ctxNodes = [...ctx].filter((id) => present.has(id) || focusIds.has(id)).map((id) => graph!.nodes.get(id)!).filter(Boolean);
      const fb = unionBox(focus, 60), cb = unionBox(ctxNodes, 60);
      B.fit(cb.w <= fb.w * 2.4 && cb.h <= fb.h * 2.4 + 400 ? cb : fb, T, si === 1 ? 1.4 : 1.0);
      for (const id of present) B.setOp(nodeGroup(id), T, focusIds.has(id) ? 1 : dim);
      for (const k of drawnEdges) { const [f, t] = k.slice(2).split(">"); B.setOp(k, T, focusIds.has(f) && focusIds.has(t) ? 1 : dim); }
      const comp = (id: string) => inp.arch!.components.find((c) => c.id === id)!;
      const times = eventTimes(words, adds.map((id) => [comp(id).keyword, comp(id).name.split(/[\s(]/)[0]]), t0, tEnd - 0.6, 1.1);
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
      // make sure every node/edge exists (planner repairs should guarantee this)
      for (const id of graph.nodes.keys()) if (!present.has(id) && !fixIds.includes(id)) { B.node(graph.nodes.get(id)!, T, nodeGroup(id)); present.add(id); }
      for (const e of graph.edges) if (!drawnEdges.has(edgeKey(e)) && !fixIds.includes(e.to)) { B.edge(e, T + 0.5, edgeKey(e)); drawnEdges.add(edgeKey(e)); }
      const steps = inp.arch.walkthrough.steps;
      const on = new Set(steps.flatMap((x) => [x.from, x.to]));
      for (const id of present) B.setOp(nodeGroup(id), T, on.has(id) ? 1 : dim);
      for (const k of drawnEdges) { const [f, t] = k.slice(2).split(">"); B.setOp(k, T, on.has(f) && on.has(t) ? 1 : dim); }
      B.fit(unionBox([...on].map((id) => graph!.nodes.get(id)!).filter(Boolean), 70), T, 1.0);
      const times = eventTimes(words, steps.map((x) => [x.label]), t0 + 0.3, tEnd - 0.4, 1.3);
      steps.forEach((st, i) => {
        const e = findEdge(st.from, st.to);
        if (!e) return;
        const fwd = e.from === st.from;
        const pts = fwd ? e.points : [...e.points].reverse();
        const dur = Math.min(1.5, Math.max(0.7, (times[i + 1] ?? tEnd + 0.6) - times[i] - 0.25));
        B.els.push({ k: "dot", id: B.id("d"), pts, color: C("yellow"), r: 13, trail: C("yellow"), t0: times[i], dur, g: "walk" });
        const tgt = graph!.nodes.get(st.to)!;
        B.rough(gen.rectangle(tgt.x - 12, tgt.y - 12, tgt.w + 24, tgt.h + 24, { seed: B.seed++, stroke: C("yellow"), strokeWidth: 4, roughness: 1.4 }), times[i] + dur * 0.8, 0.4, `w:${i}`);
        B.setOp(`w:${i}`, times[i] + dur + 1.0, 0, 0.5);
        const lab = `${i + 1}`;
        B.text({ text: lab, x: pts[0][0] + (fwd ? 18 : -18), y: pts[0][1] - 16, size: 34, color: C("yellow"), anchor: "middle", t0: times[i], dur: 0.3, g: "walk", sketch: false });
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
        B.fit(unionBox([c, f, { x: c.x - c.w * 0.25, y: c.y - c.h * 0.6, w: c.w * 1.5, h: c.h * 2.2 }], 80), T, 1.0);
        const [t1, t2] = eventTimes(words, [[r.problem, r.at], [r.fix]], t0 + 0.2, tEnd - 0.4, 1.6);
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        B.rough(gen.ellipse(cx, cy, c.w * 1.45, c.h * 1.5, { seed: B.seed++, stroke: C("red"), strokeWidth: 5, roughness: 1.5 }), t1, 0.8, `s:${k}`);
        B.sketch.ellipses.push({ box: { x: cx - c.w * 0.725, y: cy - c.h * 0.75, w: c.w * 1.45, h: c.h * 1.5 }, color: C("red") });
        // problem label: above the circle unless a box is in the way, then below, then left
        const lab = `${r.at}: ${r.problem}`, lw = textWidth(lab, 44) + 24, ex = c.w * 0.725, ey = c.h * 0.75;
        const others = [...graph.nodes.values()].filter((n) => n.id !== c.id && n.id !== f.id);
        const hit = (b: Box) => others.some((n) => b.x < n.x + n.w && b.x + b.w > n.x && b.y < n.y + n.h && b.y + b.h > n.y);
        const cands: [number, number, "middle" | "start"][] = [[cx, cy - ey - 22, "middle"], [cx, cy + ey + 58, "middle"], [cx - ex - 20 - lw, cy - ey + 30, "start"], [cx - ex - 20 - lw, cy + ey, "start"]];
        const box = ([x, y, a]: [number, number, string]): Box => ({ x: a === "start" ? x : x - lw / 2, y: y - 46, w: lw, h: 60 });
        const pick = cands.find((cd) => !hit(box(cd))) ?? cands[0];
        B.text({ text: lab, x: pick[0], y: pick[1], size: 44, color: C("red"), anchor: pick[2], t0: t1 + 0.5, dur: 0.6, g: `s:${k}`, bg: true });
        // big blocky red arrow from the problem to the fix
        const fx = f.x + f.w / 2, fy = f.y + f.h / 2;
        const ang = Math.atan2(fy - cy, fx - cx), ux = Math.cos(ang), uy = Math.sin(ang);
        const edgeDist = (n: PlacedNode) => Math.min(Math.abs(n.w / 2 / (ux || 1e-6)), Math.abs(n.h / 2 / (uy || 1e-6)));
        const ax = cx + ux * (edgeDist(c) * 1.25 + 10), ay = cy + uy * (edgeDist(c) * 1.25 + 10);
        const bx = fx - ux * (edgeDist(f) + 16), by = fy - uy * (edgeDist(f) + 16);
        const L = Math.max(90, Math.hypot(bx - ax, by - ay)), hl = Math.min(80, L * 0.5);
        const local: [number, number][] = [[0, 0], [-hl, -52], [-hl, -22], [-L, -22], [-L, 22], [-hl, 22], [-hl, 52]];
        const poly = local.map(([x, y]) => [bx + x * ux - y * uy, by + x * uy + y * ux] as [number, number]);
        B.rough(gen.polygon(poly, { seed: B.seed++, stroke: C("red"), strokeWidth: 4, roughness: 1.1, fill: C("red"), fillStyle: "hachure", hachureGap: 9, fillWeight: 3 }), t2, 0.6, `s:${k}`);
        B.sketch.polygons.push({ points: poly, color: C("red") });
        B.node(f, t2 + 0.55, nodeGroup(f.id));
        present.add(f.id);
      }
    } else if (s.kind === "recap" && graph) {
      const all = [...present];
      B.fit(unionBox(all.map((id) => graph!.nodes.get(id)!).filter(Boolean), 60), T, 1.3, 1.0);
      for (const kk of drawnEdges) B.setOp(kk, T, 1);
      for (let j = 0; j < fixIds.length; j++) B.setOp(`s:${j}`, T, 1);
      const comps = (inp.arch?.components ?? []).filter((c) => present.has(c.id));
      for (const id of all) B.setOp(nodeGroup(id), T, dim);
      const times = eventTimes(words, comps.map((c) => [c.keyword]), t0 + 0.3, tEnd - 1.2, 0.5);
      comps.forEach((c, i) => B.setOp(nodeGroup(c.id), times[i], 1, 0.35));
      for (const id of all) B.setOp(nodeGroup(id), tEnd - 0.6, 1, 0.4);
    } else if (s.kind === "source" && inp.shot && shotBox) {
      const sb = shotBox;
      const sc = sb.w / inp.shot.width;
      B.els.push({ k: "img", id: B.id("i"), href: `data:image/png;base64,${fs.readFileSync(inp.shot.file).toString("base64")}`, x: sb.x, y: sb.y, w: sb.w, h: sb.h, t0: T, dur: 0.6, g: "src", anim: "fade" });
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
        const fx0 = Math.min(u.x - 60, nx + nw - 1400);
        B.fit({ x: fx0, y: Math.min(u.y, ny - 50) - 120, w: nx + nw + 40 - fx0, h: Math.max(u.y + u.h, ny) - Math.min(u.y, ny - 50) + 260 }, times[i] - 0.7, 0.8, 1.6);
        const col = C(h.color);
        for (const r of rs) {
          B.rough(gen.line(r.x, r.y + r.h + 4, r.x + r.w, r.y + r.h + 2, { seed: B.seed++, stroke: col, strokeWidth: 5, roughness: 1.2 }), times[i], 0.45, "src");
        }
        B.rough(gen.rectangle(u.x - 6, u.y - 6, u.w + 12, u.h + 12, { seed: B.seed++, stroke: col, strokeWidth: 4, roughness: 1.6 }), times[i] + 0.2, 0.6, "src");
        B.sketch.ellipses.push({ box: u, color: col });
        B.rough(gen.line(sb.x + sb.w + 6, u.y + u.h / 2, nx - 14, ny - 15, { seed: B.seed++, stroke: col, strokeWidth: 3, roughness: 1.3 }), times[i] + 0.5, 0.3, "src");
        B.text({ text: h.note, x: nx, y: ny, size: 44, color: col, anchor: "start", t0: times[i] + 0.7, dur: 0.5, g: "src", bg: true });
      });
      B.setOp("src", T + D - 0.2, 0, 0.4);
    } else if (s.kind === "board") {
      const l = boardPos.get(s.id)!;
      fades.push({ t: T, dur: 0.35 });
      B.fit(unionBox([...l.nodes.values()], 70), T, 0, 1.5);
      const nodes = s.board_nodes.filter((n) => l.nodes.has(n.id));
      const times = eventTimes(words, nodes.map((n) => [n.keyword]), t0, tEnd - 0.6, 1.0);
      const ready = new Map<string, number>();
      nodes.forEach((n, i) => ready.set(n.id, B.node(l.nodes.get(n.id)!, times[i], `b:${s.id}`)));
      let te = 0;
      for (const e of l.edges) {
        const at = Math.max(ready.get(e.from) ?? T, ready.get(e.to) ?? T, te);
        te = B.edge(e, at, `b:${s.id}`) - 0.1;
      }
      // callouts circle a node with a short note
      s.callouts.forEach((co, i) => {
        const n = l.nodes.get(co.target);
        if (!n) return;
        const tt = Math.min(tEnd, Math.max(...[...ready.values()]) + 0.3 + i * 1.2);
        const col = C(co.color);
        B.rough(gen.ellipse(n.x + n.w / 2, n.y + n.h / 2, n.w * 1.4, n.h * 1.45, { seed: B.seed++, stroke: col, strokeWidth: 4.5, roughness: 1.5 }), tt, 0.7, `b:${s.id}`);
        B.text({ text: co.text, x: n.x + n.w / 2, y: n.y - n.h * 0.22 - 30, size: 40, color: col, anchor: "middle", t0: tt + 0.4, dur: 0.5, g: `b:${s.id}`, bg: true });
      });
    } else if (s.kind === "recap" || s.kind === "outro") {
      // concept recap: pull back over every board
      const all = [...boardPos.values()].flatMap((l) => [...l.nodes.values()]);
      if (all.length) { fades.push({ t: T, dur: 0.35 }); B.fit(unionBox(all, 120), T, 0, 1.0); for (const s2 of boards) B.setOp(`b:${s2.scene.id}`, T, 1); }
    }
    T += D;
  }

  const brand = "<b>metual</b>";
  const film: Film = {
    width: W, height: H, fps: FPS, duration: T + 4.2,
    theme: { background: theme.background, ink: theme.ink, accent: theme.accent, caption: theme.caption },
    fonts: { hand: fontDataUrl("Excalifont-Regular.woff2", "font/woff2"), sans: fontDataUrl("Nunito-Variable.ttf", "font/ttf") },
    elements: B.els, groups: B.groups, camera: B.cam.length ? B.cam : [{ t: 0, x: 0, y: 0, w: W, h: H, move: 0 }],
    headings, captions, fades,
    end: { t0: T, title: plan.title.toLowerCase(), lines: [inp.sourceLabel, `explained like ${inp.level.label.toLowerCase()}`], credit: "Powered by Meta Muse models" },
    brand,
  };
  return { film, sketch: B.sketch, timeline };
}
