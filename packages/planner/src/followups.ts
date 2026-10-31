import { z } from "zod";
import { ScaleRisk, NoteItem, lower, type Architecture, type Level, type Progress, type Scene, type ScenePlan } from "@metual/core";
import { sparkJson, type CostLedger } from "@metual/models";
import { validateNotes } from "./scenes.js";

// Follow-up clips that reuse an earlier run's architecture: a deep dive on one box, and "what if 10x traffic?".

const blank = (id: string, kind: Scene["kind"], heading: string, narration: string): Scene => ({
  id, kind, heading: lower(heading), narration, add_components: [], add_connections: [], board_nodes: [], board_edges: [], highlights: [], callouts: [], items: [],
});

const neighbours = (arch: Architecture, id: string) =>
  new Set([id, ...arch.connections.flatMap((c) => (c.from === id ? [c.to] : c.to === id ? [c.from] : []))]);

/** Text answer for the interactive player: what this box does, grounded in its evidence files. */
export async function explainComponent(o: { ledger: CostLedger; arch: Architecture; id: string; evidence: string; level: Level; question?: string }) {
  const c = o.arch.components.find((x) => x.id === o.id);
  if (!c) throw new Error(`unknown component ${o.id}`);
  const links = o.arch.connections.filter((x) => x.from === c.id || x.to === c.id).map((x) => `${x.from} -> ${x.to} (${x.label})`);
  return sparkJson({
    ledger: o.ledger, step: "explain", name: "explain", effort: "low", maxTokens: 2500,
    schema: z.object({
      summary: z.string().describe("2 to 4 plain sentences"),
      points: z.array(z.object({ text: z.string(), file: z.string().describe("one evidence file path from the list, exact") })),
    }),
    messages: [
      { role: "system", content: [
        `You explain one box of a system design diagram of the product "${o.arch.product}" to a viewer who tapped it while watching. Audience level: ${o.level}.`,
        "Use only the evidence files given. Every point cites one of those file paths. If the files do not show something, say so; never guess traffic, latency or cost numbers.",
        "2 to 4 points, each one short sentence.",
      ].join("\n") },
      { role: "user", content: JSON.stringify({ component: { id: c.id, name: c.name, kind: c.kind, what: c.what }, connections: links, question: o.question ?? "what does this do and how does it connect?" }) + "\n\nEVIDENCE FILES:\n" + o.evidence },
    ],
  }).then((r) => ({ ...r, points: r.points.filter((p) => c.evidence.includes(p.file) || o.evidence.includes(`### ${p.file}\n`)) }));
}

/** A 15 to 20 second clip: the whole system for a beat, then pinned notes on one component and its neighbours. */
export async function planFocus(o: { ledger: CostLedger; arch: Architecture; id: string; evidence: string; level: Level; progress?: Progress }): Promise<ScenePlan & { repairs: string[] }> {
  const c = o.arch.components.find((x) => x.id === o.id);
  if (!c) throw new Error(`unknown component ${o.id}`);
  const near = neighbours(o.arch, c.id);
  o.progress?.({ stage: "plan", message: `planning a deep dive on ${c.keyword}` });
  const r = await sparkJson({
    ledger: o.ledger, step: "focus-plan", name: "focus", effort: "low", maxTokens: 3000,
    schema: z.object({ intro: z.string(), heading: z.string(), items: z.array(NoteItem), narration: z.string() }),
    messages: [
      { role: "system", content: [
        `Write a 15 to 20 second deep dive on one box of the "${o.arch.product}" diagram. Audience: ${o.level}.`,
        "intro: one sentence (about 10 words) naming the box and where it sits. heading: 2 to 4 lowercase words that the narration says.",
        `items: 3 or 4 notes pinned on the diagram. target is always "${c.id}" (mention neighbours in the text if needed). text 2 to 7 lowercase words. evidence: one exact file path from the evidence files. color: blue, green, orange, purple, yellow or red. icon: "" is fine. estimate false unless the text holds an assumed number.`,
        "narration: about 35 words, reads the notes in order, and says each note's first words out loud. Only facts the evidence files show; no traffic, latency or cost numbers.",
      ].join("\n") },
      { role: "user", content: JSON.stringify({ component: c, connections: o.arch.connections.filter((x) => near.has(x.from) && near.has(x.to)) }) + "\n\nEVIDENCE FILES:\n" + o.evidence },
    ],
  });
  const files = new Set(o.arch.components.flatMap((x) => x.evidence));
  const v = validateNotes(r.items.slice(0, 4).map((i) => ({ ...i, target: c.id })), { ids: near, files, evidenceOf: (id) => o.arch.components.find((x) => x.id === id)?.evidence[0] ?? "" });
  const notes = { ...blank("focus", "notes", r.heading || c.keyword, r.narration), items: v.items.slice(0, 4) };
  return { title: lower(o.arch.product), subtitle: `deep dive: ${c.keyword}`, scenes: [blank("establish", "establish", "where it sits", r.intro), notes], repairs: v.repairs } as ScenePlan & { repairs: string[] };
}

/** "What if traffic grows 10x?": fresh scale risks on the existing diagram, every number labelled as an assumption. */
export async function planWhatIf(o: { ledger: CostLedger; arch: Architecture; factor: "10x" | "100x"; evidence: string; level: Level; progress?: Progress }): Promise<{ arch: Architecture; plan: ScenePlan & { repairs: string[] } }> {
  o.progress?.({ stage: "plan", message: `what breaks at ${o.factor}?` });
  const ids = o.arch.components.map((c) => c.id);
  const r = await sparkJson({
    ledger: o.ledger, step: "what-if-plan", name: "what_if", effort: "low", maxTokens: 4000,
    schema: z.object({ intro: z.string(), risks: z.array(ScaleRisk.extend({ heading: z.string(), narration: z.string() })) }),
    messages: [
      { role: "system", content: [
        `The viewer asks: what if "${o.arch.product}" got ${o.factor} its traffic? Pick the 2 components that break first, from the evidence. Audience: ${o.level}.`,
        `component must be one of: ${ids.join(", ")}. at: "${o.factor}". problem and fix: 1 to 3 lowercase words. evidence: one exact file path from the evidence. heading: 2 to 4 lowercase words that the narration says (reuse the problem words).`,
        "narration: about 30 words per risk: what breaks and why, then the fix. You do not know the app's real traffic: say 'if' or 'assume' and never state user, request, latency or cost numbers as facts.",
        "intro: one sentence (about 10 words) that sets up the question.",
      ].join("\n") },
      { role: "user", content: JSON.stringify({ components: o.arch.components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, what: c.what })), connections: o.arch.connections.map((c) => `${c.from}>${c.to}`) }) + "\n\nEVIDENCE FILES:\n" + o.evidence },
    ],
  });
  const repairs: string[] = [];
  const risks = r.risks.filter((x) => { const ok = ids.includes(x.component); if (!ok) repairs.push(`dropped risk on unknown ${x.component}`); return ok; }).slice(0, 2)
    .map((x) => ({ ...x, at: o.factor, problem: lower(x.problem).split(/\s+/).slice(0, 3).join(" "), fix: lower(x.fix).split(/\s+/).slice(0, 3).join(" ") }));
  if (!risks.length) throw new Error("what-if: no usable risks");
  const HEDGE = /\b(if|assum|estimat|suppose|imagine)/i;
  const scenes: Scene[] = [blank("establish", "establish", `what if ${o.factor}?`, r.intro)];
  risks.forEach((x, i) => scenes.push({
    ...blank(`scale-${i}`, "scale", x.heading, HEDGE.test(x.narration) ? x.narration : `If traffic grew ${o.factor}: ${x.narration}`),
    callouts: [{ target: x.component, text: x.problem, color: "red" }, { target: x.component, text: x.fix, color: "green" }],
  }));
  const arch = { ...o.arch, scale: risks.map(({ heading: _h, narration: _n, ...rest }) => rest) };
  return { arch, plan: { title: lower(o.arch.product), subtitle: `what if ${o.factor} traffic`, scenes, repairs } as ScenePlan & { repairs: string[] } };
}
