import type { Architecture } from "./schemas.js";
import { phraseAt } from "./text.js";

/**
 * Where the narration tells each walkthrough step, as an index into its spoken words (-1 when it never
 * does). A step is told when its label is said ("sends the message") or, in plain words, when the part it
 * reaches is named after the part it leaves ("the engine hands the numbers back to the chat window"). A
 * part named early on the way somewhere else does not count for a later step: once the step's own source
 * is named, only a mention after it does. The planner's check and the board's timing read the same cues,
 * so a walkthrough that passes the check is one the board can follow, and no label has to be recited.
 */
export function walkCues(spoken: string[], arch: Architecture): number[] {
  const kw = (id: string) => arch.components.find((c) => c.id === id)?.keyword ?? "";
  let at = 0;
  return arch.walkthrough.steps.map((st) => {
    let k = phraseAt(spoken, st.label, at);
    const to = kw(st.to),
      from = kw(st.from);
    if (k < 0 && to) {
      const f = from ? phraseAt(spoken, from, at) : -1;
      k = f >= 0 ? phraseAt(spoken, to, f + 1) : -1;
      if (k < 0) k = phraseAt(spoken, to, at);
    }
    if (k >= 0) at = k + 1;
    return k;
  });
}
