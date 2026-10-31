import { z } from "zod";
import { ScenePlan, getLevel, lower, wordCount, quoteInSource, type Architecture, type Level, type Progress, type NoteItem, type Scene, type SourceDoc } from "@metual/core";
import { sparkJson, type CostLedger } from "@metual/models";

const STYLE = [
  "Style of the video: a calm engineer at a black whiteboard, like the YouTube channel Caleb Writes Code.",
  "Narration is spoken; write it for the ear: short sentences, concrete, no filler ('in this video', 'let's dive in', 'robust', 'seamless', 'leverage' are banned).",
  "Headings are 2 to 4 lowercase words that the narration of that scene actually says (the viewer reads the heading while hearing it). Keywords 1 to 3 lowercase words.",
  "A visual change every 2 to 5 seconds: one new thing per sentence.",
].join("\n");

// ---------------------------------------------------------------------------
// Repo: build the architecture layer by layer on one evolving canvas.
// ---------------------------------------------------------------------------
export async function planRepoScenes(o: { ledger: CostLedger; arch: Architecture; level: Level; progress?: Progress }): Promise<ScenePlan> {
  const L = getLevel(o.level);
  o.progress?.({ stage: "plan", message: "writing the scene plan" });
  const compact = {
    product: o.arch.product, one_liner: o.arch.one_liner,
    components: o.arch.components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, layer: c.layer, keyword: c.keyword, what: c.what })),
    connections: o.arch.connections.map((c) => `${c.from}>${c.to} (${c.label})`),
    walkthrough: { name: o.arch.walkthrough.name, steps: o.arch.walkthrough.steps.map((s) => `${s.from}>${s.to} (${s.label})`) },
    scale: o.arch.scale.map((s) => ({ component: s.component, at: s.at, problem: s.problem, why: s.why, fix: s.fix, fix_detail: s.fix_detail })),
  };
  const plan = await sparkJson({
    ledger: o.ledger, step: "scene-plan", schema: ScenePlan, name: "scene_plan", effort: "low", maxTokens: 9000,
    messages: [
      { role: "system", content: [
        "You write the scene plan for a system design explainer video of one repository. The renderer draws one evolving architecture canvas.",
        STYLE,
        `Audience: ${L.label}. ${L.voice}`,
        "Scene order and rules:",
        "1. one 'hook' scene: what the product is and the one question the video answers. add_components empty.",
        `2. 'layer' scenes: each adds at most ${L.perScene} components (by id), starting where requests start (the client) and moving inward, in flow order. Every component is added exactly once. The narration must say each added component's keyword out loud, in the order listed in add_components, and say what it does here.`,
        "3. one 'walkthrough' scene: narrate the walkthrough request hop by hop, saying each hop's keyword, in order. add_components empty.",
        `4. ${o.arch.scale.length} 'scale' scenes, one per scale risk, in the given order: say what breaks at that traffic level and why (problem keyword), then the fix (fix keyword). callouts: [{target: component id, text: problem keyword, color: red}, {target: component id, text: fix keyword, color: green}].`,
        "5. one 'recap' scene: the whole picture in two or three sentences.",
        ...notesRules(L.notes),
        `Each scene's narration is about ${L.wordsPerScene} words (hook and recap can be shorter). Whole video ${L.seconds[0]} to ${L.seconds[1]} seconds at 2.6 words per second.`,
        "Leave add_connections, board_nodes, board_edges, highlights empty (the renderer derives them). callouts empty except in scale scenes. items empty except in notes scenes.",
        "Never state a traffic, user, latency or cost number as a fact about this app: the repo does not tell you its real load. Numbers only appear as clearly labelled assumptions.",
        "title: the product name in lowercase. subtitle: under 8 lowercase words.",
      ].join("\n") },
      { role: "user", content: JSON.stringify(compact) },
    ],
  });
  return repairRepoPlan(plan, o.arch, o.level);
}

function notesRules(slots: { after: string; heading: string; brief: string }[]): string[] {
  if (!slots.length) return [];
  return [
    "Extra 'notes' scenes (whiteboard lists). Place each right after the scene named, use the heading given, and fill items:",
    ...slots.map((n) => `- notes "${n.heading}" after the ${n.after} scene(s): ${n.brief}`),
    "Each item text is 2 to 7 lowercase words. The narration reads the items in order and adds the reasoning. icon from the same icon names as the components.",
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
export function repairRepoPlan(plan: ScenePlan, arch: Architecture, level: Level): ScenePlan & { repairs: string[] } {
  const L = getLevel(level);
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
        const sentences = s.narration.match(/[^.!?]+[.!?]*/g) ?? [s.narration];
        for (let i = 0; i < add.length; i += L.perScene) {
          const chunk = add.slice(i, i + L.perScene);
          const n0 = Math.floor((i / add.length) * sentences.length), n1 = Math.floor(((i + chunk.length) / add.length) * sentences.length);
          scenes.push(blank({ ...s, id: `${s.id}-${i}`, heading: i ? s.heading + " cont." : s.heading, add_components: chunk, narration: sentences.slice(n0, Math.max(n0 + 1, n1)).join(" ").trim() }));
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
  // any component never added: give it a layer scene before the walkthrough
  const missing = arch.components.filter((c) => !seen.has(c.id));
  if (missing.length) {
    const at = Math.max(1, scenes.findIndex((s) => s.kind === "walkthrough"));
    for (let i = 0; i < missing.length; i += L.perScene) {
      const chunk = missing.slice(i, i + L.perScene);
      scenes.splice(at < 0 ? scenes.length : at, 0, blank({ id: `extra-${i}`, kind: "layer", heading: chunk.map((c) => c.keyword).join(" + ").split(" ").slice(0, 4).join(" "), narration: chunk.map((c) => `${c.keyword}: ${c.what}`).join(" "), add_components: chunk.map((c) => c.id) }));
    }
    repairs.push(`added ${missing.length} missing components`);
  }
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
  if (!scenes.some((s) => s.kind === "walkthrough") && arch.walkthrough.steps.length) {
    const at = scenes.findIndex((s) => s.kind === "scale");
    scenes.splice(at < 0 ? scenes.length : at, 0, blank({ id: "walk", kind: "walkthrough", heading: "follow one request", narration: `Let's follow one request: ${arch.walkthrough.name}. ` + arch.walkthrough.steps.map((s) => s.label).join(", then ") + "." }));
    repairs.push("walkthrough added");
  }
  // scale scenes must map 1:1 to scale risks, in order
  const scaleScenes = scenes.filter((s) => s.kind === "scale");
  arch.scale.forEach((r, i) => {
    let s = scaleScenes[i];
    if (!s) { s = blank({ id: `scale-${i}`, kind: "scale", heading: `at ${r.at}`, narration: `At ${r.at} traffic, ${r.why} The fix: ${r.fix_detail}` }); const rec = scenes.findIndex((x) => x.kind === "recap"); scenes.splice(rec < 0 ? scenes.length : rec, 0, s); repairs.push("scale scene added"); }
    s.callouts = [{ target: r.component, text: r.problem, color: "red" }, { target: r.component, text: r.fix, color: "green" }];
  });
  for (const extra of scaleScenes.slice(arch.scale.length)) { scenes.splice(scenes.indexOf(extra), 1); repairs.push("extra scale scene dropped"); }
  if (!scenes.some((s) => s.kind === "recap")) { scenes.push(blank({ id: "recap", kind: "recap", heading: "the big picture", narration: arch.one_liner })); repairs.push("recap added"); }
  scenes.forEach((s, i) => (s.id = `s${String(i + 1).padStart(2, "0")}-${s.kind}`));
  return { title: lower(plan.title || arch.product), subtitle: lower(plan.subtitle || ""), scenes, repairs };
}

// ---------------------------------------------------------------------------
// X posts and articles: annotated source + concept boards, every node quoted.
// ---------------------------------------------------------------------------
export async function planConceptScenes(o: { ledger: CostLedger; doc: SourceDoc; level: Level; icons: string; progress?: Progress }): Promise<ScenePlan & { repairs: string[] }> {
  const L = getLevel(o.level);
  o.progress?.({ stage: "plan", message: "breaking the source into concepts" });
  const sys = [
    `You turn a dense ${o.doc.kind === "x-post" ? "X post" : "article"} into a whiteboard explainer video.`,
    STYLE,
    `Audience: ${L.label}. ${L.voice}`,
    "Scenes:",
    "1. 'hook': the one question this source answers, in plain words.",
    "2. 'source' scene(s): the reader sees the real post/article screenshot. highlights: 2 to 4 phrases (2 to 10 words) copied VERBATIM from the source text, each with a 1 to 3 word note and a color (red = problem/claim to question, orange = key idea, green = result/fix, blue = actor/entity). Narration explains why those phrases matter.",
    `3. 3 to 5 'board' scenes: each is a fresh mini diagram of one idea with 2 to ${Math.max(3, L.perScene + 1)} board_nodes and edges between them, drawn left to right in reading order. Every board node's evidence is an exact quote (3 to 12 words) from the source that justifies it (it is printed under the node, so pick the most telling words). count is 1, or 3 to 9 when the node means 'many of these' (8 GPUs, many workers, lots of docs): it becomes an icon grid. callouts: at most 1 per board, circling the node that matters most (target = board node id, text 1 to 3 words). Use colors semantically. icon from: ${o.icons}`,
    "Optionally one 'notes' scene (after the source scene) when the source lists concrete things (features, steps, numbers, stack): 3 to 6 items, text 2 to 7 words, evidence an exact quote, target empty, estimate false (a number the author states is their claim, not our estimate). icon from the same list.",
    "4. 'recap': the whole idea in two sentences, what to remember.",
    `Each narration about ${L.wordsPerScene} words; total ${L.seconds[0]}-${L.seconds[1]} seconds at 2.6 words/sec. Do not claim anything the source does not say; say 'the author claims' when it is a claim.`,
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
    return { ...s, id: `s${String(i + 1).padStart(2, "0")}-${s.kind}`, heading: lower(s.heading).split(/\s+/).slice(0, 4).join(" "), highlights, board_nodes, board_edges, callouts, items, add_components: [], add_connections: [] };
  }).filter((s) => !(s.kind === "board" && s.board_nodes.length < 2) && !(s.kind === "source" && !s.highlights.length && !s.narration) && !(s.kind === "notes" && s.items.length < 2));
  return { plan: { ...plan, title: lower(plan.title), subtitle: lower(plan.subtitle), scenes }, dropped };
}

export const estimateSeconds = (text: string) => Math.max(2.5, wordCount(text) / 2.6);
export { z };
