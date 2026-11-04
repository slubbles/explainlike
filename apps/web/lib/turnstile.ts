/**
 * Cloudflare Turnstile check for the send-a-code step. Fail closed: a missing token,
 * a network error, a wrong action or an unlisted hostname all refuse the send.
 */

export type TurnstileResult = { ok: true } | { ok: false; error: string };

const FAIL = "That check did not pass. Try again.";

/** Verify a Turnstile token from the login form. `fetchImpl` is stubbed in tests. */
export async function verifyTurnstile(token: string, remoteIp: string, fetchImpl: typeof fetch = fetch): Promise<TurnstileResult> {
  if (!token) return { ok: false, error: FAIL };
  const secret = process.env.EXPLANIMATE_TURNSTILE_SECRET;
  if (!secret) {
    console.error("[turnstile] EXPLANIMATE_TURNSTILE_SECRET is not set");
    return { ok: false, error: FAIL };
  }
  const hostnames = (process.env.EXPLANIMATE_TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  let res: Response;
  try {
    res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, error: FAIL };
  }
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; action?: string; hostname?: string };
  if (data.success !== true) return { ok: false, error: FAIL };
  if (data.action !== "login") return { ok: false, error: FAIL };
  // the hostname must be listed; with no list configured nothing passes (fail closed)
  if (!hostnames.includes((data.hostname ?? "").toLowerCase())) return { ok: false, error: FAIL };
  return { ok: true };
}
