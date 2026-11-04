"use client";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageViewOverride } from "../lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Google Analytics, only when the deploy sets a measurement id (NEXT_PUBLIC_GA_ID, or the
 * older GA_MEASUREMENT_ID server setting; read from /api/runtime-config, the same pattern as
 * the Turnstile site key — client code never reads the environment directly). Loads gtag.js
 * with IP anonymization and sends a page_view for every route, including query changes
 * (?job=<id>); with no id set, nothing from Google loads at all. There is no consent banner
 * on this site; when one is added, loading waits for it. The /copy page_view reports the bare
 * path, since ?c there carries the login code (see pageViewOverride).
 */
function Tracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const id = useRef("");
  const sent = useRef("");
  const pagePath = `${pathname}${search.size ? `?${search}` : ""}`;

  useEffect(() => {
    let stop = false;
    const ready = (mid: string) => {
      if (stop || !mid || typeof window === "undefined") return;
      id.current = mid;
      if (document.getElementById("ga-gtag")) return;
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = window.gtag ?? ((...a: unknown[]) => void window.dataLayer!.push(a));
      const s = document.createElement("script");
      s.id = "ga-gtag";
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(mid)}`;
      document.head.appendChild(s);
      window.gtag("js", new Date());
      window.gtag("config", mid, { anonymize_ip: true, send_page_view: false });
      // /copy links carry the login code in ?c: report the bare path so the code never reaches GA
      const override = pageViewOverride(location.href);
      sent.current = override?.page_path ?? `${location.pathname}${location.search}`;
      window.gtag("event", "page_view", {
        page_path: sent.current,
        page_location: override?.page_location ?? location.href,
        page_title: document.title,
      });
    };
    fetch("/api/runtime-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { gaMeasurementId?: unknown } | null) => {
        const mid = typeof j?.gaMeasurementId === "string" && j.gaMeasurementId ? j.gaMeasurementId : "";
        ready(mid);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  // every route change after the first page_view (query changes count: opening a video is one)
  useEffect(() => {
    if (!id.current || typeof window === "undefined" || !window.gtag) return;
    // the login code in /copy ?c never reaches GA either (see pageViewOverride above)
    const override = pageViewOverride(location.href);
    const path = override?.page_path ?? pagePath;
    if (sent.current === path) return;
    sent.current = path;
    try {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: override?.page_location ?? location.href,
        page_title: document.title,
      });
    } catch {
      /* analytics never breaks the page */
    }
  }, [pagePath]);

  return null;
}

export default function Analytics() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
