/** Shared text helpers used by planners and validators. */
export const lower = (s: string) => s.toLowerCase().trim();
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const isKeyword = (s: string, max = 3) => wordCount(s) >= 1 && wordCount(s) <= max && s === s.toLowerCase();
/** normalize for fuzzy quote matching (a sentence-ending period is not part of the word; 3.5 keeps its dot) */
export const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^a-z0-9%$.' ]+/g, " ").replace(/\.+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
export function quoteInSource(quote: string, source: string): boolean {
  const q = norm(quote), s = norm(source);
  if (!q) return false;
  if (s.includes(q)) return true;
  // tolerate small edits: 80% of the quote's words appear in order (longest common subsequence) within a window
  const qw = q.split(" "); const sw = s.split(" ");
  const need = Math.ceil(qw.length * 0.8);
  for (let i = 0; i < sw.length; i++) {
    if (!qw.slice(0, qw.length - need + 1).includes(sw[i])) continue;
    const win = sw.slice(i, i + qw.length * 2);
    let prev = new Array(win.length + 1).fill(0);
    for (const w of qw) {
      const cur = [0];
      for (let k = 0; k < win.length; k++) cur.push(w === win[k] ? prev[k] + 1 : Math.max(prev[k + 1], cur[k]));
      prev = cur;
    }
    if (prev[win.length] >= need) return true;
  }
  return false;
}

/**
 * Mechanical clean-up of spoken narration before it is voiced and captioned:
 * single spaces, no space before punctuation, no word said twice in a row,
 * each sentence starting with a capital and the whole ending with a full stop.
 */
export function tidySpeech(s: string): string {
  let t = s.replace(/\s+/g, " ").trim()
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[A-Za-z])/g, "$1 ")
    .replace(/\.{2,}(?!\.)/g, ".")
    .replace(/\b(\w+) \1\b/gi, (m, w: string) => (/^(that|had|is)$/i.test(w) ? m : w));
  t = fixAgreement(t);
  // a new sentence starts with a capital; "e.g." or "vs." do not end one
  t = t.replace(/(^|(\S*)[.!?] )([a-z])/g, (m, a: string, w: string | undefined, c: string) =>
    /^(e\.g|i\.e|vs|etc|approx)$/i.test(w ?? "") ? m : a + c.toUpperCase());
  if (t && !/[.!?]["')]?$/.test(t)) t += ".";
  return t;
}

// Common verbs in their bare form. A singular subject ("a pasted link") followed by one of these,
// with no helper verb before it ("does", "can", "to" ...), is a subject-verb agreement slip.
const BARE_VERBS = new Set(("become turn send store read write fetch draw run make take get give need use keep go show hold call build " +
  "load save start stop wait break fail grow scale serve handle return render play pick check ask answer find hit cache queue " +
  "split join pass push pull post sit live talk mean let help hand look feel seem stay move bring come have do be explain " +
  "decide own track sync know see say want work open close").split(" "));
const SINGULAR_DET = /^(a|an|each|every|this)$/;
const HELPERS = /^(do|does|did|can|could|will|would|shall|should|may|might|must|to|let|lets|help|helps|helped|make|makes|made|watch|watches|see|sees|saw|hear|hears|why|not)$/;
const NOT_ONE_THING = /^(and|or|few|couple|lot|lots|number|bunch|pair|of|plus|both|many)$/;
const TO_OR_HELPER = /^(to|will|would|can|could|should|must|might|may|does|did|do|let|lets|helps|help|make|makes)$/;
const NOUN_NEXT = /^(that|which|who|is|was|will|can|could|would|should|might|must|has|had)$/;
const thirdPerson = (v: string) =>
  ({ have: "has", do: "does", go: "goes", be: "is" } as Record<string, string>)[v] ??
  (/(s|sh|ch|x|z)$/.test(v) ? v + "es" : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : v + "s");

/**
 * Agreement slips in a piece of text: a singular subject such as "a pasted link" followed by a bare
 * verb such as "become", with no helper verb earlier in the same clause. "How does a pasted link
 * become a video?" is fine (the helper "does" carries the agreement); "a pasted link become" read on
 * its own is not. Returns the slipped phrase, the verb's word index and its fixed form.
 */
export function agreementSlips(text: string): { phrase: string; index: number; fix: string }[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const words = raw.map((w) => w.toLowerCase().replace(/[^a-z']/g, ""));
  const ends = raw.map((w) => /[,.;:!?]["')]?$/.test(w));
  const out: { phrase: string; index: number; fix: string }[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!SINGULAR_DET.test(words[i])) continue;
    // "a user and a bot send" has a plural subject
    if (i > 0 && NOT_ONE_THING.test(words[i - 1])) continue;
    // a helper earlier in the same clause carries the agreement
    let helped = false;
    for (let k = i - 1; k >= 0 && k >= i - 5 && !ends[k]; k--) if (HELPERS.test(words[k])) { helped = true; break; }
    if (helped) continue;
    for (let j = i + 2; j <= i + 4 && j < words.length; j++) {
      if (ends[j - 1] || NOT_ONE_THING.test(words[j - 1])) break;
      // "an X post, or an article": a noun that closes a list item with a comma is not a verb
      // "a write queue that lines up", "the fix is a write queue.": a word that ends the sentence or
      // is followed by a relative pronoun or helper is the noun, not the verb
      const nounish = ends[j] || (j + 1 < words.length && NOUN_NEXT.test(words[j + 1]));
      // "asks a concierge to run the agent": after "to" or a helper the bare form is right
      if (TO_OR_HELPER.test(words[j - 1])) break;
      if (BARE_VERBS.has(words[j]) && !nounish && !words[j - 1].endsWith("'s") && !/,["')]?$/.test(raw[j])) {
        // "an api call return": the first of two such words is still part of the subject
        if (!ends[j] && j + 1 < words.length && BARE_VERBS.has(words[j + 1])) j++;
        out.push({ phrase: raw.slice(i, j + 1).join(" "), index: j, fix: thirdPerson(words[j]) });
        break;
      }
      if (ends[j]) break;
    }
  }
  return out;
}

/** Fix agreement slips ("a pasted link become a video" -> "a pasted link becomes a video"). */
export function fixAgreement(text: string): string {
  const raw = text.split(/(\s+)/);
  const slips = agreementSlips(text);
  if (!slips.length) return text;
  let wi = -1;
  return raw.map((part) => {
    if (/^\s+$/.test(part) || !part) return part;
    wi++;
    const s = slips.find((x) => x.index === wi);
    return s ? part.replace(/^[A-Za-z]+/, (w) => (w[0] === w[0].toUpperCase() ? s.fix[0].toUpperCase() + s.fix.slice(1) : s.fix)) : part;
  }).join("");
}

const GLUE = /^(a|an|the|you|your|it|its|this|that|these|those|they|their|we|our|he|she|his|her|is|are|was|were)$/;
/**
 * True when text reads as a list of keywords rather than spoken English, e.g.
 * "Browser user sits at frontend start pasting links for video." Real sentences of
 * eight or more words almost always carry an article, a pronoun or a form of "be".
 */
export function soundsLikeKeywords(text: string): boolean {
  const ws = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z']/g, "")).filter(Boolean);
  if (ws.length < 8) return false;
  return ws.filter((w) => GLUE.test(w)).length / ws.length < 0.05;
}

/** Small words a speaker slips into a step ("sends the message", "returns its reply"). */
const FILLER = /^(a|an|the|your|its|their|his|her|this|that|our|it|back|them|you)$/;
const inflects = (a: string, b: string) => a.startsWith(b) && /^(s|es|ed|d|ing|ning|ned)$/.test(a.slice(b.length));
const stemMatch = (a: string, b: string) => a === b || inflects(a, b) || inflects(b, a) || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))));
/**
 * Where a short phrase such as a step label is said in a run of spoken words: each word of the phrase
 * in order, matching on its stem ("send" ~ "sends"), with up to two small words between them
 * ("sends the message"). Returns the index of the first matched word, or -1.
 */
export function phraseAt(spoken: string[], phrase: string, from = 0): number {
  const toks = phrase.toLowerCase().split(/[\s\-_/]+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const ws = spoken.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!toks.length) return -1;
  for (let i = from; i < ws.length; i++) {
    if (!stemMatch(ws[i], toks[0])) continue;
    let at = i, ok = true;
    for (let j = 1; j < toks.length && ok; j++) {
      let k = at + 1, skipped = 0;
      while (k < ws.length && !stemMatch(ws[k], toks[j]) && FILLER.test(ws[k]) && skipped < 2) { k++; skipped++; }
      ok = k < ws.length && stemMatch(ws[k], toks[j]);
      at = k;
    }
    if (ok) return i;
  }
  return -1;
}
export const spokenWords = (s: string) => s.split(/\s+/).filter(Boolean);

// Singular nouns that are almost never verbs and always need an article in speech.
const BARE_NOUNS = /^(message|reply|request|question|task|job|file|server|database|bot|agent|browser|window|worker|response|result|page|user|queue|cache|engine|notebook|ledger|manager|concierge|counter|logbook|helper)$/;
const NEEDS_OBJECT = /^(send|sends|sent|save|saves|saved|run|runs|ran|return|returns|returned|show|shows|showed|get|gets|got|reach|reaches|reached|hit|hits|start|starts|started|open|opens|opened|call|calls|called|use|uses|used|take|takes|took|pick|picks|picked|wake|wakes|ask|asks|asked|with|into|onto|is|was)$/;
/** "will run agent", "send message to manager": a verb or preposition right before a bare singular noun. */
export function missingArticles(text: string): string[] {
  const raw = spokenWords(text);
  const ws = raw.map((w) => w.toLowerCase().replace(/[^a-z']/g, ""));
  const out: string[] = [];
  for (let i = 1; i < ws.length; i++) {
    if (!BARE_NOUNS.test(ws[i]) || !NEEDS_OBJECT.test(ws[i - 1]) || /[,.;:!?]$/.test(raw[i - 1])) continue;
    // "the open window": after an article the word is an adjective, and the noun already has its article
    if (i > 1 && /^(the|a|an|your|its|this|that|each|every|one)$/.test(ws[i - 2])) continue;
    out.push(`${ws[i - 1]} ${ws[i]}`);
  }
  for (let i = 1; i < ws.length; i++) if (ws[i - 1] === "to" && /^(manager|counter|user|server|database|agent|browser|worker|engine|notebook|ledger|logbook)$/.test(ws[i])) out.push(`to ${ws[i]}`);
  return out;
}

const DANGLING = /^(the|a|an|and|or|of|to|in|on|for|at|by|with|from|into|start|then|your|its)$/;
/**
 * A scene heading of at most `max` words that still reads as a name: "one message, start to end"
 * becomes "one message", never "one message start to".
 */
export function shortHeading(s: string, max = 4): string {
  const all = lower(s).replace(/[,;:.!?]+/g, " ").split(/\s+/).filter(Boolean);
  // a heading that already fits can still end mid-phrase ("one message start to")
  const ws = all.slice(0, max);
  while (ws.length > 2 && DANGLING.test(ws[ws.length - 1]!)) ws.pop();
  return ws.join(" ");
}
