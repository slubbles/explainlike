"use client";
import { useEffect, useState } from "react";
import type { Interactive } from "../components/Player";
import Nav from "../components/Nav";
import InputScreen from "../components/InputScreen";
import JobBar from "../components/JobBar";
import Steps from "../components/Steps";
import ResultView from "../components/ResultView";
import { DEFAULT_FORM, formFromJob, type Form } from "../lib/form";
import { fileUrl, postJson, useGallery, useJob, useJobs, type Explain } from "../lib/client";

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
  const [posting, setPosting] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const job = useJob(jobId);
  const listed = useJobs(bump);
  const examples = useGallery();

  // ?job=<id> reopens a saved job (jobs are kept on disk); back and forward move between jobs and the start page
  useEffect(() => {
    const sync = () => setJobId(urlJob());
    sync();
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    setMap(undefined);
    setPicked(undefined);
    setExpl(null);
    setStarted([]);
    setErr("");
    if (!jobId) setForm(DEFAULT_FORM);
  }, [jobId]);
  // the job is the truth for what is on screen: a reopened job shows the link and voice it was made with
  useEffect(() => {
    if (job) setForm(formFromJob(job));
  }, [job?.id]);
  useEffect(() => {
    if (job?.state === "done") setBump((b) => b + 1);
    if (job?.state === "done" && job.interactive && !map)
      fetch(fileUrl(job.id, "interactive.json"))
        .then((r) => r.json())
        .then(setMap)
        .catch(() => {});
  }, [job?.state, job?.interactive, job?.id, map]);

  const busy = job?.state === "running";

  async function go() {
    if (posting) return;
    setErr("");
    setPosting(true);
    const r = await postJson<{ id: string; warnings?: string[] }>("/api/jobs", { ...form, input: form.input.trim() });
    setPosting(false);
    if (!r.ok) return setErr(r.error);
    setNotes(r.data.warnings ?? []);
    history.pushState(null, "", `?job=${r.data.id}`);
    setJobId(r.data.id);
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
    setPicked(id);
    setExpl(null);
    setExplBusy(true);
    setErr("");
    const r = await postJson<Explain>(`/api/jobs/${job.id}/explain`, { component: id });
    setExplBusy(false);
    if (!r.ok) return setErr(r.error);
    setExpl(r.data);
  }

  async function followUp(body: { focus?: string; whatIf?: string }) {
    if (!job) return;
    setErr("");
    const r = await postJson<{ id: string }>(`/api/jobs/${job.id}/followup`, body);
    if (!r.ok) return setErr(r.error);
    setStarted((f) => [r.data.id, ...f]);
  }

  const clips = job ? [...new Set([...started, ...listed.filter((j) => j.parent === job.id).map((j) => j.id)])] : [];

  return (
    <>
      <Nav />
      <main className={jobId ? "page job" : "page"}>
        {!jobId && (
          <InputScreen
            form={form}
            set={set}
            go={go}
            busy={posting}
            err={err}
            examples={examples}
            talking={talking}
            talk={setTalking}
            onVoiceJob={voiceJob}
          />
        )}
        {jobId && (
          <>
            <JobBar
              form={form}
              set={set}
              go={go}
              busy={busy || posting}
              fold={job?.state === "done"}
              quiet={job?.state === "done" && form.input.trim() === job.input && form.voice === job.voice}
            />
            {notes.map((n) => (
              <p className="note" role="status" key={n}>
                {n}
              </p>
            ))}
            {!job && (
              <div className="main solo">
                <div className="screen wait" aria-busy="true">
                  Loading…
                </div>
              </div>
            )}
            {job?.stage === "missing" && (
              <div className="main solo">
                <div className="screen wait" role="alert">
                  {job.error}
                </div>
              </div>
            )}
            {job && job.state !== "done" && job.stage !== "missing" && (
              <div className="main">
                <div className="col">
                  <div className="screen wait" aria-busy={job.state === "running"}>
                    {job.state === "error" ? "No video: this run stopped before the end." : "The video shows up here when it is ready."}
                  </div>
                  {err && (
                    <div className="err" role="alert">
                      {err}
                    </div>
                  )}
                </div>
                <Steps job={job} />
              </div>
            )}
            {job?.state === "done" && (
              <ResultView
                job={job}
                map={map}
                picked={picked}
                expl={expl}
                explBusy={explBusy}
                clips={clips}
                pick={pick}
                followUp={followUp}
                err={err}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
