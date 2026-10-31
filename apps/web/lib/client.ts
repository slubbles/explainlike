"use client";
import { useEffect, useState } from "react";

export type Usd = { meta: number; voice: number; total: number };
export type Job = {
  id: string; kind: "video" | "focus" | "what-if"; input: string; level: string; voice: string;
  state: "running" | "done" | "error"; stage: string; message: string; pct: number; error?: string; title?: string;
  durationSec?: number; costUsd?: number; usd?: Usd; interactive?: boolean; focus?: string; whatIf?: string; parent?: string;
  outputs?: { mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string };
};
/** A job as the jobs list returns it. */
export type Listed = Pick<Job, "id" | "kind" | "input" | "level" | "voice" | "state" | "title" | "parent" | "focus" | "whatIf" | "costUsd" | "durationSec"> & { started: number; mp4?: string };
export type Explain = { component: { id: string; name: string; keyword: string; evidence: string[] }; summary: string; points: { text: string; file: string }[]; usd: number };

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
