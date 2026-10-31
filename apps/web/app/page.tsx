"use client";
import { useEffect, useState } from "react";
import type { Interactive } from "../components/Player";
import Nav from "../components/Nav";
import InputScreen from "../components/InputScreen";
import JobBar from "../components/JobBar";
import Steps from "../components/Steps";
import ResultView from "../components/ResultView";
import { DEFAULT_FORM, formFromJob, type Form } from "../lib/form";
import { fileUrl, useJob, useJobs, type Explain } from "../lib/client";

const urlJob = () => new URLSearchParams(location.search).get("job") ?? undefined;

export default function Home() {
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const set = (f: Partial<Form>) => setForm((x) => ({ ...x, ...f }));
  const [jobId, setJobId] = useState<string>();
  const [err, setErr] = useState("");
  const [map, setMap] = useState<Interactive>();
  const [picked, setPicked] = useState<string>();
  const [expl, setExpl] = useState<Explain | null>(null);
  const [explBusy, setExplBusy] = useState(false);
  const [started, setStarted] = useState<string[]>([]);
  const [bump, setBump] = useState(0);
  const [talking, setTalking] = useState(false);
  const job = useJob(jobId);
  const listed = useJobs(bump);

  // ?job=<id> reopens a saved job (jobs are kept on disk); back and forward move between jobs and the start page
  useEffect(() => {
    const sync = () => setJobId(urlJob());
    sync();
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    setMap(undefined); setPicked(undefined); setExpl(null); setStarted([]); setErr("");
    if (!jobId) setForm(DEFAULT_FORM);
  }, [jobId]);
  // the job is the truth for what is on screen: a reopened job shows the link and voice it was made with
  useEffect(() => {
    if (job) setForm(formFromJob(job));
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (job?.state === "done") setBump((b) => b + 1);
    if (job?.state === "done" && job.interactive && !map) fetch(fileUrl(job.id, "interactive.json")).then((r) => r.json()).then(setMap).catch(() => {});
  }, [job?.state, job?.interactive, job?.id, map]);

  const busy = job?.state === "running";

  async function go() {
    setErr("");
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, input: form.input.trim() }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return setErr(j?.error ?? "something went wrong");
    history.pushState(null, "", `?job=${j.id}`);
    setJobId(j.id);
    scrollTo({ top: 0 });
  }

  // voice mode started the job itself: open it like any other
  function voiceJob(j: { id: string }) {
    setTalking(false);
    history.pushState(null, "", `?job=${j.id}`);
    setJobId(j.id);
    scrollTo({ top: 0 });
  }

  async function pick(id: string) {
    if (!job) return;
    setPicked(id); setExpl(null); setExplBusy(true); setErr("");
    const r = await fetch(`/api/jobs/${job.id}/explain`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ component: id }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setExplBusy(false);
    if (!r?.ok) return setErr(j?.error ?? "could not explain that box");
    setExpl(j);
  }

  async function followUp(body: { focus?: string; whatIf?: string }) {
    if (!job) return;
    setErr("");
    const r = await fetch(`/api/jobs/${job.id}/followup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return setErr(j?.error ?? "could not start that clip");
    setStarted((f) => [j.id, ...f]);
  }

  const gallery = listed.filter((j) => j.kind === "video" && j.state === "done" && j.mp4).slice(0, 6);
  const clips = job ? [...new Set([...started, ...listed.filter((j) => j.parent === job.id).map((j) => j.id)])] : [];

  return (
    <>
      <Nav />
      <main className="page">
        {!jobId && <InputScreen form={form} set={set} go={go} busy={false} err={err} gallery={gallery} talking={talking} talk={setTalking} onVoiceJob={voiceJob} />}
        {jobId && (
          <>
            <JobBar form={form} set={set} go={go} busy={busy} fold={job?.state === "done"} quiet={job?.state === "done" && form.input.trim() === job.input && form.voice === job.voice} />
            {!job && <div className="main solo"><div className="screen" /></div>}
            {job && job.state !== "done" && (
              <div className="main">
                <div className="col">
                  <div className="screen wait">{job.state === "error" ? "No video: this run stopped before the end." : "The video shows up here when it is ready."}</div>
                  {err && <div className="err" role="alert">{err}</div>}
                </div>
                <Steps job={job} />
              </div>
            )}
            {job?.state === "done" && <ResultView job={job} map={map} picked={picked} expl={expl} explBusy={explBusy} clips={clips} pick={pick} followUp={followUp} err={err} />}
          </>
        )}
      </main>
    </>
  );
}
