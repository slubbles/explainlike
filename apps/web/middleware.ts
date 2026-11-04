import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, securityHeaders } from "./lib/security";

/**
 * A fresh CSP nonce per request plus the security headers on every route. Next reads the nonce
 * back from the request's CSP header and stamps it on the inline scripts it renders, so the
 * strict script-src does not break hydration (verified by fetching / and matching the nonces).
 */
export function middleware(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const csp = contentSecurityPolicy(nonce);
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  for (const [name, value] of Object.entries(securityHeaders(csp))) res.headers.set(name, value);
  return res;
}

export const config = { matcher: "/:path*" };
