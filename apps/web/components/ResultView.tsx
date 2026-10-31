"use client";
import Player, { type Interactive } from "./Player";
import { fileUrl, money, secs, useJob, type Explain, type Job } from "../lib/client";
import { Info } from "./Icons";

/** One follow-up clip in the side list: progress while it draws, then a still you can open. */
function Clip({ id }: { id: string }) {
  const job = useJob(id);
  if (!job) return null;
  const what = job.kind === "focus" ? `Deep dive: ${job.focus}` : `What if ${job.whatIf} traffic?`;
  const mp4 = job.outputs?.mp4;
  return (
    <div className="clip">
      <a className="screen" href={job.state === "done" ? fileUrl(id, mp4) : undefined} target="_blank" rel="noreferrer" aria-label={`Play ${what}`}>
        {job.state === "done" && mp4 && <video src={`${fileUrl(id, mp4)}#t=4`} preload="metadata" muted playsInline tabIndex={-1} />}
        {job.state === "running" && <span className="mini"><span className="bar"><i style={{ width: `${Math.max(4, job.pct)}%` }} /></span></span>}
      </a>
      <div>
        <b>{what}</b>
        {job.state === "running" && <span>{job.message} · {money(job.usd?.total)}</span>}
        {job.state === "error" && <span className="err">Failed: {job.error}</span>}
        {job.state === "done" && <span>{secs(job.durationSec)} · cost {money(job.costUsd)} · <a href={fileUrl(id, mp4, true)}>download</a></span>}
      </div>
    </div>
  );
}

type Props = {
  job: Job; map?: Interactive; picked?: string; expl: Explain | null; explBusy: boolean; clips: string[];
  pick: (id: string) => void; followUp: (b: { focus?: string; whatIf?: string }) => void; err: string;
};

export default function ResultView({ job, map, picked, expl, explBusy, clips, pick, followUp, err }: Props) {
  const o = job.outputs ?? {};
  const names = Object.fromEntries((map?.nodes ?? []).map((n) => [n.id, n.keyword]));
  const side = !!map;
  return (
    <div className={`main ${side ? "" : "solo"}`}>
      <div className="col">
        {o.mp4 && <Player src={fileUrl(job.id, o.mp4)} map={map} selected={picked} onPick={pick} />}
        <div className="under">
          <div>
            <div className="t">{job.title}</div>
            <div className="m muted">{secs(job.durationSec)}{job.costUsd ? <> · model {money(job.usd?.meta)} + voice {money(job.usd?.voice)} = {money(job.costUsd)}</> : null}</div>
          </div>
          <div className="dl">
            {o.mp4 && <a className="btn solid" href={fileUrl(job.id, o.mp4, true)}>Download mp4</a>}
            {o.tldr && <a className="btn" href={fileUrl(job.id, o.tldr, true)}>Download .tldr</a>}
            {o.contactSheet && <a className="btn" href={fileUrl(job.id, o.contactSheet)} target="_blank" rel="noreferrer">Contact sheet</a>}
          </div>
        </div>
        {map && <div className="tip"><Info />Tap any box on the diagram to ask Muse Spark what it does. The answer only cites files that box was built from.</div>}
        {err && <div className="err" role="alert">{err}</div>}
        {o.tldr && (
          <div className="excal"><b>Keep drawing at tldraw.com</b><ol>
            <li>Click <i>Download .tldr</i> above to save the board file.</li>
            <li>Go to <a href="https://www.tldraw.com" target="_blank" rel="noreferrer">tldraw.com</a>, sign in (free), open the account menu and choose <i>Import file</i>, or just drag the file onto the canvas.</li>
            <li>Every box, arrow and label is a normal shape, so you can move, restyle or add to it.</li>
          </ol></div>
        )}
      </div>

      {side && (
        <aside className="side split">
          <div className="sec">
            {!picked && (
              <>
                <h3>Tap a box to ask about it</h3>
                <div className="boxes">{map!.nodes.map((n) => <button key={n.id} type="button" className="chip" onClick={() => pick(n.id)}>{n.keyword}</button>)}</div>
              </>
            )}
            {picked && (
              <>
                <h3>{expl?.component.name ?? names[picked] ?? picked}</h3>
                <span className="kw">{names[picked] ?? expl?.component.keyword}</span>
                {explBusy && <p className="sum muted">Reading the files behind this box…</p>}
                {expl && (
                  <>
                    <p className="sum">{expl.summary}</p>
                    <ul className="pts">{expl.points.map((p, i) => <li key={i}>{p.text}<br /><code>{p.file}</code></li>)}</ul>
                    <div className="ev">Evidence: {expl.component.evidence.map((f) => <code key={f}>{f}</code>)}<span>· cost {money(expl.usd)}</span></div>
                  </>
                )}
                <button type="button" className="btn solid wide" disabled={explBusy} onClick={() => followUp({ focus: picked })}>Render a 20 s deep dive on this box</button>
              </>
            )}
          </div>
          <div className="sec"><div className="row2">
            <button type="button" className="btn" onClick={() => followUp({ whatIf: "10x" })}>What if 10x traffic?</button>
            <button type="button" className="btn" onClick={() => followUp({ whatIf: "100x" })}>What if 100x?</button>
          </div></div>
          {clips.length > 0 && <div className="sec">{clips.map((id) => <Clip key={id} id={id} />)}</div>}
        </aside>
      )}
    </div>
  );
}
