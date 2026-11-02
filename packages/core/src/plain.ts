/**
 * The plain-language standard every spoken line, heading and box label is held to: a friend explaining
 * over coffee to a smart person who doesn't write code. The prompts quote PLAIN_LANGUAGE; plainSlips is
 * the part a program can check, so a slip is caught even when a model reviewer lets it pass.
 */
export const PLAIN_LANGUAGE = [
  "Plain language: talk like a friend explaining over coffee to a smart person who doesn't write code.",
  "- Everyday words only. Use a technical term only when the viewer truly needs it, and explain it in the same breath with everyday words ('Chrome DevTools Protocol, basically a remote control for Chrome'). A term the viewer can do without is left out.",
  "- Say what happens and why it matters to you, not which component does it: 'your AI says \"click the login button\", and the tool clicks it in a real browser', never 'the CLI sends a CDP command to the client'.",
  "- Short sentences, at most about 18 words each, in second person ('you', 'your'), with contractions (it's, you'd, don't) and concrete examples the viewer has done themselves (logging in, filling a form, taking a screenshot).",
  "- No package, module, file or language names as if the viewer knew them ('the rust cli', 'the cdp client'); say what the thing is for ('the little command tool', 'the part that talks to Chrome').",
].join("\n");

/** Box labels: everyday nouns a non-programmer already knows, never a package, module or language name. */
export const PLAIN_LABELS = "Box labels (keywords) are plain everyday nouns of 1 to 3 lowercase words, without 'the' or 'your', that a non-programmer already knows, like 'ai assistant', 'browser tool', 'chrome', 'web page', 'saved logins'; never a package, module, protocol or language name ('rust cli', 'cdp client', 'ws server').";

// words only people who write code know; said aloud they need everyday words beside them
const JARGON = /\b(cdp|rpc|grpc|ipc|ffi|daemon|shards?|inference|wasm|orm|rust|golang|cli|stdio|jsonl|kv|dom|ast|repl|tty|pty|cgo|jni|sdk|json|http|https|apis?|websockets?|endpoints?|middleware|backend|frontend|runtime|payloads?|async|serializ\w*|deserializ\w*|parses?|parsed|parser|binary|binaries|subprocess(es)?|stdout|stderr|regex|schema|tokens?|latency|throughput|headless|protocol|cli's)\b/i;

/** The first practitioner-only word in a phrase, lowercased, or "" when it reads plainly. */
export function practitionerTerm(text: string): string { return JARGON.exec(text)?.[1]?.toLowerCase() ?? ""; }

// what a sentence says right beside a term when it explains it: "CDP, basically a remote control", "a parser, which ..."
const EXPLAINS = /(,|—| - |\()\s*(basically|which|that's|that is|meaning|i\.e\.|in other words|a |an |the |think of|like |just |kind of|sort of|so )|\b(means|is just|is basically|is like|stands for|a fancy (word|name) for)\b/i;

const MAX_WORDS = 22;

/**
 * Sentences a non-programmer would stumble on, as fixes a rewriter can act on: a practitioner word with no
 * everyday words beside it, or a sentence too long to follow by ear. `known` lists phrases that are fine
 * as they are (the box labels, already checked on the map), so naming a box is never flagged.
 */
export function plainSlips(narration: string, known: string[] = []): string[] {
  const out: string[] = [];
  const keep = known.map((k) => k.toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const sent of narration.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)) {
    let t = ` ${sent.toLowerCase().replace(/[’‘]/g, "'")} `;
    for (const k of keep) t = t.split(k).join(" ");
    const term = practitionerTerm(t);
    if (term && !EXPLAINS.test(sent)) out.push(`"${sent}" uses "${term}" with no everyday words beside it; explain it in the same breath ("${term}, basically ...") or say what it does instead`);
    const n = sent.split(/\s+/).filter(Boolean).length;
    if (n > MAX_WORDS) out.push(`"${sent}" has ${n} words; split it into short sentences of at most 18 words`);
  }
  return out;
}
