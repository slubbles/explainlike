import { APPROACHES, Brief, LOOKS, NOTE_LIBRARY, STYLES, type Ask, type Progress, type SourceKind } from "@explainlike/core";
import { sparkJson, type CostLedger } from "@explainlike/models";

/**
 * Step one of every video: read the source and decide how to explain it.
 * The engine, not the viewer, picks the approach, depth, tempo, look and style.
 */
export async function planBrief(o: { ledger: CostLedger; kind: SourceKind; name: string; text: string; ask?: Ask; progress?: Progress }): Promise<Brief> {
  o.progress?.({ stage: "brief", message: "deciding how to explain it" });
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
        "Pick the approach from the shape of the source, not by habit: a request with one clear path through the system is 'story'; a project that grew one part at a time, each part answering a limit, is 'build-up'; a project that exists to kill one specific pain is 'problem-solution'; one that replaces a common way of doing something is 'compare'. Do not default to story.",
        "If the approach is story, step-by-step or analogy, pick ONE everyday analogy for the whole system whose parts map onto the real parts. Draw it from the world this project serves (music, maps, money, health, games, transport, a workshop). Never a hotel front desk, a post office, a restaurant kitchen or a mailroom: those are the first thing anyone thinks of, and they make every video feel like the same video. If the approach is problem-solution or compare, set analogy to an empty string and let the pain carry the video.",
        "Pick the look from the subject, not by habit: chalk-dark for infrastructure and low-level systems, whiteboard-light for conceptual or product explanations, pen-light for business, data or everyday subjects. The last video's look is not a reason to pick it again.",
        "Pick the audience that will get the most from this source; the default viewer is a developer who has never seen this project.",
        "Pick depth from what the viewer needs, not from how big the code is: 'working' by default, 'overview' for small tools, 'deep' only when the internals are the point. Extras: usually none.",
        `Approaches:\n${list(APPROACHES)}`,
        `Looks:\n${list(LOOKS)}`,
        `Styles (repositories are always whiteboard; pick explainer only when the sources state real numbers or dates that carry the story):\n${list(STYLES)}`,
        `Extra list scenes (only when they teach something the diagram cannot):\n${list(NOTE_LIBRARY)}`,
        ask ?? "",
      ].filter(Boolean).join("\n") },
      { role: "user", content: `${o.kind === "repo" ? "Repository" : o.kind === "x-post" ? "X post" : o.kind === "topic" ? "Topic (asked by the viewer; the text is from reputable sources)" : "Article"}: ${o.name}\n\n${o.text.slice(0, 14000)}` },
    ],
  });
  // what the viewer asked for is not a suggestion; a repo has no stated figures to chart, so it stays a whiteboard
  return { ...b, depth: o.ask?.depth ?? b.depth, style: o.kind === "repo" ? "whiteboard" : b.style };
}
