import { z } from "zod";
import {
  ScaleRisk,
  NoteItem,
  lower,
  tidySpeech,
  soundsLikeKeywords,
  type Architecture,
  type Progress,
  type Scene,
  type ScenePlan,
} from "@explanimate/core";
import { sparkJson, type CostLedger } from "@explanimate/models";
import { validateNotes } from "./scenes.js";

// Follow-up clips that reuse an earlier run's architecture: a deep dive on one box, and "what if 10x traffic?".

const blank = (id: string, kind: Scene["kind"], heading: string, narration: string): Scene => ({
  id,
  kind,
  heading: lower(heading),
  narration: tidySpeech(narration),
  add_components: [],
  add_connections: [],
  board_nodes: [],
  board_edges: [],
  highlights: [],
  callouts: [],
  items: [],
});

const neighbours = (arch: Architecture, id: string) =>
  new Set([id, ...arch.connections.flatMap((c) => (c.from === id ? [c.to] : c.to === id ? [c.from] : []))]);

/**
 * A summary sentence that names a rendering mode the evidence never shows is a
 * model guess, not a fact (microui was once called "retained" when the code is
 * immediate-mode). Drop only those sentences; keep everything else word for word.
 */
export function groundedSummary(summary: string, evidence: string): string {
  const ev = evidence.toLowerCase();
  const sentences = summary.match(/[^.!?]+[.!?]+/g) ?? [summary];
  const kept = sentences.filter((s) => {
    const t = s.toLowerCase();
    if (/\bretained?\b/.test(t) && !ev.includes("retain")) return false;
    if (/\bimmediate([ -]mode)?\b/.test(t) && !ev.includes("immediate")) return false;
    return true;
  });
  return kept.join(" ").trim();
}

/** A point that only says the files don't show something tells the viewer nothing and cites a file that doesn't back it. */
export function emptyPoint(text: string) {
  return /\b(?:do(?:es)?\s+not|don'?t|doesn'?t|never)\s+(?:show|reveal|include|contain|say)\b|\bnot\s+(?:shown|visible|included|in the (?:provided |given )?files)\b/i.test(
    text,
  );
}

/** Text answer for the interactive player: what this box does, grounded in its evidence files. */
export async function explainComponent(o: {
  ledger: CostLedger;
  arch: Architecture;
  id: string;
  evidence: string;
  audience: string;
  question?: string;
}) {
  const c = o.arch.components.find((x) => x.id === o.id);
  if (!c) throw new Error(`unknown component ${o.id}`);
  const links = o.arch.connections.filter((x) => x.from === c.id || x.to === c.id).map((x) => `${x.from} -> ${x.to} (${x.label})`);
  return sparkJson({
    ledger: o.ledger,
    step: "explain",
    name: "explain",
    effort: "low",
    maxTokens: 2500,
    schema: z.object({
      summary: z.string().describe("2 to 4 plain sentences"),
      points: z.array(z.object({ text: z.string(), file: z.string().describe("one evidence file path from the list, exact") })),
    }),
    messages: [
      {
        role: "system",
        content: [
          `You explain one box of a system design diagram of the product "${o.arch.product}" to a viewer who tapped it while watching. Audience: ${o.audience}.`,
          "Use only the evidence files given. Every point is a fact the cited file shows. If the files do not show something, say so once in the summary, never as a point; never guess traffic, latency or cost numbers.",
          "2 to 4 points, each one short sentence.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          JSON.stringify({
            component: { id: c.id, name: c.name, kind: c.kind, what: c.what },
            connections: links,
            question: o.question ?? "what does this do and how does it connect?",
          }) +
          "\n\nEVIDENCE FILES:\n" +
          o.evidence,
      },
    ],
  }).then((r) => ({
    ...r,
    summary: groundedSummary(r.summary, o.evidence),
    points: r.points.filter((p) => !emptyPoint(p.text) && (c.evidence.includes(p.file) || o.evidence.includes(`### ${p.file}\n`))),
  }));
}

/** A 15 to 20 second clip: the whole system for a beat, then pinned notes on one component and its neighbours. */
export async function planFocus(o: {
  ledger: CostLedger;
  arch: Architecture;
  id: string;
  evidence: string;
  audience: string;
  progress?: Progress;
}): Promise<ScenePlan & { repairs: string[] }> {
  const c = o.arch.components.find((x) => x.id === o.id);
  if (!c) throw new Error(`unknown component ${o.id}`);
  const near = neighbours(o.arch, c.id);
  o.progress?.({ stage: "plan", message: `planning a deep dive on ${c.keyword}` });
  const ask = (retry: string) =>
    sparkJson({
      ledger: o.ledger,
      step: retry ? "focus-plan-retry" : "focus-plan",
      name: "focus",
      effort: "low",
      maxTokens: 3000,
      schema: z.object({ intro: z.string(), heading: z.string(), items: z.array(NoteItem), narration: z.string() }),
      messages: [
        {
          role: "system",
          content: [
            `Write a 15 to 20 second deep dive on one box of the "${o.arch.product}" diagram. Audience: ${o.audience}.`,
            'intro: one natural spoken sentence (about 10 words) naming the box and where it sits, e.g. "This box is you, the viewer, pasting a link into the web app." heading: 2 to 4 lowercase words that the narration says.',
            `items: 3 or 4 notes pinned on the diagram. target is always "${c.id}" (mention neighbours in the text if needed). text 2 to 7 lowercase words that read as a phrase: keep commas and "or" in a list ("paste a github, x or article link", never "paste github x article link"). evidence: one exact file path from the evidence files. color: blue, green, orange, purple, yellow or red. icon: "" is fine. estimate false unless the text holds an assumed number.`,
            'narration: about 35 words of natural, complete spoken sentences, the way a teacher talks, never a list of keywords. Walk through the notes in order and work each note\'s key words into a full sentence (note "paste a github, x or article link" -> "You paste a GitHub, X, or article link."). Keep articles, "or", "and" and commas. Only facts the evidence files show; no traffic, latency or cost numbers.',
          ].join("\n"),
        },
        {
          role: "user",
          content:
            JSON.stringify({ component: c, connections: o.arch.connections.filter((x) => near.has(x.from) && near.has(x.to)) }) +
            "\n\nEVIDENCE FILES:\n" +
            o.evidence +
            retry,
        },
      ],
    });
  let r = await ask("");
  // a narration that reads as a keyword list sounds broken when voiced, so it is asked for once more
  if (soundsLikeKeywords(r.intro) || soundsLikeKeywords(r.narration))
    r = await ask(
      `\n\nYOUR LAST DRAFT READ AS A KEYWORD LIST, NOT SPEECH:\n${r.intro} ${r.narration}\nRewrite intro and narration as natural spoken sentences with articles and pronouns.`,
    );
  const files = new Set(o.arch.components.flatMap((x) => x.evidence));
  const v = validateNotes(
    r.items.slice(0, 4).map((i) => ({ ...i, target: c.id })),
    { ids: near, files, evidenceOf: (id) => o.arch.components.find((x) => x.id === id)?.evidence[0] ?? "" },
  );
  const notes = { ...blank("focus", "notes", r.heading || c.keyword, r.narration), items: v.items.slice(0, 4) };
  return {
    title: lower(o.arch.product),
    subtitle: `deep dive: ${c.keyword}`,
    scenes: [blank("establish", "establish", "where it sits", r.intro), notes],
    repairs: v.repairs,
  } as ScenePlan & { repairs: string[] };
}

/** "What if traffic grows 10x?": fresh scale risks on the existing diagram, every number labelled as an assumption. */
export async function planWhatIf(o: {
  ledger: CostLedger;
  arch: Architecture;
  factor: "10x" | "100x";
  evidence: string;
  audience: string;
  progress?: Progress;
}): Promise<{ arch: Architecture; plan: ScenePlan & { repairs: string[] } }> {
  o.progress?.({ stage: "plan", message: `what breaks at ${o.factor}?` });
  const ids = o.arch.components.map((c) => c.id);
  const r = await sparkJson({
    ledger: o.ledger,
    step: "what-if-plan",
    name: "what_if",
    effort: "low",
    maxTokens: 4000,
    schema: z.object({ intro: z.string(), risks: z.array(ScaleRisk.extend({ heading: z.string(), narration: z.string() })) }),
    messages: [
      {
        role: "system",
        content: [
          `The viewer asks: what if "${o.arch.product}" got ${o.factor} its traffic (or, for a library, ${o.factor} the adoption)? Pick the 2 components that break first, from the evidence. Audience: ${o.audience}.`,
          `component must be one of: ${ids.join(", ")}. at: "${o.factor}". problem and fix: 1 to 3 lowercase words. evidence: one exact file path from the evidence. heading: 2 to 4 lowercase words that the narration says (reuse the problem words).`,
          "narration: about 30 words per risk, in 2 or 3 short plain sentences a non-engineer can follow: what breaks and why, then 'The fix is ...'. Start with 'If ...' (you do not know the project's real traffic or adoption) and never state user, request, latency or cost numbers as facts. No run-on 'so assume' clauses, no jargon strings like 'single room fanout'.",
          "intro: one natural spoken sentence (about 10 words) that sets up the question. Every narration is complete, grammatical sentences, never a list of keywords.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          JSON.stringify({
            components: o.arch.components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, what: c.what })),
            connections: o.arch.connections.map((c) => `${c.from}>${c.to}`),
          }) +
          "\n\nEVIDENCE FILES:\n" +
          o.evidence,
      },
    ],
  });
  const repairs: string[] = [];
  const risks = r.risks
    .filter((x) => {
      const ok = ids.includes(x.component);
      if (!ok) repairs.push(`dropped risk on unknown ${x.component}`);
      return ok;
    })
    .slice(0, 2)
    .map((x) => ({
      ...x,
      at: o.factor,
      problem: lower(x.problem).split(/\s+/).slice(0, 3).join(" "),
      fix: lower(x.fix).split(/\s+/).slice(0, 3).join(" "),
    }));
  if (!risks.length) throw new Error("what-if: no usable risks");
  const HEDGE = /\b(if|assum|estimat|suppose|imagine)/i;
  const scenes: Scene[] = [blank("establish", "establish", `what if ${o.factor}?`, r.intro)];
  risks.forEach((x, i) =>
    scenes.push({
      ...blank(`scale-${i}`, "scale", x.heading, HEDGE.test(x.narration) ? x.narration : `If use grew ${o.factor}: ${x.narration}`),
      callouts: [
        { target: x.component, text: x.problem, color: "red" },
        { target: x.component, text: x.fix, color: "green" },
      ],
    }),
  );
  const arch = { ...o.arch, scale: risks.map(({ heading: _h, narration: _n, ...rest }) => rest) };
  return {
    arch,
    plan: { title: lower(o.arch.product), subtitle: `what if ${o.factor} traffic`, scenes, repairs } as ScenePlan & { repairs: string[] },
  };
}
