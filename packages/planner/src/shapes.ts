import type { Approach } from "@explainlike/core";

/**
 * The shape of the video, chosen from the approach the brief picked. Until now every source got the
 * same six beats (hook, one scene per part, one walkthrough, a scale scene, a recap headed "the whole
 * trip") and the same hotel-front-desk analogy, so a DNS explainer and a web-analytics explainer came
 * out looking like the same video with different labels. The shape decides the opening move, how the
 * parts are introduced, whether there is an analogy at all, and where the video stops.
 */
export type Shape = "journey" | "build" | "fault";

export interface ShapeSpec {
  /** what the first scene does */
  hook: string;
  /** how the scenes that introduce the parts are framed */
  spine: string;
  /** how the video ends, and whether there is a recap at all */
  close: string;
  /** heading style, with examples the narration has to actually say */
  headings: string;
  /** whether the everyday analogy is used, optional, or left out */
  analogy: "required" | "optional" | "none";
  recap: boolean;
}

export const SHAPES: Record<Shape, ShapeSpec> = {
  journey: {
    analogy: "optional",
    hook:
      "Sentence one is the hook: a question the viewer would ask, or one surprising, concrete claim about the problem this project solves, at most 14 words, no product name needed. Then what the product is in plain words (no part names, no jargon), what goes wrong without it, the everyday analogy, and the promise of the story, e.g. 'Let's follow one message through it.'",
    spine:
      "Tell it as the request moving forward ('First...', 'Next it reaches...'): each scene is the next thing that happens to it, and the part it meets is the part that does that thing. For each added part say its keyword out loud, what it does in plain words, its role in the analogy, and why it is there.",
    close:
      "End with one recap scene: retell the trip in one breath, from the viewer to what they get back, naming the journey keywords in order, then one line that answers the hook's question. Give it a heading that says what came back to the viewer, not 'the whole trip'.",
    headings:
      "Name the hop, in the words the narration says: 'a click arrives', 'the queue holds it', 'the ledger keeps it'. Never a generic summary heading.",
    recap: true,
  },
  build: {
    analogy: "optional",
    hook:
      "Sentence one is the hook: the one small thing that already works here, said as a concrete claim ('one file, and it already answers'), at most 14 words, no product name needed. Then the limit of that small thing, in plain words, and the promise: what has to be added, and why. No analogy unless one genuinely comes from the project's own world.",
    spine:
      "Each scene adds the next part because the scene before it hit a specific limit. Say the limit first, as a problem the viewer can feel ('one process is fine until the second writer arrives'), then add the part that lifts it and say what it buys. The parts arrive in the order the limits appear, not the order they are listed in the architecture.",
    close:
      "Do not recap the whole trip. End on the walkthrough's payoff: the thing this system can do now that the first small version could not, in one sentence, and stop.",
    headings:
      "Name the limit or the gain, not the part: 'it works once', 'the second writer', 'now it queues'. Never 'the whole trip'.",
    recap: false,
  },
  fault: {
    analogy: "none",
    hook:
      "Sentence one is the hook: the pain, in the second person and concrete, at most 14 words ('your dashboard takes nine seconds to open'), then what that pain costs and what this project does about it. No analogy: the pain is the through-line.",
    spine:
      "Each scene removes one piece of the pain: name what hurts at that point (slow, lost, wrong, down), then the part that removes it and what changes for the viewer because of it. The parts arrive in the order the pain is felt.",
    close:
      "End with one short closing scene: the same moment from the hook, now without the pain, in one breath ('the dashboard opens, from the first chart to the last, in under a second'). Pay off the hook's number or claim, then stop.",
    headings:
      "Name the pain and its removal: 'nine seconds', 'nothing is lost', 'it waits its turn'. Never a tour heading.",
    recap: true,
  },
};

/** story and step-by-step are both one thing moving through the system; build-up adds parts; the rest start from a pain. */
export function shapeFor(approach: Approach): Shape {
  if (approach === "build-up") return "build";
  if (approach === "problem-solution" || approach === "compare") return "fault";
  return "journey";
}

/** The analogy rule for a shape, so no shape falls back to the three standbys. */
export function analogyRule(shape: Shape, analogy: string): string {
  const banned =
    "Never a hotel front desk, a post office, a restaurant kitchen or a mailroom unless the source is literally about one of those.";
  if (shape === "fault") return `No everyday analogy in this video: the pain carries it. ${banned}`;
  if (!analogy) return `No everyday analogy. Say the real parts by their real names; this subject is concrete enough without one. ${banned}`;
  return `Everyday analogy, used lightly: ${analogy}. Give it one sentence in the hook and at most a light callback on the journey; do not dress every part in it, and say the real name each time you use it. It must come from the world this project serves, not from the standbys. ${banned}`;
}
