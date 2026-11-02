import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getTheme, specFromBrief, DEFAULT_BRIEF } from "@explanimate/core";
import { compose, loadIconPack, captureFrames, wordOpacities, revealWords, rendererChoice, renderFilm, skiaUnavailable, videoCodec, DEFAULT_RENDERER } from "../src/index.js";
import { pumpFrames, skiaWorkers, captureFramesSkia } from "../src/skia.js";
// @ts-expect-error plain JS module shared with the worker threads
import * as draw from "../src/skia/draw.mjs";

test("EXPLANIMATE_RENDERER picks skia or chrome, and anything else means the default", () => {
  assert.equal(rendererChoice({}), DEFAULT_RENDERER);
  assert.equal(rendererChoice({ EXPLANIMATE_RENDERER: "chrome" }), "chrome");
  assert.equal(rendererChoice({ EXPLANIMATE_RENDERER: " Skia " }), "skia");
  assert.equal(rendererChoice({ EXPLANIMATE_RENDERER: "webgl" }), DEFAULT_RENDERER);
});

test("skia that cannot load says why, so the render falls back to chrome instead of failing", async () => {
  assert.equal(await skiaUnavailable(async () => ({})), undefined);
  assert.match((await skiaUnavailable(async () => { throw new Error("no prebuilt binary for this platform\nstack"); }))!, /^skia unavailable \(no prebuilt binary for this platform\)$/);
});

test("NVENC is used only when a test encode works, and EXPLANIMATE_ENCODER can force either encoder", () => {
  assert.equal(videoCodec({}, () => false).name, "libx264");
  assert.equal(videoCodec({}, () => true).name, "h264_nvenc");
  assert.equal(videoCodec({ EXPLANIMATE_ENCODER: "x264" }, () => true).name, "libx264");
  assert.equal(videoCodec({ EXPLANIMATE_ENCODER: "nvenc" }, () => false).name, "h264_nvenc");
  // the same quality knob either way: x264 crf 20, nvenc cq 20
  assert.ok(videoCodec({}, () => false).args.join(" ").includes("-crf 20"));
  assert.ok(videoCodec({}, () => true).args.join(" ").includes("-cq 20"));
});

test("skia draws on 2-4 threads beside libx264, and on every spare core beside a hardware encoder", () => {
  assert.equal(skiaWorkers(false, 2), 2);
  assert.equal(skiaWorkers(false, 8), 2);
  assert.equal(skiaWorkers(false, 32), 4);
  assert.equal(skiaWorkers(true, 8), 7);
  assert.equal(skiaWorkers(true, 64), 8);
});

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("frames waiting for a slow encoder never pile up past the limit, and still arrive in order", async () => {
  let held = 0, peak = 0;
  const out: number[] = [];
  const frames = [...Array(60).keys()];
  const r = await pumpFrames({
    frames, workers: 4, limit: 8,
    // uneven drawing times, so frames finish out of order
    draw: async (_w, f) => { held++; peak = Math.max(peak, held); await tick((f * 7) % 5); return f; },
    write: async (f, b) => { assert.equal(b, f); await tick(3); out.push(f); held--; },
  });
  assert.deepEqual(out, frames);
  assert.ok(peak <= 8, `${peak} frames held at once`);
  assert.ok(r.peakHeld <= 8);
  assert.equal(held, 0);
});

test("a frame that fails to draw, or to encode, stops the render with that error", async () => {
  const written: number[] = [];
  await assert.rejects(pumpFrames({ frames: [...Array(40).keys()], workers: 3, limit: 4, draw: async (_w, f) => { await tick(1); if (f === 9) throw new Error("bad frame 9"); return f; }, write: (f) => { written.push(f); } }), /bad frame 9/);
  assert.ok(written.length <= 9 && written.every((f, i) => f === i));
  let drawn = 0;
  await assert.rejects(pumpFrames({ frames: [...Array(40).keys()], workers: 3, limit: 4, draw: async (_w, f) => { drawn++; return f; }, write: (f) => { if (f === 5) throw new Error("ffmpeg died"); } }), /ffmpeg died/);
  assert.ok(drawn <= 5 + 4 + 3, `kept drawing ${drawn} frames after the encoder died`);
});

test("the skia stage's copies of the word-reveal helpers match reveal.ts", () => {
  for (const n of [1, 2, 3, 5, 9, 20]) for (const p of [0, 0.1, 0.33, 0.5, 0.8, 1]) assert.deepEqual(draw.wordOpacities(n, p), wordOpacities(n, p));
  for (const s of ["one", "two words", "  padded  text ", "a-b c\td", ""]) assert.deepEqual(draw.revealWords(s), revealWords(s));
});

test("skia measures path lengths the way the browser does", () => {
  assert.equal(draw.pathLength("M0 0 L30 40"), 50);
  assert.equal(draw.pathLength("M0 0 h10 v10 Z"), 20 + Math.hypot(10, 10));
  // a cubic that is really a straight line
  assert.ok(Math.abs(draw.pathLength("M0 0 C10 0 20 0 30 0") - 30) < 1e-6);
  // a quarter circle of radius 100 as a cubic: about 157.08
  assert.ok(Math.abs(draw.pathLength("M100 0 C100 55.23 55.23 100 0 100") - 157.08) < 0.1);
});

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("spotibai.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("spotibai.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});
const ssim = (a: string[], b: string[]) => Number(/All:([\d.]+)/.exec(spawnSync("ffmpeg", ["-v", "info", ...a, ...b, "-lavfi", "ssim", "-f", "null", "-"], { encoding: "utf8" }).stderr)?.[1] ?? 0);

test("skia draws the same frames as chrome: drawing, headings, captions and the end card", { timeout: 180_000 }, async () => {
  for (const theme of ["pen-light", "chalk-dark"]) {
    const { film } = await compose({ plan, audio, theme: getTheme(theme), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });
    const at = [film.headings[0].t0 + 0.3, film.duration * 0.45, film.duration * 0.7, film.end!.t0 + 0.25, film.duration - 0.5];
    const only = at.map((t) => Math.round(t * film.fps));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-skia-"));
    const chrome = await captureFrames(film, path.join(dir, "c"), { only, workers: 2 });
    const raw = new Map<number, Buffer>();
    const skia = await captureFramesSkia(film, path.join(dir, "s"), { only, workers: 2, onFrame: (f, b) => { raw.set(f, Buffer.from(b)); } });
    assert.deepEqual(skia.captions, chrome.captions, "the frame check gets the same caption report");
    for (const f of only) {
      const id = String(f).padStart(6, "0"), file = path.join(dir, `s${id}.rgba`);
      fs.writeFileSync(file, raw.get(f)!);
      const s = ssim(["-i", path.join(dir, "c", `f${id}.jpg`)], ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${film.width}x${film.height}`, "-i", file]);
      assert.ok(s > 0.97, `${theme} frame ${f} (${(f / film.fps).toFixed(1)}s): ssim ${s}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("renderFilm with skia makes a complete mp4 and leaves the frames the frame check reads", { timeout: 120_000 }, async () => {
  const { film } = await compose({ plan, audio, theme: getTheme("pen-light"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });
  film.duration = 2; film.fps = 24; film.end = undefined as any;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-skia-mp4-"));
  const mp4 = path.join(dir, "out.mp4");
  const r = await renderFilm(film, path.join(dir, "frames"), mp4, { renderer: "skia", music: false });
  await r.encoded;
  assert.equal(r.renderer, "skia");
  assert.equal(r.fellBack, undefined);
  const n = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v", "-show_entries", "stream=nb_read_frames,width,height", "-of", "csv=p=0", mp4], { encoding: "utf8" }).stdout.trim();
  assert.equal(n, "1920,1080,48");
  assert.ok(fs.existsSync(path.join(dir, "frames", "f000012.jpg")), "the 0.5s sample frame is missing");
  fs.rmSync(dir, { recursive: true, force: true });
});
