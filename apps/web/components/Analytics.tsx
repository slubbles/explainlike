"use client";
import { useEffect } from "react";
import { pageViewOverride } from "../lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Google Analytics, only when the deploy sets GA_MEASUREMENT_ID (read from /api/runtime-config,
 * the same pattern as the Turnstile site key). Loads gtag.js with IP anonymization and sends the
 * first page_view; with no id set, nothing from Google loads at all. The /copy page_view reports
 * the bare path, since ?c there carries the login code (see pageViewOverride).
 */
export default function Analytics() {
  useEffect(() => {
    let stop = false;
    fetch("/api/runtime-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { gaMeasurementId?: unknown } | null) => {
        const id = typeof j?.gaMeasurementId === "string" && j.gaMeasurementId ? j.gaMeasurementId : "";
        if (stop || !id || typeof window === "undefined" || document.getElementById("ga-gtag")) return;
        window.dataLayer = window.dataLayer ?? [];
        window.gtag = window.gtag ?? ((...a: unknown[]) => void window.dataLayer!.push(a));
        const s = document.createElement("script");
        s.id = "ga-gtag";
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
        document.head.appendChild(s);
        window.gtag("js", new Date());
        // /copy links carry the login code in ?c: report the bare path so the code never reaches GA
        const override = pageViewOverride(window.location.href);
        window.gtag("config", id, override ? { anonymize_ip: true, ...override } : { anonymize_ip: true });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);
  return null;
}
