/**
 * Per-provider rate limiting for the paid services (Muse Spark on OpenRouter or Meta, Deepgram,
 * Cartesia). Each provider gets its own lane: at most N calls run at once, and a 429 parks the lane
 * for a backoff that doubles with each rejection. Retries and provider fallbacks stay where they are
 * (fetchRetry, llmFallback, FallbackVoice); this only bounds how fast calls go out, so parallel scenes
 * and hedged copies do not trip a provider limit together.
 *
 * The lane is per process: within one render it bounds the parallel scenes, and across the server's
 * renders each process still retries a 429 with backoff through fetchRetry.
 */
import { ServiceError } from "./http.js";

/** Default lanes: voice scenes go out 8 at a time, chat calls rarely exceed their hedged copies. */
const DEFAULT_LANES: Record<string, number> = { deepgram: 8, cartesia: 8, openrouter: 4, meta: 4 };

/**
 * How many calls to a provider run at once. EXPLANIMATE_RATE_LIMIT_<PROVIDER> (e.g. _DEEPGRAM) sets
 * one lane, EXPLANIMATE_PROVIDER_CONCURRENCY sets every lane without its own value; a missing or
 * garbage value falls through to the next, then the default above.
 */
export function providerConcurrency(provider: string, env: Record<string, string | undefined> = process.env): number {
  const lane = provider.toLowerCase();
  for (const raw of [env[`EXPLANIMATE_RATE_LIMIT_${lane.toUpperCase()}`], env.EXPLANIMATE_PROVIDER_CONCURRENCY]) {
    if (raw === undefined || raw === "") continue;
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n > 0) return Math.min(n, 32);
  }
  return DEFAULT_LANES[lane] ?? 4;
}

/** How long a 429 parks its lane: 1 s, doubling per consecutive rejection, at most 30 s. */
export function rateLimitBackoffMs(rejections: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, Math.floor(rejections) - 1));
}

interface Lane {
  active: number;
  waiting: (() => void)[];
  parkedUntil: number;
  rejections: number;
}

/**
 * One lane per provider, shared process-wide through `providerLimiter`. `limit` and the clock are
 * injectable so tests can set a small lane and skip the waiting.
 */
export class ProviderLimiter {
  private lanes = new Map<string, Lane>();
  constructor(
    private limit: (provider: string) => number = providerConcurrency,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private lane(provider: string): Lane {
    const lane = this.lanes.get(provider) ?? { active: 0, waiting: [], parkedUntil: 0, rejections: 0 };
    this.lanes.set(provider, lane);
    return lane;
  }

  /** Run one provider call in its lane, parking the lane briefly when the provider says 429. */
  async run<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    const lane = this.lane(provider);
    for (;;) {
      const waitMs = lane.parkedUntil - this.now();
      if (waitMs > 0) await this.sleep(waitMs);
      if (lane.active < this.limit(provider)) break;
      await new Promise<void>((wake) => lane.waiting.push(wake));
    }
    lane.active++;
    try {
      const out = await fn();
      lane.rejections = 0;
      return out;
    } catch (e) {
      if (e instanceof ServiceError && e.status === 429) {
        lane.rejections++;
        lane.parkedUntil = this.now() + rateLimitBackoffMs(lane.rejections);
      }
      throw e;
    } finally {
      lane.active--;
      lane.waiting.shift()?.();
    }
  }
}

/** The process-wide lanes every provider call goes through. */
export const providerLimiter = new ProviderLimiter();
