"use client";
import { useEffect, useRef, useState } from "react";
import Player, { type Interactive } from "../components/Player";

type Usd = { meta: number; voice: number; total: number };
type Job = {
  id: string; kind: "video" | "focus" | "what-if"; state: "running" | "done" | "error"; message: string; pct: number; error?: string; title?: string;
  durationSec?: number; costUsd?: number; usd?: Usd; interactive?: boolean; focus?: string; whatIf?: string;
  outputs?: { mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string };
};
type Explain = { component: { id: string; name: string; keyword: string; evidence: string[] }; summary: string; points: { text: string; file: string }[]; usd: number };

const LEVELS = [
  { id: "five", label: "I'm 5" },
  { id: "new", label: "I'm new" },
  { id: "interviewing", label: "I'm interviewing" },
  { id: "senior", label: "I'm senior" },
];
const EXAMPLES = ["https://github.com/umami-software/umami", "https://x.com/karpathy/status/1977755427569111362", "https://blog.vllm.ai/2023/06/20/vllm.html"];
const money = (n?: number) => `$${(n ?? 0).toFixed(3)}`;
const fileUrl = (id: string, n?: string, dl = false) => (n ? `/api/jobs/${id}/file/${n}${dl ? "?download" : ""}` : "#");

/** Poll a job until it finishes. */
function useJob(id?: string) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!id) return setJob(null);
    let stop = false;
    const poll = async () => {
      const r = await fetch(`/api/jobs/${id}`);
      if (!r.ok || stop) return;
      const j: Job = await r.json();
      setJob(j);
      if (j.state === "running") setTimeout(poll, 1000);
    };
    poll();
    return () => { stop = true; };
  }, [id]);
  return job;
}

function Progress({ job }: { job: Job }) {
  return (
    <div className="prog">
      <div className="bar"><i style={{ width: `${Math.max(3, job.pct)}%` }} /></div>
      <div className="msg">{job.message} · <span className="cost">spent so far {money(job.usd?.total)}</span></div>
    </div>
  );
}

function FollowUp({ id }: { id: string }) {
  const job = useJob(id);
  if (!job) return null;
  const what = job.kind === "focus" ? `Deep dive: ${job.focus}` : `What if ${job.whatIf} traffic?`;
  return (
    <div className="fj">
      <b>{what}</b>
      {job.state === "running" && <Progress job={job} />}
      {job.state === "error" && <div className="err">Failed: {job.error}</div>}
      {job.state === "done" && job.outputs?.mp4 && (
        <>
          <video src={fileUrl(id, job.outputs.mp4)} controls playsInline />
          <div className="meta">{job.durationSec?.toFixed(0)} s · cost {money(job.costUsd)} · <a href={fileUrl(id, job.outputs.mp4, true)}>download</a></div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [level, setLevel] = useState("new");
  const [voice, setVoice] = useState("deepgram");
  const [jobId, setJobId] = useState<string>();
  const [err, setErr] = useState("");
  const [map, setMap] = useState<Interactive>();
  const [picked, setPicked] = useState<string>();
  const [expl, setExpl] = useState<Explain | null>(null);
  const [explBusy, setExplBusy] = useState(false);
  const [follow, setFollow] = useState<string[]>([]);
  const job = useJob(jobId);
  const top = useRef<HTMLDivElement>(null);

  // ?job=<id> reopens a finished video (jobs are kept on disk)
  useEffect(() => { const j = new URLSearchParams(location.search).get("job"); if (j) setJobId(j); }, []);
  useEffect(() => {
    setMap(undefined); setPicked(undefined); setExpl(null); setFollow([]);
  }, [jobId]);
  useEffect(() => {
    if (job?.state === "done" && job.interactive && !map) fetch(fileUrl(job.id, "interactive.json")).then((r) => r.json()).then(setMap).catch(() => {});
  }, [job?.state, job?.interactive, job?.id, map]);

  async function go() {
    setErr(""); setJobId(undefined);
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, level, voice }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "something went wrong");
    setJobId(j.id);
    history.replaceState(null, "", `?job=${j.id}`);
  }

  async function pick(id: string) {
    if (!job) return;
    setPicked(id); setExpl(null); setExplBusy(true); setErr("");
    const r = await fetch(`/api/jobs/${job.id}/explain`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ component: id }) });
    const j = await r.json();
    setExplBusy(false);
    if (!r.ok) return setErr(j.error ?? "could not explain that box");
    setExpl(j);
  }

  async function followUp(body: { focus?: string; whatIf?: string }) {
    if (!job) return;
    setErr("");
    const r = await fetch(`/api/jobs/${job.id}/followup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "could not start that clip");
    setFollow((f) => [j.id, ...f]);
  }

  const busy = job?.state === "running";
  const names = Object.fromEntries((map?.nodes ?? []).map((n) => [n.id, n.keyword]));

  return (
    <main className="wrap" ref={top}>
      <div className="top">
        <a className="brand" href="/">metual<b>.</b></a>
        <a className="gh" href="https://github.com/slubbles/metual">GitHub</a>
      </div>
      <h1>Any repo, post or article,<br />explained on a <em>whiteboard</em>.</h1>
      <p className="lede">Paste a link. Metual reads the code or the text, draws the system piece by piece, walks one real request through it, and narrates it at your level. You get an mp4 and an editable board that opens in tldraw.com.</p>

      <div className="card">
        <div className="row">
          <input type="text" placeholder="github.com/owner/repo, an X post, or an article URL" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && input && !busy && go()} />
          <button className="go" disabled={!input || busy} onClick={go}>{busy ? "Drawing…" : "Explain it"}</button>
        </div>
        <div className="label">Explain it like</div>
        <div className="chips">{LEVELS.map((l) => <button key={l.id} className={`chip ${level === l.id ? "on" : ""}`} onClick={() => setLevel(l.id)}>{l.label}</button>)}</div>
        <div className="label">Voice</div>
        <div className="chips">
          <button className={`chip ${voice === "deepgram" ? "on" : ""}`} onClick={() => setVoice("deepgram")}>Narrated</button>
          <button className={`chip ${voice === "silent" ? "on" : ""}`} onClick={() => setVoice("silent")}>Captions only</button>
        </div>
        <div className="examples">Try:{EXAMPLES.map((x) => <button key={x} onClick={() => setInput(x)}>{x.replace(/^https?:\/\//, "").slice(0, 44)}</button>)}</div>

        {err && <div className="err">{err}</div>}
        {job?.state === "running" && <Progress job={job} />}
        {job?.state === "error" && <div className="err">Failed: {job.error}</div>}
        {job?.state === "done" && job.outputs?.mp4 && (
          <div className="result">
            <Player src={fileUrl(job.id, job.outputs.mp4)} map={map} selected={picked} onPick={pick} />
            {map && <div className="tip">Tap any box on the diagram to ask Muse Spark what it does. The answer only cites files that box was built from.</div>}
            <div className="dl">
              <a className="primary" href={fileUrl(job.id, job.outputs.mp4, true)}>Download mp4</a>
              {job.outputs.tldr && <a href={fileUrl(job.id, job.outputs.tldr, true)}>Open in tldraw</a>}
              {job.outputs.excalidraw && <a href={fileUrl(job.id, job.outputs.excalidraw, true)}>Open in Excalidraw</a>}
              <a href={fileUrl(job.id, job.outputs.contactSheet)} target="_blank">Contact sheet</a>
            </div>
            <div className="meta">{job.title} · {job.durationSec?.toFixed(0)} s · <span className="cost">model {money(job.usd?.meta)} + voice {money(job.usd?.voice)} = {money(job.costUsd)}</span></div>

            {(picked || expl) && (
              <div className="panel">
                <h3>{expl?.component.name ?? names[picked!] ?? picked}</h3>
                {explBusy && <p>Reading the files behind this box…</p>}
                {expl && (
                  <>
                    <p>{expl.summary}</p>
                    <ul>{expl.points.map((p, i) => <li key={i}>{p.text} <code>{p.file}</code></li>)}</ul>
                    <div className="meta">Evidence: {expl.component.evidence.map((f) => <code key={f}>{f}</code>).reduce((a: React.ReactNode[], c, i) => (i ? [...a, " ", c] : [c]), [])} · cost {money(expl.usd)}</div>
                  </>
                )}
                <div className="actions">
                  <button className="btn solid" disabled={!picked} onClick={() => followUp({ focus: picked })}>Render a 20 s deep dive on this box</button>
                </div>
              </div>
            )}

            {map && (
              <div className="actions">
                <button className="btn" onClick={() => followUp({ whatIf: "10x" })}>What if 10x traffic?</button>
                <button className="btn" onClick={() => followUp({ whatIf: "100x" })}>What if 100x?</button>
              </div>
            )}
            {follow.length > 0 && <div className="follow">{follow.map((id) => <FollowUp key={id} id={id} />)}</div>}

            <div className="excal">
              <b>Keep drawing in tldraw</b>
              <ol>
                <li>Click <i>Open in tldraw</i> above to download the <code>.tldr</code> file.</li>
                <li>Go to <a href="https://www.tldraw.com" target="_blank" rel="noreferrer">tldraw.com</a> and sign in (free). Open the account menu and choose <i>Import file…</i>, or drag the file onto the page.</li>
                <li>Every box, arrow and label is a normal tldraw shape. Arrows stay tied to their boxes when you move them.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      <div className="how">
        <div><b>Grounded</b>Every box on the board points at real files. A second Muse Spark pass checks each one against the code.</div>
        <div><b>Interactive</b>Tap a box to ask about it, render a deep dive on it, or ask what breaks at 10x traffic.</div>
        <div><b>Yours to edit</b>Open the .tldr in tldraw.com and keep drawing. Open source, MIT.</div>
      </div>
      <footer>Powered by Meta Muse models · voice by Deepgram · drawn with rough.js, perfect-freehand and Shantell Sans</footer>
    </main>
  );
}
