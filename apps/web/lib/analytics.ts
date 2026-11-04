"use client";

/**
 * The GA4 events the site sends. A no-op until the Analytics loader brings gtag in.
 * A successful sign-in carries new_account so new accounts read apart from logins.
 */
export type AnalyticsEvent =
  | "video_create"
  | "video_finished"
  | "video_failed"
  | "signin_code_sent"
  | "signin_success"
  | "gallery_play"
  | "mcp_docs_view"
  | "format_select"
  | "sign_out";

export function trackEvent(name: AnalyticsEvent, params?: Record<string, string | number | boolean>): void {
  try {
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.("event", name, params ?? {});
  } catch {
    /* analytics never breaks the page */
  }
}

/**
 * The page_view override for a URL, or null when GA's default location is safe. /copy
 * links carry the login code in ?c, so there the query string and fragment are stripped
 * from both page_location and page_path. Nothing else carries secrets in the URL (?job=
 * ids are public share links), so only /copy is rewritten.
 */
export function pageViewOverride(href: string): { page_location: string; page_path: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== "/copy" && !url.pathname.startsWith("/copy/")) return null;
  return { page_location: `${url.origin}${url.pathname}`, page_path: url.pathname };
}
