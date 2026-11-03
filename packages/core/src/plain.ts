/**
 * The plain-language standard every spoken line, heading and box label is held to: a friend explaining
 * over coffee to a smart person who doesn't write code. The prompts quote PLAIN_LANGUAGE; plainSlips is
 * the part a program can check, so a slip is caught even when a model reviewer lets it pass.
 */
export const PLAIN_LANGUAGE = [
  "Plain language: talk like a friend explaining over coffee to a smart person who doesn't write code.",
  "- Everyday words only. Use a technical term only when the viewer truly needs it, and explain it in the same breath with everyday words ('Chrome DevTools Protocol, basically a remote control for Chrome'). A term the viewer can do without is left out.",
  "- Problem before fix: say what's annoying or hard first, then what this does about it.",
  "- Say what happens and why it matters to you: 'your AI says \"click the login button\", and agent-browser clicks it in Chrome', never a bare chain of part names ('the CLI sends a CDP command to the client').",
  "- Casual, direct and short, the way you'd text a friend: at most about 18 words a sentence, with contractions (it's, you'd, don't) and concrete examples the viewer has done themselves (logging in, filling a form, taking a screenshot).",
  "- Talk to the viewer as 'you' where it's natural ('you ask', 'you get the page back'), but don't stick 'your' on every part: 'the daemon', not 'your daemon'.",
  "- Say things literally. No running metaphor (a trip, a ride, a journey, riders, a car door). An analogy is at most one clause riding on a real name ('the daemon, a program that stays running in the background, like a waiter who never leaves the table'), and it never renames the part.",
  "- Never explain a part with its own name ('the browser link drives it in the web browser'), never turn a step label into a noun ('you get the read result', 'that step reused your saved logins'): say what actually happens ('Chrome clicks the button and sends back a short text list of the page').",
  "- Real names, explained: call each part by the name the README uses (agent-browser CLI, the daemon, Chrome DevTools Protocol) and say what it is in one plain clause the first time ('the daemon, a program that stays running in the background'). Never invent a nickname for a part ('the browser link', 'the terminal tool', 'the little command tool').",
  "- Anchor to what people already use: 'an AI agent, like Claude Code or Cursor'.",
  "- Numbers made concrete: 'one command', 'about 200 characters instead of a whole page'.",
].join("\n");

/** Box labels: the real name of the part, short; the subtitle explains it. */
export const PLAIN_LABELS =
  "Box labels (keywords) are the part's real name, shortened to 1 to 3 lowercase words without 'the' or 'your': the name the README or code uses ('agent-browser cli', 'daemon', 'chrome', 'devtools protocol', 'ai agent'), never a made-up nickname ('browser link', 'terminal tool', 'little command tool'). The line under it says in plain words what it does.";

/** The line under each box name: what the part does for the viewer, in everyday words. */
export const PLAIN_SUBTITLE =
  "`does` is the small line under the box name: what the part does for the viewer, 2 to 6 everyday words with no product, package, protocol or language names ('clicks and types for your AI', 'keeps you logged in', 'shows what's running'). Never repeat the keyword in it.";

/** Headings: plain, literal and short. */
export const PLAIN_HEADINGS =
  "Headings are plain, literal and short, 2 to 5 everyday words saying what the scene is about ('where it starts', 'what runs the page', 'when lots of jobs come in'), never a metaphor ('a real car door', 'too many riders', 'your ride').";

// back-to-front lines: an -ing phrase or a place put before the part it is about
const INVERTED_ING = /^([a-z]+ing)\b[^,.;!?]*?\b(?:is|are)\s+(?:the|a|an|your)\b/i;
const NOT_ING = /^(nothing|something|everything|anything|thing|during|bring|string|king|morning|evening|ceiling|being)$/i;
const INVERTED_PLACE =
  /^(off to the side|to the side|next to (?:it|them|that)|behind (?:it|them|that)|on top(?: of (?:it|them))?|beside (?:it|them)|below (?:it|that)|above (?:it|that)|nearby|over here|out front|alongside),? (?:sits|sit|stands|lives|lies|comes|waits|is|are)\b/i;
const VAGUE_PEOPLE = /\b(?:for|to|with|let|lets|helps?) (folks|people|somebody|someone)\b/i;
const NONSENSE = /\bsaved (?:clicks|taps|steps|actions|commands)\b|\bmemory for (?:saved |old )?(?:clicks|taps|steps|actions)\b/i;
const STOP =
  /^(that|this|with|from|your|then|they|them|their|there|what|when|which|just|into|each|very|more|than|have|does|it's|you're|page|pages)$/;

/**
 * Lines that read stiff or clumsy aloud, as fixes a rewriter can act on: back to front ("Running the page is
 * the daemon", "Off to the side sits the live view"), the same name twice in a breath ("In chrome,
 * real Chrome presses"), vague people ("for folks"), and phrases that make no literal sense ("saved clicks").
 */
export function stiffLines(narration: string): string[] {
  const out: string[] = [];
  for (const sent of narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const ing = INVERTED_ING.exec(sent);
    if (ing && !NOT_ING.test(ing[1]!))
      out.push(`"${sent}" is back to front; start with the part and say what it does ('the daemon runs the page')`);
    if (INVERTED_PLACE.test(sent)) out.push(`"${sent}" is back to front; start with the part ('the live view sits off to the side')`);
    const ws = sent
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z']/g, ""));
    const twice = ws.find(
      (w, i) => w.length >= 4 && !STOP.test(w) && ws.slice(i + 1, i + 4).includes(w) && !/^(by|after|to|for|and|or)$/.test(ws[i + 1] ?? ""),
    );
    if (twice) out.push(`"${sent}" says "${twice}" twice in a breath; say it once`);
    const who = VAGUE_PEOPLE.exec(sent);
    if (who) out.push(`"${sent}" says "${who[1]}"; say "you" or exactly who`);
    const odd = NONSENSE.exec(sent);
    if (odd) out.push(`"${sent}" says "${odd[0]}", which doesn't literally make sense; say what really happens`);
  }
  return out;
}

// travel and vehicle words a model reaches for when it turns a request into a story; said about software they are a metaphor
const FIGURATIVE =
  /\b(trips?|rides?|riders?|journeys?|roads?|highways?|passengers?|car doors?|cars?|tickets?|vehicles?|drivers? seat|driving seat|suitcases?|luggage|destinations?)\b/i;

/** The first figurative travel word in a phrase, or "" when it reads literally. `known` phrases (box names) are skipped. */
export function figurative(text: string, known: string[] = []): string {
  let t = ` ${text.toLowerCase()} `;
  for (const k of [...known]
    .map((x) => x.toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    t = t.split(k).join(" ");
  return FIGURATIVE.exec(t)?.[1]?.toLowerCase() ?? "";
}

// words that name no thing a viewer could picture; under a box they say nothing ("builds ready commands", "runs browser chores")
const ABSTRACT = /\b(ready|stuff|things?|chores?|handles?|manages?|process(?:es)?|logic|operations?|tasks?|data|workflows?)\b/i;

/** A box subtitle that would lose a non-programmer: jargon, too long, or just the keyword again. */
export function subtitleSlip(does: string, keyword: string): string {
  const d = does.trim();
  if (!d) return "has no plain line saying what it does";
  const j = practitionerTerm(d);
  if (j) return `says "${j}"; say what it does for the viewer in everyday words`;
  if (d.split(/\s+/).length > 7) return "runs over 7 words; keep it to 2 to 6 everyday words";
  const bare = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (bare(d) === bare(keyword)) return "just repeats the box name; say what it does";
  const vague = ABSTRACT.exec(d);
  if (vague)
    return `says "${vague[1]!.toLowerCase()}", too abstract; say a concrete thing you could watch it do ('turns "log in" into clicks')`;
  return "";
}

// words only people who write code know; said aloud they need everyday words beside them
const JARGON =
  /\b(cdp|rpc|grpc|ipc|ffi|daemon|shards?|inference|wasm|orm|rust|golang|cli|stdio|jsonl|kv|dom|ast|repl|tty|pty|cgo|jni|sdk|json|http|https|apis?|websockets?|endpoints?|middleware|backend|frontend|runtime|payloads?|async|serializ\w*|deserializ\w*|parses?|parsed|parser|binary|binaries|subprocess(es)?|stdout|stderr|regex|schema|tokens?|latency|throughput|headless|protocol|cli's)\b/i;

/** The first practitioner-only word in a phrase, lowercased, or "" when it reads plainly. */
export function practitionerTerm(text: string): string {
  return JARGON.exec(text)?.[1]?.toLowerCase() ?? "";
}

// what a sentence says right beside a term when it explains it: "CDP, basically a remote control", "a parser, which ..."
const EXPLAINS =
  /(,|—| - |\()\s*(basically|which|that's|that is|meaning|i\.e\.|in other words|a |an |the |think of|like |just |kind of|sort of|so )|\b(means|is just|is basically|is like|stands for|a fancy (word|name) for)\b/i;

const MAX_WORDS = 22;

/**
 * Sentences a non-programmer would stumble on, as fixes a rewriter can act on: a practitioner word with no
 * everyday words beside it, or a sentence too long to follow by ear. `known` lists phrases that are fine
 * as they are (the box labels, already checked on the map), so naming a box is never flagged.
 */
export function plainSlips(narration: string, known: string[] = []): string[] {
  const out: string[] = [];
  const keep = known
    .map((k) => k.toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const sent of narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    let t = ` ${sent.toLowerCase().replace(/[’‘]/g, "'")} `;
    for (const k of keep) t = t.split(k).join(" ");
    const term = practitionerTerm(t);
    if (term && !EXPLAINS.test(sent))
      out.push(
        `"${sent}" uses "${term}" with no everyday words beside it; explain it in the same breath ("${term}, basically ...") or say what it does instead`,
      );
    const n = sent.split(/\s+/).filter(Boolean).length;
    if (n > MAX_WORDS) out.push(`"${sent}" has ${n} words; split it into short sentences of at most 18 words`);
  }
  return out;
}
