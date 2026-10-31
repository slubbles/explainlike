import { APPROACHES, Brief, LOOKS, NOTE_LIBRARY, type Progress } from "@explainlike/core";
import { sparkJson, type CostLedger } from "@explainlike/models";

/**
 * Step one of every video: read the source and decide how to explain it.
 * The engine, not the viewer, picks the approach, depth, tempo and look.
 */
export async function planBrief(o: { ledger: CostLedger; kind: "repo" | "x-post" | "article"; name: string; text: string; progress?: Progress }): Promise<Brief> {
  o.progress?.({ stage: "plan", message: "deciding how to explain it" });
  const list = (r: Record<string, string | { brief: string }>) => Object.entries(r).map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : v.brief.split(".")[0]}`).join("\n");
  return sparkJson({
    ledger: o.ledger, step: "brief", schema: Brief, name: "brief", effort: "low", maxTokens: 3000,
    messages: [
      { role: "system", content: [
        "You are the director of a short whiteboard explainer video. Before anything is drawn, decide how this source should be explained.",
        "Good explainers (Mayer's multimedia principles): one idea per beat, words spoken while the matching drawing appears, signal what matters, nothing decorative.",
        "Technical, unfamiliar or many-part topics go slower and step by step; simple topics go faster and lean on an analogy.",
        "Pick the audience that will get the most from this source; the default reader is a developer who has never seen this project.",
        "Pick depth from what the source can support: a small script is an overview; a large multi-service system can go deep.",
        `Approaches:\n${list(APPROACHES)}`,
        `Looks:\n${list(LOOKS)}`,
        `Extra list scenes (only when they teach something the diagram cannot):\n${list(NOTE_LIBRARY)}`,
      ].join("\n") },
      { role: "user", content: `${o.kind === "repo" ? "Repository" : o.kind === "x-post" ? "X post" : "Article"}: ${o.name}\n\n${o.text.slice(0, 14000)}` },
    ],
  });
}
