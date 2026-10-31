import { money, type Job } from "../lib/client";
import { stepsFor, stepStates } from "../lib/steps";
import { Check } from "./Icons";

/** The side card while a job draws: percent, the pipeline steps, and the money spent so far. */
export default function Steps({ job }: { job: Job }) {
  const steps = stepsFor(job);
  const states = stepStates(steps, job.stage, job.state);
  const failed = job.state === "error";
  return (
    <aside className="side">
      <div className="pct"><h3>{failed ? "Failed" : "Drawing…"}</h3><b>{Math.round(job.pct)}%</b></div>
      <div className="bar" style={{ marginTop: 12 }}><i style={{ width: `${Math.max(2, job.pct)}%` }} className={failed ? "fail" : ""} /></div>
      <ul className="steps">
        {steps.map((s, i) => (
          <li key={s.stage} className={states[i]}>
            <span className="d">{states[i] === "ok" && <Check />}</span>
            {states[i] === "now" && job.message && job.message !== "starting" ? job.message : s.label}
          </li>
        ))}
      </ul>
      {failed && <div className="err" role="alert">Failed: {job.error}</div>}
      <div className="cost"><span>spent so far</span><b>{money(job.usd?.total)}</b></div>
    </aside>
  );
}
