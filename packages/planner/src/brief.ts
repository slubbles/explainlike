import { APPROACHES, Brief, LOOKS, NOTE_LIBRARY, type Ask, type Progress } from "@explainlike/core";
import { sparkJson, type CostLedger } from "@explainlike/models";

/**
 * Step one of every video: read the source and decide how to explain it.
 * The engine, not the viewer, picks the approach, depth, tempo and look.
 */
export async function planBrief(o: { ledger: CostLedger; kind: "repo" | "x-post" | "article"; name: string; text: string; ask?: Ask; progress?: Progress }): Promise<Brief> {
  o.progress?.({ stage: "plan", message: "deciding how to explain it" });
  const list = (r: Record<string, string | { brief: string }>) => Object.entries(r).map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : v.brief.split(".")[0]}`).join("\n");
  const ask = o.ask && [
    "The viewer told us what they want; it outranks the defaults above:",
    o.ask.goal && `- they want to understand: ${o.ask.goal}`,
    o.ask.audience && `- it is for: ${o.ask.audience} (write the audience as that viewer)`,
    o.ask.depth && `- depth: ${o.ask.depth}`,
    o.ask.also && `- also cover: ${o.ask.also}`,
  ].filter(Boolean).join("\n");
  const b = await sparkJson({
    ledger: o.ledger, step: "brief", schema: Brief, name: "brief", effort: "low", maxTokens: 3000,
    messages: [
      { role: "system", content: [
        "You are the director of a short whiteboard explainer video. Before anything is drawn, decide how this source should be explained.",
        "Good explainers (Mayer's multimedia principles): one idea per beat, words spoken while the matching drawing appears, signal what matters, nothing decorative.",
        "Technical, unfamiliar or many-part topics go slower and step by step; simple topics go faster.",
        "The video must leave a newcomer able to say what this is and how one request flows through it. That core flow is the video; internals, scale and trade-offs are optional extras.",
        "Always pick one everyday analogy for the whole system (a restaurant kitchen, a post office, a hotel front desk) whose parts map onto the real parts.",
        "For repositories prefer the 'story' approach: follow one request on its journey.",
        "Pick the audience that will get the most from this source; the default viewer is a developer who has never seen this project.",
        "Pick depth from what the viewer needs, not from how big the code is: 'working' by default, 'overview' for small tools, 'deep' only when the internals are the point. Extras: usually none.",
        `Approaches:\n${list(APPROACHES)}`,
        `Looks:\n${list(LOOKS)}`,
        `Extra list scenes (only when they teach something the diagram cannot):\n${list(NOTE_LIBRARY)}`,
        ask ?? "",
      ].filter(Boolean).join("\n") },
      { role: "user", content: `${o.kind === "repo" ? "Repository" : o.kind === "x-post" ? "X post" : "Article"}: ${o.name}\n\n${o.text.slice(0, 14000)}` },
    ],
  });
  // what the viewer asked for is not a suggestion
  return { ...b, depth: o.ask?.depth ?? b.depth };
}
