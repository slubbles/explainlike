import os from "node:os";

/**
 * How many videos render at once. Each render drives a headless browser and ffmpeg, so the default
 * fits the machine: one slot per spare core, and one per 1.5 GB of free memory, at least one.
 */
export function defaultPoolSize(sys: { cpus?: number; freeBytes?: number } = {}): number {
  const cpus = sys.cpus ?? os.cpus().length;
  const freeGB = (sys.freeBytes ?? os.freemem()) / 1024 ** 3;
  return Math.max(1, Math.min(cpus - 1, Math.floor(freeGB / 1.5)));
}

const CANDIDATES = ["EXPLANIMATE_MAX_CONCURRENT", "JOB_CONCURRENCY", "EXPLANIMATE_CONCURRENCY"] as const;

// the default sampled once per process: free memory wiggles as the system works, and the pool must not flap with it
let memo: number | undefined;

/**
 * The render slots from the environment. EXPLANIMATE_MAX_CONCURRENT wins when set, then
 * JOB_CONCURRENCY, then the pre-rename EXPLANIMATE_CONCURRENCY; a missing or garbage value falls
 * through to the next, and with none set the default fits the machine (see defaultPoolSize).
 * Passing `sys` always computes fresh, for tests; otherwise the sampled default is reused.
 */
export function poolSize(env: Record<string, string | undefined> = process.env, sys: { cpus?: number; freeBytes?: number } = {}): number {
  for (const name of CANDIDATES) {
    const raw = env[name];
    if (raw === undefined || raw === "") continue;
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (sys.cpus !== undefined || sys.freeBytes !== undefined) return defaultPoolSize(sys);
  return (memo ??= defaultPoolSize());
}
