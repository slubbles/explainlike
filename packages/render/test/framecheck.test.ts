import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Brief } from "@explainlike/core";
import { compose, loadIconPack, sampleTimes, moving, judgeFrames, measureFrames, findChrome, cameraAt, type FrameBoxes, type FrameEl } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("spotibai.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("spotibai.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});
const make = (complexity: Brief["complexity"]) => compose({ plan, audio, theme: getTheme("chalk-dark"), spec: specFromBrief({ ...DEFAULT_BRIEF, complexity }), pack: loadIconPack(), sourceLabel: "x", arch });

const word = (id: string, x: number, y: number, extra: Partial<FrameEl> = {}): FrameEl =>
  ({ id, k: "text", text: id, mark: false, op: 1, done: true, size: 40, rect: { x, y, w: 200, h: 50 }, ...extra });

test("samples land at a steady interval and around every camera move", async () => {
  const { film } = await make("moderate");
  const ts = sampleTimes(film);
  assert.ok(ts.length >= film.duration / 2, `${ts.length} samples`);
  const end = film.end ? film.end.t0 : film.duration;
  for (const k of film.camera.slice(1).filter((k) => k.t + k.move + 0.3 < end)) assert.ok(ts.some((t) => Math.abs(t - (k.t + k.move + 0.2)) < 0.06), `after the move at ${k.t}`);
});

test("judgeFrames flags a cut-off word, overlapping words, a caption over a word and tiny text", async () => {
  const { film } = await make("moderate");
  const t = sampleTimes(film).find((x) => x > 5 && !moving(film, x))!;
  const scale = film.width / cameraAt(film, t).w;
  const frame: FrameBoxes = {
    t, end: false,
    els: [
      word("edge", film.width - 80, 300),
      word("a", 400, 400), word("b", 420, 410),
      word("under", 800, 950),
      word("small", 1200, 200, { size: 10 / scale }),
      // a wire may run off screen, and a fading word is not judged yet
      { id: "wire", k: "line", g: "e:x>y", mark: true, op: 1, done: true, rect: { x: -300, y: 500, w: 900, h: 4 } },
      word("fading", -100, 600, { op: 0.3 }),
    ],
    hud: [{ k: "caption", rect: { x: 700, y: 940, w: 520, h: 90 } }, { k: "brand", rect: { x: 0, y: 0, w: 400, h: 400 } }],
  };
  const rep = judgeFrames(film, [frame]);
  const got = rep.issues.map((i) => `${i.rule}:${i.ids.join(",")}`).sort();
  assert.deepEqual(got, ["cut-off:edge", "hud-cover:caption,under", "text-overlap:a,b", "tiny-text:small"]);
  assert.equal(rep.ok, false);
  assert.equal(judgeFrames(film, [{ ...frame, els: [word("fine", 600, 300)], hud: [] }]).ok, true, "a clean frame passes");
  assert.equal(judgeFrames(film, [{ ...frame, end: true }]).atRest, 0, "the end card is not judged");
  const faded = { ...film, fades: [{ t: t + 0.05, dur: 0.35 }] };
  assert.equal(judgeFrames(faded, [frame]).atRest, 0, "a frame under the scene-change wash is not judged");
  assert.equal(judgeFrames({ ...film, fades: [{ t: t + 0.3, dur: 0.35 }] }, [frame]).atRest, 1, "the light edge of the wash still is");
});

const chrome = (() => { try { return findChrome(); } catch { return ""; } })();
test("the spotibai board reads cleanly at every rest, at every tempo", { skip: !chrome && "no Chrome" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-"));
  try {
    for (const cx of ["simple", "moderate", "technical"] as const) {
      const { film } = await make(cx);
      const rep = judgeFrames(film, await measureFrames(film, sampleTimes(film), dir));
      assert.ok(rep.atRest > 50, `${cx}: ${rep.atRest} frames at rest`);
      assert.deepEqual(rep.issues.map((i) => `${i.rule} ${i.t} ${i.detail}`), [], cx);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
