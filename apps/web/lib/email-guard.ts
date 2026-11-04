/**
 * Temporary inboxes never get a login code: the maintained disposable-email-domains
 * blocklist plus a cheap MX lookup. The send hook in lib/auth.ts rejects before
 * sending, so no email goes out to a throwaway address.
 */
import dns from "node:dns";
import disposableDomains from "disposable-email-domains";
import wildcardDomains from "disposable-email-domains/wildcard.json";

/** Shown when an address is refused. */
export const TEMP_EMAIL_ERROR = "Please use a permanent email address. Temporary inboxes aren't supported.";

/** Lowercased domain of an address, or "" when there is none (Better Auth validates the shape). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
}

const BLOCKED: ReadonlySet<string> = new Set([...(disposableDomains as string[]), ...(wildcardDomains as string[])]);

/**
 * True when the domain, or any parent of it, is on the blocklist: sub.mailinator.com
 * is still mailinator. Only whole labels count, so fakemailinator.com stays allowed.
 */
export function isDisposableDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (!d) return false;
  if (BLOCKED.has(d)) return true;
  const labels = d.split(".");
  for (let i = 1; i < labels.length; i++) {
    if (BLOCKED.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/** "ok" takes mail, "none" provably does not, "unknown" means the lookup failed open. */
export type MxVerdict = "ok" | "none" | "unknown";

export interface MxOptions {
  /** dns.resolveMx by default; tests inject a stub. */
  resolve?: (domain: string) => Promise<dns.MxRecord[]>;
  /** Milliseconds before giving up and failing open. Default 2000. */
  timeoutMs?: number;
}

/**
 * Cheap MX lookup: "ok" when the domain takes mail, "none" on NXDOMAIN or no MX
 * records. Timeouts and every other DNS failure answer "unknown" (fail open): a
 * flaky resolver must not lock real users out, and an undeliverable domain still
 * fails later at send time.
 */
export async function checkMx(domain: string, opts: MxOptions = {}): Promise<MxVerdict> {
  const resolve = opts.resolve ?? ((d: string) => dns.promises.resolveMx(d));
  const timeoutMs = opts.timeoutMs ?? 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      resolve(domain).then(
        (mx) => ({ status: "done", mx }) as const,
        (error: unknown) => ({ status: "failed", error }) as const,
      ),
      // ref'd on purpose: this timer is the only thing keeping the fail-open path alive
      new Promise<{ status: "timeout" }>((r) => {
        timer = setTimeout(() => r({ status: "timeout" }), timeoutMs);
      }),
    ]);
    if (result.status === "timeout") return "unknown";
    if (result.status === "done") return result.mx.length > 0 ? "ok" : "none";
    const code = (result.error as NodeJS.ErrnoException | null)?.code;
    return code === "ENOTFOUND" || code === "ENODATA" ? "none" : "unknown";
  } finally {
    clearTimeout(timer);
  }
}

export interface TempEmailOptions extends MxOptions {
  /**
   * Skip the MX lookup. The send hook sets this when codes are captured locally
   * instead of sent (end-to-end tests only, never production): example.com-style
   * fixtures have no MX records. The blocklist still applies.
   */
  skipMx?: boolean;
}

/**
 * TEMP_EMAIL_ERROR when the address is a temporary inbox (a blocklist hit, or a
 * domain with no MX records), else null. Malformed addresses pass through:
 * Better Auth validates the shape.
 */
export async function rejectTempEmail(email: string, opts: TempEmailOptions = {}): Promise<string | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  if (isDisposableDomain(domain)) return TEMP_EMAIL_ERROR;
  if (opts.skipMx) return null;
  return (await checkMx(domain, opts)) === "none" ? TEMP_EMAIL_ERROR : null;
}
