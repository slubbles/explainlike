import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, specFromBrief, DEFAULT_BRIEF } from "@explainlike/core";
import { textWidth, captionMismatches, compose, loadIconPack, stillGaps, shotStarts, offFrameTexts, cameraAt, boxOf, readableWidth, READ_KINDS, type Pace } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
// narration with evenly spaced words, so captions exist
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});
const make = (pace: Pace) => compose({ plan, audio, theme: getTheme("chalk-dark"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch, pace });

test("lively: the picture never sits still for more than 1.2 s", async () => {
  const { film, timeline } = await make("lively");
  const long = stillGaps(film, 0, timeline.at(-1)!.end).filter((g) => g.t1 - g.t0 > 1.2);
  assert.deepEqual(long.map((g) => `${g.t0.toFixed(1)}-${g.t1.toFixed(1)}`), []);
});

test("lively: a new shot about every 2.5 to 3 seconds", async () => {
  const calm = shotStarts((await make("calm")).film), lively = shotStarts((await make("lively")).film);
  const median = (s: number[]) => { const d = s.slice(1).map((t, i) => t - s[i]).sort((a, b) => a - b); return d[d.length >> 1]; };
  assert.ok(median(lively) <= 3, `median shot ${median(lively).toFixed(2)} s`);
  assert.ok(median(calm) > median(lively));
});

test("lively: black cards name each new part, calm has none", async () => {
  const { film, timeline } = await make("lively");
  const texts = (film.cards ?? []).map((c) => c.text);
  for (const t of ["how it's built", "follow one request", "what breaks at scale", "the whole picture"]) assert.ok(texts.includes(t), t);
  for (const c of film.cards!) assert.ok(!timeline.some((s) => c.t0 < s.end && c.t1 > s.start), "a card never covers a scene");
  assert.equal((await make("calm")).film.cards?.length ?? 0, 0);
});

test("lively: short captions sit next to what they talk about", async () => {
  const { film, timeline } = await make("lively");
  // about four words: at most seven, and only rarely more than four (when that keeps a noun phrase or a clause whole)
  for (const c of film.captions) assert.ok(c.words.length <= 7 && c.words.map((w) => w.w).join(" ").length <= 34, c.words.map((w) => w.w).join(" "));
  assert.ok(film.captions.filter((c) => c.words.length > 4).length <= film.captions.length / 4);
  const inLayers = film.captions.filter((c) => timeline.some((s) => s.kind === "layer" && c.t0 >= s.start && c.t0 < s.end));
  assert.ok(inLayers.length > 10 && inLayers.every((c) => c.at), "layer captions have a spot");
});

test("lively: scale scenes count up the jump, and nothing ends up off screen", async () => {
  const { film } = await make("lively");
  const counts = film.elements.filter((e) => e.k === "text" && e.anim === "count");
  assert.equal(counts.length, arch.scale.length);
  assert.deepEqual(offFrameTexts(film), []);
});

test("lively: a close-up never slices a box or a word in half", async () => {
  const { film } = await make("lively");
  type B = { x: number; y: number; w: number; h: number };
  const inside = (b: B, v: B) => b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h;
  const overlaps = (b: B, v: B) => b.x < v.x + v.w && v.x < b.x + b.w && b.y < v.y + v.h && v.y < b.y + b.h;
  const sliced: string[] = [];
  for (const k of film.camera.filter((k) => k.move === 0)) {
    const before = cameraAt(film, k.t - 0.01);
    for (const e of film.elements) {
      const b = boxOf(e);
      if (!b || e.k === "path" || e.t0 >= k.t || !inside(b, before)) continue;
      if (overlaps(b, k) && !inside(b, k)) sliced.push(`${e.id} at ${k.t.toFixed(1)}`);
    }
  }
  assert.deepEqual(sliced, []);
});

test("captions spell out the narration word for word, and a changed word is caught", async () => {
  for (const pace of ["lively", "calm"] as Pace[]) {
    const { film } = await make(pace);
    assert.deepEqual(captionMismatches(film, plan.scenes), []);
    const bent = structuredClone(film);
    const c = bent.captions.find((x) => x.words.some((w) => w.w === "a"));
    if (c) c.words.find((w) => w.w === "a")!.w = "the";
    else bent.captions[3].words[0].w += "s";
    assert.equal(captionMismatches(bent, plan.scenes).length, 1);
  }
});

test("lively: the jump counter covers only the icon, never the box's name or description", async () => {
  const { film } = await make("lively");
  type B = { x: number; y: number; w: number; h: number };
  const box = (e: any): B => { const w = textWidth(e.text, e.size), x = e.anchor === "middle" ? e.x - w / 2 : e.anchor === "end" ? e.x - w : e.x; return { x, y: e.y - e.size * 0.95, w, h: e.size * 1.25 }; };
  const hit = (a: B, b: B) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const counts = film.elements.filter((e: any) => e.k === "text" && e.anim === "count") as any[];
  assert.ok(counts.length > 0);
  for (const c of counts) {
    const cover = [c.bgBox, box(c)];
    const covered = film.elements.filter((e: any) => e.k === "text" && e !== c && e.anim !== "count" && cover.some((r) => hit(r, box(e))));
    assert.deepEqual(covered.map((e: any) => e.text), [], c.text);
    const b = box(c), r = c.bgBox;
    assert.ok(b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h + 0.01, `${c.text} fits its backdrop`);
  }
});

test("a new caption line over a still board still counts as a still picture", () => {
  const film = { elements: [], camera: [], headings: [], cards: [], fades: [],
    captions: [1, 2, 3].map((t) => ({ scene: "s", t0: t, t1: t + 1, words: [{ w: "hi", s: t, e: t + 0.5 }] })) } as any;
  assert.deepEqual(stillGaps(film, 0, 4), [{ t0: 0, t1: 4 }]);
});

test("a small label or a moving dot drawn into a wide shot still counts as a still picture; a new box does not", () => {
  const base = { headings: [], cards: [], fades: [], captions: [], width: 1920, height: 1080,
    camera: [{ t: 0, move: 0, x: 0, y: 0, w: 3840, h: 2160 }] };
  const label = { k: "text", id: "t", t0: 2, dur: 0.3, x: 100, y: 100, text: "rows", size: 18 };
  const dot = { k: "dot", id: "d", t0: 1, dur: 2, pts: [[0, 0], [3000, 2000]], r: 8, color: "red" };
  const box = { k: "img", id: "i", t0: 2, dur: 0.5, x: 1000, y: 800, w: 400, h: 300 };
  assert.deepEqual(stillGaps({ ...base, elements: [label, dot] } as any, 0, 4), [{ t0: 0, t1: 4 }]);
  assert.deepEqual(stillGaps({ ...base, elements: [label, box] } as any, 0, 4), [{ t0: 0, t1: 2 }, { t0: 2.5, t1: 4 }]);
});

test("lively: no scene opens on an unchanged board for two seconds", async () => {
  const { film, timeline } = await make("lively");
  const late: string[] = [];
  for (const s of timeline) {
    const first = film.elements.filter((e) => e.t0 >= s.start && e.t0 < s.end).sort((a, b) => a.t0 - b.t0)[0];
    if (!first) continue;
    const open = Math.max(s.start, ...(film.cards ?? []).filter((c) => c.t0 >= s.start - 0.01 && c.t0 < s.end).map((c) => c.t1));
    if (first.t0 - open > 1.8) late.push(`${s.sceneId ?? s.id} waits ${(first.t0 - open).toFixed(1)} s`);
  }
  assert.deepEqual(late, []);
});

test("lively: a shot too wide to read a box's name never rests more than a beat", async () => {
  const { film, timeline } = await make("lively");
  const RW = readableWidth(film), long: string[] = [];
  for (const s of timeline) {
    if (!READ_KINDS.has(s.kind)) continue;
    let run = 0;
    for (let t = s.start; t < s.end; t += 0.1) {
      run = cameraAt(film, t).w > RW * 1.2 ? run + 0.1 : 0;
      if (run > 2.0) { long.push(`${s.kind} at ${t.toFixed(1)}`); break; }
    }
  }
  assert.deepEqual(long, []);
});
