import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validInput } from "./validate";
export { validInput };

export type JobState = "running" | "done" | "error";
export type JobKind = "video" | "focus" | "what-if";
export interface Job {
  id: string; kind: JobKind; input: string; voice: string; approach?: string; state: JobState;
  stage: string; message: string; pct: number; started: number; finished?: number;
  /** follow-up clips point at the video they came from */
  parent?: string; focus?: string; whatIf?: string;
  outputs?: { mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string };
  /** live cost meter while running, final spend when done (Meta models + voice, USD) */
  usd?: { meta: number; voice: number; total: number };
  costUsd?: number; error?: string; title?: string; durationSec?: number; interactive?: boolean;
}

const ROOT = path.resolve(process.cwd(), "../..");
export const JOBS_DIR = process.env.EXPLAINLIKE_JOBS_DIR ?? path.join(ROOT, "explainlike-out", "web");
const ID = /^[a-f0-9]{12}$/;

// Jobs live on disk (one job.json per folder) so they survive a server restart.
const g = globalThis as unknown as { __explainlikeJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (g.__explainlikeJobs ??= loadJobs());

function loadJobs(): Map<string, Job> {
  const m = new Map<string, Job>();
  if (!fs.existsSync(JOBS_DIR)) return m;
  for (const id of fs.readdirSync(JOBS_DIR)) {
    const f = path.join(JOBS_DIR, id, "job.json");
    if (!ID.test(id) || !fs.existsSync(f)) continue;
    try {
      const j: Job = { kind: "video", ...JSON.parse(fs.readFileSync(f, "utf8")) };
      // the child process died with the old server: say so instead of spinning forever
      if (j.state === "running") Object.assign(j, { state: "error", error: "interrupted by a server restart; start it again", finished: Date.now() });
      m.set(id, j);
      save(j);
    } catch { /* skip a broken job file */ }
  }
  return m;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function save(job: Job, soon = false) {
  const write = () => { saveTimers.delete(job.id); fs.mkdirSync(path.join(JOBS_DIR, job.id), { recursive: true }); fs.writeFileSync(path.join(JOBS_DIR, job.id, "job.json"), JSON.stringify(job, null, 1)); };
  if (!soon) { clearTimeout(saveTimers.get(job.id)); return write(); }
  if (!saveTimers.has(job.id)) saveTimers.set(job.id, setTimeout(write, 1000));
}

// ---- guard rails for any shared deployment: one render at a time, a per-client hourly cap, an optional demo-only switch
const recent = new Map<string, number[]>();
export function admit(client: string): string | undefined {
  if (process.env.EXPLAINLIKE_DEMO_ONLY === "1") return "This demo only plays example videos. Run Explain Like locally with your own keys to make new ones.";
  if ([...jobs.values()].some((j) => j.state === "running")) return "Another video is drawing right now. Try again in a minute.";
  const cap = Number(process.env.EXPLAINLIKE_JOBS_PER_HOUR ?? 20);
  const now = Date.now(), hits = (recent.get(client) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= cap) return "Hourly limit reached for this client.";
  recent.set(client, [...hits, now]);
  return undefined;
}

const CLI = () => path.join(ROOT, "packages/cli/bin/explainlike.mjs");

function run(job: Job, args: string[]) {
  const child = spawn(process.execPath, [CLI(), ...args, "--json"], { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const e = JSON.parse(line);
        if (e.type === "progress") { Object.assign(job, { stage: e.stage, message: e.message, pct: e.pct ?? job.pct, usd: e.usd ?? job.usd }); save(job, true); }
        else if (e.type === "done") {
          const m = e.manifest;
          Object.assign(job, { state: "done", pct: 100, message: "done", title: m.title, approach: m.brief?.approach, durationSec: m.durationSec, finished: Date.now(),
            costUsd: (m.cost?.metaUsd ?? 0) + (m.cost?.voiceUsd ?? 0),
            interactive: fs.existsSync(path.join(JOBS_DIR, job.id, "interactive.json")),
            outputs: Object.fromEntries(Object.entries(m.outputs ?? {}).filter(([, v]) => v).map(([k, v]) => [k, path.basename(String(v))])) });
          save(job);
        } else if (e.type === "error") { Object.assign(job, { state: "error", error: e.message, finished: Date.now() }); save(job); }
      } catch { /* not a JSON line */ }
    }
  });
  let errTail = "";
  child.stderr.on("data", (d: Buffer) => { errTail = (errTail + d.toString()).slice(-2000); });
  child.on("close", (code) => {
    if (job.state === "running") Object.assign(job, { state: code === 0 ? "done" : "error", finished: Date.now(), error: code === 0 ? undefined : errTail.split("\n").filter(Boolean).pop() ?? `exit ${code}` });
    save(job);
  });
}

function newJob(p: Omit<Job, "id" | "state" | "stage" | "message" | "pct" | "started">): Job {
  const id = crypto.randomBytes(6).toString("hex");
  const job: Job = { ...p, id, state: "running", stage: "start", message: "starting", pct: 0, started: Date.now() };
  jobs.set(id, job);
  save(job);
  return job;
}

export function startJob(input: string, voice: string): Job {
  const job = newJob({ kind: "video", input, voice });
  const args = [input, "--out", path.join(JOBS_DIR, job.id)];
  if (voice === "silent") args.push("--voice", "silent");
  run(job, args);
  return job;
}

/** A follow-up clip on a finished repo video: deep dive on one box, or "what if 10x traffic?". */
export function startFollowUp(parentId: string, f: { focus?: string; whatIf?: string }): Job | string {
  const p = jobs.get(parentId);
  if (!p || p.state !== "done") return "the original video is not ready";
  if (!fs.existsSync(path.join(JOBS_DIR, p.id, "architecture.json"))) return "follow-ups work on repo videos";
  if (f.focus && !/^[a-z0-9-]{1,60}$/.test(f.focus)) return "bad component id";
  if (f.whatIf && f.whatIf !== "10x" && f.whatIf !== "100x") return "what-if takes 10x or 100x";
  const job = newJob({ kind: f.focus ? "focus" : "what-if", input: p.input, voice: p.voice, parent: p.id, focus: f.focus, whatIf: f.whatIf });
  const args = [p.input, "--out", path.join(JOBS_DIR, job.id), "--from", path.join(JOBS_DIR, p.id), "--no-qa"];
  if (f.focus) args.push("--focus", f.focus); else args.push("--what-if", f.whatIf!);
  if (p.voice === "silent") args.push("--voice", "silent");
  run(job, args);
  return job;
}

/** Muse Spark explanation of one box, grounded in its evidence files. Cached per job and component. */
export function explain(jobId: string, component: string): Promise<unknown> {
  const j = jobs.get(jobId);
  if (!j || j.state !== "done" || !/^[a-z0-9-]{1,60}$/.test(component)) return Promise.resolve({ type: "error", message: "not found" });
  const dir = path.join(JOBS_DIR, j.id);
  const cache = path.join(dir, `explain-${component}.json`);
  if (fs.existsSync(cache)) return Promise.resolve(JSON.parse(fs.readFileSync(cache, "utf8")));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI(), "explain", "--from", dir, "--component", component, "--json"], { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.on("close", () => {
      try {
        const r = JSON.parse(out.trim().split("\n").pop() ?? "{}");
        if (r.type === "explain") fs.writeFileSync(cache, JSON.stringify(r));
        resolve(r);
      } catch { resolve({ type: "error", message: "no answer" }); }
    });
  });
}

export const getJob = (id: string) => jobs.get(id);
export const listJobs = () => [...jobs.values()].sort((a, b) => b.started - a.started);

export function jobFile(id: string, name: string): string | undefined {
  if (!ID.test(id) || !/^[\w.-]+$/.test(name) || name === "job.json") return undefined;
  const f = path.join(JOBS_DIR, id, name);
  return fs.existsSync(f) ? f : undefined;
}
