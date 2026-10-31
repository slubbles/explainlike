"use client";
import { useEffect, useRef, useState } from "react";

type Job = { id: string; state: "running" | "done" | "error"; message: string; pct: number; error?: string; title?: string; durationSec?: number; costUsd?: number; outputs?: { mp4?: string; excalidraw?: string; contactSheet?: string } };

const LEVELS = [
  { id: "five", label: "I'm 5" },
  { id: "new", label: "I'm new" },
  { id: "interviewing", label: "I'm interviewing" },
  { id: "senior", label: "I'm senior" },
];
const EXAMPLES = ["https://github.com/umami-software/umami", "https://blog.vllm.ai/2023/06/20/vllm.html"];

export default function Home() {
  const [input, setInput] = useState("");
  const [level, setLevel] = useState("new");
  const [voice, setVoice] = useState("deepgram");
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function go() {
    setErr(""); setJob(null);
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, level, voice }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "something went wrong");
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const s: Job = await (await fetch(`/api/jobs/${j.id}`)).json();
      setJob(s);
      if (s.state !== "running" && timer.current) clearInterval(timer.current);
    }, 1000);
  }

  const busy = job?.state === "running";
  const file = (n?: string, dl = false) => (job && n ? `/api/jobs/${job.id}/file/${n}${dl ? "?download" : ""}` : "#");

  return (
    <main className="wrap">
      <div className="top">
        <a className="brand" href="/">metual<b>.</b></a>
        <a className="gh" href="https://github.com/slubbles/metual">GitHub</a>
      </div>
      <h1>Any repo, post or article,<br />explained on a <em>whiteboard</em>.</h1>
      <p className="lede">Paste a link. Metual reads the code or the text, draws the system piece by piece, walks one real request through it, and narrates it at your level. You get an mp4 and an editable Excalidraw file.</p>

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
        <div className="examples">Try:{EXAMPLES.map((x) => <button key={x} onClick={() => setInput(x)}>{x.replace(/^https?:\/\//, "")}</button>)}</div>

        {err && <div className="err">{err}</div>}
        {job && job.state === "running" && (
          <div className="prog"><div className="bar"><i style={{ width: `${Math.max(3, job.pct)}%` }} /></div><div className="msg">{job.message}</div></div>
        )}
        {job?.state === "error" && <div className="err">Failed: {job.error}</div>}
        {job?.state === "done" && job.outputs && (
          <div className="result">
            <video src={file(job.outputs.mp4)} controls autoPlay playsInline />
            <div className="dl">
              <a className="primary" href={file(job.outputs.mp4, true)}>Download mp4</a>
              <a href={file(job.outputs.excalidraw, true)}>Download .excalidraw</a>
              <a href={file(job.outputs.contactSheet)} target="_blank">Contact sheet</a>
            </div>
            <div className="meta">{job.title} · {job.durationSec?.toFixed(0)} s · model and voice cost ${job.costUsd?.toFixed(3)}</div>
          </div>
        )}
      </div>

      <div className="how">
        <div><b>Grounded</b>Every box on the board points at real files. A second Muse Spark pass checks each one against the code.</div>
        <div><b>One canvas</b>The system grows layer by layer, then a dot carries one request through and red circles show what breaks at 10x.</div>
        <div><b>Yours to edit</b>Open the .excalidraw in excalidraw.com and keep drawing. Open source, MIT.</div>
      </div>
      <footer>Powered by Meta Muse models · voice by Deepgram · drawn with rough.js and Excalifont</footer>
    </main>
  );
}
