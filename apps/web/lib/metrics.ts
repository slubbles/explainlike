/**
 * Job timing metrics for the admin portal and the logs. Every number comes from the job
 * records themselves (started, began, finished, cost); nothing is estimated.
 * - wait: from the request until an API slot picked the job up (began - started)
 * - render wait: inside the run, waiting for a render slot (reported by the renderer)
 * - render: from the slot pickup until the job ended (finished - began)
 * - total: from the request until the job ended (finished - started)
 */
import os from "node:os";

export interface TimedJob {
  id: string;
  kind?: string;
  state: string;
  started: number;
  began?: number;
  finished?: number;
  accepted?: number;
  renderWaitMs?: number;
  stages?: Record<string, { start: number; end?: number }>;
  durationSec?: number;
  costUsd?: number;
  usd?: { total?: number };
  error?: string;
  cancelled?: boolean;
}

export interface JobTiming {
  id: string;
  kind: string;
  state: string;
  started: number;
  accepted: number;
  waitMs: number | null;
  renderWaitMs: number | null;
  stages?: Record<string, { start: number; end?: number }>;
  renderMs: number | null;
  totalMs: number | null;
  videoSec: number | null;
  cost: number;
  error: string;
}

const span = (from: number | undefined, to: number | undefined): number | null =>
  typeof from === "number" && typeof to === "number" && to >= from ? to - from : null;

/** One job's timings. A job still waiting or rendering has no render or total time yet. */
export function jobTiming(j: TimedJob): JobTiming {
  return {
    id: j.id,
    kind: j.kind ?? "video",
    state: j.state,
    started: j.started,
    accepted: j.accepted ?? j.started,
    renderWaitMs: typeof j.renderWaitMs === "number" && Number.isFinite(j.renderWaitMs) && j.renderWaitMs >= 0 ? j.renderWaitMs : null,
    stages: j.stages,
    waitMs: span(j.started, j.began),
    renderMs: span(j.began, j.finished),
    totalMs: span(j.started, j.finished),
    videoSec: typeof j.durationSec === "number" && Number.isFinite(j.durationSec) ? j.durationSec : null,
    cost: j.costUsd ?? j.usd?.total ?? 0,
    error: (j.error ?? "").slice(0, 200),
  };
}

/** The value at a fraction of a sorted list (nearest rank), or null for an empty list. */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return sorted[rank - 1];
}

export interface JobMetrics {
  /** jobs counted: started inside the window */
  total: number;
  queued: number;
  running: number;
  done: number;
  /** ended in an error the owner did not ask for */
  failed: number;
  /** stopped by their owner: neither a success nor a failure */
  cancelled: number;
  /** done / (done + failed), or null before any job has ended */
  successRate: number | null;
  medianRenderMs: number | null;
  p90RenderMs: number | null;
  medianWaitMs: number | null;
  medianTotalMs: number | null;
  /** average spend per finished video, or null before one has finished */
  avgCostDone: number | null;
}

/** Counts and timing percentiles over the jobs started at or after sinceMs (all jobs by default). */
export function jobMetrics(jobs: TimedJob[], sinceMs = 0): JobMetrics {
  const inWindow = jobs.filter((j) => j.started >= sinceMs);
  const timings = inWindow.map(jobTiming);
  const count = (s: string) => inWindow.filter((j) => j.state === s).length;
  const done = timings.filter((t) => t.state === "done");
  const cancelled = inWindow.filter((j) => j.state === "error" && j.cancelled).length;
  const failed = count("error") - cancelled;
  const sorted = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  const render = sorted(done.map((t) => t.renderMs));
  const wait = sorted(timings.map((t) => t.waitMs));
  const totals = sorted(done.map((t) => t.totalMs));
  const ended = done.length + failed;
  return {
    total: inWindow.length,
    queued: count("queued"),
    running: count("running"),
    done: done.length,
    failed,
    cancelled,
    successRate: ended ? done.length / ended : null,
    medianRenderMs: percentile(render, 0.5),
    p90RenderMs: percentile(render, 0.9),
    medianWaitMs: percentile(wait, 0.5),
    medianTotalMs: percentile(totals, 0.5),
    avgCostDone: done.length ? done.reduce((s, t) => s + t.cost, 0) / done.length : null,
  };
}

export interface SystemMetrics {
  now: number;
  /** 1, 5 and 15 minute load averages */
  loadavg: [number, number, number];
  cpus: number;
  freemem: number;
  totalmem: number;
  process: { rss: number; heapUsed: number; heapTotal: number; external: number };
  uptime: number;
}

/** Server CPU and memory for the admin metrics endpoint and the load test sampler. */
export function systemMetrics(): SystemMetrics {
  const m = process.memoryUsage();
  const [a, b, c] = os.loadavg();
  return {
    now: Date.now(),
    loadavg: [a, b, c],
    cpus: os.cpus().length,
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    process: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external },
    uptime: process.uptime(),
  };
}

/** 83500 -> "1m 24s"; 4200 -> "4.2s"; null -> "—". */
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
