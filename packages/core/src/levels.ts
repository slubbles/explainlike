import type { Level } from "./schemas.js";

export interface LevelSpec {
  id: Level;
  label: string;
  maxComponents: number;
  minComponents: number;
  perScene: number;
  scaleItems: number;
  scaleAt: ("10x" | "100x")[];
  wordsPerScene: number;
  seconds: [number, number];
  voice: string;
}

const L: Record<Level, LevelSpec> = {
  five: {
    id: "five", label: "I'm 5", minComponents: 4, maxComponents: 6, perScene: 2, scaleItems: 1, scaleAt: ["10x"],
    wordsPerScene: 24, seconds: [40, 60],
    voice: "Explain to a curious 5 year old. Use one everyday analogy (a restaurant, a library, a post office) and keep it through the whole video. No jargon; if a real name is needed, say what it is like first. Short, warm sentences.",
  },
  new: {
    id: "new", label: "I'm new", minComponents: 6, maxComponents: 9, perScene: 3, scaleItems: 2, scaleAt: ["10x"],
    wordsPerScene: 30, seconds: [55, 80],
    voice: "Explain to a junior developer in their first job. Name the real technologies, say in plain words what each one does and why it is there. One small analogy is fine.",
  },
  interviewing: {
    id: "interviewing", label: "I'm interviewing", minComponents: 8, maxComponents: 12, perScene: 3, scaleItems: 3, scaleAt: ["10x", "100x"],
    wordsPerScene: 34, seconds: [65, 95],
    voice: "Explain like a strong candidate in a system design interview: requirements, components, data flow, bottlenecks, tradeoffs. Use the vocabulary interviewers expect (read path, write path, cache hit, fan-out, sharding, back-pressure) but only when the code supports it.",
  },
  senior: {
    id: "senior", label: "a senior", minComponents: 9, maxComponents: 13, perScene: 4, scaleItems: 4, scaleAt: ["10x", "100x"],
    wordsPerScene: 34, seconds: [65, 95],
    voice: "Explain to a staff engineer. Terse. Focus on tradeoffs, failure modes, consistency, cost and what you would change. Skip basics.",
  },
};

const registry = new Map<string, LevelSpec>(Object.entries(L));
export function getLevel(id: string): LevelSpec {
  const l = registry.get(id);
  if (!l) throw new Error(`unknown level "${id}". Known: ${[...registry.keys()].join(", ")}`);
  return l;
}
/** Plugin point: add your own explanation level. */
export function registerLevel(spec: LevelSpec) { registry.set(spec.id, spec); }
export function listLevels(): LevelSpec[] { return [...registry.values()]; }
