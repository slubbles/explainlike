import os from "node:os";
import { apiConcurrency, renderConcurrency } from "@explanimate/core/concurrency";

/**
 * How many videos run their API-bound stages at once (LLM planning, TTS, fetches).
 * Ten by default; the old job-slot names still set it (see @explanimate/core).
 */
export function poolSize(env: Record<string, string | undefined> = process.env): number {
  return apiConcurrency(env);
}

/**
 * How many videos render or encode at once: the CPU-heavy stage.
 * Defaults to max(1, cpus - 2), so a 4-core server renders two at a time.
 */
export function renderSlots(env: Record<string, string | undefined> = process.env, sys: { cpus?: number } = {}): number {
  return renderConcurrency(env, sys);
}

/**
 * Before the split, one pool limited whole jobs and defaulted to spare cores and free memory.
 * It is kept so old callers still read a number; new code uses poolSize (API stages) and
 * renderSlots (render/encode).
 */
export function defaultPoolSize(sys: { cpus?: number; freeBytes?: number } = {}): number {
  const cpus = sys.cpus ?? os.cpus().length;
  const freeGB = (sys.freeBytes ?? os.freemem()) / 1024 ** 3;
  return Math.max(1, Math.min(cpus - 1, Math.floor(freeGB / 1.5)));
}
