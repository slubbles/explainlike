"use client";
import { useEffect, useState } from "react";

export type Usd = { meta: number; voice: number; total: number };
export type Job = {
  id: string; kind: "video" | "focus" | "what-if"; input: string; voice: string; approach?: string;
  state: "queued" | "running" | "done" | "error"; stage: string; message: string; pct: number; error?: string; title?: string;
  durationSec?: number; costUsd?: number; usd?: Usd; interactive?: boolean; focus?: string; whatIf?: string; parent?: string;
  ask?: { goal?: string; audience?: string; depth?: "overview" | "working" | "deep"; also?: string }; via?: "voice";
  outputs?: { mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string };
};
/** A job as the jobs list returns it. */
export type Listed = Pick<Job, "id" | "kind" | "input" | "approach" | "voice" | "state" | "title" | "parent" | "focus" | "whatIf" | "costUsd" | "durationSec"> & { started: number; mp4?: string };
export type Explain = { component: { id: string; name: string; keyword: string; evidence: string[] }; summary: string; points: { text: string; file: string }[]; usd: number };

/** POST JSON and come back with the reply or a plain sentence saying what went wrong. */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  const data = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, data: data as T };
  const said = typeof data?.error === "string" ? data.error : "";
  if (said) return { ok: false, error: said };
  if (r.status === 429) return { ok: false, error: `Too many requests. Wait ${r.headers.get("retry-after") ?? "a minute"} seconds and try again.` };
  if (r.status === 413) return { ok: false, error: "That request is too large." };
  return { ok: false, error: `The server had a problem (${r.status}). Try again in a moment.` };
}

export const money = (n?: number) => `$${(n ?? 0).toFixed(3)}`;
export const secs = (n?: number) => `${Math.round(n ?? 0)} s`;
export const fileUrl = (id: string, n?: string, dl = false) => (n ? `/api/jobs/${id}/file/${n}${dl ? "?download" : ""}` : "#");

/** Poll a job until it finishes. */
export function useJob(id?: string) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    setJob(null);
    if (!id) return;
    let stop = false;
    const poll = async () => {
      const r = await fetch(`/api/jobs/${id}`).catch(() => null);
      if (stop) return;
      // a job that is gone (deleted, or a different server) ends as an error instead of a blank page that polls forever
      if (r?.status === 404) { setJob({ id, kind: "video", input: "", voice: "deepgram", state: "error", stage: "missing", message: "", pct: 0, error: "This video is not on this server anymore. Paste the link again to make it." }); return; }
      if (!r?.ok) { setTimeout(poll, 3000); return; }
      const j: Job = await r.json();
      if (stop) return;
      setJob(j);
      if (j.state === "running") setTimeout(poll, 1000);
    };
    poll();
    return () => { stop = true; };
  }, [id]);
  return job;
}

/** The saved jobs list; `bump` refetches it. */
export function useJobs(bump: unknown = 0) {
  const [jobs, setJobs] = useState<Listed[]>([]);
  useEffect(() => {
    let stop = false;
    fetch("/api/jobs").then((r) => (r.ok ? r.json() : [])).then((j) => { if (!stop) setJobs(j); }).catch(() => {});
    return () => { stop = true; };
  }, [bump]);
  return jobs;
}
