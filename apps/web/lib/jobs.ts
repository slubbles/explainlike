import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validInput } from "./validate";
import { budget, recordSpend, spent, type Budget } from "./guard";
export { validInput };

export type JobState = "queued" | "running" | "done" | "error";
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
  /** what the viewer asked for (from voice mode), and how the job was started */
  ask?: Ask; via?: "voice";
  /** the CLI arguments, kept so a job cut off by a server restart can pick up where it stopped */
  args?: string[]; resumed?: number;
  /** queued jobs: how many renders have to finish first */
  ahead?: number;
}
export type Ask = { goal?: string; audience?: string; depth?: "overview" | "working" | "deep"; also?: string };

const ROOT = process.env.EXPLAINLIKE_ROOT ?? path.resolve(process.cwd(), "../..");
export const JOBS_DIR = process.env.EXPLAINLIKE_JOBS_DIR ?? path.join(ROOT, "explainlike-out", "web");
const ID = /^[a-f0-9]{12}$/;
const INTERRUPTED = "Interrupted by a server restart. Start it again.";

// Jobs live on disk (one job.json per folder) so they survive a server restart.
const g = globalThis as unknown as { __explainlikeJobs?: Map<string, Job>; __explainlikeLine?: string[]; __explainlikeResumed?: boolean };
const jobs: Map<string, Job> = (g.__explainlikeJobs ??= loadJobs());
// first load after a restart: carry on with a job the restart cut off (EXPLAINLIKE_RESUME=0 turns this off)
if (!g.__explainlikeResumed && process.env.EXPLAINLIKE_RESUME !== "0") { g.__explainlikeResumed = true; setTimeout(() => resumeInterrupted(), 0); }

function loadJobs(): Map<string, Job> {
  const m = new Map<string, Job>();
  // turbopackIgnore: the jobs folder only exists at run time; tracing it would copy the whole repo into the server build
  if (!fs.existsSync(/*turbopackIgnore: true*/ JOBS_DIR)) return m;
  for (const id of fs.readdirSync(/*turbopackIgnore: true*/ JOBS_DIR)) {
    const f = path.join(JOBS_DIR, id, "job.json");
    if (!ID.test(id) || !fs.existsSync(f)) continue;
    try {
      const j: Job = { kind: "video", ...JSON.parse(fs.readFileSync(f, "utf8")) };
      // the child process died with the old server: say so instead of spinning forever (resumeInterrupted may restart it)
      if (j.state === "running") Object.assign(j, { state: "error", error: INTERRUPTED, finished: Date.now() });
      if (j.state === "queued") Object.assign(j, { state: "error", error: "The queue was lost in a server restart. Start it again.", finished: Date.now() });
      m.set(id, j);
      save(j);
    } catch { /* skip a broken job file */ }
  }
  return m;
}

/**
 * Restart the newest job a server restart cut off, once. The CLI keeps every paid step (brief, architecture,
 * plan, voice) in the job folder, so the rerun only pays for what had not finished. Returns the job, if any.
 */
export function resumeInterrupted(): Job | undefined {
  if ([...jobs.values()].some((j) => j.state === "running")) return undefined;
  const j = [...jobs.values()].filter((x) => x.error === INTERRUPTED && x.args && (x.resumed ?? 0) < 1 && Date.now() - x.started < 6 * 3600_000).sort((a, b) => b.started - a.started)[0];
  if (!j) return undefined;
  Object.assign(j, { state: "running", error: undefined, finished: undefined, resumed: (j.resumed ?? 0) + 1, message: "picking up where it stopped" });
  save(j);
  run(j, j.args!);
  return j;
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
  const waiting = [...jobs.values()].filter((j) => j.state === "queued").length;
  const room = Number(process.env.EXPLAINLIKE_QUEUE_MAX ?? 6);
  if (waiting >= room) return `The line is full: ${waiting} videos are already waiting. Try again in a few minutes.`;
  const b = budgetNow();
  if (!b.ok) return b.error;
  const cap = Number(process.env.EXPLAINLIKE_JOBS_PER_HOUR ?? 20);
  const now = Date.now(), hits = (recent.get(client) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= cap) return "Hourly limit reached for this client.";
  recent.set(client, [...hits, now]);
  return undefined;
}

/** Room left under the Meta and Deepgram caps, counting every job's meter and the side-call ledger. */
export const budgetNow = (): Budget => budget(spent(JOBS_DIR, [...jobs.values()]));
/** Note a paid call made outside a job (voice-mode chat), so the spend guard sees it. */
export const noteSpend = (s: { meta?: number; voice?: number }, what: string) => recordSpend(JOBS_DIR, s, what);

const CLI = () => process.env.EXPLAINLIKE_CLI ?? path.join(ROOT, "packages/cli/bin/explainlike.mjs");
// the CLI reads private-network links by default (its user chose them); links typed into the web app never may
const CLI_ENV = { ...process.env, EXPLAINLIKE_ALLOW_PRIVATE_URLS: process.env.EXPLAINLIKE_ALLOW_PRIVATE_URLS ?? "0" };

const line = (): string[] => (g.__explainlikeLine ??= []);
const busy = (except?: string): Job | undefined => [...jobs.values()].find((j) => j.state === "running" && j.id !== except);
const aheadOf = (id: string): number => line().indexOf(id) + 1;

/** Start the next video in line, if the render slot is free. */
function pump() {
  if (busy()) return;
  const id = line().shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job || job.state !== "queued") return pump();
  run(job, job.args ?? []);
  line().forEach((other) => {
    const j = jobs.get(other);
    if (!j) return;
    const n = aheadOf(other);
    Object.assign(j, { ahead: n, message: n === 1 ? "one video ahead" : `${n} videos ahead` });
    save(j, true);
  });
}

function run(job: Job, args: string[]) {
  if (!job.args) { job.args = args; save(job); }
  // one render at a time: a second request waits its turn instead of being told no
  if (busy(job.id) || line().length) {
    const n = line().length + (busy(job.id) ? 1 : 0) || 1;
    Object.assign(job, { state: "queued", stage: "queued", ahead: n, message: n === 1 ? "one video ahead" : `${n} videos ahead` });
    line().push(job.id);
    save(job);
    return;
  }
  const child = spawn(process.execPath, [CLI(), ...args, "--json"], { cwd: ROOT, env: CLI_ENV, stdio: ["ignore", "pipe", "pipe"] });
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
            usd: { meta: m.cost?.metaUsd ?? 0, voice: m.cost?.voiceUsd ?? 0, total: (m.cost?.metaUsd ?? 0) + (m.cost?.voiceUsd ?? 0) },
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
    pump();
  });
}

function newJob(p: Omit<Job, "id" | "state" | "stage" | "message" | "pct" | "started">): Job {
  const id = crypto.randomBytes(6).toString("hex");
  const job: Job = { ...p, id, state: "running", stage: "start", message: "starting", pct: 0, started: Date.now() };
  jobs.set(id, job);
  save(job);
  return job;
}

export function startJob(input: string, voice: string, ask?: Ask, via?: "voice"): Job {
  const job = newJob({ kind: "video", input, voice, ask, via });
  const args = [input, "--out", path.join(JOBS_DIR, job.id)];
  if (voice === "silent") args.push("--voice", "silent");
  for (const k of ["goal", "audience", "depth", "also"] as const) if (ask?.[k]) args.push(`--${k}`, ask[k]!);
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
    const child = spawn(process.execPath, [CLI(), "explain", "--from", dir, "--component", component, "--json"], { cwd: ROOT, env: CLI_ENV, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.on("close", () => {
      try {
        const r = JSON.parse(out.trim().split("\n").pop() ?? "{}");
        if (r.type === "explain") { fs.writeFileSync(cache, JSON.stringify(r)); noteSpend({ meta: Number(r.usd) || 0 }, `explain ${j.id} ${component}`); }
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
