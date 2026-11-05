import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validInput } from "./validate";
import { withLegacyDir } from "@explanimate/core/env";
import { buildErrorRow, recordError } from "./errors";
import { log } from "./log";
import { fallbacksFromManifest, jobTiming } from "./metrics";
import { poolSize } from "./pool";
import { budget, caps, dailyBudget, dailyCap, dailyReserve, recordSpend, reserve, spent, spentToday, type Budget } from "./guard";
import type { D1Db } from "./db";
import { updateVideoResult } from "./videos";
export { validInput };

export type JobState = "queued" | "running" | "done" | "error";
export type JobKind = "video" | "focus" | "what-if";
export interface Job {
  id: string;
  kind: JobKind;
  input: string;
  /** subfolder inside the repo to explain (a .../tree/<branch>/<path> input scopes itself) */
  path?: string;
  voice: string;
  approach?: string;
  state: JobState;
  stage: string;
  message: string;
  pct: number;
  started: number;
  finished?: number;
  /** when the request was accepted (same as started for new jobs; old jobs fall back to started) */
  accepted?: number;
  /** per-stage first/last seen times from the renderer's progress, in ms since the epoch */
  stages?: Record<string, { start: number; end?: number }>;
  /** how long the run waited for a render slot inside the CPU-heavy stage, in ms */
  renderWaitMs?: number;
  /** follow-up clips point at the video they came from */
  parent?: string;
  focus?: string;
  whatIf?: string;
  outputs?: { mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string; poster?: string };
  /** live cost meter while running, final spend when done (Meta models + voice, USD) */
  usd?: { meta: number; voice: number; total: number };
  costUsd?: number;
  /** which backup providers answered during this run, from its done manifest (older jobs kept nothing) */
  fallbacks?: { llm: boolean; tts: boolean };
  error?: string;
  title?: string;
  durationSec?: number;
  interactive?: boolean;
  /** what the viewer asked for (from voice mode), and how the job was started */
  ask?: Ask;
  via?: "voice";
  /** the CLI arguments, kept so a job cut off by a server restart can pick up where it stopped */
  args?: string[];
  resumed?: number;
  /** when an API slot picked the job up (a job can wait for a slot after it is created) */
  began?: number;
  /** who started it (lib/owner.ts): scopes the jobs list and who may cancel; never sent to the browser */
  owner?: string;
  /** the owner stopped it (lib/owner.ts decides who may); it ends as an error that is not a failure */
  cancelled?: boolean;
  /** deleted through /api/me: dropped from memory and disk, never written back nor sent out */
  deleted?: boolean;
  /** the daily video slot was given back after a failure, so it is never given back twice */
  slotReleased?: boolean;
}
export type Ask = {
  goal?: string;
  audience?: string;
  depth?: "overview" | "working" | "deep";
  also?: string;
  format?: "short" | "deep" | "anatomy";
};

const ROOT = process.env.EXPLANIMATE_ROOT ?? path.resolve(process.cwd(), "../..");
export const JOBS_DIR =
  process.env.EXPLANIMATE_JOBS_DIR ?? withLegacyDir(path.join(ROOT, "explanimate-out", "web"), path.join(ROOT, "explainlike-out", "web"));
const ID = /^[a-f0-9]{12}$/;
const INTERRUPTED = "Interrupted by a server restart. Start it again.";

// Jobs live on disk (one job.json per folder) so they survive a server restart.
const g = globalThis as unknown as {
  __explanimateJobs?: Map<string, Job>;
  __explanimateLine?: string[];
  __explanimateSeen?: Map<string, number>;
  __explanimateResumed?: boolean;
  __explanimateKids?: Map<string, ReturnType<typeof spawnCli>>;
};
const jobs: Map<string, Job> = (g.__explanimateJobs ??= loadJobs());

function loadJobs(): Map<string, Job> {
  const m = new Map<string, Job>();
  // turbopackIgnore: the jobs folder only exists at run time; tracing it would copy the whole repo into the server build
  if (!fs.existsSync(/*turbopackIgnore: true*/ JOBS_DIR)) return m;
  for (const id of fs.readdirSync(/*turbopackIgnore: true*/ JOBS_DIR)) {
    const f = path.join(JOBS_DIR, id, "job.json");
    if (!ID.test(id) || !fs.existsSync(f)) continue;
    try {
      const j: Job = { kind: "video", ...JSON.parse(fs.readFileSync(f, "utf8")) };
      if (!Number.isFinite(j.started)) j.started = j.finished ?? Date.now();
      // the child process died with the old server: say so instead of spinning forever (resumeInterrupted may restart it)
      if (j.state === "running") Object.assign(j, { state: "error", error: INTERRUPTED, finished: Date.now() });
      // a job that was still waiting keeps its place: restoreQueue rebuilds the wait line below
      m.set(id, j);
      save(j);
    } catch {
      /* skip a broken job file */
    }
  }
  return m;
}

/**
 * Restart the newest job a server restart cut off, once. The CLI keeps every paid step (brief, architecture,
 * plan, voice) in the job folder, so the rerun only pays for what had not finished. Returns the job, if any.
 */
export function resumeInterrupted(): Job | undefined {
  if ([...jobs.values()].some((j) => j.state === "running")) return undefined;
  const j = [...jobs.values()]
    .filter((x) => x.error === INTERRUPTED && x.args && (x.resumed ?? 0) < 1 && Date.now() - x.started < 6 * 3600_000)
    .sort((a, b) => b.started - a.started)[0];
  if (!j) return undefined;
  Object.assign(j, { error: undefined, finished: undefined, resumed: (j.resumed ?? 0) + 1 });
  launch(j);
  if (j.state === "running") {
    j.message = "picking up where it stopped";
    save(j);
  }
  return j;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function save(job: Job, soon = false) {
  if (job.deleted) return;
  const write = () => {
    saveTimers.delete(job.id);
    if (job.deleted) return;
    fs.mkdirSync(path.join(JOBS_DIR, job.id), { recursive: true });
    fs.writeFileSync(path.join(JOBS_DIR, job.id, "job.json"), JSON.stringify(job, null, 1));
  };
  if (!soon) {
    clearTimeout(saveTimers.get(job.id));
    return write();
  }
  if (!saveTimers.has(job.id)) saveTimers.set(job.id, setTimeout(write, 1000));
}

/** The videos table when sign-in storage exists, else null (auth off, or D1 unreachable). Loaded late so renders never wait on it. */
async function videosDb(): Promise<D1Db | null> {
  try {
    const [{ getD1Db }, { ensureUsageTables }] = await Promise.all([import("./db"), import("./usage")]);
    const db = getD1Db();
    await ensureUsageTables(db);
    return db;
  } catch {
    return null;
  }
}

/**
 * One still frame from the finished mp4, saved as poster.jpg beside it for the dashboard
 * thumbnails. The frame sits just past the middle, where the board is fullest (the player
 * previews from the same spot). Nothing without an mp4 on disk; a missing or failing ffmpeg
 * only skips the still.
 */
function savePosterFrame(job: Job): Promise<string | undefined> {
  return new Promise((resolve) => {
    const mp4 = job.outputs?.mp4 ? path.join(JOBS_DIR, job.id, job.outputs.mp4) : undefined;
    if (!mp4 || job.deleted) return resolve(undefined);
    fs.stat(mp4, (err, st) => {
      if (err || !st.isFile()) return resolve(undefined);
      const dur = job.durationSec ?? 0;
      const at = dur > 2 ? (dur * 0.55).toFixed(1) : "1";
      const out = path.join(JOBS_DIR, job.id, "poster.jpg");
      const child = spawn("ffmpeg", ["-y", "-v", "error", "-ss", at, "-i", mp4, "-frames:v", "1", "-q:v", "4", out], {
        stdio: "ignore",
      });
      child.on("error", () => resolve(undefined));
      child.on("close", (code) => resolve(code === 0 && !job.deleted && fs.existsSync(out) ? "poster.jpg" : undefined));
    });
  });
}

/**
 * A finished render's result lands on its videos row (title, format, duration, file names,
 * status and cost), and a still frame is saved beside the mp4. Best effort throughout: noting
 * the result must never break a render that already succeeded.
 */
function finishVideoResult(job: Job): void {
  void (async () => {
    const db = await videosDb();
    if (db && !job.deleted) {
      const o = job.outputs ?? {};
      await updateVideoResult(
        job.id,
        {
          title: job.title ?? "",
          format: job.ask?.format ?? "",
          durationSec: job.durationSec ?? 0,
          files: {
            ...(o.mp4 ? { mp4: o.mp4 } : {}),
            ...(o.tldr ? { tldr: o.tldr } : {}),
            ...(o.excalidraw ? { excalidraw: o.excalidraw } : {}),
            ...(o.contactSheet ? { contactSheet: o.contactSheet } : {}),
          },
          status: "done",
          cost: job.costUsd ?? job.usd?.total ?? 0,
        },
        db,
      );
    }
    const poster = await savePosterFrame(job);
    if (poster && db && !job.deleted) {
      job.outputs = { ...job.outputs, poster };
      save(job);
      await updateVideoResult(job.id, { poster }, db);
    }
  })().catch(() => {});
}

/** A failed or cancelled render's final status lands on its videos row, best effort. Done renders are noted by finishVideoResult instead. */
function noteVideoStatus(job: Job): void {
  if (job.deleted || job.state === "done") return;
  void (async () => {
    const db = await videosDb();
    if (db && !job.deleted)
      await updateVideoResult(job.id, { status: job.cancelled ? "cancelled" : job.state, cost: job.costUsd ?? job.usd?.total ?? 0 }, db);
  })().catch(() => {});
}

// ---- guard rails for any shared deployment: a per-client hourly cap, a very high ceiling on waiting jobs, an optional demo-only switch
const recent = new Map<string, number[]>();
export function admit(client: string): string | undefined {
  if (process.env.EXPLANIMATE_DEMO_ONLY === "1")
    return "This demo only plays example videos. Run Explanimate locally with your own keys to make new ones.";
  // nobody is turned away for being busy: past the API slots a job waits its turn. This ceiling only stops a flood.
  sweep();
  if (line().length >= num("EXPLANIMATE_QUEUE_MAX", 200)) return "Explanimate is very busy right now. Try again in a few minutes.";
  const b = budgetNow();
  if (!b.ok) return b.error;
  const cap = num("EXPLANIMATE_JOBS_PER_HOUR", 20);
  const now = Date.now(),
    hits = (recent.get(client) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= cap) return "Hourly limit reached for this client.";
  recent.set(client, [...hits, now]);
  return undefined;
}

/** Room left under the Meta, Deepgram and daily caps, counting every job's meter and the side-call ledger. */
export const budgetNow = (): Budget => {
  const all = [...jobs.values()];
  const b = budget(spent(JOBS_DIR, all));
  if (!b.ok) return b;
  const d = dailyBudget(spentToday(JOBS_DIR, all));
  return d.ok ? b : { ...b, ok: false, error: d.error };
};
/** Note a paid call made outside a job (voice-mode chat), so the spend guard sees it. */
export const noteSpend = (s: { meta?: number; voice?: number }, what: string) => recordSpend(JOBS_DIR, s, what);

const CLI = () => process.env.EXPLANIMATE_CLI ?? path.join(ROOT, "packages/cli/bin/explanimate.mjs");
// renders spawned here never read private-network links unless the server explicitly allows them for local use
const CLI_ENV = { ...process.env, EXPLANIMATE_ALLOW_PRIVATE_URLS: process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS ?? "0" };

// ---- the wait line: up to API_CONCURRENCY jobs (default 10) run their API-bound stages at once;
// past that, jobs wait first in, first out. The CPU-heavy render/encode stage holds a separate,
// smaller render slot inside the run (RENDER_CONCURRENCY, default max(1, cpus-2)).
// A waiting job looks like any job at its first step (the page never says "queued"); it is honest because nothing has run yet.
const num = (name: string, dflt: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};
// API slots come from lib/pool.ts: an explicit setting when set, else 10
const slots = () => poolSize();
const line = (): string[] => (g.__explanimateLine ??= []);
const seen = (): Map<string, number> => (g.__explanimateSeen ??= new Map());
const kids = (): Map<string, ReturnType<typeof spawnCli>> => (g.__explanimateKids ??= new Map());
const running = () => [...jobs.values()].filter((j) => j.state === "running").length;
const GONE = "Not started: the page was closed while it waited. Start it again.";

/** The wait line on disk, so a restart picks up the same order. A line that cannot be written still runs in memory. */
function persistLine() {
  try {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    fs.writeFileSync(path.join(JOBS_DIR, "queue.json"), JSON.stringify(line()));
  } catch {
    /* ignore */
  }
}

/**
 * Rebuild the wait line after a restart: the stored order first, then any other queued job,
 * oldest first. Each waiting job keeps its place for a fresh idle window, since its page is
 * about to poll again after the downtime. Returns the restored line.
 */
export function restoreQueue(): string[] {
  const queued = [...jobs.values()].filter((j) => j.state === "queued").sort((a, b) => a.started - b.started);
  let stored: unknown = [];
  try {
    stored = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, "queue.json"), "utf8"));
  } catch {
    /* no stored line: order by arrival */
  }
  const waiting = new Set(queued.map((j) => j.id));
  const ordered = (Array.isArray(stored) ? stored : []).filter((id): id is string => typeof id === "string" && waiting.has(id));
  for (const j of queued) if (!ordered.includes(j.id)) ordered.push(j.id);
  const l = line();
  l.length = 0;
  l.push(...ordered);
  for (const id of ordered) seen().set(id, Date.now());
  persistLine();
  return ordered;
}

/** The page polls its job every second; this is how the server knows someone is still watching a waiting job. */
export function touch(id: string) {
  if (jobs.has(id)) seen().set(id, Date.now());
}

/** The wait line, oldest first, as the admin dashboard shows it. A copy: only pump() moves jobs. */
export const queueOrder = (): string[] => [...line()];

/** Drop waiting jobs whose page went away (no poll for EXPLANIMATE_WAIT_IDLE_S, default 120), so they never take a slot. */
function sweep(now = Date.now()) {
  const idle = num("EXPLANIMATE_WAIT_IDLE_S", 120) * 1000;
  let dropped = false;
  for (const id of [...line()]) {
    const j = jobs.get(id);
    if (j && j.state === "queued" && now - (seen().get(id) ?? j.started) <= idle) continue;
    line().splice(line().indexOf(id), 1);
    dropped = true;
    if (j?.state === "queued") {
      Object.assign(j, { state: "error", error: GONE, finished: now });
      save(j);
    }
  }
  if (dropped) persistLine();
}

/** Room under the spend caps for this many renders at once, each holding back one job's reserve. */
const roomFor = (n: number) => {
  const r = reserve();
  const all = [...jobs.values()];
  const b = budget(spent(JOBS_DIR, all), caps(), { meta: r.meta * n, voice: r.voice * n });
  if (!b.ok) return b;
  // the lifetime caps hold a full reserve per concurrent render, so even a worst-case wave cannot cross
  // them; the daily cap throttles admission instead (one reserve, as in admit), so the default slots fit under it
  const d = dailyBudget(spentToday(JOBS_DIR, all), dailyCap(), dailyReserve());
  return d.ok ? b : { ...b, ok: false, error: d.error };
};

/** Start waiting jobs, oldest first, while an API slot is free. */
function pump() {
  sweep();
  let moved = false;
  while (line().length && running() < slots()) {
    const job = jobs.get(line()[0])!;
    // the spend guard holds back one reserve per running render: wait for one to finish before starting another
    const room = roomFor(running() + 1);
    if (!room.ok && running() > 0) break;
    line().shift();
    moved = true;
    if (!room.ok) {
      Object.assign(job, { state: "error", error: room.error, finished: Date.now() });
      save(job);
      continue;
    }
    launch(job);
  }
  if (moved) persistLine();
}

/** Take a new job: start it now if a slot is free and nobody is waiting, otherwise it waits its turn. */
function run(job: Job, args: string[]) {
  job.args = args;
  touch(job.id);
  line().push(job.id);
  save(job);
  pump();
  persistLine();
}

const spawnCli = (args: string[]) =>
  spawn(process.execPath, [CLI(), ...args, "--json"], { cwd: ROOT, env: CLI_ENV, stdio: ["ignore", "pipe", "pipe"] });

function launch(job: Job) {
  Object.assign(job, { state: "running", stage: "start", message: "starting", pct: 0, began: Date.now() });
  save(job);
  let child: ReturnType<typeof spawnCli>;
  try {
    child = spawnCli(job.args ?? []);
  } catch (e) {
    Object.assign(job, { state: "error", error: `Could not start the renderer: ${(e as Error).message}`, finished: Date.now() });
    save(job);
    return void setTimeout(pump, 0);
  }
  kids().set(job.id, child);
  // free the slot once, whether the process closed or never started
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    kids().delete(job.id);
    save(job);
    noteEnd(job);
    pump();
  };
  child.on("error", (e) => {
    if (job.state === "running") Object.assign(job, { state: "error", error: `The renderer stopped: ${e.message}`, finished: Date.now() });
    end();
  });
  let buf = "";
  let gotDone = false;
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const e = JSON.parse(line);
        // a cancelled run only keeps its cost meter current while it stops
        if (job.cancelled) {
          if (e.type === "progress" && e.usd) job.usd = e.usd;
          continue;
        }
        if (e.type === "progress") {
          Object.assign(job, { stage: e.stage, message: e.message, pct: e.pct ?? job.pct, usd: e.usd ?? job.usd });
          if (typeof e.stage === "string" && e.stage) recordStage(job, e.stage);
          if (typeof e.renderWaitMs === "number" && Number.isFinite(e.renderWaitMs)) job.renderWaitMs = e.renderWaitMs;
          save(job, true);
        } else if (e.type === "done") {
          gotDone = true;
          const m = e.manifest;
          mergeManifestStages(job, m);
          Object.assign(job, {
            state: "done",
            pct: 100,
            message: "done",
            title: m.title,
            approach: m.brief?.approach,
            durationSec: m.durationSec,
            finished: Date.now(),
            renderWaitMs: typeof m?.renderWaitMs === "number" ? m.renderWaitMs : job.renderWaitMs,
            costUsd: (m.cost?.metaUsd ?? 0) + (m.cost?.voiceUsd ?? 0),
            usd: { meta: m.cost?.metaUsd ?? 0, voice: m.cost?.voiceUsd ?? 0, total: (m.cost?.metaUsd ?? 0) + (m.cost?.voiceUsd ?? 0) },
            fallbacks: fallbacksFromManifest(m),
            interactive: fs.existsSync(path.join(JOBS_DIR, job.id, "interactive.json")),
            outputs: Object.fromEntries(
              Object.entries(m.outputs ?? {})
                .filter(([, v]) => v)
                .map(([k, v]) => [k, path.basename(String(v))]),
            ),
          });
          save(job);
          finishVideoResult(job);
        } else if (e.type === "error") {
          Object.assign(job, { state: "error", error: e.message, finished: Date.now() });
          save(job);
        }
      } catch {
        /* not a JSON line */
      }
    }
  });
  let errTail = "";
  child.stderr.on("data", (d: Buffer) => {
    errTail = (errTail + d.toString()).slice(-2000);
  });
  child.on("close", (code) => {
    if (job.state === "running") {
      // exit 0 without a done event is a quiet death, not a success; the first stderr line says what failed
      const ok = code === 0 && gotDone;
      const firstErr = errTail
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0];
      Object.assign(job, {
        state: ok ? "done" : "error",
        finished: Date.now(),
        error: ok
          ? undefined
          : (firstErr ?? (code === 0 ? "The renderer finished without a video. Try again." : `the renderer stopped (exit ${code})`)),
      });
    }
    end();
  });
}

let releaseSlot: (userId: string, day: number) => Promise<void> = async (userId, day) =>
  (await import("./usage")).releaseVideoSlot(userId, day);
/** Tests swap in a fake slot release. */
export function setSlotRelease(fn: typeof releaseSlot) {
  releaseSlot = fn;
}

/** A video that failed (not cancelled, not a restart resume) gives its daily slot back, once per job, on the day it was claimed. */
export function refundFailedSlot(job: Job): boolean {
  if (job.state !== "error" || job.cancelled || job.slotReleased || (job.resumed ?? 0) > 0) return false;
  if (!job.owner?.startsWith("u:")) return false;
  job.slotReleased = true;
  void releaseSlot(job.owner.slice(2), job.started).catch(() => {});
  return true;
}

/** One structured log line per finished job, with its timings; a failed render also lands in the error store. */
function noteEnd(job: Job) {
  noteVideoStatus(job);
  const t = jobTiming(job);
  const what = job.cancelled ? "cancelled" : job.state;
  log(job.state === "done" || job.cancelled ? "info" : "warn", "job", `job ${what}`, {
    jobId: job.id,
    kind: t.kind,
    state: what,
    waitMs: t.waitMs,
    renderWaitMs: t.renderWaitMs,
    renderMs: t.renderMs,
    totalMs: t.totalMs,
    videoSec: t.videoSec,
    costUsd: Number(t.cost.toFixed(4)),
  });
  if (job.state === "error" && !job.cancelled) refundFailedSlot(job);
  if (job.state === "error" && !job.cancelled) {
    const e = new Error(job.error || "render failed");
    e.name = "RenderError";
    void recordError(buildErrorRow(`job/${job.kind}`, "server", e, job.id)).catch(() => {});
  }
}

/** Note a pipeline stage sighting: first sighting starts it, every sighting ends it. */
export function recordStage(job: Job, stage: string, now = Date.now()) {
  job.stages ??= {};
  const s = (job.stages[stage] ??= { start: now });
  s.end = now;
}

/**
 * Fold the renderer's own stage clock (manifest.stages: seconds from its start) into the job's
 * stage map. The renderer's start is the slot pickup (began); a stage seen both ways keeps the
 * earliest start and the latest end.
 */
export function mergeManifestStages(job: Job, m: { stages?: { stage: string; at: number; seconds: number }[] }) {
  if (!Array.isArray(m?.stages) || typeof job.began !== "number") return;
  job.stages ??= {};
  for (const s of m.stages) {
    if (typeof s?.stage !== "string" || typeof s?.at !== "number" || typeof s?.seconds !== "number") continue;
    const start = job.began + s.at * 1000;
    const end = start + s.seconds * 1000;
    const cur = job.stages[s.stage];
    job.stages[s.stage] = cur ? { start: Math.min(cur.start, start), end: Math.max(cur.end ?? cur.start, end) } : { start, end };
  }
}

function newJob(p: Omit<Job, "id" | "state" | "stage" | "message" | "pct" | "started">): Job {
  const id = crypto.randomBytes(6).toString("hex");
  const now = Date.now();
  const job: Job = { ...p, id, state: "queued", stage: "start", message: "starting", pct: 0, started: now, accepted: now, stages: {} };
  jobs.set(id, job);
  save(job);
  return job;
}

export function startJob(input: string, voice: string, ask?: Ask, via?: "voice", owner?: string, repoPath?: string): Job {
  const job = newJob({ kind: "video", input, voice, ask, via, owner, path: repoPath });
  const args = [input, "--out", path.join(JOBS_DIR, job.id)];
  if (voice === "silent") args.push("--voice", "silent");
  if (repoPath) args.push("--path", repoPath);
  for (const k of ["goal", "audience", "depth", "also", "format"] as const) if (ask?.[k]) args.push(`--${k}`, ask[k]!);
  run(job, args);
  return job;
}

/** A follow-up clip on a finished repo video: deep dive on one box, or "what if 10x traffic?". */
export function startFollowUp(parentId: string, f: { focus?: string; whatIf?: string }, owner?: string): Job | string {
  const p = jobs.get(parentId);
  if (!p || p.state !== "done") return "the original video is not ready";
  if (!fs.existsSync(path.join(JOBS_DIR, p.id, "architecture.json"))) return "follow-ups work on repo videos";
  if (f.focus && !/^[a-z0-9-]{1,60}$/.test(f.focus)) return "bad component id";
  if (f.whatIf && f.whatIf !== "10x" && f.whatIf !== "100x") return "what-if takes 10x or 100x";
  const job = newJob({
    kind: f.focus ? "focus" : "what-if",
    input: p.input,
    voice: p.voice,
    parent: p.id,
    focus: f.focus,
    whatIf: f.whatIf,
    owner,
    path: p.path,
  });
  const args = [p.input, "--out", path.join(JOBS_DIR, job.id), "--from", path.join(JOBS_DIR, p.id), "--no-qa"];
  if (p.path) args.push("--path", p.path);
  if (f.focus) args.push("--focus", f.focus);
  else args.push("--what-if", f.whatIf!);
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
    const child = spawn(process.execPath, [CLI(), "explain", "--from", dir, "--component", component, "--json"], {
      cwd: ROOT,
      env: CLI_ENV,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    // a child that never starts answers with an error instead of crashing the server
    child.on("error", () => resolve({ type: "error", message: "Could not start the renderer." }));
    child.on("close", () => {
      try {
        const r = JSON.parse(out.trim().split("\n").pop() ?? "{}");
        if (r.type === "explain") {
          fs.writeFileSync(cache, JSON.stringify(r));
          noteSpend({ meta: Number(r.usd) || 0 }, `explain ${j.id} ${component}`);
        }
        resolve(r);
      } catch {
        resolve({ type: "error", message: "no answer" });
      }
    });
  });
}

export const CANCELLED = "Cancelled. Nothing more is spent on this video.";

/**
 * Stop a waiting or running job. A waiting one leaves the line before it costs anything; a running
 * one gets SIGTERM (the renderer stops its paid calls with it) and SIGKILL if it is still there after
 * 5 s. The cost meter keeps what was already spent, so the spend caps stay honest. Who may call
 * this is the route's job (the owner key from lib/owner.ts). Returns the job, or undefined when
 * there is nothing left to stop.
 */
export function cancelJob(id: string): Job | undefined {
  const job = jobs.get(id);
  if (!job || (job.state !== "queued" && job.state !== "running")) return undefined;
  const i = line().indexOf(id);
  if (i >= 0) line().splice(i, 1);
  Object.assign(job, { state: "error", cancelled: true, error: CANCELLED, message: "cancelled", finished: Date.now() });
  save(job);
  const child = kids().get(id);
  if (child) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 5000).unref();
  } else noteEnd(job);
  return job;
}

/**
 * Forget a job entirely: stop it when it is still waiting or drawing, drop it from memory,
 * and remove its folder. A killed render's close handler still runs, but save() skips a
 * deleted job, so nothing is written back. Returns whether a job or a folder was there.
 */
export function removeJob(id: string): boolean {
  if (!ID.test(id)) return false;
  const job = jobs.get(id);
  if (job) {
    job.deleted = true;
    cancelJob(id);
    jobs.delete(id);
    const t = saveTimers.get(id);
    if (t) {
      clearTimeout(t);
      saveTimers.delete(id);
    }
  }
  const i = line().indexOf(id);
  if (i >= 0) {
    line().splice(i, 1);
    persistLine();
  }
  const hadDir = fs.existsSync(path.join(JOBS_DIR, id));
  fs.rmSync(path.join(JOBS_DIR, id), { recursive: true, force: true });
  return !!job || hadDir;
}

export const getJob = (id: string) => jobs.get(id);
export const listJobs = () => [...jobs.values()].sort((a, b) => b.started - a.started);

export function jobFile(id: string, name: string): string | undefined {
  if (!ID.test(id) || !/^[\w.-]+$/.test(name) || name === "job.json" || name === "." || name === "..") return undefined;
  const f = path.join(JOBS_DIR, id, name);
  try {
    return fs.statSync(f).isFile() ? f : undefined;
  } catch {
    return undefined;
  }
}

// first load after a restart: pick the stored wait line back up, and carry on with a job the
// restart cut off (EXPLANIMATE_RESUME=0 turns the restarting off; the line is still rebuilt)
if (!g.__explanimateResumed) {
  g.__explanimateResumed = true;
  restoreQueue();
  if (process.env.EXPLANIMATE_RESUME !== "0")
    setTimeout(() => {
      resumeInterrupted();
      pump();
    }, 0);
}
