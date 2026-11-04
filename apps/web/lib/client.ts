"use client";
import { useEffect, useState } from "react";
import type { GalleryItem } from "./gallery";

export type Usd = { meta: number; voice: number; total: number };
export type Job = {
  id: string;
  kind: "video" | "focus" | "what-if";
  input: string;
  voice: string;
  approach?: string;
  state: "running" | "done" | "error";
  stage: string;
  message: string;
  pct: number;
  error?: string;
  title?: string;
  durationSec?: number;
  costUsd?: number;
  usd?: Usd;
  interactive?: boolean;
  focus?: string;
  whatIf?: string;
  parent?: string;
  ask?: {
    goal?: string;
    audience?: string;
    depth?: "overview" | "working" | "deep";
    also?: string;
    format?: "short" | "deep" | "anatomy";
  };
  via?: "voice";
  /** this browser (or account) started it, so it may cancel it */
  mine?: boolean;
  /** its owner stopped it */
  cancelled?: boolean;
  outputs?: { mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string; poster?: string };
};
/** A follow-up clip as the jobs list returns it for one parent video. */
export type Listed = Pick<Job, "id" | "kind" | "state" | "title" | "parent" | "focus" | "whatIf"> & { started: number };
export type Explain = {
  component: { id: string; name: string; keyword: string; evidence: string[] };
  summary: string;
  points: { text: string; file: string }[];
  usd: number;
};

/** POST JSON and come back with the reply or a plain sentence saying what went wrong. */
export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(
    () => null,
  );
  if (!r) return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  const data = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, data: data as T };
  const said = typeof data?.error === "string" ? data.error : "";
  if (said) return { ok: false, error: said };
  if (r.status === 429) {
    const wait = r.headers.get("retry-after");
    return {
      ok: false,
      error: wait ? `Too many requests. Wait ${wait} seconds and try again.` : "Too many requests. Wait a minute and try again.",
    };
  }
  if (r.status === 413) return { ok: false, error: "That request is too large." };
  return { ok: false, error: `The server had a problem (${r.status}). Try again in a moment.` };
}

export const money = (n?: number) => `$${(n ?? 0).toFixed(3)}`;
export const secs = (n?: number) => `${Math.round(n ?? 0)} s`;
export const fileUrl = (id: string, n?: string, dl = false) => (n ? `/api/jobs/${id}/file/${n}${dl ? "?download" : ""}` : "#");
export const captionsUrl = (id: string) => `/api/jobs/${id}/captions`;

/** One job poll may hang this long before it counts as failed. */
export const POLL_TIMEOUT_MS = 15_000;
/** Failed polls in a row (offline, timeout, 429, 5xx) before the page says it is reconnecting. */
export const RECONNECT_AFTER_FAILURES = 3;
/** Wait after a failed poll: 3 s, then doubling up to 15 s. */
export function pollDelay(failures: number): number {
  return Math.min(3000 * 2 ** Math.max(0, failures - 1), 15_000);
}

/** Poll a job until it finishes. Failed polls never end the loop; only a 404 or the server reporting done or error does. */
export function useJob(id?: string): { job: Job | null; reconnecting: boolean } {
  const [job, setJob] = useState<Job | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    setJob(null);
    setReconnecting(false);
    if (!id) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    // failures never replace the last job the server sent; they only back off and, after a few, flag reconnecting
    let failures = 0;
    const missing = (): Job => ({
      id,
      kind: "video",
      input: "",
      voice: "deepgram",
      state: "error",
      stage: "missing",
      message: "",
      pct: 0,
      error: "This video is not on this server anymore. Paste the link again to make it.",
    });
    const failed = () => {
      failures += 1;
      if (failures >= RECONNECT_AFTER_FAILURES) setReconnecting(true);
      timer = setTimeout(poll, pollDelay(failures));
    };
    const poll = async () => {
      const ctrl = new AbortController();
      active = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS);
      let r: Response | null = null;
      try {
        r = await fetch(`/api/jobs/${id}`, { signal: ctrl.signal }).catch(() => null);
      } finally {
        clearTimeout(timeout);
        if (active === ctrl) active = null;
      }
      if (stop) return;
      // a job that is gone (deleted, or a different server) ends as an error instead of a blank page that polls forever
      if (r?.status === 404) {
        setReconnecting(false);
        setJob(missing());
        return;
      }
      if (!r?.ok) {
        failed();
        return;
      }
      let j: Job;
      try {
        j = (await r.json()) as Job;
      } catch {
        failed();
        return;
      }
      if (stop) return;
      failures = 0;
      setReconnecting(false);
      setJob(j);
      if (j.state === "running") timer = setTimeout(poll, 1000);
    };
    poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      active?.abort();
    };
  }, [id]);
  return { job, reconnecting };
}

/** The follow-up clips made from one video; `bump` refetches them. */
export function useClips(parent: string | undefined, bump: unknown = 0) {
  const [jobs, setJobs] = useState<Listed[]>([]);
  useEffect(() => {
    let stop = false;
    if (!parent) {
      setJobs([]);
      return;
    }
    fetch(`/api/jobs?parent=${encodeURIComponent(parent)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        if (!stop) setJobs(j);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [parent, bump]);
  return jobs;
}

/** The example videos the server has (its gallery folder); empty when it has none. */
export function useGallery() {
  const [videos, setVideos] = useState<GalleryItem[]>([]);
  useEffect(() => {
    let stop = false;
    fetch("/api/gallery")
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((j) => {
        if (!stop && Array.isArray(j?.videos)) setVideos(j.videos);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);
  return videos;
}
