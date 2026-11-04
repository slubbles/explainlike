import { z } from "zod";
import { isAnatomyQuestion } from "./intent.js";
import type { SourceKind } from "./schemas.js";

/**
 * The explainer brief: Muse Spark reads the source first and decides how to explain it
 * (approach, depth, tempo, look). There are no user-facing levels or themes; everything
 * below is derived from the brief so the rest of the engine stays deterministic.
 *
 * Approaches come from common explainer practice (Mayer's multimedia principles, worked
 * examples, analogy-led teaching): pick one spine and keep it for the whole video.
 */
export const APPROACHES = {
  analogy:
    "one everyday analogy carried through the whole video, drawn from the world the project serves; name the real part right after its analogy",
  story: "follow one character or one piece of data on its journey; each scene is the next thing that happens to it",
  "step-by-step": "a worked example: one concrete input traced step by step, each step named before it is shown",
  "build-up": "start from the smallest thing that works and add one part per scene, saying what problem each new part solves",
  compare: "contrast the naive way with the way this project does it, then show why the difference matters",
  "problem-solution": "open with the pain, then each scene removes one part of it",
} as const;
export type Approach = keyof typeof APPROACHES;
const APPROACH_IDS = Object.keys(APPROACHES) as [Approach, ...Approach[]];

/** Extra whiteboard list scenes the brief can ask for (deep or technical topics). */
export const NOTE_LIBRARY = {
  requirements: {
    after: "hook",
    brief:
      "4 to 6 requirements this system meets, read from what the code does. Functional ones (what a user can do) in blue, non-functional ones (latency, availability, durability, privacy) in orange. target empty. No numbers. evidence: one file path that shows it.",
  },
  "back of envelope": {
    after: "walkthrough",
    brief:
      "a capacity estimate for a HYPOTHETICAL load, the way an engineer would sketch it. 3 to 5 items such as 'assume 50k daily users', '~2 reads per second avg', '10x at peak'. Every number is an assumption: estimate=true, evidence empty, color orange (red for the number that hurts). The narration must start with 'Let's assume' and must say these are estimates, not measurements of the real app.",
  },
  "trade-offs": {
    after: "scale",
    brief:
      "3 or 4 trade-offs this design makes, each about one component (target = its id): what it buys and what it costs, e.g. 'sqlite: simple, single writer'. green for the win side, red for the cost side. evidence: one file path.",
  },
  "failure modes": {
    after: "walkthrough",
    brief:
      "3 or 4 ways this system fails in production, each about one component (target = its id): what breaks, and the blast radius. red. Grounded in what the code does (timeouts, retries, single instance, no idempotency...). evidence: one file path.",
  },
} as const;
export type NoteKind = keyof typeof NOTE_LIBRARY;
const NOTE_IDS = Object.keys(NOTE_LIBRARY) as [NoteKind, ...NoteKind[]];

export const LOOKS = {
  "pen-light": "light paper with marker-pen lines and a friendly hand font; good default for most topics",
  "whiteboard-light": "light whiteboard with sketchy pencil lines; suits stories and conceptual ideas",
  "chalk-dark": "dark chalkboard; suits deep infrastructure and low-level systems topics",
} as const;
export type Look = keyof typeof LOOKS;

/** How the video shows things: the hand-drawn board, or that board with news-explainer cut-ins. */
export const STYLES = {
  whiteboard: "diagrams drawn on the board; right for systems, code, processes and how-things-work ideas",
  explainer:
    "the same board plus news-explainer cut-ins (a chart of numbers the sources state, a timeline of their dates, a map of the places they name, highlighted source quotes); right when the core is a trend, a comparison or a history",
} as const;
export type Style = keyof typeof STYLES;
const LOOK_IDS = Object.keys(LOOKS) as [Look, ...Look[]];

export const Brief = z.object({
  topic: z.string().describe("what this source is, in one plain sentence"),
  complexity: z.enum(["simple", "moderate", "technical"]).describe("how hard the core idea is for a developer new to it"),
  audience: z.string().describe("who will get the most from this video, e.g. 'a developer new to agent frameworks'"),
  depth: z
    .enum(["overview", "working", "deep"])
    .describe("overview: the big idea only; working: enough to start contributing; deep: internals and trade-offs"),
  approach: z.enum(APPROACH_IDS),
  analogy: z
    .string()
    .describe(
      "one everyday analogy for the whole system, drawn from the world this project serves, used in the hook and on the journey; empty only when the approach does not use one (problem-solution, compare)",
    ),
  why: z.string().describe("one sentence: why this approach and depth fit this source"),
  look: z.enum(LOOK_IDS),
  style: z.enum(Object.keys(STYLES) as [Style, ...Style[]]),
  extras: z.array(z.enum(NOTE_IDS)).describe("0 or 1 extra list scene, only when the topic truly needs it; usually empty"),
});
export type Brief = z.infer<typeof Brief>;

/** What the viewer said they want (from the voice chat or the CLI): it steers the brief and the script. */
export interface Ask {
  /** what they want to understand, in their words */
  goal?: string;
  /** who the video is for, e.g. "my non-technical cofounder" */
  audience?: string;
  depth?: Brief["depth"];
  /** anything else they asked to have covered */
  also?: string;
  /** explicit format override (--format, MCP/web); anatomy only applies to repos */
  format?: ExplainFormat;
}

export const NotesSlot = z.object({ after: z.enum(["hook", "walkthrough", "scale"]), heading: z.string(), brief: z.string() });
export type NotesSlot = z.infer<typeof NotesSlot>;

/**
 * Tempo, set by complexity. Numbers are grounded in measured explainer pacing: narrated
 * documentary channels hold a median shot of 4.1 to 5.0 s (13 to 15 picture changes a minute),
 * YouTube tutorials 4 to 8 s (7.5 to 15 a minute), and Mayer's segmenting principle says
 * complex material needs more time per step. A beat never drops below 4 s, so every shot can be read.
 */
export const TEMPOS = {
  brisk: { minBeat: 4.0, maxCutsPerMin: 15, move: 0.9, tail: 0.6, wps: 2.7 },
  steady: { minBeat: 4.0, maxCutsPerMin: 13, move: 1.1, tail: 0.8, wps: 2.6 },
  slow: { minBeat: 4.8, maxCutsPerMin: 11, move: 1.4, tail: 1.1, wps: 2.45 },
} as const;
export type TempoId = keyof typeof TEMPOS;
export type Tempo = { id: TempoId; minBeat: number; maxCutsPerMin: number; move: number; tail: number; wps: number };
export const MIN_CUTS_PER_MIN = 8;
export const tempoOf = (id: TempoId): Tempo => ({ id, ...TEMPOS[id] });

/**
 * The three explanation formats. Short covers one idea in four beats; deep covers a repo or a piece of
 * code in six; anatomy tours a repo's parts layer by layer in six, anchored on one traced request.
 * A longer video adds beats, never just runtime: a repo that cannot fit its code trace
 * in 60 seconds is deep, not a slower short.
 */
export type ExplainFormat = "short" | "deep" | "anatomy";
export interface FormatBeat {
  id: string;
  label: string;
  /** short beats carry a time budget; deep beats fill the format's range together */
  seconds?: [number, number];
}
export interface FormatSpec {
  seconds: [number, number];
  beats: FormatBeat[];
  /** visual reasoning moments the format needs (one mechanism drawing plus evidence) */
  visuals: number;
}
export const FORMATS: Record<ExplainFormat, FormatSpec> = {
  short: {
    seconds: [45, 60],
    visuals: 2,
    beats: [
      { id: "hook", label: "hook and stakes", seconds: [5, 8] },
      { id: "mechanism", label: "core mechanism", seconds: [20, 25] },
      { id: "evidence", label: "failure case or concrete example", seconds: [10, 15] },
      { id: "payoff", label: "payoff", seconds: [5, 8] },
    ],
  },
  deep: {
    seconds: [90, 120],
    visuals: 3,
    beats: [
      { id: "problem", label: "problem" },
      { id: "model", label: "mental model" },
      { id: "mechanism", label: "mechanism" },
      { id: "trace", label: "code trace or worked example" },
      { id: "failure", label: "failure case or tradeoff" },
      { id: "payoff", label: "payoff" },
    ],
  },
  anatomy: {
    seconds: [90, 150],
    visuals: 4,
    beats: [
      { id: "hook", label: "hook question" },
      { id: "entry", label: "entry point: where one request comes in" },
      { id: "tour", label: "the parts in turn: what each owns, hands on, and why" },
      { id: "trace", label: "one request traced end to end through real files and symbols" },
      { id: "map", label: "the whole map lit up along the traced path" },
      { id: "payoff", label: "payoff" },
    ],
  },
};

/** Repos are deep, or anatomy when the viewer asked for a tour; anything else follows the brief's depth. */
export function formatFor(kind: SourceKind | undefined, depth: Brief["depth"], goal?: string): ExplainFormat {
  if (kind === "repo" && goal && isAnatomyQuestion(goal)) return "anatomy";
  if (kind === "repo") return "deep";
  return depth === "overview" ? "short" : "deep";
}

/** Everything the planner and renderer need, derived from a brief. */
export interface ExplainSpec {
  format: ExplainFormat;
  brief: Brief;
  audience: string;
  minComponents: number;
  maxComponents: number;
  perScene: number;
  scaleItems: number;
  scaleAt: ("10x" | "100x")[];
  wordsPerScene: number;
  voice: string;
  notes: NotesSlot[];
  tempo: Tempo;
  look: Look;
  style: Style;
}

const DEPTH = {
  // the core flow is the video; depth only buys a short extra beat or two after it (docs/explaining-playbook.md)
  overview: { minComponents: 4, maxComponents: 6, perScene: 2, scaleItems: 0, scaleAt: ["10x"], wordsPerScene: 26, extras: 0 },
  working: { minComponents: 5, maxComponents: 8, perScene: 2, scaleItems: 1, scaleAt: ["10x"], wordsPerScene: 30, extras: 0 },
  deep: { minComponents: 6, maxComponents: 10, perScene: 3, scaleItems: 1, scaleAt: ["10x"], wordsPerScene: 32, extras: 1 },
} as const;

export function specFromBrief(b: Brief, ask?: Ask, kind?: SourceKind): ExplainSpec {
  const d = DEPTH[b.depth];
  const tempoId: TempoId = b.complexity === "technical" ? "slow" : b.complexity === "simple" ? "brisk" : "steady";
  // technical topics add fewer boxes per beat so each one gets time on screen
  const perScene = tempoId === "slow" ? Math.min(d.perScene, 2) : d.perScene;
  const notes = [...new Set(b.extras)]
    .slice(0, d.extras)
    .map((k) => ({ after: NOTE_LIBRARY[k].after, heading: k, brief: NOTE_LIBRARY[k].brief }));
  const voice = [
    `Explain to ${b.audience}.`,
    `Approach: ${b.approach}: ${APPROACHES[b.approach]}.`,
    b.analogy
      ? `The everyday analogy: ${b.analogy}. Use it in the hook and give each part on the journey its role in it, then say the real name.`
      : "",
    ask?.goal ? `The viewer asked to understand: ${ask.goal}. The video must answer that.` : "",
    ask?.also ? `They also asked to cover: ${ask.also}. Fit it into the story where it belongs.` : "",
    tempoId === "slow"
      ? "This is technical: one idea per sentence, name each thing before using it, no stacked jargon."
      : tempoId === "brisk"
        ? "This is simple: keep it light and quick, lean on the analogy."
        : "",
  ]
    .filter(Boolean)
    .join(" ");
  // an explicit format wins, except anatomy off a repo (it needs the map to tour)
  const format = ask?.format && (ask.format !== "anatomy" || kind === "repo") ? ask.format : formatFor(kind, b.depth, ask?.goal);
  return {
    format,
    brief: b,
    audience: b.audience,
    minComponents: d.minComponents,
    maxComponents: d.maxComponents,
    perScene,
    scaleItems: d.scaleItems,
    scaleAt: [...d.scaleAt],
    wordsPerScene: d.wordsPerScene,
    voice,
    notes,
    tempo: tempoOf(tempoId),
    look: b.look,
    // briefs saved before styles existed are whiteboard videos
    style: b.style ?? "whiteboard",
  };
}

/**
 * Video length follows what has to be covered, not a fixed range: a hook, a beat per box,
 * a hop per walkthrough step, the scale risks, list scenes and a recap, at this tempo.
 */
export function coverageSeconds(
  spec: ExplainSpec,
  c: { components: number; steps: number; scale: number; boards?: number },
): [number, number] {
  const perBox = spec.tempo.id === "slow" ? 7 : spec.tempo.id === "brisk" ? 5 : 6;
  // the core flow is told as a story, so each hop of the walk gets a full sentence
  const base = 9 + c.components * perBox + c.steps * 5 + c.scale * 13 + spec.notes.length * 15 + (c.boards ?? 0) * 14 + 9;
  const mid = Math.max(40, Math.min(240, base));
  return [Math.round(mid * 0.85), Math.round(mid * 1.15)];
}

/** Used when no model call is possible (tests, silent dry runs). */
export const DEFAULT_BRIEF: Brief = {
  topic: "a software project",
  complexity: "moderate",
  audience: "a developer new to this codebase",
  depth: "working",
  approach: "build-up",
  analogy: "",
  why: "default",
  look: "pen-light",
  style: "whiteboard",
  extras: [],
};
