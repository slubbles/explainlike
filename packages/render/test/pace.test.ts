import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, getLevel } from "@metual/core";
import { compose, loadIconPack, stillGaps, shotStarts, offFrameTexts, cameraAt, boxOf, type Pace } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("spotibai.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("spotibai.architecture.json", fx), "utf8"));
// narration with evenly spaced words, so captions exist
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});
const make = (pace: Pace) => compose({ plan, audio, theme: getTheme("caleb-dark"), level: getLevel("interviewing"), pack: loadIconPack(), sourceLabel: "x", arch, pace });

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
  for (const c of film.captions) assert.ok(c.words.length <= 4, c.words.map((w) => w.w).join(" "));
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
