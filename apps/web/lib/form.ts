/** The choices on the input form. */
export type Form = { input: string; voice: string };

export const VOICES = [
  { id: "deepgram", label: "Narrated" },
  { id: "silent", label: "Captions only" },
] as const;
export const DEFAULT_FORM: Form = { input: "", voice: "deepgram" };

/** The form a saved job was made with, so reopening it shows its own link and voice instead of the defaults. */
export function formFromJob(job: { input?: unknown; voice?: unknown }): Form {
  const voice = VOICES.some((v) => v.id === job.voice) ? String(job.voice) : DEFAULT_FORM.voice;
  return { input: typeof job.input === "string" ? job.input : "", voice };
}

export const voiceLabel = (id?: string) => VOICES.find((v) => v.id === id)?.label ?? id ?? "";

/** What kind of source a link is, in the words the gallery uses. */
export function sourceKind(input: string): "repo" | "X post" | "article" | "topic" {
  if (!/^https?:\/\//i.test(input) && !input.startsWith("/")) return "topic";
  if (/^https?:\/\/(www\.)?github\.com\//i.test(input) || input.startsWith("/")) return "repo";
  if (/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(input)) return "X post";
  return "article";
}

/** A link as people read it: no scheme, no trailing slash. */
export const shortLink = (s: string) => s.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** Why a finished video has no boxes to tap: only repo videos map each box to real files. */
export function noBoxesNote(input: string): string {
  const kind = sourceKind(input);
  if (kind === "repo") return "This video has no box map, so there is nothing to tap. Tap-to-ask and what-if clips need one.";
  const what = kind === "topic" ? "a topic" : kind === "X post" ? "an X post" : "an article";
  return `Tap-to-ask and what-if clips work on GitHub repo videos, where every box maps to real files. This one explains ${what}, so it has no boxes to tap.`;
}
