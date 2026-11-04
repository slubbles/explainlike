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
 * Google Analytics, only when the deploy sets GA_MEASUREMENT_ID on the server. The root layout
 * reads it at request time and hands it down, so the id is never baked in at build time.
 * Loads gtag.js with IP anonymization and sends a page_view for every route, including query
 * changes (?job=<id>); /copy views never carry their query, which can hold pasted text.
 * With no id set, nothing from Google loads at all. There is no consent banner on this site;
 * when one is added, loading waits for it.
 */
function Tracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const sent = useRef("");
  const query = search.size ? `?${search}` : "";
  const pagePath = `${pathname}${query}`;

  useEffect(() => {
    if (!measurementId || typeof window === "undefined") return;
    if (document.getElementById("ga-gtag")) return;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = window.gtag ?? ((...a: unknown[]) => void window.dataLayer!.push(a));
    const s = document.createElement("script");
    s.id = "ga-gtag";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { anonymize_ip: true, send_page_view: false });
    // /copy links carry the login code in ?c: report the bare path so the code never reaches GA
    const override = pageViewOverride(location.href);
    sent.current = override?.page_path ?? `${location.pathname}${location.search}`;
    window.gtag("event", "page_view", {
      page_path: sent.current,
      page_location: override?.page_location ?? location.href,
      page_title: document.title,
    });
  }, [measurementId]);

  // every route change after the first page_view (query changes count: opening a video is one)
  useEffect(() => {
    if (!measurementId || typeof window === "undefined" || !window.gtag) return;
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
  }, [measurementId, pagePath, pathname]);

  return null;
}

export default function Analytics({ measurementId }: { measurementId: string }) {
  return (
    <Suspense fallback={null}>
      <Tracker measurementId={measurementId} />
    </Suspense>
  );
}
