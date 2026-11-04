/**
 * The render gate: only RENDER_CONCURRENCY jobs draw frames or encode at once.
 * API-bound stages (planning, TTS, fetches) run side by side in their own processes;
 * this file-based semaphore is what those processes share so the CPU-heavy stage stays
 * within the machine. A crashed holder's lock is stale (dead pid or older than 30 min)
 * and the next waiter clears it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpegThreads, renderConcurrency } from "@explanimate/core";

export { ffmpegThreads };

/** Where the slot locks live; one folder per machine, shared by every render on it. */
export function renderSlotsDir(env: Record<string, string | undefined> = process.env): string {
  return env.EXPLANIMATE_RENDER_SLOTS_DIR ?? path.join(os.tmpdir(), "explanimate-render-slots");
}

/** ffmpeg threads for this render as -threads args, e.g. ["-threads", "2"]. */
export function threadArgs(env: Record<string, string | undefined> = process.env, sys: { cpus?: number } = {}): string[] {
  return ["-threads", String(ffmpegThreads(env, sys))];
}

export interface RenderSlot {
  /** which slot was taken (0-based), for logs */
  slot: number;
  /** how long the acquire waited, in ms */
  waitMs: number;
  /** give the slot back; safe to call twice */
  release: () => void;
}

const STALE_MS = 30 * 60_000;

function takeable(file: string, staleMs: number): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e: unknown) {
    // missing: free. Unreadable but old: clear it; otherwise leave it alone.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return true;
    try {
      if (Date.now() - fs.statSync(file).mtimeMs > staleMs) fs.rmSync(file);
      else return false;
      return true;
    } catch {
      return false;
    }
  }
  try {
    const { pid, at } = JSON.parse(raw) as { pid?: unknown; at?: unknown };
    const old = typeof at !== "number" || Date.now() - at > staleMs;
    let dead = false;
    if (typeof pid === "number") {
      try {
        process.kill(pid, 0);
      } catch {
        dead = true;
      }
    }
    if (!old && !dead) return false;
  } catch {
    return false;
  }
  try {
    fs.rmSync(file);
  } catch {
    return false;
  }
  return true;
}

/**
 * Hold one render slot until release. Waits silently (polling every pollMs) while every
 * slot is busy; waitMs says how long that took. `slots` pins the pool for tests.
 */
export async function acquireRenderSlot(
  o: {
    env?: Record<string, string | undefined>;
    dir?: string;
    slots?: number;
    pollMs?: number;
    staleMs?: number;
  } = {},
): Promise<RenderSlot> {
  const env = o.env ?? process.env;
  const dir = o.dir ?? renderSlotsDir(env);
  const slots = o.slots ?? renderConcurrency(env);
  const pollMs = o.pollMs ?? 150;
  const staleMs = o.staleMs ?? STALE_MS;
  fs.mkdirSync(dir, { recursive: true });
  const start = Date.now();
  for (;;) {
    for (let slot = 0; slot < slots; slot++) {
      const file = path.join(dir, `slot-${slot}.lock`);
      if (!takeable(file, staleMs)) continue;
      try {
        fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" });
      } catch {
        continue; // someone else took it between the check and the write
      }
      let released = false;
      return {
        slot,
        waitMs: Date.now() - start,
        release: () => {
          if (released) return;
          released = true;
          try {
            fs.rmSync(file);
          } catch {
            /* already cleared */
          }
        },
      };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
