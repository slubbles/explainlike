"use client";
import { useState } from "react";
import { money, type Job } from "../lib/client";
import { cap, stepsFor, stepStates } from "../lib/steps";
import { Check } from "./Icons";

/**
 * The side card while a job draws: the one progress readout (percent and steps) and the money spent so far.
 * The person who started it also gets Cancel, which asks once before it stops the render.
 */
export default function Steps({ job, onCancel }: { job: Job; onCancel?: () => Promise<void> }) {
  const steps = stepsFor(job);
  // a cancelled run did not fail: the step it stopped on just stays undone
  const states = stepStates(steps, job.stage, job.state).map((s) => (job.cancelled && s === "fail" ? "todo" : s));
  const failed = job.state === "error" && !job.cancelled;
  const [asking, setAsking] = useState(false);
  const [stopping, setStopping] = useState(false);
  const canCancel = !!onCancel && job.mine && job.state === "running";
  return (
    <aside className="side">
      <div className="pct">
        <h3>{job.cancelled ? "Cancelled" : failed ? "Failed" : job.state === "done" ? "Done" : "Drawing…"}</h3>
        <b>{Math.round(job.pct)}%</b>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.pct)}
      >
        <i style={{ width: `${Math.max(2, job.pct)}%` }} />
      </div>
      <p className="sr" aria-live="polite">
        {failed ? "" : cap(job.message || "")}
      </p>
      <ul className="steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.stage} className={states[i]}>
            <span className="d" aria-hidden="true">
              {states[i] === "ok" && <Check />}
            </span>
            <span className="sr">{states[i] === "ok" ? "done: " : states[i] === "now" ? "now: " : ""}</span>
            {cap(states[i] === "now" && job.message && job.message !== "starting" ? job.message : s.label)}
          </li>
        ))}
      </ul>
      {failed && (
        <div className="err" role="alert">
          Failed: {job.error}
        </div>
      )}
      {job.cancelled && (
        <p className="note" role="status">
          {job.error}
        </p>
      )}
      {canCancel && !asking && (
        <button type="button" className="btn wide stop" onClick={() => setAsking(true)}>
          Cancel this video
        </button>
      )}
      {canCancel && asking && (
        <div className="confirm" role="group" aria-label="Cancel this video?">
          <p>Stop drawing? The {money(job.usd?.total)} spent so far is not refunded, and the video is not finished.</p>
          <div className="row2">
            <button
              type="button"
              className="btn stop"
              disabled={stopping}
              onClick={async () => {
                setStopping(true);
                await onCancel!();
                // stays "Stopping…" until the poll brings the cancelled job; on an error the page says why
                setTimeout(() => setStopping(false), 3000);
              }}
            >
              {stopping ? "Stopping…" : "Yes, stop it"}
            </button>
            <button type="button" className="btn" disabled={stopping} onClick={() => setAsking(false)} autoFocus>
              Keep drawing
            </button>
          </div>
        </div>
      )}
      <div className="cost">
        <span>spent so far</span>
        <b>{money(job.usd?.total)}</b>
      </div>
    </aside>
  );
}
