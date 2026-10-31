/**
 * Frame self-check after render: seek the real stage at a steady interval and around every camera move,
 * fade and heading change, read where everything actually landed in screen pixels, and flag what a viewer
 * would see as broken. Placement checks the plan; this checks the picture.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { reviewFrames, type CostLedger } from "@explainlike/models";
import type { Film } from "./film.js";
import { findChrome } from "./capture.js";
import { stageHtml } from "./stage.js";
import { cameraAt } from "./check.js";
import { MIN_TEXT_PX, MIN_SMALL_TEXT_PX } from "./placement.js";

export interface Rect { x: number; y: number; w: number; h: number }
export interface FrameEl { id: string; k: string; text?: string; anim?: string; g?: string; mark: boolean; op: number; done: boolean; size?: number; rect: Rect }
export interface FrameBoxes { t: number; els: FrameEl[]; hud: { k: "caption" | "heading" | "brand"; rect: Rect }[]; end: boolean }

export type FrameRule = "cut-off" | "text-overlap" | "hud-cover" | "blank" | "tiny-text";
export interface FrameIssue { rule: FrameRule; t: number; until: number; samples: number; ids: string[]; detail: string }
export interface FrameReport {
  ok: boolean; samples: number; atRest: number; times: number[];
  issues: FrameIssue[]; warnings: FrameIssue[];
  vision?: { t: number; problems: { kind: string; where: string }[] }[];
}

const OVERLAP_PX2 = 40;
const EDGE = 2;

/** Every `every` seconds, plus just before, during and after each camera move, fade and heading change. */
export function sampleTimes(film: Film, every = 2): number[] {
  const end = film.end ? film.end.t0 : film.duration;
  const ts: number[] = [];
  for (let t = 0.5; t < end; t += every) ts.push(t);
  for (const k of film.camera.slice(1)) ts.push(k.t - 0.15, k.t + k.move * 0.5, k.t + k.move + 0.2);
  for (const f of film.fades) ts.push(f.t - f.dur - 0.1, f.t + f.dur + 0.1);
  for (const h of film.headings) ts.push(h.t0 + 0.9);
  const out = [...new Set(ts.filter((t) => t > 0 && t < end - 0.05).map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
  return out;
}

export function moving(film: Film, t: number) {
  return film.camera.slice(1).some((k) => k.move > 0 && t >= k.t - 0.02 && t <= k.t + k.move + 0.02);
}

/** Ask the stage where everything is at each time. */
export async function measureFrames(film: Film, times: number[], dir: string): Promise<FrameBoxes[]> {
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "stage-check.html");
  fs.writeFileSync(html, stageHtml(film));
  const browser = await chromium.launch({ executablePath: findChrome(), args: ["--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars"] });
  try {
    const page = await browser.newPage({ viewport: { width: film.width, height: film.height }, deviceScaleFactor: 1 });
    await page.goto("file://" + html);
    await page.evaluate(() => (window as any).ready);
    const out: FrameBoxes[] = [];
    for (const t of times) out.push(await page.evaluate((tt) => (window as any).frameBoxes(tt), t));
    return out;
  } finally {
    await browser.close();
    fs.rmSync(html, { force: true });
  }
}

const inter = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/** the inked part of a text line: the DOM box includes the font's full ascent and descent */
const glyph = (r: Rect): Rect => ({ x: r.x, y: r.y + r.h * 0.2, w: r.w, h: r.h * 0.62 });
const lit = (e: FrameEl, min = 0.6) => e.k === "text" && e.done && e.op >= min && e.anim !== "count" && e.rect.w > 0 && e.rect.h > 0 && !!e.text?.trim();

/** Pure bounding-box checks over measured frames (no browser, no spend). */
export function judgeFrames(film: Film, frames: FrameBoxes[]): FrameReport {
  const W = film.width, H = film.height;
  const raw: { rule: FrameRule; t: number; ids: string[]; detail: string; warn?: boolean }[] = [];
  let atRest = 0;
  for (const f of frames) {
    if (f.end || moving(film, f.t)) continue;
    atRest++;
    const texts = f.els.filter((e) => lit(e));
    for (const e of f.els) {
      if (!e.done || e.op < 0.6 || !(e.k === "text" ? lit(e) : true)) continue;
      // a wire (group "e:from>to") may lead off screen to a node out of shot; rings, arrows and words may not
      if (e.g?.startsWith("e:")) continue;
      const r = e.k === "text" ? glyph(e.rect) : e.rect;
      const onScreen = inter(r, { x: 0, y: 0, w: W, h: H }) > 0;
      const inside = r.x >= -EDGE && r.y >= -EDGE && r.x + r.w <= W + EDGE && r.y + r.h <= H + EDGE;
      if (onScreen && !inside) raw.push({ rule: "cut-off", t: f.t, ids: [e.id], detail: `${e.k}${e.text ? ` "${e.text}"` : ""} runs past the frame edge (${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)})` });
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (inter(glyph(a.rect), glyph(b.rect)) > OVERLAP_PX2) raw.push({ rule: "text-overlap", t: f.t, ids: [a.id, b.id].sort(), detail: `"${a.text}" overlaps "${b.text}"` });
    }
    for (const h of f.hud) {
      if (h.k === "brand") continue;
      for (const e of texts) {
        if (e.op < 0.9) continue; // dimmed context may sit under the caption
        if (inter(glyph(e.rect), h.rect) > OVERLAP_PX2) raw.push({ rule: "hud-cover", t: f.t, ids: [h.k, e.id], detail: `${h.k} covers "${e.text}"` });
      }
    }
    // the same floors the placement check holds the plan to: names and titles, then wire labels and small print
    const scale = W / cameraAt(film, f.t).w;
    for (const e of texts) {
      if (e.op < 0.9 || !e.size) continue;
      const px = e.size * scale, floor = e.size >= 34 ? MIN_TEXT_PX : MIN_SMALL_TEXT_PX;
      if (px < floor - 0.5 && inter(e.rect, { x: 0, y: 0, w: W, h: H }) > 0) raw.push({ rule: "tiny-text", t: f.t, ids: [e.id], detail: `"${e.text}" is ${px.toFixed(0)} px on screen (floor ${floor})` });
    }
  }
  // one issue per rule and ids, spanning the samples where it shows
  const groups = new Map<string, FrameIssue & { warn?: boolean }>();
  for (const r of raw) {
    const key = `${r.rule}|${r.ids.join(",")}`;
    const g = groups.get(key);
    if (g) { g.until = r.t; g.samples++; } else groups.set(key, { rule: r.rule, t: r.t, until: r.t, samples: 1, ids: r.ids, detail: r.detail, warn: r.warn });
  }
  const all = [...groups.values()];
  const strip = ({ warn: _w, ...i }: FrameIssue & { warn?: boolean }) => i;
  const issues = all.filter((g) => !g.warn).map(strip), warnings = all.filter((g) => g.warn).map(strip);
  return { ok: issues.length === 0, samples: frames.length, atRest, times: frames.map((f) => f.t), issues, warnings };
}

/** A frame that is one flat colour (nothing drawn) is a broken frame. Reads the rendered JPEGs. */
export async function blankFrames(film: Film, frameDir: string, times: number[]): Promise<FrameIssue[]> {
  // all at once: sharp spreads the decodes over its thread pool
  const flat = await Promise.all(times.map(async (t) => {
    const file = path.join(frameDir, `f${String(Math.round(t * film.fps)).padStart(6, "0")}.jpg`);
    if (!fs.existsSync(file)) return false;
    const s = await sharp(file).stats();
    return Math.max(...s.channels.map((c) => c.stdev)) < 2;
  }));
  return times.filter((_, i) => flat[i]).map((t): FrameIssue => ({ rule: "blank", t, until: t, samples: 1, ids: [], detail: "frame is a flat colour" }));
}

/** Run the whole self-check. visionFrames > 0 also sends that many frames to Muse Spark (costs money; off by default). */
export async function frameCheck(film: Film, opts: { workDir: string; frameDir?: string; every?: number; visionFrames?: number; ledger?: CostLedger }): Promise<FrameReport> {
  const times = sampleTimes(film, opts.every ?? 2);
  const rep = judgeFrames(film, await measureFrames(film, times, opts.workDir));
  if (opts.frameDir) {
    const blank = await blankFrames(film, opts.frameDir, times);
    rep.issues.push(...blank);
    rep.ok = rep.issues.length === 0;
  }
  if (opts.visionFrames && opts.visionFrames > 0 && opts.frameDir && opts.ledger) {
    // flagged moments first, then an even spread
    const flagged = [...rep.issues, ...rep.warnings].map((i) => i.t);
    const spread = times.filter((_, i) => i % Math.max(1, Math.floor(times.length / opts.visionFrames!)) === 0);
    const pick = [...new Set([...flagged, ...spread])].slice(0, opts.visionFrames);
    const frames = await Promise.all(pick.map(async (t) => ({
      t, jpeg: await sharp(path.join(opts.frameDir!, `f${String(Math.round(t * film.fps)).padStart(6, "0")}.jpg`)).resize(960).jpeg({ quality: 80 }).toBuffer(),
    })));
    rep.vision = (await reviewFrames({ ledger: opts.ledger, frames })).frames;
  }
  return rep;
}
