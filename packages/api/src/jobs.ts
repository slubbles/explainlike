import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { looksLikeTopic, privateHostname, allowPrivateUrls, withLegacyDir } from "@explanimate/core";

/** What to explain and how. Only `input` is required: the engine picks the approach, depth, pace and look itself. */
export interface JobRequest {
  /** a GitHub repo URL, an x.com post URL, an article URL, a local repo folder, or a topic in words ("how DNS works") */
  input: string;
  /** output folder; default: <outRoot>/<name from the input> */
  out?: string;
  /** display name, e.g. owner/repo for a local folder */
  name?: string;
  /** "deepgram" (default when DEEPGRAM_API_KEY is set) or "silent" (captions only, no voice cost) */
  voice?: "deepgram" | "silent";
  /** ignore the brief, diagram and plan cached in the output folder */
  fresh?: boolean;
  /** false: no music bed under the voice */
  music?: boolean;
  /** false: skip the Muse Transcribe check of the voiceover */
  qa?: boolean;
  /** follow-up clips: an earlier repo run's output folder, plus one of focus or whatIf */
  from?: string;
  /** a component id from the earlier run's architecture.json, for a short deep dive on that box */
  focus?: string;
  whatIf?: "10x" | "100x";
  /** what the viewer wants to understand, in their words, e.g. "how a message reaches the bot's tools" */
  goal?: string;
  /** who the video is for, e.g. "a new contributor" */
  audience?: string;
  /** how deep to go; default: the engine decides */
  depth?: "overview" | "working" | "deep";
  /** anything else to cover */
  also?: string;
}

export type JobState = "running" | "done" | "error" | "cancelled";

export interface JobOutputs {
  mp4?: string;
  tldr?: string;
  excalidraw?: string;
  contactSheet?: string;
  manifest?: string;
}

export interface Job {
  id: string;
  input: string;
  out: string;
  state: JobState;
  stage: string;
  message: string;
  pct: number;
  started: number;
  finished?: number;
  /** running spend while it works, final spend when done (USD) */
  usd?: { meta: number; voice: number; total: number };
  outputs?: JobOutputs;
  title?: string;
  durationSec?: number;
  /** how the engine chose to explain it, e.g. "analogy" or "story" */
  approach?: string;
  /** the engine's one-line reason for that approach and depth */
  why?: string;
  error?: string;
}

export interface RunnerOptions {
  /** where outputs go when a request names no folder; default $EXPLANIMATE_OUT_DIR or ~/explanimate-videos */
  outRoot?: string;
  /** the explanimate CLI entry; default the one in this monorepo (tests point it at a stand-in) */
  cliPath?: string;
  /** renders allowed at the same time; each one drives a headless Chrome, so the default is 1 */
  maxRunning?: number;
  /** extra environment for the render; keys are read from process.env and never logged */
  env?: NodeJS.ProcessEnv;
}

export class JobError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const DEFAULT_CLI = fileURLToPath(new URL("../../cli/bin/explanimate.mjs", import.meta.url));
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** A folder name a person recognises: owner-repo for GitHub, host-path for anything else. */
export function nameFor(input: string): string {
  if (looksLikeTopic(input)) return slug(input).slice(0, 60) || "explanimate";
  if (!/^https?:\/\//i.test(input)) return slug(path.basename(path.resolve(input))) || "explanimate";
  const u = new URL(input);
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (/^github\.com$/i.test(host))
    return (
      slug(
        parts
          .slice(0, 2)
          .join("-")
          .replace(/\.git$/, ""),
      ) || "explanimate"
    );
  if (/^(x|twitter)\.com$/i.test(host)) return slug(`x-${parts[0] ?? ""}-${parts.at(-1) ?? ""}`);
  return slug(`${host}-${parts.join("-")}`) || "explanimate";
}

/** Links, local repo folders and plain topics ("how DNS works", read from reputable sources) are fine. Links to localhost or private networks are refused unless EXPLANIMATE_ALLOW_PRIVATE_URLS=1. */
export function checkInput(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const s = input.trim();
  if (/^https?:\/\/\S+$/i.test(s)) {
    let host: string;
    try {
      host = new URL(s).hostname;
    } catch {
      throw new JobError(`not a valid link: ${s}`);
    }
    // localhost and private-network links are refused, the way the web app refuses them (the fetch
    // checks every redirect hop again). EXPLANIMATE_ALLOW_PRIVATE_URLS=1 opts local use back out.
    if (!allowPrivateUrls(env) && privateHostname(host))
      throw new JobError(
        `that link points at a private network address (${host}), which this server does not read. Set EXPLANIMATE_ALLOW_PRIVATE_URLS=1 to allow it for local use.`,
      );
    return s;
  }
  const p = path.resolve(s.replace(/^~(?=\/|$)/, os.homedir()));
  if (/^[~./]/.test(s) || fs.existsSync(p)) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    throw new JobError(`no folder at ${s}; pass a link (a GitHub repo, an X post or an article), a local repo folder, or a topic in words`);
  }
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`;
  if (s.length > 300) throw new JobError("that topic is too long; ask in one sentence (under 300 characters)");
  if (looksLikeTopic(s)) return s.replace(/\s+/g, " ");
  throw new JobError("pass a link (a GitHub repo, an X post or an article), a local repo folder, or a topic in words");
}

/**
 * Runs Explanimate jobs as child processes of the CLI, so a crash or a stray print in a render never
 * reaches the caller (important for the MCP server, whose stdout is the protocol).
 */
export class JobRunner extends EventEmitter {
  readonly outRoot: string;
  private readonly cli: string;
  private readonly maxRunning: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly jobs = new Map<string, Job>();
  private readonly children = new Map<string, ChildProcess>();

  constructor(o: RunnerOptions = {}) {
    super();
    this.outRoot = path.resolve(
      o.outRoot ??
        process.env.EXPLANIMATE_OUT_DIR ??
        withLegacyDir(path.join(os.homedir(), "explanimate-videos"), path.join(os.homedir(), "explainlike-videos")),
    );
    this.cli = o.cliPath ?? DEFAULT_CLI;
    this.maxRunning = o.maxRunning ?? 1;
    // renders spawned here never read private-network links unless local use explicitly allows it
    // (an agent passing a localhost URL it was told about must not reach the server itself)
    this.env = { EXPLANIMATE_ALLOW_PRIVATE_URLS: "0", ...process.env, ...o.env };
  }

  get(id: string): Job | undefined {
    const j = this.jobs.get(id);
    return j && { ...j };
  }
  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.started - a.started).map((j) => ({ ...j }));
  }

  start(req: JobRequest): Job {
    const input = checkInput(req.input, this.env);
    if ((req.focus || req.whatIf) && !req.from)
      throw new JobError("focus and whatIf need `from`: the output folder of an earlier repo run");
    if (req.focus && req.whatIf) throw new JobError("pick one of focus or whatIf");
    if (req.focus && !/^[a-z0-9-]{1,60}$/.test(req.focus))
      throw new JobError("focus is a component id from architecture.json, like `api` or `job-queue`");
    if (req.whatIf && req.whatIf !== "10x" && req.whatIf !== "100x") throw new JobError("whatIf takes 10x or 100x");
    if (req.voice && req.voice !== "deepgram" && req.voice !== "silent") throw new JobError("voice is deepgram or silent");
    if (req.depth && !["overview", "working", "deep"].includes(req.depth)) throw new JobError("depth is overview, working or deep");
    for (const k of ["goal", "audience", "also"] as const) {
      if (req[k] !== undefined && (typeof req[k] !== "string" || req[k]!.length > 500))
        throw new JobError(`${k} is text of at most 500 characters`);
    }
    const running = [...this.jobs.values()].filter((j) => j.state === "running");
    if (running.length >= this.maxRunning)
      throw new JobError(`another video is still rendering (job ${running[0].id}); wait for it or cancel it`, 409);
    // an ask changes the brief and the plan, so it gets its own folder instead of reusing a plain run's cache
    const ask = [req.goal, req.audience, req.depth, req.also].map((v) => v?.trim() ?? "");
    const askTag = ask.some(Boolean) ? "-ask-" + crypto.createHash("sha1").update(ask.join("\n")).digest("hex").slice(0, 8) : "";
    const suffix = (req.focus ? `-focus-${req.focus}` : req.whatIf ? `-what-if-${req.whatIf}` : "") + askTag;
    const out = path.resolve(req.out ?? path.join(this.outRoot, nameFor(input) + suffix));
    if (running.some((j) => j.out === out)) throw new JobError(`a job is already writing to ${out}`, 409);
    fs.mkdirSync(out, { recursive: true });

    const job: Job = {
      id: crypto.randomBytes(6).toString("hex"),
      input,
      out,
      state: "running",
      stage: "start",
      message: "starting",
      pct: 0,
      started: Date.now(),
    };
    this.jobs.set(job.id, job);
    const args = [this.cli, input, "--out", out, "--json"];
    if (req.name) args.push("--name", req.name);
    if (req.voice) args.push("--voice", req.voice);
    if (req.fresh) args.push("--fresh");
    if (req.music === false) args.push("--no-music");
    if (req.qa === false) args.push("--no-qa");
    if (req.from) args.push("--from", path.resolve(req.from));
    if (req.focus) args.push("--focus", req.focus);
    if (req.whatIf) args.push("--what-if", req.whatIf);
    if (ask[0]) args.push("--goal", ask[0]);
    if (ask[1]) args.push("--audience", ask[1]);
    if (ask[2]) args.push("--depth", ask[2]);
    if (ask[3]) args.push("--also", ask[3]);
    // the render runs inside its output folder, so the keys come from this process's environment only
    const child = spawn(process.execPath, args, { cwd: out, env: this.env, stdio: ["ignore", "pipe", "pipe"] });
    this.children.set(job.id, child);
    this.follow(job, child);
    this.emit("update", { ...job });
    return { ...job };
  }

  cancel(id: string): Job | undefined {
    const j = this.jobs.get(id);
    if (!j) return undefined;
    if (j.state === "running") {
      Object.assign(j, { state: "cancelled", message: "cancelled", finished: Date.now() });
      this.children.get(id)?.kill("SIGTERM");
      this.emit("update", { ...j });
    }
    return { ...j };
  }

  /** Resolves when the job ends, or after `ms` with the job as it stands. */
  wait(id: string, ms: number): Promise<Job | undefined> {
    const j = this.jobs.get(id);
    if (!j || j.state !== "running" || ms <= 0) return Promise.resolve(j && { ...j });
    return new Promise((resolve) => {
      const done = (u: Job) => {
        if (u.id === id && u.state !== "running") finish();
      };
      const finish = () => {
        clearTimeout(timer);
        this.off("update", done);
        resolve(this.get(id));
      };
      const timer = setTimeout(finish, ms);
      this.on("update", done);
    });
  }

  /** Stop every render, e.g. when the MCP client goes away. */
  close() {
    for (const id of this.children.keys()) this.cancel(id);
  }

  private follow(job: Job, child: ChildProcess) {
    let buf = "",
      errTail = "";
    child.stdout!.on("data", (d: Buffer) => {
      buf += d.toString();
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let e: any;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (job.state !== "running") continue;
        if (e.type === "progress") Object.assign(job, { stage: e.stage, message: e.message, pct: e.pct ?? job.pct, usd: e.usd ?? job.usd });
        else if (e.type === "done") this.finish(job, e.manifest);
        else if (e.type === "error") Object.assign(job, { state: "error", error: String(e.message), finished: Date.now() });
        this.emit("update", { ...job });
      }
    });
    child.stderr!.on("data", (d: Buffer) => {
      errTail = (errTail + d.toString()).slice(-2000);
    });
    const end = (code: number | null, err?: Error) => {
      this.children.delete(job.id);
      if (job.state !== "running") return;
      const why = err?.message ?? errTail.split("\n").filter(Boolean).pop() ?? `the render stopped (exit ${code})`;
      Object.assign(job, { state: "error", error: why, finished: Date.now() });
      this.emit("update", { ...job });
    };
    child.on("error", (err) => end(null, err));
    child.on("close", (code) => end(code));
  }

  private finish(job: Job, m: any) {
    const o = m?.outputs ?? {};
    const meta = Number(m?.cost?.metaUsd ?? 0),
      voice = Number(m?.cost?.voiceUsd ?? 0);
    Object.assign(job, {
      state: "done",
      stage: "done",
      message: "done",
      pct: 100,
      finished: Date.now(),
      title: m?.title,
      durationSec: m?.durationSec,
      approach: m?.brief?.approach,
      why: m?.brief?.why,
      usd: { meta, voice, total: Number((meta + voice).toFixed(4)) },
      outputs: {
        mp4: o.mp4,
        tldr: o.tldr,
        excalidraw: o.excalidraw,
        contactSheet: o.contactSheet,
        manifest: path.join(job.out, "manifest.json"),
      },
    });
  }
}
