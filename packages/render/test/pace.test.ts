import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Brief } from "@explanimate/core";
import {
  textWidth,
  captionMismatches,
  compose,
  loadIconPack,
  stillGaps,
  shotStarts,
  offFrameTexts,
  cameraAt,
  boxOf,
  readableWidth,
  READ_KINDS,
  paceReport,
} from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("clipfeed.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("clipfeed.architecture.json", fx), "utf8"));
// narration with evenly spaced words, so captions exist
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return {
    sceneId: s.id,
    duration: ws.length * 0.38,
    words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })),
  };
});
type Cx = Brief["complexity"];
const made = new Map<Cx, ReturnType<typeof compose>>();
const make = (complexity: Cx = "moderate") => {
  if (!made.has(complexity))
    made.set(
      complexity,
      compose({
        plan,
        audio,
        theme: getTheme("chalk-dark"),
        spec: specFromBrief({ ...DEFAULT_BRIEF, complexity }),
        pack: loadIconPack(),
        sourceLabel: "x",
        arch,
      }),
    );
  return made.get(complexity)!;
};
const ALL: Cx[] = ["simple", "moderate", "technical"];

test("every tempo: shots hold at least the minimum beat and stay under the cuts a minute", async () => {
  for (const cx of ALL) {
    const { film, pace } = await make(cx);
    const spec = specFromBrief({ ...DEFAULT_BRIEF, complexity: cx });
    assert.deepEqual(pace.problems, [], cx);
    assert.ok(pace.shortestHold >= spec.tempo.minBeat - 0.05, `${cx}: shortest hold ${pace.shortestHold}`);
    assert.ok(pace.cutsPerMin <= spec.tempo.maxCutsPerMin, `${cx}: ${pace.cutsPerMin} cuts a minute`);
    assert.deepEqual(paceReport(film, spec.tempo), pace, "the report measures the finished film");
  }
});

test("technical topics run slower than simple ones", async () => {
  const slow = (await make("technical")).pace,
    brisk = (await make("simple")).pace;
  // fewer cuts a minute and a longer shortest hold (the median can tie on a shared long hold)
  assert.ok(slow.cutsPerMin < brisk.cutsPerMin, `${slow.cutsPerMin} vs ${brisk.cutsPerMin} cuts a minute`);
  assert.ok(slow.shortestHold > brisk.shortestHold, `${slow.shortestHold} vs ${brisk.shortestHold}`);
  assert.ok(slow.medianHold >= brisk.medianHold, `${slow.medianHold} vs ${brisk.medianHold}`);
  assert.ok((await make("technical")).film.duration > (await make("simple")).film.duration);
});

test("the camera eases every move, and never moves while a ring, arrow or dot is drawn", async () => {
  for (const cx of ALL) {
    const { film, pace } = await make(cx);
    const tempo = specFromBrief({ ...DEFAULT_BRIEF, complexity: cx }).tempo;
    assert.equal(pace.panDuringDraw, 0, cx);
    // hard cuts only where the picture crossfades (a new board or the source page) or at the very start
    const cuts = film.camera.filter((k) => k.t > 0 && k.move === 0 && !film.fades.some((f) => Math.abs(f.t - k.t) < 0.05));
    assert.deepEqual(
      cuts.map((k) => k.t.toFixed(2)),
      [],
      cx,
    );
    for (const k of film.camera) if (k.move > 0) assert.ok(k.move >= tempo.move - 1e-6 || k.move > 0.4, `${cx}: move ${k.move} at ${k.t}`);
  }
});

test("headings never overlap in time, so only one title is ever on screen", async () => {
  const { film } = await make();
  for (let i = 1; i < film.headings.length; i++) assert.ok(film.headings[i].t0 >= film.headings[i - 1].t1 - 1e-6);
});

test("scale scenes count up the jump, and nothing ends up off screen", async () => {
  const { film } = await make();
  const counts = film.elements.filter((e) => e.k === "text" && e.anim === "count");
  assert.equal(counts.length, arch.scale.length);
  assert.deepEqual(offFrameTexts(film), []);
});

test("a framing at rest never slices a box or a word in half", async () => {
  const { film } = await make();
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
  const { film } = await make();
  assert.deepEqual(captionMismatches(film, plan.scenes), []);
  const bent = structuredClone(film);
  const c = bent.captions.find((x) => x.words.some((w) => w.w === "a"));
  if (c) c.words.find((w) => w.w === "a")!.w = "the";
  else bent.captions[3].words[0].w += "s";
  assert.equal(captionMismatches(bent, plan.scenes).length, 1);
});

test("the jump counter covers only the icon, never the box's name or description", async () => {
  const { film } = await make();
  type B = { x: number; y: number; w: number; h: number };
  const box = (e: any): B => {
    const w = textWidth(e.text, e.size),
      x = e.anchor === "middle" ? e.x - w / 2 : e.anchor === "end" ? e.x - w : e.x;
    return { x, y: e.y - e.size * 0.95, w, h: e.size * 1.25 };
  };
  const hit = (a: B, b: B) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const counts = film.elements.filter((e: any) => e.k === "text" && e.anim === "count") as any[];
  assert.ok(counts.length > 0);
  for (const c of counts) {
    const cover = [c.bgBox, box(c)];
    const covered = film.elements.filter((e: any) => e.k === "text" && e !== c && e.anim !== "count" && cover.some((r) => hit(r, box(e))));
    assert.deepEqual(
      covered.map((e: any) => e.text),
      [],
      c.text,
    );
  }
});

test("a new caption line over a still board still counts as a still picture", () => {
  const film = {
    elements: [],
    camera: [],
    headings: [],
    fades: [],
    captions: [1, 2, 3].map((t) => ({ scene: "s", t0: t, t1: t + 1, words: [{ w: "hi", s: t, e: t + 0.5 }] })),
  } as any;
  assert.deepEqual(stillGaps(film, 0, 4), [{ t0: 0, t1: 4 }]);
});

test("a small label or a moving dot drawn into a wide shot still counts as a still picture; a new box does not", () => {
  const base = {
    headings: [],
    fades: [],
    captions: [],
    width: 1920,
    height: 1080,
    camera: [{ t: 0, move: 0, x: 0, y: 0, w: 3840, h: 2160 }],
  };
  const label = { k: "text", id: "t", t0: 2, dur: 0.3, x: 100, y: 100, text: "rows", size: 18 };
  const dot = {
    k: "dot",
    id: "d",
    t0: 1,
    dur: 2,
    pts: [
      [0, 0],
      [3000, 2000],
    ],
    r: 8,
    color: "red",
  };
  const box = { k: "img", id: "i", t0: 2, dur: 0.5, x: 1000, y: 800, w: 400, h: 300 };
  assert.deepEqual(stillGaps({ ...base, elements: [label, dot] } as any, 0, 4), [{ t0: 0, t1: 4 }]);
  assert.deepEqual(stillGaps({ ...base, elements: [label, box] } as any, 0, 4), [
    { t0: 0, t1: 2 },
    { t0: 2.5, t1: 4 },
  ]);
});

test("a slow push is not a new shot; a big reframe is", () => {
  const film = {
    width: 1920,
    height: 1080,
    elements: [],
    headings: [],
    fades: [],
    captions: [],
    camera: [
      { t: 0, move: 0, x: 0, y: 0, w: 1920, h: 1080 },
      { t: 1, move: 4, x: 48, y: 27, w: 1824, h: 1026 },
      { t: 6, move: 1, x: 2000, y: 0, w: 1920, h: 1080 },
    ],
  } as any;
  assert.deepEqual(shotStarts(film), [6]);
});

test("a shot too wide to read a box's name never rests longer than a beat", async () => {
  const { film, timeline } = await make();
  // the overview holds one beat, then the glide in takes one move
  const { minBeat, move } = specFromBrief({ ...DEFAULT_BRIEF, complexity: "moderate" }).tempo;
  const RW = readableWidth(film),
    long: string[] = [];
  for (const s of timeline) {
    if (!READ_KINDS.has(s.kind)) continue;
    let run = 0;
    for (let t = s.start; t < s.end; t += 0.1) {
      // a framing may widen past readable so every word is whole on screen as it finishes, between the title
      // and the captions, when a dense layer is narrated too fast for a second glide (names stay at least
      // 26 / 1.5 = 17 px tall); past 1.5x it reads as a parked overview
      run = cameraAt(film, t).w > RW * 1.5 ? run + 0.1 : 0;
      if (run > minBeat + move) {
        long.push(`${s.kind} at ${t.toFixed(1)}`);
        break;
      }
    }
  }
  assert.deepEqual(long, []);
});
