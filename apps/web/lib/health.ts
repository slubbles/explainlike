import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** What a load balancer or uptime check needs to know. Keys are reported present or missing, never their values. */
export interface Health {
  ok: boolean;
  checks: { ffmpeg: boolean; chrome: boolean; modelKey: boolean; voiceKey: boolean; jobsDir: boolean };
  /** new videos are refused: demo-only mode or the spend cap */
  paused: boolean;
  problems: string[];
}

const CHROME = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];

export interface Probe {
  env: NodeJS.ProcessEnv;
  has: (file: string) => boolean;
  runs: (cmd: string) => boolean;
  writable: (dir: string) => boolean;
}

export const realProbe: Probe = {
  env: process.env,
  has: (f) => fs.existsSync(/*turbopackIgnore: true*/ f),
  runs: (cmd) => spawnSync(cmd, ["-version"], { stdio: "ignore", timeout: 5000 }).status === 0,
  writable: (dir) => {
    try {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
      const f = path.join(dir, ".health");
      fs.writeFileSync(/*turbopackIgnore: true*/ f, String(Date.now()));
      fs.rmSync(/*turbopackIgnore: true*/ f);
      return true;
    } catch { return false; }
  },
};

/** Healthy means a video can be made: ffmpeg, Chrome, the Meta key and a writable jobs folder. Voice is optional. */
export function checkHealth(jobsDir: string, budgetOk: boolean, p: Probe = realProbe): Health {
  const checks = {
    ffmpeg: p.runs("ffmpeg"),
    chrome: [p.env.EXPLAINLIKE_CHROME, ...CHROME].some((f) => !!f && p.has(f)),
    modelKey: !!p.env.MODEL_API_KEY,
    voiceKey: !!p.env.DEEPGRAM_API_KEY,
    jobsDir: p.writable(jobsDir),
  };
  const problems: string[] = [];
  if (!checks.ffmpeg) problems.push("ffmpeg is not on the PATH.");
  if (!checks.chrome) problems.push("Chrome or Chromium was not found. Set EXPLAINLIKE_CHROME.");
  if (!checks.modelKey) problems.push("MODEL_API_KEY is not set.");
  if (!checks.jobsDir) problems.push("The jobs folder is not writable. Check EXPLAINLIKE_JOBS_DIR and the volume.");
  const paused = p.env.EXPLAINLIKE_DEMO_ONLY === "1" || !budgetOk;
  return { ok: problems.length === 0, checks, paused, problems };
}
