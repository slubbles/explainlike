/**
 * The Cache-Control split: versioned static assets cache for a year, everything else never.
 * Static means the Next build output, the public images and fonts, the share image, and the
 * gallery files served from /api/gallery/* (they are named files, not JSON). Pages carry a
 * fresh CSP nonce per request, and every other /api/* answer is per viewer or per job, so both
 * send no-store. Cloudflare mirrors this (see docs/deploy.md): cache the first group, bypass
 * the second.
 */

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const NO_STORE_VALUE = "no-store";

/** The Cache-Control value for a pathname (no query string). */
export function cacheControlFor(pathname: string): string {
  if (pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image")) return IMMUTABLE;
  if (pathname.startsWith("/api/gallery/") && /\.(mp4|jpg|jpeg|png|webp)$/i.test(pathname)) return IMMUTABLE;
  if (pathname.startsWith("/api/")) return NO_STORE_VALUE;
  if (/\.(ico|png|jpg|jpeg|webp|avif|svg|woff|woff2|mp4)$/i.test(pathname)) return IMMUTABLE;
  return NO_STORE_VALUE;
}
