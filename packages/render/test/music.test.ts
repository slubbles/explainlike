import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { encodeMp4, loudness, BED_UNDER_DB, VOICE_LUFS, sfxCues, makeSfx, SFX_PEAK } from "../src/index.js";

test("the music bed sits at least 20 dB under the voice, and --no-music leaves only the voice", { timeout: 120_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainlike-music-"));
  const T = 14, frames = path.join(dir, "frames");
  fs.mkdirSync(frames);
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=white:s=320x180:r=10:d=${T}`, path.join(frames, "f%06d.jpg")]);
  // a stand-in voice: half-second "words" of a rich tone with short gaps, 24 kHz mono like the narration
  const voice = path.join(dir, "voice.wav"), silent = path.join(dir, "silent.wav");
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `aevalsrc='(sin(2*PI*180*t)+0.5*sin(2*PI*360*t)+0.3*sin(2*PI*900*t))*0.3*lt(mod(t,0.65),0.5)':s=24000:d=${T}`, "-ac", "1", voice]);
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `anullsrc=r=24000:cl=mono`, "-t", String(T), silent]);
  const out = (n: string) => path.join(dir, `${n}.mp4`);
  await encodeMp4(frames, 10, out("voice"), voice, { music: false });
  await encodeMp4(frames, 10, out("bed"), silent);
  await encodeMp4(frames, 10, out("mix"), voice);
  const v = loudness(out("voice")), b = loudness(out("bed")), m = loudness(out("mix"));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(Math.abs(v - VOICE_LUFS) < 1.5, `voice at ${v} LUFS`);
  assert.ok(v - b >= 20, `bed only ${(v - b).toFixed(1)} dB under the voice (aim ${BED_UNDER_DB})`);
  assert.ok(Math.abs(m - v) < 0.5, `the bed lifts the mix by ${(m - v).toFixed(2)} dB`);
});

test("sound effects are cued by what is drawn, at most one every 0.35 s, and never lift the voice mix", { timeout: 120_000 }, async () => {
  const film = { duration: 10, elements: [{ t0: 1, cue: "pop" as const }, { t0: 1.1, cue: "pop" as const }, { t0: 2, cue: "whoosh" as const }, { t0: 3 }, { t0: 12, cue: "pop" as const }] };
  assert.deepEqual(sfxCues(film), [{ t: 1, kind: "pop" }, { t: 2, kind: "whoosh" }]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainlike-sfx-"));
  const T = 10, frames = path.join(dir, "frames");
  fs.mkdirSync(frames);
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=white:s=320x180:r=10:d=${T}`, path.join(frames, "f%06d.jpg")]);
  const voice = path.join(dir, "voice.wav");
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `aevalsrc='(sin(2*PI*180*t)+0.5*sin(2*PI*360*t)+0.3*sin(2*PI*900*t))*0.3*lt(mod(t,0.65),0.5)':s=24000:d=${T}`, "-ac", "1", voice]);
  const cues = Array.from({ length: 12 }, (_, i) => ({ t: 0.5 + i * 0.8, kind: (i % 3 ? "pop" : "whoosh") as "pop" | "whoosh" }));
  const out = (n: string) => path.join(dir, `${n}.mp4`);
  await encodeMp4(frames, 10, out("plain"), voice);
  await encodeMp4(frames, 10, out("fx"), voice, { cues });
  const fxWav = path.join(dir, "fx.wav");
  makeSfx(T, cues, fxWav);
  const plain = loudness(out("plain")), fx = loudness(out("fx")), only = loudness(fxWav);
  const peak = Number(spawnSync("ffmpeg", ["-hide_banner", "-i", fxWav, "-af", "astats=measure_overall=Peak_level:measure_perchannel=none", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/Peak level dB:\s*(-?[\d.]+)/)![1]);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(Math.abs(fx - plain) < 0.5, `the effects lift the mix by ${(fx - plain).toFixed(2)} dB`);
  assert.ok(only < plain - 20, `the effects alone measure ${only} LUFS against the voice's ${plain}`);
  assert.ok(peak <= 20 * Math.log10(Math.max(SFX_PEAK.pop, SFX_PEAK.whoosh)) + 1 && peak > -40, `effects peak at ${peak} dBFS`);
});
