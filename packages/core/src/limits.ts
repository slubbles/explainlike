import { FORMATS, type ExplainFormat, type Look } from "./brief.js";
import type { ScenePlan } from "./schemas.js";
import { wordCount } from "./text.js";

/** The hard cap for a format: the final video never runs past the top of its range. */
export function formatCap(format: ExplainFormat): number {
  return FORMATS[format].seconds[1];
}

/** The job name wins over the planned title when given; otherwise the plan keeps its own. */
export function titleForPlan(planTitle: string, name?: string): string {
  const n = name?.trim();
  return n ? n : planTitle;
}

/** An explicit look wins over the brief's; anything else keeps what the engine picked. */
export function resolveLook(look: "dark" | "default" | undefined, briefLook: Look): Look {
  return look === "dark" ? "chalk-dark" : briefLook;
}

/** Predicted narration seconds at this speaking pace (matches the renderer's silent timing). */
export function estimatePlanSeconds(plan: ScenePlan, wps: number): number {
  return plan.scenes.reduce((t, s) => t + Math.max(2.5, wordCount(s.narration) / wps), 0);
}

/** Predicted film seconds: narration plus a lead and tail per scene and the outro hold. */
export function estimateFilmSeconds(plan: ScenePlan, wps: number, tail: number): number {
  return estimatePlanSeconds(plan, wps) + plan.scenes.length * (0.3 + tail) + 4.2;
}

const sentences = (t: string) =>
  t
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

/**
 * Shorten the narration until the film estimate fits the cap, dropping trailing sentences
 * from the longest scenes first. Every scene keeps at least its first sentence.
 */
export function trimPlanToCap(plan: ScenePlan, capSec: number, wps: number, tail: number): { plan: ScenePlan; trimmed: string[] } {
  const scenes = plan.scenes.map((s) => ({ ...s }));
  const trimmed: string[] = [];
  for (;;) {
    if (estimateFilmSeconds({ ...plan, scenes }, wps, tail) <= capSec) break;
    let best = -1,
      bestWords = 0;
    scenes.forEach((s, i) => {
      if (sentences(s.narration).length < 2) return;
      const w = wordCount(s.narration);
      if (w > bestWords) {
        bestWords = w;
        best = i;
      }
    });
    if (best < 0) break;
    const parts = sentences(scenes[best].narration);
    parts.pop();
    scenes[best] = { ...scenes[best], narration: parts.join(" ") };
    if (!trimmed.includes(scenes[best].id)) trimmed.push(scenes[best].id);
  }
  return { plan: { ...plan, scenes }, trimmed };
}
