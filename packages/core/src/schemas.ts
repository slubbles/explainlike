import { z } from "zod";

/** Semantic colors. The meaning is part of the contract, not decoration. */
export const Color = z.enum(["white", "red", "orange", "yellow", "green", "blue", "purple", "teal", "pink", "gray"]);
export type Color = z.infer<typeof Color>;
export const COLOR_MEANING: Record<Color, string> = {
  white: "neutral",
  red: "problem, cost, bottleneck",
  orange: "highlight, attention",
  yellow: "the moving request / key idea",
  green: "fix, win, benefit",
  blue: "entity, user, client",
  purple: "compute, backend",
  teal: "storage",
  pink: "cache",
  gray: "third party, ops",
};

export const SourceKind = z.enum(["repo", "x-post", "article", "topic"]);
export type SourceKind = z.infer<typeof SourceKind>;

const keyword = z.string().describe("1 to 3 lowercase words for the whiteboard");

// ---------------------------------------------------------------------------
// Architecture model (repos). Every component and connection must cite files.
// ---------------------------------------------------------------------------
export const ComponentKind = z.enum([
  "client",
  "edge",
  "api",
  "worker",
  "db",
  "object-storage",
  "cache",
  "queue",
  "search",
  "auth",
  "third-party",
  "ai",
  "realtime",
  "cron",
  "cdn",
  "analytics",
  "email",
  "ci",
]);
export type ComponentKind = z.infer<typeof ComponentKind>;

export const ArchLayer = z.enum(["frontend", "edge", "backend", "data", "storage", "cache", "auth", "async", "third-party", "ops"]);
export type ArchLayer = z.infer<typeof ArchLayer>;

export const Component = z.object({
  id: z.string().describe("kebab-case id"),
  name: z.string().describe("real product or binding name, e.g. 'Postgres via Prisma'"),
  kind: ComponentKind,
  layer: ArchLayer,
  keyword,
  icon: z.string().describe("icon name from the icon pack"),
  what: z.string().describe("one sentence: what it does in THIS repo"),
  does: z
    .string()
    .optional()
    .describe("the small line under the box: what it does for the viewer, 2 to 6 everyday words ('clicks and types for your AI')"),
  evidence: z.array(z.string()).describe("1 to 3 exact repo-relative file paths that prove it exists"),
});
export type Component = z.infer<typeof Component>;

export const Connection = z.object({
  from: z.string(),
  to: z.string(),
  label: keyword,
  evidence: z.string().describe("one exact repo-relative file path"),
});
export type Connection = z.infer<typeof Connection>;

export const ScaleRisk = z.object({
  component: z.string(),
  at: z.enum(["10x", "100x"]),
  problem: keyword,
  why: z.string(),
  fix: keyword,
  fix_detail: z.string(),
  evidence: z.string(),
});
export type ScaleRisk = z.infer<typeof ScaleRisk>;

export const Architecture = z.object({
  product: z.string(),
  one_liner: z.string(),
  components: z.array(Component),
  connections: z.array(Connection),
  walkthrough: z.object({
    name: z.string().describe("the request being traced, e.g. 'open the feed'"),
    steps: z.array(Connection),
  }),
  scale: z.array(ScaleRisk),
});
export type Architecture = z.infer<typeof Architecture>;

// ---------------------------------------------------------------------------
// Concept model (X posts and articles). Every node must quote the source.
// ---------------------------------------------------------------------------
export const BoardNode = z.object({
  id: z.string(),
  keyword,
  icon: z.string(),
  color: Color,
  evidence: z.string().describe("short exact quote (3 to 12 words) copied from the source text"),
  count: z
    .number()
    .int()
    .describe("1 normally; 2 to 9 when the idea is 'many of these' (many GPUs, many requests): drawn as a grid of icons"),
});
export type BoardNode = z.infer<typeof BoardNode>;

export const BoardEdge = z.object({ from: z.string(), to: z.string(), label: z.string().describe("0 to 3 lowercase words") });
export type BoardEdge = z.infer<typeof BoardEdge>;

export const Highlight = z.object({
  quote: z.string().describe("exact phrase (2 to 10 words) copied verbatim from the source text"),
  note: keyword,
  color: Color,
});
export type Highlight = z.infer<typeof Highlight>;

// ---------------------------------------------------------------------------
// Scene plan: the core contract between the planner and the renderer.
// ---------------------------------------------------------------------------
export const SceneKind = z.enum([
  "hook",
  "source",
  "layer",
  "walkthrough",
  "scale",
  "board",
  "notes",
  "chart",
  "timeline",
  "map",
  "establish",
  "recap",
  "outro",
]);
export type SceneKind = z.infer<typeof SceneKind>;

export const Callout = z.object({ target: z.string(), text: keyword, color: Color });
export type Callout = z.infer<typeof Callout>;

/** A row on a whiteboard list (requirements, estimates, trade-offs, failure modes, cost). */
export const NoteItem = z.object({
  text: z.string().describe("2 to 7 lowercase words written on the board"),
  color: Color,
  icon: z.string(),
  target: z.string().describe("component id this item is about, or empty string"),
  estimate: z.boolean().describe("true when the item contains an assumed or estimated number, never a measured fact"),
  evidence: z.string().describe("repo: one exact file path that supports it (empty for pure estimates). post/article: exact quote."),
});
export type NoteItem = z.infer<typeof NoteItem>;

/**
 * What the screen shows while one narration line is spoken. 'board' stays on the evolving diagram (it
 * builds or highlights there); 'title' is the hook's title card; the rest are full-frame cut-aways drawn
 * in the same hand-drawn look, appearing on the words they show (docs/explaining-playbook.md).
 */
export const VisualType = z.enum(["title", "board", "kinetic", "chips", "terminal", "output", "browser", "number", "contrast", "doodle"]);
export type VisualType = z.infer<typeof VisualType>;

/** One narration line and the visual that goes with it. One flat shape for every type, so structured output stays simple. */
export const Beat = z.object({
  line: z.string().describe("one narration line, one or two short sentences, copied word for word from the narration"),
  visual: VisualType,
  anchor: z.string().describe("1 to 4 consecutive words from this line, copied exactly: the visual appears as they are said"),
  text: z
    .string()
    .describe(
      "kinetic: the 2 to 8 spoken words to show; terminal: the exact command; number: the figure with its unit as said ('1 command'); browser: the page address; output: the output's title; chips: a short label over the chips or empty; doodle: the label; contrast: empty; board/title: empty",
    ),
  items: z
    .array(z.string())
    .describe(
      "chips: 2 to 4 product or part names said in the line; output: 2 to 5 short output rows; browser: 2 to 4 page elements ('email box', 'password box', 'button log in'); contrast: exactly [before, after], each 2 to 5 spoken words; otherwise empty",
    ),
  focus: z
    .string()
    .describe(
      "board: the component id to highlight, or empty; output: the row text to circle; browser: the element clicked; doodle: an icon name; otherwise empty",
    ),
});
export type Beat = z.infer<typeof Beat>;

const SceneShape = z.object({
  id: z.string(),
  kind: SceneKind,
  heading: z.string().describe("2 to 4 lowercase words"),
  narration: z.string().describe("what the narrator says during this scene"),
  /** repo scenes: component ids added to the evolving canvas in this scene */
  add_components: z.array(z.string()),
  /** repo scenes: connections added, written "from>to" */
  add_connections: z.array(z.string()),
  /** board scenes: a fresh mini diagram */
  board_nodes: z.array(BoardNode),
  board_edges: z.array(BoardEdge),
  /** source scenes: phrases to circle on the real screenshot */
  highlights: z.array(Highlight),
  callouts: z.array(Callout),
  /** notes scenes: list rows, or annotations on the canvas when they target components; chart and timeline scenes: one row per bar or date; map scenes: one row per place, its name in target */
  items: z.array(NoteItem),
});
/** A scene; repo scenes also carry `beats`, one visual per narration line. */
export const Scene = SceneShape.extend({ beats: z.array(Beat).optional() });
export type Scene = z.infer<typeof Scene>;

export const ScenePlan = z.object({
  title: z.string(),
  subtitle: z.string(),
  scenes: z.array(Scene),
});
export type ScenePlan = z.infer<typeof ScenePlan>;
/** The plan as a topic planner is asked for it: the same scenes, without per-line beats (strict output makes every field required). */
export const ConceptPlanWire = z.object({ title: z.string(), subtitle: z.string(), scenes: z.array(SceneShape) });
/** The plan as the repo planner is asked for it: every scene with its beats. */
export const RepoPlanWire = z.object({
  title: z.string(),
  subtitle: z.string(),
  scenes: z.array(SceneShape.extend({ beats: z.array(Beat) })),
});

// ---------------------------------------------------------------------------
// Ingested source.
// ---------------------------------------------------------------------------
export interface SourceDoc {
  kind: SourceKind;
  url: string;
  title: string;
  author?: string;
  /** digest for repos, plain text for posts/articles (secrets already stripped) */
  text: string;
  /** topic: the reputable pages the text was read from, cited in the video and the manifest */
  sources?: { title: string; url: string; site: string }[];
  /** repo: local checkout and commit */
  repoDir?: string;
  commit?: string;
  files?: string[];
  /** posts/articles: screenshot + the DOM page we can re-open to locate quotes */
  screenshot?: string;
  pageHtml?: string;
  images?: string[];
  meta?: Record<string, unknown>;
}

/** Word-level timing for narration, seconds relative to scene start. */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}
export interface SceneAudio {
  sceneId: string;
  file?: string;
  duration: number;
  words: WordTiming[];
}

export interface CostEntry {
  step: string;
  model: string;
  seconds: number;
  usd: number;
  detail?: Record<string, unknown>;
}

/** usd: running spend so far (Meta models + voice), the per-video cost meter */
export type Progress = (e: { stage: string; message: string; pct?: number; usd?: { meta: number; voice: number; total: number } }) => void;
