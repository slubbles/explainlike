"use client";
import { useState } from "react";
import Player, { type Interactive } from "./Player";
import { fileUrl, money, secs, useJob, type Explain, type Job } from "../lib/client";
import { Info } from "./Icons";
import { cap } from "../lib/steps";
import { noBoxesNote } from "../lib/form";

/** The answer's opening sentence, so the cited points lead. */
function firstSentence(s: string) {
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : s;
}

/** One follow-up clip in the side list: progress while it draws, then a still you can open. */
function Clip({ id }: { id: string }) {
  const { job } = useJob(id);
  if (!job) return null;
  const what = job.kind === "focus" ? `Deep dive: ${job.focus}` : `What if ${job.whatIf} traffic?`;
  const mp4 = job.outputs?.mp4;
  // a done clip without an mp4 has nowhere to go: a plain still, never a dead link
  const href = job.state === "done" && mp4 ? fileUrl(id, mp4) : undefined;
  const still = (
    <>
      {job.state === "done" && mp4 && (
        <video src={`${fileUrl(id, mp4)}#t=4`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />
      )}
      {job.state === "running" && (
        <span className="mini">
          <span className="bar">
            <i style={{ width: `${Math.max(4, job.pct)}%` }} />
          </span>
        </span>
      )}
    </>
  );
  return (
    <div className="clip">
      {href ? (
        <a className="screen" href={href} target="_blank" rel="noreferrer" aria-label={`Play ${what}`}>
          {still}
        </a>
      ) : (
        <span className="screen" aria-hidden="true">
          {still}
        </span>
      )}
      <div>
        <b>{what}</b>
        {job.state === "running" && <span>{cap(job.message)}</span>}
        {job.state === "error" && <span className="err">Failed: {job.error}</span>}
        {job.state === "done" && (
          <span>
            {secs(job.durationSec)}
            {mp4 && (
              <>
                {" · "}
                <a href={fileUrl(id, mp4, true)}>download</a>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

type Props = {
  job: Job;
  map?: Interactive;
  picked?: string;
  expl: Explain | null;
  explBusy: boolean;
  clips: string[];
  pick: (id: string) => void;
  followUp: (b: { focus?: string; whatIf?: string }) => void;
  followBusy: boolean;
  err: string;
};

export default function ResultView({ job, map, picked, expl, explBusy, clips, pick, followUp, followBusy, err }: Props) {
  const o = job.outputs ?? {};
  const names = Object.fromEntries((map?.nodes ?? []).map((n) => [n.id, n.keyword]));
  const side = !!map;
  // a follow-up renders a new paid clip, so each button asks once first, like cancel does
  const [asking, setAsking] = useState<{ focus?: string; whatIf?: string; label: string } | null>(null);
  const confirm = asking && (
    <div className="confirm" role="group" aria-label={`Render ${asking.label}?`}>
      <p>{asking.label} is a new paid clip. Render it?</p>
      <div className="row2">
        <button
          type="button"
          className="btn solid"
          disabled={followBusy}
          onClick={() => {
            followUp({ focus: asking.focus, whatIf: asking.whatIf });
            setAsking(null);
          }}
        >
          {followBusy ? "Starting…" : "Yes, render it"}
        </button>
        <button type="button" className="btn" disabled={followBusy} onClick={() => setAsking(null)} autoFocus>
          Not now
        </button>
      </div>
    </div>
  );
  return (
    <div className={`main ${side ? "" : "solo"}`}>
      <div className="col">
        <div className="under">
          <h1 className="t">{job.title}</h1>
          <div className="m muted">
            {secs(job.durationSec)}
            {job.costUsd ? ` · cost ${money(job.costUsd)}` : null}
          </div>
        </div>
        {o.mp4 && <Player src={fileUrl(job.id, o.mp4)} map={map} selected={picked} onPick={pick} title={job.title} />}
        <div className="dl">
          {o.mp4 && (
            <a className="btn solid" href={fileUrl(job.id, o.mp4, true)}>
              Download mp4
            </a>
          )}
          {o.tldr && (
            <a className="btn" href={fileUrl(job.id, o.tldr, true)}>
              Download .tldr
            </a>
          )}
          {o.excalidraw && (
            <a className="btn" href={fileUrl(job.id, o.excalidraw, true)}>
              Download .excalidraw
            </a>
          )}
          {o.contactSheet && (
            <a className="link" href={fileUrl(job.id, o.contactSheet)} target="_blank" rel="noreferrer">
              Contact sheet
            </a>
          )}
        </div>
        {o.tldr && (
          <div className="note">
            Keep drawing at{" "}
            <a href="https://www.tldraw.com" target="_blank" rel="noreferrer">
              tldraw.com
            </a>
            : open the site and drag the .tldr file onto the canvas, or open the .excalidraw at{" "}
            <a href="https://excalidraw.com" target="_blank" rel="noreferrer">
              excalidraw.com
            </a>
            .
          </div>
        )}
        {!job.interactive && job.kind === "video" && (
          <div className="tip" data-testid="no-boxes">
            <Info />
            {noBoxesNote(job.input)}
          </div>
        )}
        {map && (
          <div className="tip">
            <Info />
            Tap any box on the diagram to ask Muse Spark what it does. The answer only cites files that box was built from.
          </div>
        )}
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
      </div>

      {side && (
        <aside className="side split">
          <div className="sec">
            {!picked && (
              <>
                <h3>Tap a box to ask about it</h3>
                <div className="boxes">
                  {map!.nodes.map((n) => (
                    <button key={n.id} type="button" className="chip" onClick={() => pick(n.id)}>
                      {n.keyword}
                    </button>
                  ))}
                </div>
              </>
            )}
            {picked && (
              <>
                <h3>{expl?.component.name ?? names[picked] ?? picked}</h3>
                <span className="kw">{names[picked] ?? expl?.component.keyword}</span>
                {explBusy && <p className="busy">Reading the files behind this box…</p>}
                {expl && (
                  <>
                    <p className="sum">{firstSentence(expl.summary)}</p>
                    <ul className="pts">
                      {expl.points.map((p, i) => (
                        <li key={i}>
                          {p.text}
                          <br />
                          <code>{p.file}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {asking?.focus === picked ? (
                  confirm
                ) : (
                  <button
                    type="button"
                    className="btn wide"
                    disabled={explBusy || followBusy}
                    onClick={() => setAsking({ focus: picked, label: "A deep dive on this box" })}
                  >
                    Render a 20 s deep dive on this box
                  </button>
                )}
              </>
            )}
          </div>
          <div className="sec">
            {asking?.whatIf ? (
              confirm
            ) : (
              <div className="row2">
                <button
                  type="button"
                  className="btn"
                  disabled={followBusy}
                  onClick={() => setAsking({ whatIf: "10x", label: "A 10x what-if" })}
                >
                  What if 10x traffic?
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={followBusy}
                  onClick={() => setAsking({ whatIf: "100x", label: "A 100x what-if" })}
                >
                  What if 100x?
                </button>
              </div>
            )}
          </div>
          {clips.length > 0 && (
            <div className="sec">
              {clips.map((id) => (
                <Clip key={id} id={id} />
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
