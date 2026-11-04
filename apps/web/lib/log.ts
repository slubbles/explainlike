/**
 * Structured JSON logs to stdout: one line per event with level, timestamp, route and message.
 * Anything sensitive is scrubbed before it is written: emails are masked (never logged in full),
 * and tokens, codes, cookies, secrets and passwords become "[redacted]".
 */
import crypto from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

/** A short id tying a response (and its stored error row) to its log lines. */
export const requestId = (): string => crypto.randomBytes(8).toString("hex");

/** you@example.com -> y***@example.com. Anything without a real local part becomes "***". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const domain = email.slice(at + 1).trim() || "?";
  return `${email[0]}***@${domain}`;
}

const EMAIL = /[\w.+-]{1,64}@[\w.-]{1,253}\.\w{2,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const SENSITIVE_KEY = /token|secret|password|passwd|otp|api[-_]?key|authorization|cookie|session|set-cookie/i;

/** Redact the secrets a free-form string can carry: emails, bearer tokens and cookie headers. */
export function scrubString(s: string): string {
  return s
    .replace(EMAIL, (m) => maskEmail(m))
    .replace(BEARER, "Bearer [redacted]")
    .replace(/(^|[; ])cookie[^;]*/gi, "$1cookie=[redacted]");
}

const MAX_STRING = 2000;

/** A deep copy with sensitive values redacted: matching keys, and secrets inside strings. */
export function scrub<T>(value: T, depth = 0): T {
  // capped after scrubbing too: masking an email can add a character
  if (typeof value === "string") return scrubString(value.slice(0, MAX_STRING)).slice(0, MAX_STRING) as T;
  if (Array.isArray(value)) return (depth > 4 ? ["[truncated]"] : value.map((v) => scrub(v, depth + 1))) as T;
  if (value && typeof value === "object") {
    if (depth > 4) return { "...": "[truncated]" } as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1);
    return out as T;
  }
  return value;
}

export interface LogFields {
  requestId?: string;
  [key: string]: unknown;
}

/** One JSON line on stdout. Fields are scrubbed; prefer logError for caught errors. */
export function log(level: LogLevel, route: string, msg: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level, ts: new Date().toISOString(), route, msg: scrubString(msg).slice(0, 500), ...scrub(fields) }));
}

/** A caught error as one JSON line: name, message and stack trimmed, all scrubbed. */
export function logError(route: string, msg: string, error: unknown, requestIdValue?: string): void {
  const e = error instanceof Error ? error : new Error(String(error));
  log("error", route, msg, {
    ...(requestIdValue ? { requestId: requestIdValue } : {}),
    error: { name: e.name.slice(0, 80), message: e.message.slice(0, 500), stack: (e.stack ?? "").slice(0, 2000) },
  });
}
