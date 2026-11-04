/**
 * Cloudflare Turnstile check for the send-a-code step. Fail closed: a missing token,
 * a network error, a wrong action or an unlisted hostname all refuse the send.
 * The documented test keys work without network: with the always-passing test secret,
 * the dummy token passes, so end-to-end tests need no widget and no Cloudflare call.
 */

export type TurnstileResult = { ok: true } | { ok: false; error: string };

const FAIL = "That check did not pass. Try again.";

/** Cloudflare's documented test keys that always pass, and the dummy token. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Verify a Turnstile token from the login form. `fetchImpl` is stubbed in tests. */
export async function verifyTurnstile(token: string, remoteIp: string, fetchImpl: typeof fetch = fetch): Promise<TurnstileResult> {
  if (!token) return { ok: false, error: FAIL };
  const secret = process.env.EXPLANIMATE_TURNSTILE_SECRET;
  if (!secret) {
    console.error("[turnstile] EXPLANIMATE_TURNSTILE_SECRET is not set");
    return { ok: false, error: FAIL };
  }
  if (secret === TURNSTILE_TEST_SECRET && token === TURNSTILE_DUMMY_TOKEN) return { ok: true };
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
