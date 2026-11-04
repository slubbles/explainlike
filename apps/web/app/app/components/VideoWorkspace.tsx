"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Interactive } from "../../../components/Player";
import { PromptBox } from "../../../components/InputScreen";
import JobBar from "../../../components/JobBar";
import SignIn from "../../../components/SignIn";
import Steps from "../../../components/Steps";
import ResultView from "../../../components/ResultView";
import DeleteVideoButton from "./DeleteVideoButton";
import type { Quota } from "../../../components/Home";
import { DEFAULT_FORM, formatForRequest, formFromJob, normalizeInput, type Form } from "../../../lib/form";
import { trackEvent } from "../../../lib/analytics";
import { fileUrl, postJson, useClips, useJob, type Explain } from "../../../lib/client";

/** The dashboard's creation flow: the prompt box, then the job bar, progress and result. /app/new starts before a job exists; /app/videos/[id] starts with one. A creation lands on the video page, so refreshes and shares keep working. */
export default function VideoWorkspace({ jobId: initialId, prompt }: { jobId?: string; prompt?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>({ ...DEFAULT_FORM, input: prompt ?? "" });
  const [jobId, setJobId] = useState<string | undefined>(initialId);
  const [err, setErr] = useState("");
  // a new link or topic clears the reason the last one was refused
  const set = (f: Partial<Form>) => {
    if (f.input !== undefined) setErr("");
    setForm((x) => ({ ...x, ...f }));
  };
  const [map, setMap] = useState<Interactive>();
  const [picked, setPicked] = useState<string>();
  const [expl, setExpl] = useState<Explain | null>(null);
  const [explBusy, setExplBusy] = useState(false);
  const [started, setStarted] = useState<string[]>([]);
  const [bump, setBump] = useState(0);
  const [posting, setPosting] = useState(false);
  // a follow-up starts a paid clip: one tap, one clip, even on a double-click
  const [followingUp, setFollowingUp] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [quota, setQuota] = useState<Quota>(null);
  const [siteKey, setSiteKey] = useState("");
  const [signin, setSignin] = useState(false);
  const job = useJob(jobId);
  const listed = useClips(jobId, bump);

  const refreshQuota = async () => {
    const r = await fetch("/api/auth-config").catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.enabled) {
      setSiteKey(j.turnstileSiteKey ?? "");
      setQuota(j.videos ?? null);
    }
  };
  useEffect(() => {
    refreshQuota();
  }, []);

  useEffect(() => {
    setMap(undefined);
    setPicked(undefined);
    setExpl(null);
    setStarted([]);
    setErr("");
  }, [jobId]);
  // the job is the truth for what is on screen: a reopened job shows the link and voice it was made with
  useEffect(() => {
    if (job) setForm(formFromJob(job));
  }, [job?.id]);
  // report a finish only for a job this tab watched run, not for an old one reopened from a link
  const watching = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (job.state === "running") watching.current = job.id;
    else if (watching.current === job.id) {
      watching.current = null;
      trackEvent(job.state === "done" ? "video_finished" : "video_failed");
    }
  }, [job?.id, job?.state]);
  useEffect(() => {
    if (job?.state === "done") setBump((b) => b + 1);
    if (job?.state === "done" && job.interactive && !map)
      fetch(fileUrl(job.id, "interactive.json"))
        .then((r) => r.json())
        .then(setMap)
        .catch(() => {});
  }, [job?.state, job?.interactive, job?.id, map]);

  const busy = job?.state === "running";

  async function submit() {
    if (posting) return;
    setErr("");
    setPosting(true);
    const input = normalizeInput(form.input);
    if (input !== form.input) setForm((x) => ({ ...x, input }));
    const { format, ...rest } = form;
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...rest, input, ...formatForRequest(format) }),
    }).catch(() => null);
    setPosting(false);
    if (!r) return setErr("Could not reach the server. Check your connection and try again.");
    // the session ran out mid-visit: sign in again, then the request goes through
    if (r.status === 401) {
      setSignin(true);
      return;
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok)
      return setErr(typeof data?.error === "string" ? data.error : `The server had a problem (${r.status}). Try again in a moment.`);
    trackEvent("video_create");
    setNotes(Array.isArray(data.warnings) ? data.warnings : []);
    refreshQuota();
    router.replace(`/app/videos/${data.id}`);
    setJobId(data.id);
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
    if (!job || followingUp) return;
    setFollowingUp(true);
    setErr("");
    const r = await postJson<{ id: string }>(`/api/jobs/${job.id}/followup`, body);
    setFollowingUp(false);
    if (!r.ok) return setErr(r.error);
    refreshQuota();
    setStarted((f) => [r.data.id, ...f]);
  }

  // the page's poll (useJob) shows the job as cancelled a moment later
  async function cancelRun() {
    if (!job) return;
    setErr("");
    const r = await postJson(`/api/jobs/${job.id}/cancel`, {});
    if (!r.ok) setErr(r.error);
  }

  const clips = job ? [...new Set([...started, ...listed.map((j) => j.id)])] : [];

  return (
    <div className="app-work">
      {signin && (
        <SignIn
          siteKey={siteKey}
          onCancel={() => setSignin(false)}
          onDone={async () => {
            setSignin(false);
            dispatchEvent(new CustomEvent("explanimate:auth-changed"));
            await submit();
          }}
        />
      )}
      {!jobId && (
        <>
          <div className="app-prompt">
            <PromptBox form={form} set={set} go={submit} busy={posting} quota={quota} />
          </div>
          {err && (
            <div className="err app-err" role="alert">
              {err}
            </div>
          )}
        </>
      )}
      {jobId && (
        <>
          <JobBar
            form={form}
            set={set}
            go={submit}
            busy={busy || posting}
            fold={job?.state === "done"}
            quiet={
              job?.state === "done" &&
              form.input.trim() === job.input &&
              form.voice === job.voice &&
              form.format === (job.ask?.format ?? "auto")
            }
            quota={quota}
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
                  {job.cancelled
                    ? "No video: you cancelled this run."
                    : job.state === "error"
                      ? "No video: this run stopped before the end."
                      : "The video shows up here when it is ready."}
                </div>
                {err && (
                  <div className="err" role="alert">
                    {err}
                  </div>
                )}
              </div>
              <Steps job={job} onCancel={cancelRun} />
            </div>
          )}
          {job?.state === "done" && (
            <>
              <ResultView
                job={job}
                map={map}
                picked={picked}
                expl={expl}
                explBusy={explBusy}
                clips={clips}
                pick={pick}
                followUp={followUp}
                followBusy={followingUp}
                err={err}
              />
              {job.mine && (
                <div className="app-vdel">
                  <DeleteVideoButton id={job.id} title={job.title ?? "this video"} redirectTo="/app/videos" />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
