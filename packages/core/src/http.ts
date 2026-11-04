/**
 * HTTP calls to the paid services (Meta Muse, Deepgram) with a timeout per attempt, retries with
 * exponential backoff and jitter on the failures that pass (network errors, timeouts, 408, 425, 429, 5xx,
 * honouring Retry-After), and errors a person can act on. No key ever goes into a message.
 */
export class ServiceError extends Error {
  constructor(
    /** what a person sees: what went wrong and what to do */
    message: string,
    readonly service: string,
    readonly status?: number,
    /** the raw reason for logs (status line and the start of the response body) */
    readonly detail?: string,
    /** the service did not answer in time (as opposed to refusing or failing) */
    readonly timedOut = false,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface RetryOptions {
  /** the name a person knows, e.g. "Meta Muse" or "Deepgram" */
  service: string;
  /** the env var holding its key, named in auth errors */
  keyVar?: string;
  /** per attempt, default 120 s */
  timeoutMs?: number;
  /** total tries, default 4 */
  attempts?: number;
  /** false: a timeout fails at once (the caller has its own quicker fallback), default true */
  retryTimeouts?: boolean;
  /** first backoff, doubled each retry, default 1000 ms */
  baseMs?: number;
  /** longest single wait, default 30 s */
  maxWaitMs?: number;
  /** for tests */
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529]);
export const retryable = (status: number) => RETRY_STATUS.has(status) || status >= 500;

/** A sentence a person can act on for a failed HTTP status. */
export function serviceMessage(service: string, status: number, keyVar?: string): string {
  if (status === 401 || status === 403)
    return `${service} rejected the API key${keyVar ? `: check that ${keyVar} is set to a valid key` : ""}.`;
  if (status === 402) return `${service} says the account is out of credit. Add credit or lower the spend, then try again.`;
  if (status === 429) return `${service} is rate-limiting requests right now. Wait a minute and try again.`;
  if (status === 413) return `The request was too large for ${service}. Try a shorter input.`;
  if (status >= 500) return `${service} is having trouble right now (HTTP ${status}). Try again in a few minutes.`;
  return `${service} refused the request (HTTP ${status}).`;
}

function retryAfterMs(h: string | null): number | undefined {
  if (!h) return undefined;
  const s = Number(h);
  if (Number.isFinite(s)) return s * 1000;
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : undefined;
}

const scrub = (s: string) => s.replace(/(Bearer|Token)\s+[\w.-]+/gi, "$1 ***").replace(/\b(sk|key|dg)[-_][\w-]{12,}/gi, "***");

/**
 * fetch with a timeout per attempt and retries. `init` is rebuilt for each attempt by the caller-supplied
 * function, so streamed bodies (FormData, Blob) are fresh every time. Resolves with an ok Response.
 */
export async function fetchRetry(url: string, init: () => RequestInit, o: RetryOptions): Promise<Response> {
  const attempts = Math.max(1, Math.floor(o.attempts ?? 4) || 1),
    base = o.baseMs ?? 1000,
    maxWait = o.maxWaitMs ?? 30_000,
    timeout = o.timeoutMs ?? 120_000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const f = o.fetchImpl ?? fetch;
  let last: ServiceError | undefined;
  for (let a = 0; a < attempts; a++) {
    let wait = Math.min(maxWait, base * 2 ** a * (0.75 + Math.random() * 0.5));
    // a ref'd timer (AbortSignal.timeout's is not), so a hung call cannot let the process exit mid-job
    const ctl = new AbortController(),
      timer = setTimeout(() => ctl.abort(Object.assign(new Error("timed out"), { name: "TimeoutError" })), timeout);
    try {
      const r = await f(url, { ...init(), signal: ctl.signal });
      if (r.ok) return r;
      const body = scrub((await r.text().catch(() => "")).slice(0, 300));
      last = new ServiceError(
        serviceMessage(o.service, r.status, o.keyVar),
        o.service,
        r.status,
        `HTTP ${r.status} ${new URL(url).pathname}: ${body}`,
      );
      if (!retryable(r.status)) throw last;
      const ra = retryAfterMs(r.headers.get("retry-after"));
      if (ra !== undefined) wait = Math.min(maxWait, Math.max(wait, ra));
    } catch (e) {
      if (e instanceof ServiceError) throw e;
      const err = e as Error;
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      last = new ServiceError(
        timedOut
          ? `${o.service} did not answer within ${Math.round(timeout / 1000)} s. Try again in a few minutes.`
          : `Could not reach ${o.service} (${scrub(String(err?.message ?? err))}). Check the internet connection and try again.`,
        o.service,
        undefined,
        scrub(String(err?.message ?? err)),
        timedOut,
      );
      if (timedOut && o.retryTimeouts === false) throw last;
    } finally {
      clearTimeout(timer);
    }
    if (a < attempts - 1) await sleep(wait);
  }
  throw last!;
}
