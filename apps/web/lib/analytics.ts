"use client";

/** The GA4 events the site sends. A no-op until the Analytics loader brings gtag in. */
export type AnalyticsEvent = "video_create" | "video_finished" | "video_failed" | "signin_code_sent" | "signin_success";

export function trackEvent(name: AnalyticsEvent): void {
  try {
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.("event", name);
  } catch {
    /* analytics never breaks the page */
  }
}
