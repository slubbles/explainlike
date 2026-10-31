import { z } from "zod";
import { ScenePlan, coverageSeconds, lower, norm, tidySpeech, wordCount, quoteInSource, type Architecture, type ExplainSpec, type Progress, type NoteItem, type Scene, type SourceDoc } from "@explainlike/core";
import { sparkJson, type CostLedger } from "@explainlike/models";

const STYLE = [
  "Style of the video: a friendly engineer drawing on a whiteboard while talking to a smart newcomer (docs/explaining-playbook.md).",
  "Narration is spoken; write it for the ear: short sentences, concrete, no filler ('in this video', 'let's dive in', 'robust', 'seamless', 'leverage' are banned).",
  "Every narration sentence is complete and grammatical: each verb agrees with its subject, and articles (a, an, the) are not dropped.",
  "Plain words first. Every technical term (an acronym, a product, a protocol, an internal name) is explained in plain words the first time it is said, in the same sentence: 'Caddy, the web server at the front door, ...'. A term the newcomer does not need is left out.",
  "Each part gets its why: what it is for, or what would go wrong without it.",
  "Headings are 2 to 4 lowercase words that the narration of that scene actually says (the viewer reads the heading while hearing it). Keywords 1 to 3 lowercase words.",
  "One new thing per sentence, and each sentence long enough to watch it being drawn (no two-word sentences).",
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
  const { path, side } = journeyOrder(arch);
  const kw = (id: string) => `${id} ("${arch.components.find((c) => c.id === id)?.keyword}")`;
  const steps = arch.walkthrough.steps.map((s) => `"${s.label}"`).join(", ");
  const analogy = L.brief.analogy || "an everyday place with clear jobs (a restaurant, a post office)";
  return [
    "You write the scene plan for a short whiteboard explainer of one repository. The renderer draws one evolving architecture canvas.",
    "Goal: a newcomer finishes the video able to say what this project is and how one request flows through it. That flow is the video.",
    STYLE,
    L.voice,
    `Everyday analogy for the whole system: ${analogy}.`,
    "Scene order and rules:",
    "1. one 'hook' scene, 2 or 3 sentences: what the product is in plain words (no part names, no jargon), why someone would care (what it lets them do), the everyday analogy, and the promise of the story, e.g. 'Let's follow one message through it.' add_components empty.",
    `2. 'layer' scenes along the journey: add exactly these components, in this order, at most ${L.perScene} per scene: ${path.map(kw).join(", ")}. Tell it as the request moving forward ('First...', 'Next it reaches...'). For each added component say its keyword out loud (in add_components order), what it does in plain words, its role in the analogy, and why it is there.`,
    `3. one 'walkthrough' scene right after them: the core flow told once, end to end, as one short story. Say these step labels word for word, in order, each inside a natural sentence about who does what (the analogy role first, then the label as the action): ${steps}. Good: 'You type a question and the counter will send message to the manager.' Bad: 'Step one is send message.' Never number the steps out loud. End with the concrete thing the user gets back (e.g. 'a working fix in your chat'), not 'an answer'. Heading like 'one message, start to end'. About ${Math.round(L.wordsPerScene * 1.6)} words. add_components empty.`,
    side.length
      ? `4. then 'layer' scene(s) for the side parts the request does not pass through: ${side.map(kw).join(", ")}. Keep them short: as few scenes as fit (at most ${L.perScene} parts per scene), one short clause per part (its keyword and plain job), opening with one tie-back to the journey such as 'Around the manager sit a few helpers:'. Do not repeat the same opener for each part.`
      : "4. (no side parts)",
    arch.scale.length
      ? `5. ${arch.scale.length} short 'scale' scene(s), one per scale risk, in the given order: what breaks at that traffic level and why (problem keyword), then the fix (fix keyword), in 2 short plain sentences ('The fix is ...'). callouts: [{target: component id, text: problem keyword, color: red}, {target: component id, text: fix keyword, color: green}].`
      : "5. no 'scale' scenes.",
    ...notesRules(L.notes),
    "6. one 'recap' scene: retell the flow in one breath, from the user to what they get back, saying the journey keywords in order, then one line on why it matters. Heading like 'the whole trip'.",
    `Each scene's narration is about ${L.wordsPerScene} words (hook and recap can be shorter). Whole video ${lo} to ${hi} seconds at ${L.tempo.wps} words per second: long enough to tell the story, no padding.`,
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
    ledger, step: "plan-check", schema: Critique, name: "critique", effort: "low", maxTokens: 2000,
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
    let at = 0;
    const missing: string[] = [];
    for (const st of arch.walkthrough.steps) { const k = w.indexOf(norm(st.label), at); if (k < 0) missing.push(st.label); else at = k + 1; }
    if (missing.length) issues.push(`the walkthrough must say each step label word for word, in order; missing or out of order: ${missing.map((m) => `"${m}"`).join(", ")}`);
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
  // the same sentence opener three times over reads like a template, not a person talking
  const openers = new Map<string, number>();
  for (const sent of sc.flatMap((x) => x.narration.split(/(?<=[.!?])\s+/))) {
    const k = norm(sent).split(" ").slice(0, 3).join(" ");
    if (k.split(" ").length === 3) openers.set(k, (openers.get(k) ?? 0) + 1);
  }
  for (const [k, n] of openers) if (n >= 3) issues.push(`${n} sentences open with '${k}'; vary them`);
  return issues;
}

export async function planRepoScenes(o: { ledger: CostLedger; arch: Architecture; spec: ExplainSpec; progress?: Progress }): Promise<ScenePlan & { repairs: string[]; check: { first: string[]; final: string[]; revised: boolean } }> {
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
    ledger: o.ledger, step: extra.length ? "scene-plan-revise" : "scene-plan", schema: ScenePlan, name: "scene_plan", effort: "low", maxTokens: 9000,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }, ...extra],
  });
  // plan-stage self-check: the flow is told, early and hop by hop, and no term reaches the viewer undefined; one revision if not
  const review = async (p: ScenePlan) => {
    const c = await critiquePlan(o.ledger, p, L.audience).catch(() => undefined);
    return [
      ...checkStory(p, o.arch, L.brief.analogy),
      ...(c?.undefined_terms ?? []).map((t) => `"${t.term}" (${t.scene}) is used without a plain-words explanation; explain it in the same sentence or drop it`),
      ...(c && !c.flow_clear ? [`a newcomer could not retell the flow: ${c.flow_problem}`] : []),
    ];
  };
  const raw = await ask();
  let plan = repairRepoPlan(raw, o.arch, L);
  const first = await review(plan);
  let final = first, revised = false;
  if (first.length) {
    o.progress?.({ stage: "plan", message: `self-check: ${first.length} issue(s), revising once` });
    plan = repairRepoPlan(await ask([{ role: "assistant", content: JSON.stringify(raw) }, { role: "user", content: `A newcomer test of this plan found these problems. Return the full corrected plan, keeping what works:\n${first.map((x, i) => `${i + 1}. ${x}`).join("\n")}` }]), o.arch, L);
    final = await review(plan);
    revised = true;
  }
  return { ...plan, check: { first, final, revised } };
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
    const s = { ...s0, heading: lower(s0.heading).split(/\s+/).slice(0, 4).join(" ") };
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
  const [lo, hi] = coverageSeconds(L, { components: 0, steps: 0, scale: 0, boards: 4 });
  o.progress?.({ stage: "plan", message: "breaking the source into concepts" });
  const sys = [
    `You turn a dense ${o.doc.kind === "x-post" ? "X post" : "article"} into a whiteboard explainer video.`,
    STYLE,
    L.voice,
    "Scenes:",
    "1. 'hook': the one question this source answers, in plain words.",
    "2. 'source' scene(s): the reader sees the real post/article screenshot. highlights: 2 to 4 phrases (2 to 10 words) copied VERBATIM from the source text, each with a 1 to 3 word note and a color (red = problem/claim to question, orange = key idea, green = result/fix, blue = actor/entity). Narration explains why those phrases matter.",
    `3. 3 to 5 'board' scenes: each is a fresh mini diagram of one idea with 2 to ${Math.max(3, L.perScene + 1)} board_nodes and edges between them, drawn left to right in reading order. Every board node's evidence is an exact quote (3 to 12 words) from the source that justifies it (it is printed under the node, so pick the most telling words). count is 1, or 3 to 9 when the node means 'many of these' (8 GPUs, many workers, lots of docs): it becomes an icon grid. callouts: at most 1 per board, circling the node that matters most (target = board node id, text 1 to 3 words). Use colors semantically. icon from: ${o.icons}`,
    "Optionally one 'notes' scene (after the source scene) when the source lists concrete things (features, steps, numbers, stack): 3 to 6 items, text 2 to 7 words, evidence an exact quote, target empty, estimate false (a number the author states is their claim, not our estimate). icon from the same list.",
    "4. 'recap': the whole idea in two sentences, what to remember.",
    `Each narration about ${L.wordsPerScene} words; total ${lo}-${hi} seconds at ${L.tempo.wps} words/sec. Do not claim anything the source does not say; say 'the author claims' when it is a claim.`,
    "Leave add_components, add_connections empty. callouts only on boards. items only in notes scenes.",
    "title: under 6 lowercase words. subtitle: who wrote it, lowercase.",
  ].join("\n");
  const user = `SOURCE (${o.doc.kind}) by ${o.doc.author ?? "unknown"}: ${o.doc.title}\nURL: ${o.doc.url}\n\nTEXT:\n${o.doc.text.slice(0, 30000)}`;
  let plan = await sparkJson({ ledger: o.ledger, step: "concept-plan", schema: ScenePlan, name: "scene_plan", effort: "medium", maxTokens: 9000, messages: [{ role: "system", content: sys }, { role: "user", content: user }] });
  let { plan: fixed, dropped } = validateConcept(plan, o.doc.text);
  if (dropped.length > 2) {
    o.progress?.({ stage: "plan", message: `re-planning: ${dropped.length} quotes were not in the source` });
    plan = await sparkJson({
      ledger: o.ledger, step: "concept-plan-revise", schema: ScenePlan, name: "scene_plan", effort: "medium", maxTokens: 9000,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }, { role: "assistant", content: JSON.stringify(plan) },
        { role: "user", content: `These quotes are NOT verbatim in the source; replace them with exact copied phrases (or remove the node):\n${dropped.join("\n")}\nReturn the full corrected plan.` }],
    });
    ({ plan: fixed, dropped } = validateConcept(plan, o.doc.text));
  }
  return { ...fixed, repairs: dropped.map((d) => `dropped unquoted: ${d}`) };
}

export function validateConcept(plan: ScenePlan, source: string): { plan: ScenePlan; dropped: string[] } {
  const dropped: string[] = [];
  const kw = (s: string) => lower(s).split(/\s+/).slice(0, 3).join(" ");
  const scenes = plan.scenes.map((s, i) => {
    const highlights = s.highlights.filter((h) => (quoteInSource(h.quote, source) ? true : (dropped.push(`highlight "${h.quote}"`), false))).map((h) => ({ ...h, note: kw(h.note) }));
    const board_nodes = s.board_nodes.filter((n) => (quoteInSource(n.evidence, source) ? true : (dropped.push(`node ${n.keyword}: "${n.evidence}"`), false))).map((n) => ({ ...n, keyword: kw(n.keyword) }));
    const ok = new Set(board_nodes.map((n) => n.id));
    const board_edges = s.board_edges.filter((e) => ok.has(e.from) && ok.has(e.to));
    const callouts = s.kind === "board" ? (s.callouts ?? []).filter((c) => ok.has(c.target)).slice(0, 1).map((c) => ({ ...c, text: kw(c.text) })) : [];
    const items = s.kind === "notes" ? validateNotes(s.items ?? [], { source }).items : [];
    for (const n of board_nodes) n.count = Math.max(1, Math.min(9, Math.round(n.count ?? 1)));
    return { ...s, id: `s${String(i + 1).padStart(2, "0")}-${s.kind}`, narration: tidySpeech(s.narration), heading: lower(s.heading).split(/\s+/).slice(0, 4).join(" "), highlights, board_nodes, board_edges, callouts, items, add_components: [], add_connections: [] };
  }).filter((s) => !(s.kind === "board" && s.board_nodes.length < 2) && !(s.kind === "source" && !s.highlights.length && !s.narration) && !(s.kind === "notes" && s.items.length < 2));
  return { plan: { ...plan, title: lower(plan.title), subtitle: lower(plan.subtitle), scenes }, dropped };
}

export const estimateSeconds = (text: string) => Math.max(2.5, wordCount(text) / 2.6);
export { z };
