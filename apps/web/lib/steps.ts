import { sourceKind } from "./form";

/** One line of the progress list: the pipeline stage it stands for and what it says while waiting. */
export type Step = { stage: string; label: string };
export type StepState = "ok" | "now" | "todo" | "fail";

const TAIL = (voice: string): Step[] => [
  { stage: "voice", label: voice === "silent" ? "no voice: timing captions at speaking pace" : "recording the voiceover (Deepgram Aura)" },
  { stage: "compose", label: "laying out the canvas" },
  { stage: "render", label: "drawing frames" },
  { stage: "encode", label: "encoding the mp4" },
];
const QA: Step = { stage: "qa", label: "Muse Transcribe is checking the voiceover" };

/** The steps a job goes through, in order, using the same words the pipeline reports. */
export function stepsFor(job: { kind: string; input: string; voice: string; focus?: string; whatIf?: string }): Step[] {
  if (job.kind === "focus" || job.kind === "what-if") {
    // follow-up clips reuse the first run's map and skip the voiceover check
    const plan = job.kind === "focus" ? `planning a deep dive on ${job.focus ?? "this box"}` : `what breaks at ${job.whatIf ?? "10x"}?`;
    return [{ stage: "ingest", label: "reading the repository" }, { stage: "plan", label: plan }, ...TAIL(job.voice)];
  }
  const qa = job.voice === "silent" ? [] : [QA];
  // the brief comes right after reading: it picks the approach, depth and tempo before anything is mapped or planned
  const brief: Step = { stage: "brief", label: "deciding how to explain it" };
  if (sourceKind(job.input) === "repo") return [
    { stage: "ingest", label: "reading the repository" }, brief,
    { stage: "architecture", label: "Muse Spark is mapping the architecture" },
    { stage: "review", label: "second pass: checking every box against the code" },
    { stage: "plan", label: "writing the scene plan" },
    ...TAIL(job.voice), ...qa,
  ];
  return [
    { stage: "ingest", label: { "X post": "reading the post", topic: "finding reputable sources on the topic" }[sourceKind(job.input) as string] ?? "reading the article" },
    brief,
    { stage: "plan", label: "Muse Spark is planning the explainer" },
    ...TAIL(job.voice), ...qa,
  ];
}

/** Where each step stands, given the stage the job last reported. Steps before it are done; a failed job marks its stage as failed. */
export function stepStates(steps: Step[], stage: string, state: "running" | "done" | "error"): StepState[] {
  if (state === "done") return steps.map(() => "ok");
  const at = Math.max(0, steps.findIndex((s) => s.stage === stage));
  return steps.map((_, i) => (i < at ? "ok" : i > at ? "todo" : state === "error" ? "fail" : "now"));
}

/** A step label as the page shows it: first letter capitalized. */
export function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
