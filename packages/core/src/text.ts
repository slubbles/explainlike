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
  const ws = spoken.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const tokens = (split: RegExp) => phrase.toLowerCase().split(split).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const at = matchAt(ws, tokens(/[\s\-_/]+/), from);
  // a hyphenated word is one spoken word ("follow-ups"), so the label may need to match it whole
  return at >= 0 || !/[-_/]/.test(phrase) ? at : matchAt(ws, tokens(/\s+/), from);
}

function matchAt(ws: string[], toks: string[], from: number): number {
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

const ADJ = /^(harsh|long|short|high|low|cold|hot|dry|wet|wide|narrow|rich|poor|vast|steep|rough|big|small|huge|tiny|old|new|great|safe|risky|slow|fast|quick|cheap|costly|rare|common|deep|dark|empty|full|heavy|light|hard|soft|strong|weak|wild|bare|endless|distant|remote|foreign|local|simple|plain|raw|fresh|busy|lonely|dusty|icy|sandy|rocky|frozen|open|closed)$/;
const ADJ_END = /^[a-z]{3,}(ous|ful|ive|less|ish|able|ible)$/;
const PLURAL = /^[a-z]{3,}s$/;
const NOT_PLURAL = /(ss|us|is|ys)$|^(this|has|was|does|its|always|across|perhaps|sometimes|plus|less|unless|thus|yes|towards|besides|whereas|afterwards)$/;
const OPENS = /^(and|or|but|from|with|by|of|to|into|through|past|so|then|while|when|as)$/;
const PREP = /^(from|behind|into|onto|to|through|via|past|beyond|inside|under|over)$/;

// "comes with you", "stays with you": the ending belongs to a verb of going along
const GOES_WITH = /^(go|goes|went|come|comes|came|travel|travels|stay|stays|stick|sticks|ride|rides|walk|walks|move|moves|grow|grows|talk|talks|speak|speaks|agree|agrees|share|shares|work|works|sit|sits|carry|carries)$/;
const YOU = /^(you|you'll|you'd|you're|you've)$/;
/**
 * A sentence that ends on "with you" or "for you" the line does not need: the clause already has "you"
 * doing the action ("and you'll follow one click with you"), the ending hangs off no verb of going along
 * ("... one click with you"), or it is tacked onto a describing word ("with OK lit for you") or a second
 * "for" ("widgets for the open window for you").
 */
function trailingYou(sent: string): string | undefined {
  const m = sent.match(/\b(with|for)\s+(you|yourself)[.!?]*$/i);
  if (!m) return undefined;
  const ending = `${m[1]!.toLowerCase()} ${m[2]!.toLowerCase()}`;
  const before = sent.slice(0, m.index).trim();
  // the clause the ending belongs to: after the last comma, semicolon or joining word
  const clause = before.split(/[,;:]|\b(?:and|but|so|while|because)\b/i).pop()!.trim();
  const ws = spokenWords(clause).map((w) => w.toLowerCase().replace(/[^a-z']/g, ""));
  const prev = ws[ws.length - 1] ?? "";
  const drop = `drop the ending "${ending}"`;
  if (ws.some((w) => YOU.test(w))) return `"${clause} ${ending}" says "you" twice; ${drop} or say what goes with you`;
  if (ending === "with you" && !GOES_WITH.test(prev)) return `"${ending}" dangles at the end of "${clause}"; ${drop} or say what goes with you`;
  if (ending === "for you" && (ADJ.test(prev) || ADJ_END.test(prev) || /^(lit|familiar|ready|done|easy|tiny)$/.test(prev) || /\bfor\b/i.test(clause))) return `"${ending}" is tacked onto "${clause}"; ${drop} or say what it does for you`;
  return undefined;
}

/**
 * Lines a listener trips on that the article check misses:
 * - a noun stack with the "and" left out ("Bandits harsh deserts make travel costly")
 * - the picture the video borrows used bare as if it were a part ("reads commands from tickets",
 *   "Behind tickets the renderer"); `metaphor` lists the picture's words the map itself never uses
 * - one action said twice over ("you press keys on the OK button")
 * - a sentence that ends on a vague word instead of what happens ("... for action.")
 * - a dangling "with you" or "for you", or "you" said twice in one clause
 * - the same word twice in a row ("the the")
 */
export function grammarSlips(text: string, o: { metaphor?: string[] } = {}): string[] {
  const out: string[] = [];
  const pic = new Set((o.metaphor ?? []).map((w) => w.toLowerCase()));
  for (const sent of text.split(/(?<=[.!?])\s+/)) {
    const raw = spokenWords(sent);
    const ws = raw.map((w) => w.toLowerCase().replace(/[^a-z'-]/g, ""));
    for (let i = 0; i + 2 < ws.length; i++) {
      const [a, b, c] = [ws[i], ws[i + 1], ws[i + 2]];
      // a comma between the words is a list, not a stack
      if (/[,;:]$/.test(raw[i]) || /[,;:]$/.test(raw[i + 1])) continue;
      if (i > 0 && !OPENS.test(ws[i - 1]) && !/[,;:]$/.test(raw[i - 1])) continue;
      if (PLURAL.test(a) && !NOT_PLURAL.test(a) && (ADJ.test(b) || ADJ_END.test(b)) && PLURAL.test(c) && !NOT_PLURAL.test(c)) out.push(`noun stack "${raw.slice(i, i + 3).join(" ")}": two things run together with no "and" or verb between them`);
    }
    for (let i = 1; i < ws.length; i++) {
      const w = ws[i], sing = w.replace(/s$/, "");
      if (!PREP.test(ws[i - 1]) || /[,;:]$/.test(raw[i - 1])) continue;
      if (pic.has(w) || pic.has(sing)) out.push(`"${ws[i - 1]} ${w}" uses the picture word "${w}" as if it were a part; name the part, or say "the ${w}" right after the part it stands for`);
    }
    const twice = sent.match(/\b(press|presses|pressed|pressing|tap|taps|tapped|click|clicks|clicked|hit|hits)\s+(keys|key|buttons)\s+on\s+(the|a|an|your)\s+(?:[\w-]+\s+){0,2}?(button|key|icon|link)\b/i);
    if (twice) out.push(`"${twice[0]}" says the action twice; say "${twice[1]} ${twice[0].split(/\s+on\s+/i)[1]}"`);
    const end = trailingYou(sent);
    if (end) out.push(end);
    const dup = sent.match(/\b([a-z']+)\s+\1\b/i);
    if (dup && !/^(that|had|is|very|bye|so|no)$/i.test(dup[1]!)) out.push(`"${dup[0]}" says the same word twice in a row; say it once`);
    const vague = sent.match(/\bfor (action|effect|work|change|things|stuff)[.!?]?$/i);
    if (vague) out.push(`"${vague[0].replace(/[.!?]$/, "")}" ends the sentence on a vague word; say what happens instead`);
  }
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
