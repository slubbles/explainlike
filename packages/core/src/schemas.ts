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
  "client", "edge", "api", "worker", "db", "object-storage", "cache", "queue",
  "search", "auth", "third-party", "ai", "realtime", "cron", "cdn", "analytics", "email", "ci",
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
  count: z.number().int().describe("1 normally; 2 to 9 when the idea is 'many of these' (many GPUs, many requests): drawn as a grid of icons"),
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
export const SceneKind = z.enum(["hook", "source", "layer", "walkthrough", "scale", "board", "notes", "chart", "timeline", "map", "establish", "recap", "outro"]);
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

export const Scene = z.object({
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
export type Scene = z.infer<typeof Scene>;

export const ScenePlan = z.object({
  title: z.string(),
  subtitle: z.string(),
  scenes: z.array(Scene),
});
export type ScenePlan = z.infer<typeof ScenePlan>;

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
export interface WordTiming { word: string; start: number; end: number }
export interface SceneAudio { sceneId: string; file?: string; duration: number; words: WordTiming[] }

export interface CostEntry { step: string; model: string; seconds: number; usd: number; detail?: Record<string, unknown> }

/** usd: running spend so far (Meta models + voice), the per-video cost meter */
export type Progress = (e: { stage: string; message: string; pct?: number; usd?: { meta: number; voice: number; total: number } }) => void;
