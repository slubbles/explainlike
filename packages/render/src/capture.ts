import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import type { Film } from "./film.js";
import { stageHtml } from "./stage.js";
import { makeBed, makeSfx, mixGraph, type SfxCue } from "./music.js";

export function findChrome(): string {
  const c = [process.env.EXPLAINLIKE_CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean) as string[];
  const f = c.find((p) => fs.existsSync(p));
  if (!f) throw new Error("Chrome/Chromium not found. Set EXPLAINLIKE_CHROME to a Chrome binary.");
  return f;
}

export function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}: ${err}`))));
  });
}

/**
 * Where the stage put one caption. overlapPx: average pixels of drawing it covers on still frames (0 = clear);
 * movingPx: the same while the camera glides, when a brief brush matters less.
 */
export interface CaptionSpot { t0: number; text: string; spot: string; stacked: boolean; small?: boolean; overlapPx: number; movingPx: number; rect?: { x: number; y: number; w: number; h: number } }

/**
 * Render frames with N headless Chromes, one page each, pulling frame numbers from a shared queue.
 * Separate browsers scale far better than pages in one browser, which all wait on that browser's single compositor.
 * Each frame is handed to `onFrame` as soon as it is drawn (frames arrive out of order) and written to `dir`.
 */
export async function captureFrames(film: Film, dir: string, opts: { workers?: number; onProgress?: (done: number, total: number) => void; only?: number[]; onFrame?: (f: number, jpeg: Buffer) => Promise<void> | void } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "stage.html");
  fs.writeFileSync(html, stageHtml(film));
  const total = Math.ceil(film.duration * film.fps);
  const frames = opts.only ?? [...Array(total).keys()];
  const workers = Math.max(1, Math.min(opts.workers ?? defaultWorkers(), frames.length));
  let next = 0, done = 0, failed = false;
  let captions: CaptionSpot[] = [];
  await Promise.all([...Array(workers).keys()].map(async (w) => {
    const browser = await chromium.launch({ executablePath: findChrome(), args: ["--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars"] });
    try {
      const page = await browser.newPage({ viewport: { width: film.width, height: film.height }, deviceScaleFactor: 1 });
      await page.goto("file://" + html);
      await page.evaluate(() => (window as any).ready);
      if (w === 0) captions = await page.evaluate(() => (window as any).captionReport ?? []);
      while (next < frames.length && !failed) {
        const f = frames[next++];
        await page.evaluate((t) => (window as any).render(t), f / film.fps);
        const jpeg = await page.screenshot({ type: "jpeg", quality: 92 });
        fs.writeFileSync(path.join(dir, `f${String(f).padStart(6, "0")}.jpg`), jpeg);
        await opts.onFrame?.(f, jpeg);
        done++;
        if (done % 30 === 0) opts.onProgress?.(done, frames.length);
      }
    } catch (e) {
      failed = true; // the other workers stop at their next frame
      throw e;
    } finally {
      await browser.close();
    }
  }));
  return { html, total, captions };
}

/** One Chrome per spare core, at most 6: each holds a full-size page in memory. */
export function defaultWorkers() {
  return Math.max(2, Math.min(6, os.cpus().length - 1));
}

/** Place each scene's WAV at its start time in one 24 kHz mono track. */
export function mixNarration(parts: { file: string; at: number }[], duration: number, out: string) {
  const rate = 24000;
  const pcm = Buffer.alloc(Math.ceil(duration * rate) * 2);
  for (const p of parts) {
    const wav = fs.readFileSync(p.file);
    let off = 12, data = 44, len = wav.length - 44, sr = rate;
    while (off + 8 <= wav.length) {
      const id = wav.toString("ascii", off, off + 4), l = wav.readUInt32LE(off + 4);
      if (id === "fmt ") sr = wav.readUInt32LE(off + 12);
      if (id === "data") { data = off + 8; len = Math.min(l, wav.length - data); break; }
      off += 8 + l + (l % 2);
    }
    if (sr !== rate) throw new Error(`unexpected sample rate ${sr}`);
    const start = Math.round(p.at * rate) * 2;
    wav.copy(pcm, start, data, Math.min(data + len, data + pcm.length - start));
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(out, Buffer.concat([h, pcm]));
}

/** ffmpeg arguments for the mp4 after the video input: narration, the music bed (unless `music` is false), codecs. */
function mp4Args(fps: number, duration: number, out: string, bedDir: string, audio: string | undefined, music: boolean | undefined, cues: SfxCue[] = []) {
  const args: string[] = [];
  let bed: string | undefined, fx: string | undefined;
  if (music !== false) {
    bed = path.join(bedDir, "bed.wav");
    makeBed(duration + 1, bed);
  }
  if (cues.length) {
    fx = path.join(bedDir, "sfx.wav");
    makeSfx(duration + 0.5, cues, fx);
  }
  const ins = [audio, bed, fx].filter(Boolean) as string[];
  for (const f of ins) args.push("-i", f);
  const at = (f?: string) => (f ? ins.indexOf(f) + 1 : undefined);
  if (ins.length) args.push("-filter_complex", mixGraph(at(audio), at(bed), duration, at(fx)), "-map", "0:v", "-map", "[aout]");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (ins.length) args.push("-c:a", "aac", "-b:a", "160k", "-t", duration.toFixed(3));
  args.push(out);
  return args;
}

/**
 * Frames on disk, the narration (if any), the music bed (unless `music` is false) and soft sound effects at
 * `cues` into one mp4. The bed sits well under the voice and ducks while it speaks (see music.ts).
 */
export async function encodeMp4(frameDir: string, fps: number, out: string, audio?: string, opts: { music?: boolean; duration?: number; cues?: SfxCue[] } = {}) {
  const frames = fs.readdirSync(frameDir).filter((f) => /^f\d+\.jpg$/.test(f)).length;
  const duration = opts.duration ?? frames / fps;
  await run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frameDir, "f%06d.jpg"), ...mp4Args(fps, duration, out, frameDir, audio, opts.music, opts.cues)]);
}

/**
 * The same mp4 as encodeMp4, encoded while the frames are still being drawn: hand each JPEG to `frame`
 * in any order (it is fed to ffmpeg in frame order), then await `done`.
 */
export function mp4Encoder(fps: number, out: string, opts: { duration: number; workDir: string; audio?: string; music?: boolean; cues?: SfxCue[] }) {
  fs.mkdirSync(opts.workDir, { recursive: true });
  const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "pipe:0", ...mp4Args(fps, opts.duration, out, opts.workDir, opts.audio, opts.music, opts.cues)];
  const p = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "", failure: Error | undefined;
  p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
  p.stdin.on("error", () => {}); // a dead ffmpeg is reported by `closed` below
  const closed = new Promise<void>((res, rej) => {
    p.on("error", (e) => rej((failure = e)));
    p.on("close", (c) => (c === 0 ? res() : rej((failure = new Error(`ffmpeg exited ${c}: ${err}`)))));
  });
  closed.catch(() => {});
  const waiting = new Map<number, Buffer>();
  let nextFrame = 0;
  return {
    async frame(f: number, jpeg: Buffer) {
      if (failure) throw failure;
      waiting.set(f, jpeg);
      while (waiting.has(nextFrame)) {
        const buf = waiting.get(nextFrame)!;
        waiting.delete(nextFrame++);
        if (!p.stdin.write(buf)) await new Promise<void>((res) => { p.stdin.once("drain", res); closed.catch(res); });
      }
    },
    async done() {
      if (waiting.size) throw new Error(`frames missing before ${Math.min(...waiting.keys())}: got up to ${nextFrame}`);
      p.stdin.end();
      await closed;
    },
    abort() { p.kill("SIGKILL"); },
  };
}

export async function contactSheet(video: string, out: string, every = 3) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `fps=1/${every},scale=480:-1,tile=5x8:padding=6:color=0x222222`, "-frames:v", "1", out]);
}
