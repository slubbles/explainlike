/**
 * The session from the browser: one shared read of /api/auth-config, and the sign-out call.
 * No React here, so unit tests import this directly.
 */

/** What /api/auth-config says: the public sign-in settings, the viewer, and their videos left today. */
export interface AuthConfig {
  enabled?: boolean;
  turnstileSiteKey?: string;
  google?: boolean;
  user?: { email?: string } | null;
  videos?: { used: number; limit: number; left: number } | null;
}

let inflight: Promise<AuthConfig | null> | null = null;

/**
 * One shared read of /api/auth-config: components mounting together (the nav and the page)
 * join the same request instead of each asking, but a settled read is never reused, so
 * signing in or out refreshes on the next call. Null when the server does not answer.
 */
export function fetchAuthConfig(): Promise<AuthConfig | null> {
  inflight ??= (async () => {
    try {
      const r = await fetch("/api/auth-config");
      if (!r.ok) return null;
      const j = (await r.json().catch(() => null)) as AuthConfig | null;
      return j && typeof j === "object" ? j : null;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * End the session. Better Auth rejects a POST without a JSON content type (415), so this
 * sends one. True when the server ended the session, false when the call failed.
 */
export async function signOut(): Promise<boolean> {
  const r = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).catch(() => null);
  return r?.ok === true;
}
