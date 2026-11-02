import { norm, phraseAt, spokenWords, wordCount, type Architecture, type Beat, type Scene, type ScenePlan, type VisualType } from "@explanimate/core";

/**
 * Per-line visuals (docs/explaining-playbook.md, "Visuals"): every narration line carries one visual, and
 * what it puts on screen is words the line says, shown as they are said. These checks run after every
 * rewrite of the narration, so a line that changed still has a visual that matches it.
 */

/** Visual types drawn as a full-frame cut-away; the rest stay on the board. */
export const CARD_TYPES: readonly VisualType[] = ["kinetic", "chips", "terminal", "output", "browser", "number", "contrast", "doodle"];
export const isCard = (v: VisualType) => CARD_TYPES.includes(v);

/** Tools most viewers already know, worth naming next to a part ("an AI agent, like Claude Code or Cursor"). */
export const FAMILIAR = /\b(claude code|claude|cursor|chatgpt|codex|copilot|gemini|windsurf|chrome|safari|firefox|vs ?code|slack|gmail|google|github|excel|notion|figma|zoom|whatsapp|iphone|android|netflix|youtube|spotify|uber|amazon|wordpress|shopify|playwright|puppeteer|selenium)\b/i;

/**
 * Made-up names for real parts: the viewer cannot look them up, and the board then disagrees with the
 * README. A part is called by its real name, explained in one clause.
 */
const NICKNAME = /\b(?:(?:the )?(?:browser|terminal|command|web|code|page|click|robot) (?:link|tool|robot|helper|buddy|butler|driver guy|remote|hands)|little (?:command|helper|robot) ?\w*|(?:robot|magic) (?:hands|fingers|helper|butler))\b/gi;
export function nicknames(text: string, real: string[] = []): string[] {
  const ok = new Set(real.map((r) => norm(r)));
  return [...new Set([...text.matchAll(NICKNAME)].map((m) => m[0].toLowerCase().replace(/^the /, "")))].filter((n) => !ok.has(norm(n)));
}

const STOP = /^(a|an|the|and|or|but|so|to|of|in|on|at|for|with|by|from|it|its|it's|is|are|was|be|this|that|these|those|you|your|you're|i|we|they|them|their|our|my|me|just|then|than|as|if|into|out|up|do|does|can|will|would|has|have|had|not|no|all|any|one|like|what|which|who|how|when|where|there|here|now|also|very)$/;
const stem = (w: string) => w.replace(/'s$/, "").replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "");
const tokens = (s: string) => norm(s).replace(/[.%$']/g, (c) => (c === "'" ? "'" : " ")).split(/[\s\-_/]+/).filter(Boolean);
/** Content words of a phrase: what has to be heard for it to count as said. */
export const contentWords = (s: string) => tokens(s).filter((w) => !STOP.test(w) && !/^\d+$/.test(w));
const spokenIn = (word: string, line: string) => { const set = new Set(tokens(line).flatMap((w) => [w, stem(w)])); return set.has(word) || set.has(stem(word)); };
/** True when every content word of `shown` is said in `line` (an empty phrase is never said). */
export function shownIsSaid(shown: string, line: string): boolean {
  const ws = contentWords(shown);
  return ws.length > 0 && ws.every((w) => spokenIn(w, line));
}
const someSaid = (shown: string, line: string) => contentWords(shown).some((w) => w.length >= 3 && spokenIn(w, line));

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
/** The figure a number card shows, read from its text ("1 command", "93%", "10x"). */
export function figureOf(text: string): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)/.exec(text);
  if (m) return Number(m[1].replace(/,/g, ""));
  const w = tokens(text).find((x) => NUM_WORDS.includes(x));
  return w === undefined ? undefined : NUM_WORDS.indexOf(w);
}
const figureSaid = (n: number, line: string) => {
  const t = ` ${norm(line).replace(/,/g, "")} `;
  return t.includes(` ${n} `) || new RegExp(`[ $]${String(n).replace(".", "\\.")}(%|x|k|ms|s)? `).test(t) || (n <= 20 && Number.isInteger(n) && tokens(line).includes(NUM_WORDS[n]));
};

const sentencesOf = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

/** Where each beat's anchor is said in the scene's narration, each after the one before; -1 when it is not. */
export function anchorIndex(narration: string, beats: Beat[]): number[] {
  const ws = spokenWords(narration);
  let at = 0;
  return beats.map((b) => { const k = b.anchor.trim() ? phraseAt(ws, b.anchor, at) : -1; if (k >= 0) at = k + 1; return k; });
}

/** The first few words of a line, said from `from`: a kinetic card the line is sure to say. */
export function kineticFrom(line: string, anchor = ""): string {
  const ws = spokenWords(line);
  let k = anchor ? Math.max(0, phraseAt(ws, anchor)) : 0;
  // start on a content word, and stop at the end of the clause
  while (k < ws.length - 1 && STOP.test(norm(ws[k]))) k++;
  const out: string[] = [];
  for (let i = k; i < ws.length && out.length < 5; i++) {
    out.push(ws[i].replace(/[,.;:!?"]+$/g, ""));
    if (/[,.;:!?]$/.test(ws[i]) && out.length >= 2) break;
  }
  while (out.length > 1 && STOP.test(norm(out[out.length - 1]))) out.pop();
  return out.join(" ");
}

/**
 * Beats re-cut to the scene's current narration: each starts at the sentence that says its anchor and
 * runs to the sentence before the next one's. A beat whose anchor is no longer said is dropped (the
 * visual before it holds on), and lines are always copied from the narration, never kept stale.
 */
export function alignBeats(s: Scene): { beats: Beat[]; dropped: string[] } {
  const beats = s.beats ?? [];
  if (!beats.length) return { beats: [], dropped: [] };
  const sents = sentencesOf(s.narration);
  const sentOf: number[] = [];
  sents.forEach((t, i) => spokenWords(t).forEach(() => sentOf.push(i)));
  const dropped: string[] = [];
  // a beat whose anchor went missing in a rewrite is found again by its line's opening words
  const kept: { b: Beat; k: number }[] = [];
  const ws = spokenWords(s.narration);
  let at = 0;
  for (const b of beats) {
    let k = b.anchor.trim() ? phraseAt(ws, b.anchor, at) : -1;
    let anchor = b.anchor;
    if (k < 0) {
      const lead = spokenWords(b.line).slice(0, 3).join(" ");
      const j = lead ? phraseAt(ws, lead, at) : -1;
      if (j >= 0) { k = j; anchor = ws.slice(j, j + Math.min(3, ws.length - j)).join(" ").replace(/[,.;:!?"]+/g, ""); }
    }
    if (k < 0) { dropped.push(`${s.id}: the ${b.visual} beat on "${b.anchor}" lost its line in a rewrite`); continue; }
    kept.push({ b: { ...b, anchor }, k });
    at = k + 1;
  }
  const out = kept.map(({ b, k }, i) => {
    const s0 = sentOf[k] ?? 0;
    const next = kept[i + 1];
    const s1 = next ? Math.max(s0, (sentOf[next.k] ?? sents.length) - (sentOf[next.k] === s0 ? 0 : 1)) : sents.length - 1;
    return { ...b, line: sents.slice(s0, s1 + 1).join(" ") };
  });
  return { beats: out, dropped };
}

export interface BeatReport { beats: number; cards: number; perMinute: number; types: Record<string, number>; repairs: string[]; issues: string[] }

/**
 * Every beat checked against its line, with a deterministic fix for what fails: a card whose words the
 * line does not say becomes a kinetic card of words it does say; a command that is not in the source
 * is dropped; the third line in a row of one type changes type. Returns the plan with fixed beats.
 */
export function checkBeats(plan: ScenePlan, o: { arch: Architecture; source?: string; wps?: number }): { plan: ScenePlan; report: BeatReport } {
  const repairs: string[] = [], issues: string[] = [];
  const ids = new Set(o.arch.components.map((c) => c.id));
  const src = ` ${(o.source ?? "").toLowerCase().replace(/\s+/g, " ")} `;
  const kinetic = (s: Scene, b: Beat, why: string): Beat => {
    repairs.push(`${s.id}: ${b.visual} beat on "${b.anchor}" ${why}; shown as words from the line instead`);
    return { ...b, visual: "kinetic", text: kineticFrom(b.line, b.anchor), items: [], focus: "" };
  };
  const scenes = plan.scenes.map((s) => {
    if (!s.beats?.length) return s;
    const a = alignBeats(s);
    repairs.push(...a.dropped);
    const beats = a.beats.map((b0, i): Beat => {
      const b: Beat = { ...b0, text: b0.text.trim(), items: b0.items.map((x) => x.trim()).filter(Boolean), focus: b0.focus.trim() };
      const line = b.line;
      switch (b.visual) {
        case "title":
          if (s.kind === "hook" && i === 0) return { ...b, text: "", items: [], focus: "" };
          repairs.push(`${s.id}: a title beat past the hook's first line became the board`);
          return { ...b, visual: "board", text: "", items: [], focus: "" };
        case "board":
          return { ...b, text: "", items: [], focus: ids.has(b.focus) ? b.focus : "" };
        case "kinetic": {
          const ws = spokenWords(b.text).slice(0, 8).join(" ");
          if (shownIsSaid(ws, line)) return { ...b, text: ws, items: [], focus: "" };
          return kinetic(s, b, "shows words the line does not say");
        }
        case "chips": {
          const said = b.items.filter((x) => shownIsSaid(x, line)).slice(0, 4);
          if (said.length >= 2) return { ...b, items: said, text: b.text && shownIsSaid(b.text, line) ? b.text : "", focus: "" };
          return kinetic(s, b, "names fewer than two of its chips aloud");
        }
        case "terminal": {
          const cmd = b.text.replace(/^\$\s*/, "").replace(/\s+/g, " ").trim();
          const head = cmd.split(" ").slice(0, 2).join(" ").toLowerCase();
          if (!cmd || !src.includes(` ${head}`) && !src.includes(head)) return kinetic(s, b, `types a command ("${cmd}") the source never shows`);
          if (!someSaid(cmd, line)) return kinetic(s, b, `types "${cmd}" but the line never says any of it`);
          return { ...b, text: cmd, items: b.items.slice(0, 4), focus: "" };
        }
        case "output": {
          const rows = b.items.slice(0, 5).map((r) => r.slice(0, 48));
          if (rows.length < 2) return kinetic(s, b, "has fewer than two output rows");
          if (!someSaid([b.text, ...rows].join(" "), line)) return kinetic(s, b, "shows output the line never mentions");
          return { ...b, items: rows, focus: rows.find((r) => r === b.focus || (b.focus && r.includes(b.focus))) ?? "" };
        }
        case "browser": {
          const els = b.items.slice(0, 4).map((r) => r.slice(0, 32));
          if (!els.length) return kinetic(s, b, "has an empty page");
          if (!someSaid([b.focus, ...els].join(" "), line)) return kinetic(s, b, "shows a page the line never mentions");
          return { ...b, text: b.text.replace(/^https?:\/\//, "").slice(0, 40), items: els, focus: els.find((e) => e === b.focus || (b.focus && e.includes(b.focus))) ?? "" };
        }
        case "number": {
          const n = figureOf(b.text);
          if (n === undefined || !figureSaid(n, line)) return kinetic(s, b, `shows a number (${b.text}) the line does not say`);
          if (n > 1 && o.source && !src.includes(String(n)) && !(n <= 20 && src.includes(` ${NUM_WORDS[n]} `))) return kinetic(s, b, `shows ${n}, which the source never states`);
          return { ...b, items: [], focus: "" };
        }
        case "contrast": {
          const [x, y] = b.items;
          if (b.items.length !== 2 || !someSaid(x, line) || !someSaid(y, line)) return kinetic(s, b, "needs a before and an after that the line both says");
          return { ...b, text: "", focus: "" };
        }
        case "doodle":
          if (!b.text || !shownIsSaid(b.text, line)) return kinetic(s, b, "labels the doodle with words the line does not say");
          return { ...b, items: [] };
      }
      return b;
    });
    return { ...s, beats };
  });
  // never the same visual three lines running (the board, which keeps building, excepted)
  const flat = scenes.flatMap((s, si) => (s.beats ?? []).map((b, bi) => ({ si, bi, b })));
  for (let i = 2; i < flat.length; i++) {
    const v = flat[i].b.visual;
    if (v === "board" || v === "title" || flat[i - 1].b.visual !== v || flat[i - 2].b.visual !== v) continue;
    const s = scenes[flat[i].si];
    const next: Beat = v === "kinetic" ? { ...flat[i].b, visual: "board", text: "", items: [], focus: "" } : { ...flat[i].b, visual: "kinetic", text: kineticFrom(flat[i].b.line, flat[i].b.anchor), items: [], focus: "" };
    repairs.push(`${s.id}: a third ${v} line in a row became ${next.visual}`);
    s.beats![flat[i].bi] = next;
    flat[i].b = next;
  }
  // a part is anchored to tools people know, early: "an AI agent, like Claude Code or Cursor"
  const early = scenes.slice(0, 3).flatMap((s) => s.beats ?? []);
  if (early.length && FAMILIAR.test(src) && !early.some((b) => b.visual === "chips" && b.items.some((x) => FAMILIAR.test(x)))) issues.push("no chips line in the first scenes names tools viewers already use (like 'Claude Code or Cursor'); anchor the user of this project to them early");
  for (const s of scenes) for (const n of nicknames(s.narration, o.arch.components.flatMap((c) => [c.keyword, c.name]))) issues.push(`${s.id}: "${n}" is a made-up name; call the part by its real name and say what it is in one clause`);
  const all = scenes.flatMap((s) => s.beats ?? []);
  const words = scenes.reduce((n, s) => n + wordCount(s.narration), 0);
  const minutes = words / (o.wps ?? 2.6) / 60;
  const types: Record<string, number> = {};
  for (const b of all) types[b.visual] = (types[b.visual] ?? 0) + 1;
  // each line is one change; a board line usually draws or rings something too
  const changes = all.length + all.filter((b) => b.visual === "board").length;
  return { plan: { ...plan, scenes }, report: { beats: all.length, cards: all.filter((b) => isCard(b.visual)).length, perMinute: minutes ? Math.round((changes / minutes) * 10) / 10 : 0, types, repairs, issues } };
}

/** Anchors the narration rewrites must keep, so each line's visual still lands on its words. */
export const beatAnchors = (s: Scene) => (s.beats ?? []).map((b) => b.anchor).filter((a) => a.trim());

/**
 * The part of a README a plan copies commands and output rows from: its opening sections, plus the first
 * example output further down (a snapshot, a response), with images, badges and HTML stripped.
 */
export function readmeExcerpt(text: string, max = 6000): string {
  const clean = text.replace(/<[^>]+>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const head = clean.slice(0, max);
  const rest = clean.slice(max);
  // an element list (what an AI reads back) is the most telling example, then any printed output
  const m = [/\[ref=/, /^\s*#\s*-\s/m, /^#?\s*output:/im, /returns:/i].map((r) => r.exec(rest)).find(Boolean);
  if (!m) return head;
  // a little context before the example (its heading and the command that printed it)
  const at = Math.max(0, m.index - 400, rest.lastIndexOf("\n", Math.max(0, m.index - 300)));
  return `${head}\n...\n${rest.slice(at, at + 1200).trim()}`;
}
