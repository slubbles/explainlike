import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import type { Film } from "./film.js";
import { stageHtml } from "./stage.js";

export function findChrome(): string {
  const c = [process.env.METUAL_CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean) as string[];
  const f = c.find((p) => fs.existsSync(p));
  if (!f) throw new Error("Chrome/Chromium not found. Set METUAL_CHROME to a Chrome binary.");
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

/** Render frames with N parallel headless pages, each seeking window.render(t). */
export async function captureFrames(film: Film, dir: string, opts: { workers?: number; onProgress?: (done: number, total: number) => void; only?: number[] } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "stage.html");
  fs.writeFileSync(html, stageHtml(film));
  const total = Math.ceil(film.duration * film.fps);
  const frames = opts.only ?? [...Array(total).keys()];
  const workers = Math.max(1, Math.min(opts.workers ?? Math.max(2, Math.min(6, os.cpus().length - 1)), frames.length));
  const browser = await chromium.launch({ executablePath: findChrome(), args: ["--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars"] });
  let done = 0;
  try {
    await Promise.all([...Array(workers).keys()].map(async (w) => {
      const page = await browser.newPage({ viewport: { width: film.width, height: film.height }, deviceScaleFactor: 1 });
      await page.goto("file://" + html);
      await page.evaluate(() => (window as any).ready);
      for (let i = w; i < frames.length; i += workers) {
        const f = frames[i];
        await page.evaluate((t) => (window as any).render(t), f / film.fps);
        await page.screenshot({ path: path.join(dir, `f${String(f).padStart(6, "0")}.jpg`), type: "jpeg", quality: 92 });
        done++;
        if (done % 30 === 0) opts.onProgress?.(done, frames.length);
      }
      await page.close();
    }));
  } finally {
    await browser.close();
  }
  return { html, total };
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

export async function encodeMp4(frameDir: string, fps: number, out: string, audio?: string) {
  const args = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frameDir, "f%06d.jpg")];
  if (audio) args.push("-i", audio);
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (audio) args.push("-c:a", "aac", "-b:a", "160k", "-shortest");
  args.push(out);
  await run("ffmpeg", args);
}

export async function contactSheet(video: string, out: string, every = 3) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `fps=1/${every},scale=480:-1,tile=5x8:padding=6:color=0x222222`, "-frames:v", "1", out]);
}
