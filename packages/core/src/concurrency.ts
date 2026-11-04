import os from "node:os";

/**
 * How many jobs run their API-bound stages at once (LLM planning and scripting, TTS, fetches).
 * Those stages wait on the network, so ten at once is fine on a small server.
 */
export const DEFAULT_API_CONCURRENCY = 10;

/** API slots from the environment. The newest name wins; the old job-slot names still work. */
const API_CANDIDATES = [
  "EXPLANIMATE_API_CONCURRENCY",
  "API_CONCURRENCY",
  "EXPLANIMATE_MAX_CONCURRENT",
  "JOB_CONCURRENCY",
  "EXPLANIMATE_CONCURRENCY",
] as const;

function pick(env: Record<string, string | undefined>, names: readonly string[]): number | undefined {
  for (const name of names) {
    const raw = env[name];
    if (raw === undefined || raw === "") continue;
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/**
 * Jobs running at once. EXPLANIMATE_API_CONCURRENCY wins when set, then API_CONCURRENCY,
 * then the pre-split names (EXPLANIMATE_MAX_CONCURRENT, JOB_CONCURRENCY, EXPLANIMATE_CONCURRENCY);
 * a missing or garbage value falls through to the next, and with none set it is 10.
 */
export function apiConcurrency(env: Record<string, string | undefined> = process.env): number {
  return pick(env, API_CANDIDATES) ?? DEFAULT_API_CONCURRENCY;
}

/**
 * How many jobs render or encode at once. Rendering drives a headless browser and ffmpeg,
 * so the default keeps two cores free for the server itself: max(1, cpus - 2).
 */
export function defaultRenderConcurrency(sys: { cpus?: number } = {}): number {
  const cpus = sys.cpus ?? os.cpus().length;
  return Math.max(1, cpus - 2);
}

/** Render slots from the environment, else the default that fits the machine (see above). */
export function renderConcurrency(env: Record<string, string | undefined> = process.env, sys: { cpus?: number } = {}): number {
  return pick(env, ["EXPLANIMATE_RENDER_CONCURRENCY", "RENDER_CONCURRENCY"]) ?? defaultRenderConcurrency(sys);
}

/**
 * ffmpeg threads for one render: the cores divided by the render slots, at least one.
 * Two renders on four cores get two threads each, so the encoders share the machine
 * instead of each grabbing every core. EXPLANIMATE_FFMPEG_THREADS (or FFMPEG_THREADS) pins it.
 */
export function ffmpegThreads(env: Record<string, string | undefined> = process.env, sys: { cpus?: number } = {}): number {
  const pinned = pick(env, ["EXPLANIMATE_FFMPEG_THREADS", "FFMPEG_THREADS"]);
  if (pinned !== undefined) return pinned;
  const cpus = sys.cpus ?? os.cpus().length;
  return Math.max(1, Math.floor(cpus / renderConcurrency(env, sys)));
}
