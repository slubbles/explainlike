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

/** Failed polls in a row (429, 500, offline) before the page says the server stopped answering. */
export const MAX_POLL_FAILURES = 10;

/** Poll a job until it finishes. */
export function useJob(id?: string) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    setJob(null);
    if (!id) return;
    let stop = false;
    // a server that stays silent (429, 500, down) may not hold the page on "Loading" forever
    let failures = 0;
    const unreachable = (stage: string, error: string): Job => ({
      id,
      kind: "video",
      input: "",
      voice: "deepgram",
      state: "error",
      stage,
      message: "",
      pct: 0,
      error,
    });
    const poll = async () => {
      const r = await fetch(`/api/jobs/${id}`).catch(() => null);
      if (stop) return;
      // a job that is gone (deleted, or a different server) ends as an error instead of a blank page that polls forever
      if (r?.status === 404) {
        setJob(unreachable("missing", "This video is not on this server anymore. Paste the link again to make it."));
        return;
      }
      if (!r?.ok) {
        failures += 1;
        if (failures > MAX_POLL_FAILURES) {
          setJob(unreachable("unreachable", "The server stopped answering. Reload the page to keep watching this video."));
          return;
        }
        setTimeout(poll, 3000);
        return;
      }
      failures = 0;
      const j: Job = await r.json();
      if (stop) return;
      setJob(j);
      if (j.state === "running") setTimeout(poll, 1000);
    };
    poll();
    return () => {
      stop = true;
    };
  }, [id]);
  return job;
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
