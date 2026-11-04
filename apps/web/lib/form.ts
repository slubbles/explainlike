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

/** Topics in words are capped here (lib/validate.ts); links may run to MAX_INPUT_CHARS. */
export const TOPIC_MAX = 300;
export const LINK_MAX = 2048;

// bare domains people type without a path; ".js" and the like stay topics ("next.js")
const BARE_TLDS = /\.(com|org|net|io|dev|ai|co|app|blog|so|sh|me|xyz|news|info|edu|gov)$/i;

/** Add the https:// people leave off ("github.com/a/b", "x.com/u/status/1", "www.site.com"), so a pasted link is not refused as a topic. */
export function normalizeInput(raw: string): string {
  const s = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /\s/.test(s)) return s;
  const host = s.split(/[/?#]/)[0];
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?$/i.test(host)) return s;
  const withPath = s.length > host.length && s[host.length] === "/" && s.length > host.length + 1;
  if (withPath || /^www\./i.test(host) || BARE_TLDS.test(host)) return `https://${s}`;
  return s;
}

/** The hint under the field: a counter once a topic nears its cap, and a plain reason when it is over. */
export function inputHint(raw: string): { count?: string; over?: string } {
  const s = normalizeInput(raw);
  if (/^https?:\/\//i.test(s))
    return s.length > LINK_MAX ? { over: "That link is too long. Paste just the repo, post or article URL." } : {};
  if (s.length < TOPIC_MAX - 60) return {};
  const count = `${s.length} / ${TOPIC_MAX}`;
  return s.length > TOPIC_MAX
    ? { count, over: `Topics are ${TOPIC_MAX} characters at most. Name it in a few words, or paste a link.` }
    : { count };
}
