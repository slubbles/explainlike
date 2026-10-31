import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type JobState = "running" | "done" | "error";
export interface Job {
  id: string; input: string; level: string; voice: string; state: JobState;
  stage: string; message: string; pct: number; started: number;
  outputs?: { mp4?: string; excalidraw?: string; contactSheet?: string };
  costUsd?: number; error?: string; title?: string; durationSec?: number;
}

const ROOT = path.resolve(process.cwd(), "../..");
export const JOBS_DIR = process.env.METUAL_JOBS_DIR ?? path.join(ROOT, "metual-out", "web");
const g = globalThis as unknown as { __metualJobs?: Map<string, Job> };
const jobs = (g.__metualJobs ??= new Map());

const LEVELS = new Set(["five", "new", "interviewing", "senior"]);

export function validInput(s: string): boolean {
  if (/^https?:\/\/(www\.)?(github\.com|x\.com|twitter\.com)\//i.test(s)) return true;
  if (/^https?:\/\/[^\s]+$/i.test(s)) {
    // never let the server fetch its own network
    const h = new URL(s).hostname;
    return !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i.test(h);
  }
  // local paths only when explicitly allowed (self-hosted use)
  return process.env.METUAL_ALLOW_LOCAL === "1" && path.isAbsolute(s) && fs.existsSync(s);
}

export function startJob(input: string, level: string, voice: string): Job {
  if (!LEVELS.has(level)) level = "new";
  const id = crypto.randomBytes(6).toString("hex");
  const out = path.join(JOBS_DIR, id);
  fs.mkdirSync(out, { recursive: true });
  const job: Job = { id, input, level, voice, state: "running", stage: "start", message: "starting", pct: 0, started: Date.now() };
  jobs.set(id, job);
  const args = [path.join(ROOT, "packages/cli/bin/metual.mjs"), input, "--level", level, "--out", out, "--json"];
  if (voice === "silent") args.push("--voice", "silent");
  const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const e = JSON.parse(line);
        if (e.type === "progress") Object.assign(job, { stage: e.stage, message: e.message, pct: e.pct ?? job.pct });
        else if (e.type === "done") {
          const m = e.manifest;
          Object.assign(job, { state: "done", pct: 100, message: "done", title: m.title, durationSec: m.durationSec,
            costUsd: (m.cost?.metaUsd ?? 0) + (m.cost?.voiceUsd ?? 0),
            outputs: Object.fromEntries(Object.entries(m.outputs ?? {}).map(([k, v]) => [k, path.basename(String(v))])) });
        } else if (e.type === "error") Object.assign(job, { state: "error", error: e.message });
      } catch { /* not a JSON line */ }
    }
  });
  let errTail = "";
  child.stderr.on("data", (d: Buffer) => { errTail = (errTail + d.toString()).slice(-2000); });
  child.on("close", (code) => { if (job.state === "running") Object.assign(job, { state: code === 0 ? "done" : "error", error: code === 0 ? undefined : errTail.split("\n").filter(Boolean).pop() ?? `exit ${code}` }); });
  return job;
}

export const getJob = (id: string) => jobs.get(id);

export function jobFile(id: string, name: string): string | undefined {
  if (!/^[a-f0-9]{12}$/.test(id) || !/^[\w.-]+$/.test(name)) return undefined;
  const f = path.join(JOBS_DIR, id, name);
  return fs.existsSync(f) ? f : undefined;
}
