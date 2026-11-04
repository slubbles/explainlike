/**
 * Request checks and response headers shared by every route: the same-origin check for POSTs,
 * the Google Analytics measurement id (the browser learns it only through /api/runtime-config),
 * and the Content Security Policy plus the rest of the security headers (sent by middleware.ts).
 */

/** The GA4 measurement id, if the deploy sets one. Anything non-empty counts; unset loads nothing. */
export function gaMeasurementId(): string | undefined {
  const v = process.env.GA_MEASUREMENT_ID?.trim();
  return v ? v : undefined;
}

/**
 * Reject a POST whose Origin header names another site. A cross-origin form or fetch from a
 * browser always carries one; requests without it (curl, server-to-server) pass, because they
 * never carry the victim's cookies and there is nothing to forge.
 */
export function checkOrigin(req: Request): Response | undefined {
  const origin = req.headers.get("origin");
  if (!origin) return undefined;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const here = (req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase() || new URL(req.url).host.toLowerCase();
  if (!here || host !== here) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  return undefined;
}

/**
 * The Content Security Policy. Scripts are this site plus a per-request nonce (middleware hands
 * it to Next, which stamps it on the inline scripts it renders) plus the Turnstile loader;
 * styles allow inline (Next and the widget need it); the browser talks back only to this site,
 * Turnstile and the Deepgram listening socket. The Google hosts join only when GA_MEASUREMENT_ID
 * is set, so an unset id loads nothing from Google.
 */
export function contentSecurityPolicy(nonce: string): string {
  const script = ["'self'", `'nonce-${nonce}'`, "https://challenges.cloudflare.com"];
  const connect = ["'self'", "https://challenges.cloudflare.com", "wss://api.deepgram.com"];
  const img = ["'self'", "data:", "blob:"];
  if (gaMeasurementId()) {
    script.push("https://www.googletagmanager.com");
    connect.push("https://www.google-analytics.com", "https://region1.google-analytics.com");
    img.push("https://www.google-analytics.com");
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Every security header for a route, given the request's CSP line (see middleware.ts). */
export function securityHeaders(csp: string): Record<string, string> {
  return {
    "content-security-policy": csp,
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "microphone=(self), camera=(), geolocation=()",
    "x-frame-options": "DENY",
  };
}
