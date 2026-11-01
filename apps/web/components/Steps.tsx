import { money, type Job } from "../lib/client";
import { cap, stepsFor, stepStates } from "../lib/steps";
import { Check } from "./Icons";

/** The side card while a job draws: the one progress readout (percent and steps) and the money spent so far. */
export default function Steps({ job }: { job: Job }) {
  const steps = stepsFor(job);
  const states = stepStates(steps, job.stage, job.state);
  const failed = job.state === "error";
  return (
    <aside className="side">
      <div className="pct"><h3>{failed ? "Failed" : job.state === "done" ? "Done" : "Drawing…"}</h3><b>{Math.round(job.pct)}%</b></div>
      <div className="track" role="progressbar" aria-label="Video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.pct)}><i style={{ width: `${Math.max(2, job.pct)}%` }} /></div>
      <p className="sr" aria-live="polite">{failed ? "" : cap(job.message || "")}</p>
      <ul className="steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.stage} className={states[i]}>
            <span className="d" aria-hidden="true">{states[i] === "ok" && <Check />}</span><span className="sr">{states[i] === "ok" ? "done: " : states[i] === "now" ? "now: " : ""}</span>
            {cap(states[i] === "now" && job.message && job.message !== "starting" ? job.message : s.label)}
          </li>
        ))}
      </ul>
      {failed && <div className="err" role="alert">Failed: {job.error}</div>}
      <div className="cost"><span>spent so far</span><b>{money(job.usd?.total)}</b></div>
    </aside>
  );
}
