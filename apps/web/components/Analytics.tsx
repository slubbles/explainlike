"use client";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Google Analytics, only when the deploy sets GA_MEASUREMENT_ID (read from /api/runtime-config,
 * the same pattern as the Turnstile site key). Loads gtag.js with IP anonymization and sends the
 * first page_view; with no id set, nothing from Google loads at all.
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
        window.gtag("config", id, { anonymize_ip: true });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);
  return null;
}
