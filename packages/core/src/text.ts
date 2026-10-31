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
      if (BARE_VERBS.has(words[j]) && !words[j - 1].endsWith("'s")) {
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
