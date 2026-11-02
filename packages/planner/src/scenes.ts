import { findPlace } from "@explanimate/core/places";
import { z } from "zod";
import { ScenePlan, coverageSeconds, parseFigure, parseDated, figureInQuote, lower, norm, tidySpeech, wordCount, quoteInSource, phraseAt, spokenWords, missingArticles, grammarSlips, soundsLikeKeywords, shortHeading, type Architecture, type ExplainSpec, type Progress, type NoteItem, type Scene, type SourceDoc } from "@explanimate/core";
import { sparkJson, type CostLedger } from "@explanimate/models";
import { SHAPES, analogyRule, shapeFor } from "./shapes.js";

const STYLE = [
  "Style of the video: a friendly engineer drawing on a whiteboard while talking to a smart newcomer (docs/explaining-playbook.md).",
  "Narration is spoken; write it for the ear: short sentences, concrete, no filler ('in this video', 'let's dive in', 'robust', 'seamless', 'leverage' are banned).",
  "Every narration sentence is complete and grammatical: each verb agrees with its subject, and articles (a, an, the) are not dropped.",
  "Plain words first. Name each part by its plain keyword. A code name (a library, framework, database or file name such as React, SQLite or Node) is said only when it helps the viewer, after the plain name, with what it is: 'the chat transcripts, saved in SQLite, a small database file on your disk'. Never 'called X'. Every other technical term (an acronym, a protocol, 'api', 'driver', 'harness') is explained in a few plain words the first time it is said, in the same sentence; a term the newcomer does not need is left out.",
  "The viewer is always 'you', from the first line to the last. Never call them 'the guest', 'the user' or 'the customer', even inside the analogy ('you walk up to the counter', not 'the guest walks up').",
  "No two scenes or two sentences in a row open with the same words.",
  "Each part gets its why: what it is for, or what would go wrong without it.",
  "Headings are 2 to 4 lowercase words that the narration of that scene actually says (the viewer reads the heading while hearing it). Keywords 1 to 3 lowercase words.",
  "One new thing per sentence, and each sentence long enough to watch it being drawn (no two-word sentences).",
  "Every sentence moves the story. Never announce what comes next instead of saying it: 'you'll meet', 'you'll see', 'you'll find', 'then you've got', 'let's take a look', 'basically', 'it's special' and 'it's important' are banned.",
  "If the video uses an everyday analogy, keep that one analogy from the hook to the end; never switch to a second one.",
  "One or two short, dry asides are welcome where they fit, the kind a friendly engineer makes at the whiteboard ('which, to be fair, is most of programming'). Never a joke about people, never more than one sentence.",
].join("\n");

/** Components in the order one request meets them, then the parts the request never touches. */
export function journeyOrder(arch: Architecture): { path: string[]; side: string[] } {
  const ids = new Set(arch.components.map((c) => c.id));
  const path: string[] = [];
  for (const st of arch.walkthrough.steps) for (const id of [st.from, st.to]) if (ids.has(id) && !path.includes(id)) path.push(id);
  return { path, side: arch.components.map((c) => c.id).filter((id) => !path.includes(id)) };
}

// ---------------------------------------------------------------------------
// Repo: tell one request's journey on one evolving canvas (docs/explaining-playbook.md).
// ---------------------------------------------------------------------------
function repoSystem(arch: Architecture, L: ExplainSpec, lo: number, hi: number): string {
  const shape = shapeFor(L.brief.approach);
  const S = SHAPES[shape];
  const { path, side } = journeyOrder(arch);
  const kw = (id: string) => `${id} ("${arch.components.find((c) => c.id === id)?.keyword}")`;
  const steps = arch.walkthrough.steps.map((s) => `"${s.label}"`).join(", ");
  const analogy = L.brief.analogy || "an everyday place with clear jobs (a restaurant, a post office)";
  return [
    "You write the scene plan for a short whiteboard explainer of one repository. The renderer draws one evolving architecture canvas.",
    "Goal: a newcomer finishes the video able to say what this project is and how one request flows through it. That flow is the video.",
    STYLE,
    L.voice,
    analogyRule(shape, analogy),
    "Scene order and rules:",
    `1. one 'hook' scene, 3 or 4 sentences, shown big on screen as it is spoken. ${S.hook} add_components empty.`,
    `2. 'layer' scenes, one part or a few at a time, adding exactly these components in this order, at most ${L.perScene} per scene: ${path.map(kw).join(", ")}. ${S.spine} Say each added component's keyword out loud, in add_components order.`,
    `3. one 'walkthrough' scene right after them: the core flow told once, end to end, as one short story. Say these step labels in order, each as the action of a natural sentence about who does what. Call each part by its keyword, the name on screen that the layer scenes already said; its analogy role may ride along ('the demo app, your front desk, sends the message') but never stands in for it, since a viewer cannot map a new role name to a box, adding articles and verb endings as speech needs ('send message' becomes 'sends the message'): ${steps}. Good: 'You type a question, and the counter sends the message to the manager.' Bad: 'Step one is send message.' Never number the steps out loud. Follow one concrete example from the repo the whole way (a real input like the words 'hello world', a real message, a real file) and say what it looks like after each step, the way Caleb follows one 2 TB model from disk to GPU. End with the concrete thing the user gets back (e.g. 'a working fix in your chat'), not 'an answer'. Give it a heading of 2 to 4 lowercase words that the narration actually says, naming this moment rather than labelling it. About ${Math.round(L.wordsPerScene * 1.6)} words. add_components empty.`,
    side.length
      ? `4. then 'layer' scene(s) for the side parts the request does not pass through: ${side.map(kw).join(", ")}. Keep them short: as few scenes as fit (at most ${L.perScene} parts per scene), one short clause per part (its keyword and plain job), opening with one tie-back to the journey such as 'Around the manager sit a few helpers:'. Do not repeat the same opener for each part.`
      : "4. (no side parts)",
    arch.scale.length
      ? `5. ${arch.scale.length} short 'scale' scene(s), one per scale risk, in the given order: what breaks at that traffic level and why (problem keyword), then the fix (fix keyword), in 2 short plain sentences ('The fix is ...'). callouts: [{target: component id, text: problem keyword, color: red}, {target: component id, text: fix keyword, color: green}].`
      : "5. no 'scale' scenes.",
    ...notesRules(L.notes),
    S.recap
      ? `6. one closing scene of kind 'recap': ${S.close} When the flow comes back through a part, say that part again, so each pair you name back to back has an arrow between them.`
      : `6. no 'recap' scene and no summary of the parts. ${S.close}`,
    `Headings: ${S.headings}`,
    `Keep the hook and the layer scenes brief enough that the walkthrough starts before the halfway mark of the whole narration, counted in words. Each scene's narration is about ${L.wordsPerScene} words (hook and recap can be shorter). There is no set length. At ${L.tempo.wps} words per second this repo's parts come to roughly ${lo} to ${hi} seconds; shorter is right if the story is told, never pad.`,
    "Only say two parts talk to each other ('the poll input feeds the ui core') when the connections list joins them; otherwise tell the hop through the part between them.",
    "Leave add_connections, board_nodes, board_edges, highlights empty (the renderer derives them). callouts empty except in scale scenes. items empty except in notes scenes.",
    "Never state a traffic, user, latency or cost number as a fact about this app: the repo does not tell you its real load. Numbers only appear as clearly labelled assumptions.",
    "Proofread every sentence aloud: a/an and singular/plural agree with the noun, no half-finished phrases. Headings are plain 2 to 4 word names for a place in the analogy (like 'the front desk' or 'the back office'); they are on screen, never spoken as if they were a part.",
    "title: the product name in lowercase. subtitle: under 8 lowercase words, plain.",
  ].join("\n");
}

const Critique = z.object({
  undefined_terms: z.array(z.object({ term: z.string(), scene: z.string() })).describe("terms a newcomer would not know, used without a plain-words explanation at their first use"),
  flow_clear: z.boolean().describe("true if a newcomer could retell how one request goes from the user to the result"),
  flow_problem: z.string().describe("what is missing from the flow, or empty"),
});
export type Critique = z.infer<typeof Critique>;

/** Model check: read the narration as a newcomer would. */
async function critiquePlan(ledger: CostLedger, plan: ScenePlan, audience: string): Promise<Critique> {
  const script = plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n");
  return sparkJson({
    ledger, step: "plan-check", schema: Critique, name: "critique", effort: "low", maxTokens: 6000, hedge: true,
    messages: [
      { role: "system", content: `You are ${audience}, hearing this explainer narration once, in order. List every term you would not know (an acronym, product, protocol or internal name) that is used without a plain-words explanation at or before its first use. Words every developer knows (server, database, browser, app, API, model) do not count; a part the narration explains in plain words counts as explained. Then say whether you could now retell how one request goes from the user to the result, and if not, what is missing. Be strict but fair; at most 8 terms.` },
      { role: "user", content: script },
    ],
  });
}

const words4 = (s: string) => norm(s).split(" ").filter((w) => w.length >= 4 && !/^(that|with|from|into|your|this|their|which|where|every)$/.test(w));

/**
 * Deterministic story check (docs/explaining-playbook.md): what the hook says, that the core flow is
 * narrated hop by hop and early, that the analogy shows up, and that the recap retells the trip.
 */
export function checkStory(plan: ScenePlan, arch: Architecture, analogy = ""): string[] {
  const issues: string[] = [];
  const sc = plan.scenes;
  const kwOf = (id: string) => arch.components.find((c) => c.id === id)?.keyword ?? id;
  const { path } = journeyOrder(arch);
  const hook = sc.find((s) => s.kind === "hook");
  if (!hook || sc[0] !== hook) issues.push("the video must open with a 'hook' scene saying what this is and why you'd care");
  const parts = arch.components.filter((c) => hook && norm(hook.narration).includes(norm(c.keyword)));
  if (hook) {
    const line = hookLine(hook.narration);
    const n = wordCount(line);
    if (n > 16) issues.push(`the hook's first sentence has ${n} words; make it a question or one surprising claim of at most 14 words`);
    if (/^(hi|hello|welcome|today|in this video|this is|meet|let'?s)\b/i.test(line)) issues.push(`the hook opens with "${line.split(/\s+/).slice(0, 3).join(" ")}"; open on a question or a surprising claim instead`);
    if (n === wordCount(hook.narration)) issues.push("the hook is a single sentence; after the hook line, say what this is, the stakes and the analogy");
  }
  if (hook && parts.length > 1) issues.push(`the hook names parts (${parts.map((c) => c.keyword).join(", ")}) before the story starts; say what it is in plain words instead`);
  if (analogy) {
    const aw = words4(analogy);
    const told = sc.filter((s) => s.kind === "hook" || s.kind === "layer" || s.kind === "walkthrough").map((s) => norm(s.narration)).join(" ");
    if (aw.length && !aw.some((w) => told.includes(w.slice(0, 5)))) issues.push(`the everyday analogy (${analogy}) never appears in the hook or the journey`);
  }
  const wi = sc.findIndex((s) => s.kind === "walkthrough");
  if (wi < 0 && arch.walkthrough.steps.length) issues.push("there is no 'walkthrough' scene telling the core flow end to end");
  if (wi >= 0) {
    const w = norm(sc[wi].narration);
    const ws = spokenWords(sc[wi].narration);
    let at = 0;
    const missing: string[] = [];
    // "sends the message" says the step "send message": small words between and verb endings are fine
    for (const st of arch.walkthrough.steps) { const k = phraseAt(ws, st.label, at); if (k < 0) missing.push(st.label); else at = k + 1; }
    if (missing.length) issues.push(`the walkthrough must say each step label in order (articles between its words and verb endings are fine); missing or out of order: ${missing.map((m) => `"${m}"`).join(", ")}`);
    if (/\bstep (one|two|three|1|2|3)\b/.test(w)) issues.push("the walkthrough reads like a numbered list ('step one is ...'); tell it as a story where each part does its step");
    const before = sc.slice(0, wi);
    const late = path.filter((id) => !before.some((s) => s.add_components.includes(id)));
    if (late.length) issues.push(`parts on the journey are drawn after the walkthrough: ${late.map(kwOf).join(", ")}`);
    const deep = before.filter((s) => s.kind === "scale" || s.kind === "notes");
    if (deep.length) issues.push("scale or list scenes come before the core flow; they belong after it");
    const total = sc.reduce((n, s) => n + wordCount(s.narration), 0);
    const pre = before.reduce((n, s) => n + wordCount(s.narration), 0);
    if (total && pre / total > 0.55) issues.push(`the core flow starts ${Math.round((pre / total) * 100)}% of the way in; it should start before the halfway mark`);
  }
  const recap = sc.find((s) => s.kind === "recap");
  if (recap && path.length) {
    const r = norm(recap.narration);
    const said = path.filter((id) => r.includes(norm(kwOf(id))) || words4(kwOf(id)).some((x) => r.includes(x)));
    if (said.length < Math.min(3, path.length)) issues.push("the recap must retell the trip, saying the journey parts in order");
  }
  return [...issues, ...undrawnLinks(plan, arch), ...speechIssues(plan, arch, analogy)];
}

/**
 * A sentence that names two parts one after the other ("the poll input feeds the rebuild widgets")
 * tells the viewer they talk to each other; the board has to draw that arrow. Plain lists ("a and b")
 * are not links.
 */
// a label where the arrow's source fetches from its target, and the verbs that tell the opposite way
const PULL = /^(read|reads|fetch|fetches|pull|pulls|poll|polls|load|loads|query|queries|get|gets|watch|watches|subscribe|subscribes)\b/i;
const PUSH = / (hands|hand|sends|send|gives|give|passes|pass|pushes|push|feeds|feed|emits|emit|delivers|deliver|streams|stream) /;
export function undrawnLinks(plan: ScenePlan, arch: Architecture): string[] {
  const linked = (a: string, b: string) => arch.connections.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const out: string[] = [];
  for (const s of plan.scenes) {
    if (s.kind !== "layer" && s.kind !== "walkthrough" && s.kind !== "recap") continue;
    for (const sent of s.narration.split(/(?<=[.!?;])\s+/)) {
      const t = ` ${norm(sent)} `;
      const hits = arch.components.flatMap((c) => {
        const k = ` ${norm(c.keyword)} `;
        const at: { id: string; kw: string; i: number; end: number }[] = [];
        if (k.trim()) for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + 1)) at.push({ id: c.id, kw: c.keyword, i, end: i + k.length - 1 });
        return at;
      }).sort((a, b) => a.i - b.i).filter((h, i, all) => !all.some((o, j) => j !== i && o.i <= h.i && o.end >= h.end && o.end - o.i > h.end - h.i));
      for (let i = 1; i < hits.length; i++) {
        const [a, b] = [hits[i - 1], hits[i]];
        if (a.id === b.id) continue;
        const between = t.slice(a.end, b.i).trim().replace(/\b(the|a|an|your)\b/g, "").trim();
        if (linked(a.id, b.id)) {
          // the board's arrow says b pulls from a; narration that has a push to b tells it backwards
          const pull = arch.connections.find((e) => e.from === b.id && e.to === a.id && PULL.test(e.label));
          const forward = arch.connections.some((e) => e.from === a.id && e.to === b.id);
          if (pull && !forward && PUSH.test(` ${between} `)) {
            const msg = `${s.id}: says the ${a.kw} ${between.split(" ")[0]} to the ${b.kw}, but the ${b.kw} ${pull.label} from the ${a.kw}; tell it in the board's direction`;
            if (!out.includes(msg)) out.push(msg);
          }
          continue;
        }
        if (/^(and|or|plus|nor)?$/.test(between)) continue;
        const msg = `${s.id}: says the ${a.kw} and the ${b.kw} talk directly, but the board draws no arrow between them; tell the hop through the part that really sits between them`;
        if (!out.includes(msg)) out.push(msg);
      }
    }
  }
  return out;
}

// phrases that announce instead of explain (docs/explaining-playbook.md, "No filler")
const FILLER = /\b(you'?ll (meet|see|find|notice)|then you'?ve got|let'?s (take a look|dive in|get into it)|in this video|basically|it'?s (special|important|worth noting)|without further ado|as you can see)\b/gi;
export function fillerIn(text: string): string[] {
  return [...new Set([...text.replace(/[’‘]/g, "'").matchAll(FILLER)].map((m) => m[0].toLowerCase()))];
}

/** The hook's first sentence, which the board shows as big kinetic type while it is spoken. */
export function hookLine(narration: string): string {
  return narration.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
}

/**
 * Lines that would not sound like a person talking: a missing article ("will run agent"), the same
 * sentence opener over and over, or a scene heading read out as if it were a part ("next it reaches
 * save then work").
 */
export function speechIssues(plan: ScenePlan, arch: Architecture, analogy = ""): string[] {
  const issues: string[] = [];
  const metaphor = pictureWords(analogy, arch);
  for (const s of plan.scenes) {
    const miss = missingArticles(s.narration);
    if (miss.length) issues.push(`${s.id}: missing article in ${miss.map((m) => `"${m}"`).join(", ")}; say "the" or "a" before the noun`);
    for (const g of grammarSlips(s.narration, { metaphor })) issues.push(`${s.id}: ${g}`);
    const filler = fillerIn(s.narration);
    if (filler.length) issues.push(`${s.id}: filler ${filler.map((f) => `"${f}"`).join(", ")}; say the thing itself instead`);
  }
  // the same sentence opener three times over reads like a template, not a person talking
  const openers = new Map<string, number>();
  for (const sent of plan.scenes.flatMap((x) => x.narration.split(/(?<=[.!?])\s+/))) {
    const k = norm(sent).split(" ").slice(0, 3).join(" ");
    if (k.split(" ").length === 3) openers.set(k, (openers.get(k) ?? 0) + 1);
  }
  for (const [k, n] of openers) if (n >= 3) issues.push(`${n} sentences open with '${k}'; vary them`);
  // the same opener twice in a row, across scenes or within one, already sounds like a template
  const opener = (t: string) => norm(t).split(" ").slice(0, 2).join(" ");
  plan.scenes.forEach((s, i) => {
    const prev = plan.scenes[i - 1];
    if (prev && opener(s.narration).split(" ").length === 2 && opener(s.narration) === opener(prev.narration)) issues.push(`${prev.id} and ${s.id} both open with '${opener(s.narration)}'; vary them`);
    const sents = s.narration.split(/(?<=[.!?])\s+/);
    for (let k = 1; k < sents.length; k++) if (opener(sents[k]).split(" ").length === 2 && opener(sents[k]) === opener(sents[k - 1])) issues.push(`${s.id}: two sentences in a row open with '${opener(sents[k])}'; vary them`);
    // the viewer is "you" all the way through
    const third = s.narration.match(/\bthe (guest|user|customer|visitor|viewer)s?\b/i);
    if (third) issues.push(`${s.id}: says "${third[0]}" for the viewer; keep it "you"`);
    // a code name in front of the plain name ("called React Web")
    const code = s.narration.match(/\bcalled (the )?[A-Z][\w-]*( [A-Z][\w-]*)*/);
    if (code) issues.push(`${s.id}: "${code[0]}" puts a code name up front; use the plain name, and add the code name after it only if it helps`);
  });
  // a part is explained once; "the regex bpe, a smart chopping method" again in the recap slows it down
  const defined = new Set<string>();
  for (const s of plan.scenes) {
    const text = s.narration.toLowerCase().replace(/[’‘]/g, "'");
    for (const c of arch.components) {
      const k = c.keyword.toLowerCase();
      if (!k) continue;
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, (a|an|that's|that is|which is|the) `, "g");
      // "the host app, the ui core fills…" lists the next part in a chain; it does not explain the first
      const names = arch.components.map((o) => o.keyword.toLowerCase()).filter(Boolean);
      const says = [...text.matchAll(re)].some((m) => m[1] !== "the" || !names.some((n) => text.startsWith(n, m.index! + m[0].length)));
      if (!says) continue;
      if (defined.has(k)) issues.push(`${s.id}: "${c.keyword}" is explained again; say what it is only the first time, then just its name`);
      defined.add(k);
    }
  }
  const keywords = new Set(arch.components.map((c) => norm(c.keyword)));
  const labels = new Set(arch.walkthrough.steps.map((x) => norm(x.label)));
  const an = norm(analogy);
  for (const s of plan.scenes) {
    if (s.kind !== "layer" && s.kind !== "walkthrough" && s.kind !== "scale") continue;
    const h = norm(s.heading).replace(/\s*cont$/, "").trim();
    // "the front desk" said aloud is a normal noun phrase; "save then work" said as a place is not
    // "follow one click" is the walkthrough heading the plan prompt asks for, and it reads as an action, not a place
    if (s.kind === "walkthrough" && /^follow\b/.test(h)) continue;
    if (h.split(" ").length < 2 || /^(the|a|an|one|your|our|this|that)\b/.test(h) || keywords.has(h) || labels.has(h) || (an && an.includes(h))) continue;
    if (` ${norm(s.narration)} `.includes(` ${h} `)) issues.push(`${s.id}: the heading "${h}" is spoken as if it were a part; name the actual part or say it in plain words`);
  }
  return issues;
}

const Polish = z.object({
  scenes: z.array(z.object({ id: z.string(), narration: z.string() })),
  renames: z.array(z.object({ id: z.string(), keyword: z.string() })),
});

/** Words of the borrowed picture ("cook tickets", "kitchen") that the map itself never uses, so said bare they stand in for a part. */
export function pictureWords(analogy: string, arch: Architecture): string[] {
  const used = norm([...arch.components.flatMap((c) => [c.keyword, c.name, c.what]), ...arch.connections.map((c) => c.label), ...arch.walkthrough.steps.map((c) => c.label)].join(" "));
  const have = new Set(used.split(" ").flatMap((w) => [w, w.replace(/s$/, "")]));
  // nouns only: "from drawing" or "into everything" are ordinary speech
  const words = norm(analogy).split(" ").filter((w) => w.length >= 4 && !/(ing|ed)$/.test(w) && !/^(every|some|any|no)thing$/.test(w) && !/^(that|this|with|from|then|than|each|every|whole|whoever|does|into|your|their|what|when|where|which|simple|short|loop|order)$/.test(w));
  return [...new Set(words)].filter((w) => !have.has(w) && !have.has(w.replace(/s$/, "")));
}

/** The phrases a scene's narration must keep, in the order it says them, so the board stays in sync. */
export function syncPhrases(s: Scene, arch: Architecture): string[] {
  const ws = spokenWords(s.narration);
  const cands = [...arch.components.map((c) => c.keyword), ...(s.kind === "walkthrough" ? arch.walkthrough.steps.map((x) => x.label) : []), ...(s.items ?? []).map((i) => i.text), ...(s.board_nodes ?? []).map((n) => n.keyword)];
  return cands.map((p) => ({ p, at: phraseAt(ws, p) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at).map((x) => x.p);
}

/** True when a rewrite still says every sync phrase in order and stays close to the original length. */
export function keepsSync(orig: string, next: string, phrases: string[]): boolean {
  const r = wordCount(next) / Math.max(1, wordCount(orig));
  if (r < 0.8 || r > 1.25 || soundsLikeKeywords(next)) return false;
  const ws = spokenWords(next);
  let at = 0;
  for (const p of phrases) { const k = phraseAt(ws, p, at); if (k < 0) return false; at = k + 1; }
  return true;
}

const okKeyword = (k: string) => /^[a-z][a-z ]{1,30}$/.test(k) && k.trim().split(/\s+/).length <= 3;

/**
 * Narration polish: one Muse Spark rewrite so every line sounds like a person explaining at a
 * whiteboard (grammatical, articles, contractions, varied openers), with awkward part names turned into
 * plain ones. A scene keeps its rewrite only when the board can still sync to it; any speech problems
 * left get one more try.
 */
export async function polishNarration(o: { ledger: CostLedger; plan: ScenePlan; arch: Architecture; analogy?: string; audience: string; progress?: Progress }): Promise<{ plan: ScenePlan; renames: { id: string; keyword: string }[]; rewritten: number; kept: string[]; issues: string[] }> {
  o.progress?.({ stage: "plan", message: "polishing the narration" });
  const sys = [
    "You rewrite narration for a whiteboard explainer video so it sounds like a friendly person talking, the way Crayon Capital or Caleb Writes Code explain systems: short natural sentences, a little warmth, no jargon left unexplained.",
    `Audience: ${o.audience}.`,
    "Rules for every scene:",
    "- Grammatical spoken English: articles before nouns ('the guest sends a message to the manager'), subject and verb agree, contractions where a person would use them (it's, you'd, that's, doesn't).",
    "- Vary how sentences start; never open three sentences the same way.",
    "- Keep the meaning, the facts and the order of events exactly. Add nothing new and drop nothing.",
    "- Keep each scene within 10% of its word count.",
    "- Each scene lists 'must_say': phrases the board syncs to. Say each one, in that order, with its words in that order. You may put 'the', 'a' or 'your' between its words and change verb endings ('send message' -> 'sends the message'), nothing else.",
    "- Never read a scene heading aloud as if it were a part of the system.",
    "- A step's verb is the sentence's only verb for that action; never pair it with a synonym ('files and saves', 'presents and shows').",
    "- Plain names before code names: drop 'called React Web' and similar unless the code name truly helps; if it stays, put it after the plain name with a few words on what it is.",
    "- Any technical word left ('api', 'driver', 'harness', a database or framework name) gets a few plain words saying what it is, the first time it's said.",
    "- The viewer is 'you' all the way through; never 'the guest', 'the user' or 'the customer'.",
    "- No two scenes, and no two sentences in a row, open with the same words.",
    "- Every sentence is a whole sentence with its own subject and verb; no fragments like 'It's incremental counts that update tallies.' 'a' and 'an' go only before one thing ('a load of pieces', never 'a ready loads of').",
    "- Say what a part is only the first time it's named; after that, just its name. The recap never re-explains a part.",
    "- No filler that announces instead of explains: never 'you'll meet', 'you'll see', 'you'll find', 'then you've got', 'let's take a look', 'basically', 'it's special'.",
    "- The hook scene's first sentence is shown on screen word by word: keep it a question or one surprising claim of at most 14 words, and keep it the first sentence.",
    "Part names: 'parts' lists every part's spoken name. If a name sounds awkward when spoken as a thing (for example 'computer use', a verb phrase, or an internal code name), give it a plain 1 to 3 word lowercase name in 'renames' (for example 'browser robot'), and use the new name in every scene instead of the old one. Rename only names that are genuinely awkward; most need none.",
    "Return every scene id with its rewritten narration.",
  ].join("\n");
  const payload = (p: ScenePlan) => JSON.stringify({
    analogy: o.analogy ?? "",
    parts: o.arch.components.map((c) => ({ id: c.id, name: c.keyword, what: c.what })),
    scenes: p.scenes.map((s) => ({ id: s.id, kind: s.kind, heading: s.heading, words: wordCount(s.narration), must_say: syncPhrases(s, o.arch), narration: s.narration })),
  });
  const ask = (msgs: { role: "system" | "user" | "assistant"; content: string }[], step: string) => sparkJson({ ledger: o.ledger, step, schema: Polish, name: "narration_polish", effort: "minimal", maxTokens: 8000, hedge: true, messages: msgs });
  const apply = (base: ScenePlan, out: z.infer<typeof Polish>, renames: Map<string, string>) => {
    const kept: string[] = [];
    let rewritten = 0;
    const scenes = base.scenes.map((s) => {
      const next = out.scenes.find((x) => x.id === s.id)?.narration?.trim();
      const want = syncPhrases(s, o.arch).map((p) => { const c = o.arch.components.find((x) => x.keyword === p); return c && renames.has(c.id) ? renames.get(c.id)! : p; });
      if (next && keepsSync(s.narration, next, want)) { rewritten++; return { ...s, narration: tidySpeech(next) }; }
      kept.push(s.id);
      return s;
    });
    return { plan: { ...base, scenes }, kept, rewritten };
  };
  const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [{ role: "system", content: sys }, { role: "user", content: payload(o.plan) }];
  // polish only improves wording: an empty answer gets one more try, then the plan goes on as written
  const out = await ask(msgs, "narration-polish").catch(() => ask(msgs, "narration-polish-again")).catch((e: unknown) => {
    o.progress?.({ stage: "plan", message: "narration polish failed; keeping the narration as written" });
    return e instanceof Error ? e : new Error(String(e));
  });
  if (out instanceof Error) return { plan: o.plan, renames: [], rewritten: 0, kept: o.plan.scenes.map((x) => x.id), issues: [`narration polish skipped: ${out.message}`, ...speechIssues(o.plan, o.arch, o.analogy)] };
  const taken = new Set(o.arch.components.map((c) => c.keyword));
  const renames = new Map<string, string>();
  for (const r of out.renames) {
    const k = r.keyword.trim().toLowerCase();
    const c = o.arch.components.find((x) => x.id === r.id);
    if (c && okKeyword(k) && !taken.has(k) && k !== c.keyword) { renames.set(c.id, k); taken.add(k); }
  }
  // a rename only stands if no scene that said the old name kept its old narration
  let res = apply(o.plan, out, renames);
  const renamed = (r: Map<string, string>): Architecture => ({ ...o.arch, components: o.arch.components.map((c) => (r.has(c.id) ? { ...c, keyword: r.get(c.id)! } : c)) });
  const dropBadRenames = () => {
    for (const [id] of [...renames]) {
      const old = o.arch.components.find((c) => c.id === id)!.keyword;
      if (res.plan.scenes.some((s) => phraseAt(spokenWords(s.narration), old) >= 0)) renames.delete(id);
    }
  };
  dropBadRenames();
  let issues = speechIssues(res.plan, renamed(renames), o.analogy);
  if (issues.length || res.kept.length) {
    o.progress?.({ stage: "plan", message: `narration polish: ${issues.length} issue(s), ${res.kept.length} scene(s) kept as is; one more try` });
    const again = await ask([...msgs, { role: "assistant", content: JSON.stringify(out) }, { role: "user", content: `Fix these and return all scenes again (same renames):\n${[...issues, ...res.kept.map((id) => `${id}: the rewrite dropped a must_say phrase, changed its order, or changed the length by more than 20%`)].map((x, i) => `${i + 1}. ${x}`).join("\n")}` }], "narration-polish-retry").catch(() => undefined);
    if (again) {
      const second = apply(o.plan, again, renames);
      // per scene, prefer the retry when it passed, else the first rewrite
      const scenes = o.plan.scenes.map((s, i) => (second.kept.includes(s.id) ? res.plan.scenes[i] : second.plan.scenes[i]));
      const kept = res.kept.filter((id) => second.kept.includes(id));
      res = { plan: { ...o.plan, scenes }, kept, rewritten: scenes.length - kept.length };
      dropBadRenames();
      issues = speechIssues(res.plan, renamed(renames), o.analogy);
    }
  }
  return { plan: res.plan, renames: [...renames].map(([id, keyword]) => ({ id, keyword })), rewritten: res.rewritten, kept: res.kept, issues };
}

export async function planRepoScenes(o: { ledger: CostLedger; arch: Architecture; spec: ExplainSpec; progress?: Progress }): Promise<ScenePlan & { repairs: string[]; check: { first: string[]; final: string[]; revised: boolean }; renames: { id: string; keyword: string }[]; polish: { rewritten: number; kept: string[]; issues: string[] } }> {
  const L = o.spec;
  const [lo, hi] = coverageSeconds(L, { components: o.arch.components.length, steps: o.arch.walkthrough.steps.length, scale: o.arch.scale.length });
  o.progress?.({ stage: "plan", message: "writing the scene plan" });
  const compact = {
    product: o.arch.product, one_liner: o.arch.one_liner,
    components: o.arch.components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, layer: c.layer, keyword: c.keyword, what: c.what })),
    connections: o.arch.connections.map((c) => `${c.from}>${c.to} (${c.label})`),
    walkthrough: { name: o.arch.walkthrough.name, steps: o.arch.walkthrough.steps.map((s) => `${s.from}>${s.to} (${s.label})`) },
    scale: o.arch.scale.map((s) => ({ component: s.component, at: s.at, problem: s.problem, why: s.why, fix: s.fix, fix_detail: s.fix_detail })),
  };
  const sys = repoSystem(o.arch, L, lo, hi);
  const user = JSON.stringify(compact);
  const ask = (extra: { role: "assistant" | "user"; content: string }[] = []) => sparkJson({
    ledger: o.ledger, step: extra.length ? "scene-plan-revise" : "scene-plan", schema: ScenePlan, name: "scene_plan", effort: "low", maxTokens: 9000, hedge: true,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }, ...extra],
  });
  const raw = await ask();
  let plan = repairRepoPlan(raw, o.arch, L);
  // the newcomer check and the narration polish both read the same draft, so they run side by side;
  // what the check found is then looked for in the polished narration, which is what the viewer hears
  const polish = (p: ScenePlan & { repairs: string[] }) => polishNarration({ ledger: o.ledger, plan: p, arch: o.arch, analogy: L.brief.analogy, audience: L.audience, progress: o.progress });
  const critique = (p: ScenePlan) => critiquePlan(o.ledger, p, L.audience).catch(() => undefined);
  const renamedArch = (r: { id: string; keyword: string }[]): Architecture => ({ ...o.arch, components: o.arch.components.map((c) => ({ ...c, keyword: r.find((x) => x.id === c.id)?.keyword ?? c.keyword })) });
  const found = (p: ScenePlan, arch: Architecture, c: Critique | undefined) => [
    ...checkStory(p, arch, L.brief.analogy),
    ...(c?.undefined_terms ?? []).filter((t) => said(p, t.term)).map((t) => termIssue(t)),
    ...(c && !c.flow_clear ? [`a newcomer could not retell the flow: ${c.flow_problem}`] : []),
  ];
  let [pol, crit] = await Promise.all([polish(plan), critique(plan)]);
  let arch = renamedArch(pol.renames);
  const first = found(pol.plan, arch, crit);
  let final = first, revised = false, story = pol.plan;
  if (first.some(structural)) {
    // the board itself is wrong (scene order, what each scene draws): the whole plan is redone once
    o.progress?.({ stage: "plan", message: `self-check: ${first.length} issue(s), revising the plan once` });
    plan = repairRepoPlan(await ask([{ role: "assistant", content: JSON.stringify(raw) }, { role: "user", content: `A newcomer test of this plan found these problems. Return the full corrected plan, keeping what works:\n${first.map((x, i) => `${i + 1}. ${x}`).join("\n")}` }]), o.arch, L);
    revised = true;
    [pol, crit] = await Promise.all([polish(plan), critique(plan)]);
    arch = renamedArch(pol.renames);
    story = pol.plan;
    final = found(story, arch, crit);
  }
  if (final.length && !final.some(structural)) {
    // only the words are off: one small rewrite of the scenes involved, then the same checks again
    o.progress?.({ stage: "plan", message: `self-check: ${final.length} issue(s), fixing the narration` });
    const fix = await fixNarration({ ledger: o.ledger, plan: story, arch, issues: final, audience: L.audience });
    revised = revised || fix.changed.length > 0;
    story = fix.plan;
    const asked = final.filter((x) => x.startsWith("\"") || x.startsWith("a newcomer"));
    const left = asked.length ? await recheckTerms(o.ledger, story, asked, L.audience) : [];
    final = [...checkStory(story, arch, L.brief.analogy), ...left];
  }
  return { ...plan, scenes: story.scenes, check: { first, final, revised }, renames: pol.renames, polish: { rewritten: pol.rewritten, kept: pol.kept, issues: pol.issues } };
}

const termIssue = (t: { term: string; scene: string }) => `"${t.term}" (${t.scene}) is used without a plain-words explanation; explain it in the same sentence or drop it`;
const said = (p: ScenePlan, term: string) => p.scenes.some((s) => ` ${norm(s.narration)} `.includes(` ${norm(term)} `));

/** Self-check problems only a new plan fixes: what the scenes draw, or in what order. The rest are wording. */
export const structural = (issue: string) => /^(the video must open with a 'hook' scene|there is no 'walkthrough' scene|parts on the journey are drawn after|scale or list scenes come before|the core flow starts )/.test(issue);

/**
 * One small Muse Spark rewrite of just the scenes the self-check flagged. A scene keeps its rewrite only
 * when the board can still sync to it, so a fix never costs the drawing its cues.
 */
export async function fixNarration(o: { ledger: CostLedger; plan: ScenePlan; arch: Architecture; issues: string[]; audience: string }): Promise<{ plan: ScenePlan; changed: string[] }> {
  const named = o.plan.scenes.filter((s) => o.issues.some((x) => x.includes(s.id)));
  // a problem that names no scene (the same opener three times, the flow as a whole) may need any of them
  const scope = o.issues.some((x) => !o.plan.scenes.some((s) => x.includes(s.id))) ? o.plan.scenes : named;
  const out = await sparkJson({
    ledger: o.ledger, step: "narration-fix", schema: Polish, name: "narration_fix", effort: "minimal", maxTokens: 5000,
    messages: [
      { role: "system", content: [
        "You fix specific problems in a whiteboard explainer's narration. The viewer hears every scene once, in order.",
        `Audience: ${o.audience}.`,
        "- Change only what the problems need; keep everything else word for word, including facts and their order.",
        "- Each scene lists 'must_say': phrases the board syncs to. Keep each one, in that order, with its words in that order ('the', 'a' or 'your' may go between its words, verb endings may change).",
        "- Keep each scene within 15% of its word count.",
        "- A term explained in plain words: a few words right where it's first said ('the font atlas, one image holding every letter').",
        "- Only say two parts talk to each other when the connections list joins them; otherwise tell the hop through the part between them.",
        "- Return only the scenes you changed, by id, with their full narration; renames stays empty.",
      ].join("\n") },
      { role: "user", content: JSON.stringify({
        problems: o.issues,
        parts: o.arch.components.map((c) => ({ id: c.id, name: c.keyword, what: c.what })),
        connections: o.arch.connections.map((c) => `${o.arch.components.find((x) => x.id === c.from)?.keyword ?? c.from} > ${o.arch.components.find((x) => x.id === c.to)?.keyword ?? c.to} (${c.label})`),
        context: o.plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n"),
        scenes: scope.map((s) => ({ id: s.id, kind: s.kind, words: wordCount(s.narration), must_say: syncPhrases(s, o.arch), narration: s.narration })),
      }) },
    ],
  }).catch(() => undefined);
  const changed: string[] = [];
  const scenes = o.plan.scenes.map((s) => {
    const next = out?.scenes.find((x) => x.id === s.id)?.narration?.trim();
    if (!next || next === s.narration || !scope.includes(s) || !keepsSync(s.narration, next, syncPhrases(s, o.arch))) return s;
    changed.push(s.id);
    return { ...s, narration: tidySpeech(next) };
  });
  return { plan: { ...o.plan, scenes }, changed };
}

const Recheck = z.object({
  open: z.array(z.string()).describe("the numbers of the problems still there, as written"),
});
/** A quick second look at the terms and flow the newcomer check flagged: which are still unexplained. */
async function recheckTerms(ledger: CostLedger, plan: ScenePlan, issues: string[], audience: string): Promise<string[]> {
  const r = await sparkJson({
    ledger, step: "plan-recheck", schema: Recheck, name: "recheck", effort: "minimal", maxTokens: 1500,
    messages: [
      { role: "system", content: `You are ${audience}, hearing this explainer narration once, in order. For each numbered problem, decide whether it is still there in the narration below: a term counts as explained when plain words say what it is at or before its first use. Return the numbers still there.` },
      { role: "user", content: `${issues.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nNarration:\n${plan.scenes.map((s) => `[${s.id}] ${s.narration}`).join("\n")}` },
    ],
  }).catch(() => undefined);
  if (!r) return issues;
  return issues.filter((_, i) => r.open.some((n) => n.trim().replace(/\.$/, "") === String(i + 1)));
}

function notesRules(slots: { after: string; heading: string; brief: string }[]): string[] {
  if (!slots.length) return [];
  return [
    "Extra 'notes' scenes (whiteboard lists). Place each right after the scene named, use the heading given, and fill items:",
    ...slots.map((n) => `- notes "${n.heading}" after the ${n.after} scene(s): ${n.brief}`),
    "Each item text is 2 to 7 lowercase words that read as a phrase; keep commas and \"or\" in a list. The narration reads the items in order and adds the reasoning. icon from the same icon names as the components.",
  ];
}

const HEDGE = /\b(assum|estimat|rough|ballpark|guess|hypothetical|let's say|say we|imagine|suppose)/i;
const NUMBER = /(^|[^a-z0-9])\d/i;

/** Ground and label list items: targets must exist, any number is an estimate, evidence is a real file. */
export function validateNotes(items: NoteItem[], o: { ids?: Set<string>; files?: Set<string>; evidenceOf?: (id: string) => string; source?: string }): { items: NoteItem[]; repairs: string[] } {
  const repairs: string[] = [];
  const out: NoteItem[] = [];
  for (const it0 of items.slice(0, 6)) {
    const it = { ...it0, text: lower(it0.text).split(/\s+/).slice(0, 7).join(" ") };
    if (o.source !== undefined) {
      // post/article: the item must be backed by a verbatim quote
      if (!quoteInSource(it.evidence, o.source)) { repairs.push(`note "${it.text}" dropped: quote not in source`); continue; }
      it.target = "";
    } else {
      if (it.target && !o.ids?.has(it.target)) { repairs.push(`note "${it.text}": unknown target ${it.target}`); it.target = ""; }
      // a standalone number ("50k", "~4", "10x"), not a name like d1 or r2
      const hasNumber = NUMBER.test(it.text);
      if (hasNumber && !it.estimate) { it.estimate = true; repairs.push(`note "${it.text}" marked as estimate`); }
      // the tag is for assumed numbers; on a plain claim it would read as doubt about the code itself
      if (!hasNumber && it.estimate) { it.estimate = false; repairs.push(`note "${it.text}": estimate tag dropped (no number)`); }
      if (it.evidence && !o.files?.has(it.evidence)) it.evidence = it.target && o.evidenceOf ? o.evidenceOf(it.target) : "";
      if (!it.estimate && !it.evidence && it.target && o.evidenceOf) it.evidence = o.evidenceOf(it.target);
    }
    out.push(it);
  }
  return { items: out, repairs };
}

/** Deterministic checker + repair, so the renderer can trust the plan. */
export function repairRepoPlan(plan: ScenePlan, arch: Architecture, L: { perScene: number }): ScenePlan & { repairs: string[] } {
  const repairs: string[] = [];
  const ids = new Set(arch.components.map((c) => c.id));
  const seen = new Set<string>();
  const scenes: Scene[] = [];
  const blank = (s: Partial<Scene>): Scene => ({ id: "", kind: "layer", heading: "", narration: "", add_components: [], add_connections: [], board_nodes: [], board_edges: [], highlights: [], callouts: [], items: [], ...s });
  const files = new Set(arch.components.flatMap((c) => c.evidence));
  const evidenceOf = (id: string) => arch.components.find((c) => c.id === id)?.evidence[0] ?? "";
  for (const s0 of plan.scenes) {
    const s = { ...s0, heading: shortHeading(s0.heading) };
    if (s.kind === "layer") {
      const add = s.add_components.filter((id) => { if (!ids.has(id)) { repairs.push(`unknown component ${id} removed`); return false; } if (seen.has(id)) { repairs.push(`${id} added twice`); return false; } return true; });
      add.forEach((id) => seen.add(id));
      if (!add.length) { repairs.push(`empty layer scene "${s.heading}" dropped`); continue; }
      if (add.length > L.perScene) {
        // split: keep sentences with the components they mention
        // too few sentences to go round: fall back to clauses, so no line is ever spoken twice
        const parts = Math.ceil(add.length / L.perScene);
        let pieces: string[] = s.narration.match(/[^.!?]+[.!?]*/g) ?? [s.narration];
        if (pieces.length < parts) pieces = s.narration.split(/(?<=[.!?,;:])\s+/);
        const tidy = (t: string) => { const x = t.trim().replace(/[,;:]$/, "."); return x ? x[0].toUpperCase() + x.slice(1) : x; };
        let used = 0;
        for (let i = 0; i < add.length; i += L.perScene) {
          const chunk = add.slice(i, i + L.perScene);
          const n1 = Math.min(pieces.length, Math.max(used + 1, Math.round(((i + chunk.length) / add.length) * pieces.length)));
          const own = pieces.slice(used, n1).join(" ").trim();
          used = Math.max(used, n1);
          const said = own || chunk.map((id) => { const c = arch.components.find((x) => x.id === id)!; return `The ${c.keyword}: ${c.what}`; }).join(" ");
          scenes.push(blank({ ...s, id: `${s.id}-${i}`, heading: i ? s.heading + " cont." : s.heading, add_components: chunk, narration: own ? tidy(said) : said }));
        }
        repairs.push(`layer scene "${s.heading}" split`);
        continue;
      }
      scenes.push(blank({ ...s, add_components: add, add_connections: [], callouts: [], items: [] }));
    } else if (s.kind === "notes") {
      const v = validateNotes(s.items ?? [], { ids, files, evidenceOf });
      repairs.push(...v.repairs);
      if (!v.items.length) { repairs.push(`empty notes scene "${s.heading}" dropped`); continue; }
      let narration = s.narration;
      if (v.items.some((i) => i.estimate) && !HEDGE.test(narration)) { narration = "Rough estimates, not measurements of the real app. " + narration; repairs.push(`hedged numbers in "${s.heading}"`); }
      scenes.push(blank({ ...s, narration, items: v.items, add_components: [], add_connections: [], callouts: [] }));
    } else scenes.push(blank({ ...s, add_components: [], add_connections: [], items: [] }));
  }
  // any component never added gets its own layer scene: journey parts before the walkthrough, side parts after it
  const { path, side } = journeyOrder(arch);
  const missing = arch.components.filter((c) => !seen.has(c.id));
  if (missing.length) {
    for (const group of [path, side]) {
      const miss = missing.filter((c) => group.includes(c.id));
      for (let i = 0; i < miss.length; i += L.perScene) {
        const chunk = miss.slice(i, i + L.perScene);
        scenes.push(blank({ id: `extra-${chunk[0].id}`, kind: "layer", heading: chunk.map((c) => c.keyword).join(" + ").split(" ").slice(0, 4).join(" "), narration: chunk.map((c) => `The ${c.keyword}: ${c.what}`).join(" "), add_components: chunk.map((c) => c.id) }));
      }
    }
    repairs.push(`added ${missing.length} missing components`);
  }
  if (!scenes.some((s) => s.kind === "walkthrough") && arch.walkthrough.steps.length) {
    scenes.push(blank({ id: "walk", kind: "walkthrough", heading: "follow one request", narration: `Let's follow one request: ${arch.walkthrough.name}. ` + arch.walkthrough.steps.map((s) => s.label).join(", then ") + "." }));
    repairs.push("walkthrough added");
  }
  // story order (docs/explaining-playbook.md): hook, the journey's parts in the order the request meets them,
  // the walkthrough, side parts, then any deep beats, then the recap
  const rank = (s: Scene): number => {
    if (s.kind === "hook") return 0;
    if (s.kind === "layer") { const k = Math.min(...s.add_components.map((id) => path.indexOf(id)).filter((k) => k >= 0)); return isFinite(k) ? 1 + k / 100 : 3; }
    if (s.kind === "walkthrough") return 2;
    if (s.kind === "recap") return 9;
    return 5;
  };
  const before = scenes.map((s) => s.id).join();
  scenes.splice(0, scenes.length, ...scenes.map((s, i) => ({ s, i })).sort((x, y) => rank(x.s) - rank(y.s) || x.i - y.i).map((x) => x.s));
  if (scenes.map((s) => s.id).join() !== before) repairs.push("scenes put in story order");
  // connections: draw each as soon as both ends exist
  const present = new Set<string>();
  const drawn = new Set<string>();
  for (const s of scenes) {
    s.add_components.forEach((id) => present.add(id));
    for (const e of arch.connections) {
      const k = `${e.from}>${e.to}`;
      if (!drawn.has(k) && present.has(e.from) && present.has(e.to)) { s.add_connections.push(k); drawn.add(k); }
    }
  }
  if (!scenes.some((s) => s.kind === "hook")) { scenes.unshift(blank({ id: "hook", kind: "hook", heading: lower(arch.product).split(/\s+/).slice(0, 4).join(" "), narration: arch.one_liner })); repairs.push("hook added"); }
  // scale scenes must map 1:1 to scale risks, in order
  const scaleScenes = scenes.filter((s) => s.kind === "scale");
  arch.scale.forEach((r, i) => {
    let s = scaleScenes[i];
    if (!s) { s = blank({ id: `scale-${i}`, kind: "scale", heading: `at ${r.at}`, narration: `At ${r.at} traffic, ${tidySpeech(r.why)} The fix: ${r.fix_detail}` }); const rec = scenes.findIndex((x) => x.kind === "recap"); scenes.splice(rec < 0 ? scenes.length : rec, 0, s); repairs.push("scale scene added"); }
    s.callouts = [{ target: r.component, text: r.problem, color: "red" }, { target: r.component, text: r.fix, color: "green" }];
  });
  for (const extra of scaleScenes.slice(arch.scale.length)) { scenes.splice(scenes.indexOf(extra), 1); repairs.push("extra scale scene dropped"); }
  if (!scenes.some((s) => s.kind === "recap")) { scenes.push(blank({ id: "recap", kind: "recap", heading: "the big picture", narration: arch.one_liner })); repairs.push("recap added"); }
  scenes.forEach((s, i) => { s.id = `s${String(i + 1).padStart(2, "0")}-${s.kind}`; s.narration = tidySpeech(s.narration); });
  return { title: lower(plan.title || arch.product), subtitle: lower(plan.subtitle || ""), scenes, repairs };
}

// ---------------------------------------------------------------------------
// X posts and articles: annotated source + concept boards, every node quoted.
// ---------------------------------------------------------------------------
export async function planConceptScenes(o: { ledger: CostLedger; doc: SourceDoc; spec: ExplainSpec; icons: string; progress?: Progress }): Promise<ScenePlan & { repairs: string[] }> {
  const L = o.spec;
  // no set length: as many boards as the core needs, with six boards as the ceiling
  const [, hi] = coverageSeconds(L, { components: 0, steps: 0, scale: 0, boards: 6 });
  o.progress?.({ stage: "plan", message: "breaking the source into concepts" });
  // a topic is not always best told as "here are four boxes": the shape decides how the boards are framed
  const shape = shapeFor(L.brief.approach);
  const S = SHAPES[shape];
  const frame = {
    journey: "Tell the boards as a process: each board is the next thing that happens, in the order it happens.",
    build: "Build the mechanism up: the first board is the smallest piece that already works, and each board after it adds the part that the last one needed.",
    fault: "Each board is one thing that goes wrong in the viewer's own experience, then what actually happens instead.",
  }[shape];
  const sys = [
    o.doc.kind === "topic"
      ? `You explain the topic "${o.doc.title}" in a whiteboard explainer video, using only the numbered sources below (an encyclopedia article and the references it cites). Cover the core of what the viewer asked, not every detail in the sources.`
      : `You turn a dense ${o.doc.kind === "x-post" ? "X post" : "article"} into a whiteboard explainer video.`,
    STYLE,
    L.voice,
    "Scenes:",
    o.doc.kind === "topic" ? `1. 'hook': ${S.hook}` : `1. 'hook': the one question this source answers, in plain words. ${S.hook}`,
    `${o.doc.kind === "topic" ? "2. optionally one 'source' scene, and only when the source's own words carry weight (a standard, a study, a spec): the reader sees a card with the sources' text (say where it comes from, e.g. 'the standard says'). When the viewer just wants to see how the thing works, skip it and start the boards." : "2. 'source' scene(s): the reader sees the real post/article screenshot"}. highlights: 2 to 4 phrases (2 to 10 words) copied VERBATIM from the source text, each with a 1 to 3 word note and a color (red = problem/claim to question, orange = key idea, green = result/fix, blue = actor/entity). Narration explains why those phrases matter.`,
    `3. as many 'board' scenes as the core idea needs, usually 2 to 5 and never more than 6. ${frame} Each is a fresh mini diagram of one idea with 2 to ${Math.max(3, L.perScene + 1)} board_nodes and edges between them, drawn left to right in reading order. Every board node's evidence is an exact quote (3 to 12 words) from the source that justifies it (it is printed under the node, so pick the most telling words). count is 1, or 3 to 9 when the node means 'many of these' (8 GPUs, many workers, lots of docs): it becomes an icon grid. callouts: at most 1 per board, circling the node that matters most (target = board node id, text 1 to 3 words). Use colors semantically. icon from: ${o.icons}`,
    "Optionally one 'notes' scene (after the source scene) when the source lists concrete things (features, steps, numbers, stack): 3 to 6 items, text 2 to 7 words, evidence an exact quote, target empty, estimate false (a number the author states is their claim, not our estimate). icon from the same list.",
    ...cutInRules(L.style, o.icons),
    S.recap ? "4. 'recap': the whole idea in two sentences, what to remember." : `4. no 'recap' scene. ${S.close}`,`Headings: ${S.headings}`,
    `Each narration about ${L.wordsPerScene} words at ${L.tempo.wps} words/sec. There is no set length: stop once the core of ${o.doc.kind === "topic" ? "what was asked" : "the source"} is covered, never pad, and stay under ${hi} seconds. Leave out side details that do not help answer the hook. Do not claim anything the source does not say; ${o.doc.kind === "topic" ? "every fact must come from the sources (no outside facts)." : "say 'the author claims' when it is a claim."}`,
    "Leave add_components, add_connections empty. callouts only on boards. items only in notes, chart, timeline and map scenes.",
    o.doc.kind === "topic" ? "title: under 6 lowercase words. subtitle: the source sites, lowercase." : "title: under 6 lowercase words. subtitle: who wrote it, lowercase.",
  ].join("\n");
  const user = `SOURCE (${o.doc.kind}) by ${o.doc.author ?? "unknown"}: ${o.doc.title}\nURL: ${o.doc.url}\n\nTEXT:\n${o.doc.text.slice(0, 30000)}`;
  let plan = await sparkJson({ ledger: o.ledger, step: "concept-plan", schema: ScenePlan, name: "scene_plan", effort: "low", maxTokens: 9000, hedge: true, messages: [{ role: "system", content: sys }, { role: "user", content: user }] });
  let { plan: fixed, dropped, unsaid } = validateConcept(plan, o.doc.text);
  // a cut-in that lost too many rows to stand is dropped whole, so even one bad row is worth a re-plan then
  const cutIns = (p: ScenePlan) => p.scenes.filter((s) => s.kind === "chart" || s.kind === "timeline" || s.kind === "map").length;
  if (dropped.length > 2 || cutIns(fixed) < cutIns(plan)) {
    o.progress?.({ stage: "plan", message: `re-planning: ${dropped.length} quotes were not in the source` });
    plan = await sparkJson({
      ledger: o.ledger, step: "concept-plan-revise", schema: ScenePlan, name: "scene_plan", effort: "low", maxTokens: 9000, hedge: true,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }, { role: "assistant", content: JSON.stringify(plan) },
        { role: "user", content: `These rows failed the source check (a quote not copied verbatim, a chart or timeline quote that does not state its number or date, or a map place that is not a real country or city named in its quote). Replace each with an exact copied phrase that does, or remove it:\n${dropped.join("\n")}\nReturn the full corrected plan.` }],
    });
    ({ plan: fixed, dropped, unsaid } = validateConcept(plan, o.doc.text));
  }
  // a dropped row still named next to a kept one ("from china through persia to rome") needs a real rewrite of that scene
  const retold: string[] = [];
  for (const u of unsaid) {
    const sc = fixed.scenes.find((x) => x.id === u.id)!;
    const out = await sparkJson({
      ledger: o.ledger, step: "cut-in-retell", schema: z.object({ narration: z.string() }), name: "narration", effort: "minimal", maxTokens: 2000,
      messages: [{ role: "system", content: "Rewrite this narration for a whiteboard explainer so it no longer mentions the removed items, which are not shown on screen. Keep everything else, the voice and the length; say each shown item's name as it is now said." },
        { role: "user", content: JSON.stringify({ narration: sc.narration, removed: u.names, shown: sc.items.map((it) => it.text) }) }],
    }).catch(() => undefined);
    const next = out?.narration.trim() ?? "";
    const r = wordCount(next) / Math.max(1, wordCount(sc.narration));
    if (next && r > 0.6 && r < 1.3 && !u.names.some((n) => new RegExp(`\\b${n}\\b`, "i").test(next))) { sc.narration = tidySpeech(next); retold.push(`${u.id}: narration retold without ${u.names.join(", ")}`); }
    else retold.push(`${u.id}: narration still names dropped ${u.names.join(", ")}`);
  }
  // broken sentences ("Bandits harsh deserts make travel costly") get one small rewrite of just those scenes
  const slips = conceptSlips(fixed);
  if (slips.length) {
    o.progress?.({ stage: "plan", message: `fixing ${slips.length} broken sentence(s)` });
    const f = await fixNarration({ ledger: o.ledger, plan: fixed, arch: NO_ARCH, issues: slips, audience: L.audience });
    fixed = { ...fixed, scenes: f.plan.scenes };
    const left = conceptSlips(fixed);
    retold.push(`speech: ${slips.length} problem(s), ${f.changed.length} scene(s) rewritten, ${left.length} left${left.length ? `: ${left.join("; ")}` : ""}`);
  }
  return { ...fixed, repairs: [...dropped.map((d) => `dropped unquoted: ${d}`), ...retold] };
}

/**
 * A plan cached before a speech check existed can still carry the slip that check now catches: one small
 * rewrite of just the flagged scenes, so a re-render from cache fixes it and re-voices only those scenes.
 * A clean plan costs nothing.
 */
export async function respeak(o: { ledger: CostLedger; plan: ScenePlan; arch?: Architecture; audience: string }): Promise<{ plan: ScenePlan; changed: string[]; note?: string }> {
  const slips = conceptSlips(o.plan);
  if (!slips.length) return { plan: o.plan, changed: [] };
  const f = await fixNarration({ ledger: o.ledger, plan: o.plan, arch: o.arch ?? NO_ARCH, issues: slips, audience: o.audience });
  const left = conceptSlips(f.plan);
  return { ...f, note: `speech recheck: ${slips.length} problem(s), ${f.changed.length ? `${f.changed.join(", ")} rewritten` : "nothing rewritten"}, ${left.length} left${left.length ? `: ${left.join("; ")}` : ""}` };
}

const NO_ARCH: Architecture = { product: "", one_liner: "", components: [], connections: [], walkthrough: { name: "", steps: [] }, scale: [] };
/** What a topic or article video's narration trips on: missing articles and broken sentences, per scene. */
export function conceptSlips(plan: ScenePlan): string[] {
  return plan.scenes.flatMap((s) => {
    const miss = missingArticles(s.narration).map((m) => `missing article in "${m}"; say "the" or "a" before the noun`);
    const all = [...miss, ...grammarSlips(s.narration)];
    return all.map((g) => `${s.id}: ${g}`);
  });
}

export function validateConcept(plan: ScenePlan, source: string): { plan: ScenePlan; dropped: string[]; unsaid: { id: string; names: string[] }[] } {
  const dropped: string[] = [];
  const unsaid: { id: string; names: string[] }[] = [];
  const kw = (s: string) => lower(s).split(/\s+/).slice(0, 3).join(" ");
  const scenes = plan.scenes.map((s, i) => {
    const highlights = s.highlights.filter((h) => (quoteInSource(h.quote, source) ? true : (dropped.push(`highlight "${h.quote}"`), false))).map((h) => ({ ...h, note: kw(h.note) }));
    const board_nodes = s.board_nodes.filter((n) => (quoteInSource(n.evidence, source) ? true : (dropped.push(`node ${n.keyword}: "${n.evidence}"`), false))).map((n) => ({ ...n, keyword: kw(n.keyword) }));
    const ok = new Set(board_nodes.map((n) => n.id));
    const board_edges = s.board_edges.filter((e) => ok.has(e.from) && ok.has(e.to));
    const callouts = s.kind === "board" ? (s.callouts ?? []).filter((c) => ok.has(c.target)).slice(0, 1).map((c) => ({ ...c, text: kw(c.text) })) : [];
    const items = s.kind === "notes" ? validateNotes(s.items ?? [], { source }).items : s.kind === "chart" || s.kind === "timeline" || s.kind === "map" ? validateCutIn(s.kind, s.items ?? [], source, dropped) : [];
    for (const n of board_nodes) n.count = Math.max(1, Math.min(9, Math.round(n.count ?? 1)));
    const id = `s${String(i + 1).padStart(2, "0")}-${s.kind}`;
    // the voice and the heading say only what is drawn: "three stations" with two on screen, or a dropped place, would not match
    let { narration, heading } = s;
    if (s.kind === "chart" || s.kind === "timeline" || s.kind === "map") {
      const r = retellCutIn({ narration, heading, kind: s.kind }, s.items ?? [], items);
      ({ narration, heading } = r);
      if (r.left.length) unsaid.push({ id, names: r.left });
    }
    return { ...s, id, narration: tidySpeech(narration), heading: shortHeading(heading), highlights, board_nodes, board_edges, callouts, items, add_components: [], add_connections: [] };
  }).filter((s) => !(s.kind === "board" && s.board_nodes.length < 2) && !(s.kind === "source" && !s.highlights.length && !s.narration) && !(s.kind === "notes" && s.items.length < 2)
    && !((s.kind === "chart" || s.kind === "map") && s.items.length < 2) && !(s.kind === "timeline" && s.items.length < 3));
  return { plan: { ...plan, title: lower(plan.title), subtitle: lower(plan.subtitle), scenes }, dropped, unsaid: unsaid.filter((u) => scenes.some((s) => s.id === u.id)) };
}

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** What a cut-in row is called aloud: the place for a map, the label words for a bar, the date for a timeline. */
const rowName = (kind: string, it: NoteItem) => (kind === "map" ? it.target : kind === "chart" ? it.text.replace(/[-+$€£]?\d[\d,.]*\s*(%|[a-z]+)?/gi, "").trim() : parseDated(it.text)?.when ?? "");

/**
 * When the source check drops rows from a cut-in, the narration and heading are rewritten to match what
 * is drawn: a count of the old rows becomes the new count, and a sentence about a dropped row goes.
 * `left` lists dropped names still said in a sentence that also talks about a kept row.
 */
export function retellCutIn(s: { narration: string; heading: string; kind: string }, before: NoteItem[], after: NoteItem[]): { narration: string; heading: string; left: string[] } {
  const keptText = new Set(after.map((it) => lower(it.text)));
  const gone = before.filter((it) => !keptText.has(lower(it.text).split(/\s+/).slice(0, 5).join(" ")) && !keptText.has(lower(it.text))).map((it) => lower(rowName(s.kind, it))).filter((n) => n.length > 1);
  if (before.length === after.length && !gone.length) return { ...s, left: [] };
  const kept = after.map((it) => lower(rowName(s.kind, it))).filter((n) => n.length > 1);
  const recount = (t: string) => {
    if (before.length === after.length || before.length > 10) return t;
    // only the word ("three"), never digits, which in a chart are the figures themselves
    return t.replace(new RegExp(`\\b${COUNT[before.length]}\\b`, "gi"), (m) => {
      const to = COUNT[after.length];
      return m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
    });
  };
  const says = (sent: string, name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sent);
  const left: string[] = [];
  const sents = s.narration.trim().split(/(?<=[.!?])\s+/).filter((sent) => {
    const bad = gone.filter((g) => says(sent, g));
    if (!bad.length) return true;
    if (kept.some((k) => says(sent, k))) { left.push(...bad); return true; }
    return false;
  });
  return { narration: recount(sents.join(" ")), heading: recount(s.heading), left: [...new Set(left)] };
}

/** Explainer style adds news-style cut-ins; the whiteboard style keeps to boards. Both only use what the source states. */
export function cutInRules(style: ExplainSpec["style"], icons: string): string[] {
  if (style !== "explainer") return ["No 'chart', 'timeline' or 'map' scenes."];
  return [
    "Cut-ins: add a 'chart', 'timeline' or 'map' scene where it shows the point better than a diagram, right after the board it belongs to, and only from figures and places the source states. Usually one cut-in, at most two.",
    `- 'chart': 2 to 6 quantities of the same kind and unit, compared. items: text is 1 to 4 lowercase label words then the number exactly as the source writes it ('chrome 65%', 'root servers 13'); evidence is an exact quote (5 to 20 words) from the source that contains that number; color orange for the bar the narration is about, blue for the rest; icon from: ${icons}; target empty; estimate false. Heading names what is compared. Narration says which bar matters and what it means; never read every number out.`,
    "- 'timeline': 3 to 6 dated events, oldest first. items: text is the date as the source writes it then 2 to 6 lowercase words ('1983 dns is invented'); evidence an exact quote containing that date; color blue, green for the latest; icon from the same list; target empty; estimate false. Narration tells the turn the dates show, not a list of years.",
    "- 'map': only when where it happened is part of the point (a place of origin, a spread, a route, a border). 2 to 6 real countries or cities the source names. items: target is the place's common English name ('france', 'geneva', 'united states'); text is 2 to 5 lowercase words saying what happened there ('geneva web is born'); evidence an exact quote (5 to 20 words) from the source that names the place; color orange for the place the narration is about, blue for the rest; icon from the same list; estimate false. Narration says why the places matter, not a list of names.",
    "Never estimate, round or convert a number for a cut-in; leave the cut-in out when the source gives no figures.",
  ];
}

/**
 * Whether a quote names a place: the name itself, or a word grown from it the way the source would say it
 * ("chinese" for china, "persian" for persia, "roman" for rome). Any part of "merv, turkmenistan" counts.
 */
export function namesPlace(quote: string, names: string[]): boolean {
  const words = quote.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  return names.map((n) => n.trim().toLowerCase()).filter(Boolean).some((n) => {
    if (` ${words.join(" ")} `.includes(` ${n.split(/[^a-z']+/).filter(Boolean).join(" ")} `)) return true;
    if (/\s/.test(n)) return false;
    const stem = n.replace(/[aeiouy]+$/, "");
    return stem.length >= 3 && words.some((w) => w.startsWith(stem) && w.length > stem.length && /^(n|an|ian|ese|ic|ish|s|'s)$/.test(w.slice(stem.length)));
  });
}

/** Map rows: a real place (in the Natural Earth gazetteer) that the quoted source sentence names, each place once. */
function validateMap(items: NoteItem[], source: string, dropped: string[]): NoteItem[] {
  const seen = new Set<string>();
  const fold = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return items.map((it) => ({ ...it, text: lower(it.text).split(/\s+/).slice(0, 5).join(" "), target: lower(it.target).replace(/^the\s+/, ""), estimate: false })).filter((it) => {
    const p = findPlace(it.target);
    const why = !p ? "not a place on the map" : !quoteInSource(it.evidence, source) ? "quote not in the source" : !namesPlace(fold(it.evidence), it.target.split(",").map(fold)) ? "the quote does not name it" : seen.has(p.iso + p.name) ? "the same place twice" : "";
    if (why) dropped.push(`map "${it.target}": ${why}`);
    else seen.add(p!.iso + p!.name);
    return !why;
  }).slice(0, 6);
}

/** Chart and timeline rows: the quote must be in the source and state the row's number or date. Bars share one unit; dates go oldest first. */
export function validateCutIn(kind: "chart" | "timeline" | "map", items: NoteItem[], source: string, dropped: string[]): NoteItem[] {
  if (kind === "map") return validateMap(items, source, dropped);
  const ok = items.map((it) => ({ ...it, text: lower(it.text), target: "", estimate: false })).filter((it) => {
    // a timeline row is checked by its year, so "jan 5, 1985" needs 1985 in the quote, not just a 5
    const fig = kind === "chart" ? parseFigure(it.text)?.shown : /\d{3,4}/.exec(parseDated(it.text)?.when ?? "")?.[0];
    const why = !fig ? "no figure" : !quoteInSource(it.evidence, source) ? "quote not in the source" : !figureInQuote(fig, it.evidence) ? "the quote does not state it" : "";
    if (why) dropped.push(`${kind} "${it.text}": ${why}`);
    return !why;
  });
  if (kind === "timeline") return ok.sort((a, b) => parseDated(a.text)!.key - parseDated(b.text)!.key).slice(0, 6);
  // bars in different units cannot share an axis: keep the unit most rows use
  const count = new Map<string, number>();
  for (const it of ok) { const u = parseFigure(it.text)!.unit; count.set(u, (count.get(u) ?? 0) + 1); }
  const top = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  return ok.filter((it) => parseFigure(it.text)!.unit === top).slice(0, 6);
}

export const estimateSeconds = (text: string) => Math.max(2.5, wordCount(text) / 2.6);
export { z };
