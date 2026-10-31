import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Levels are config: one JSON file per level in packages/core/levels.
 * Add your own with registerLevel(), loadLevelFile() or `explainlike --level-file my-level.json`.
 */
export const NotesSlot = z.object({
  after: z.enum(["hook", "walkthrough", "scale"]),
  heading: z.string(),
  brief: z.string(),
});
export type NotesSlot = z.infer<typeof NotesSlot>;

export const LevelSpec = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string(),
  minComponents: z.number().int().min(2),
  maxComponents: z.number().int().max(20),
  perScene: z.number().int().min(1).max(6),
  scaleItems: z.number().int().min(0).max(5),
  scaleAt: z.array(z.enum(["10x", "100x"])).min(1),
  wordsPerScene: z.number().int().min(10).max(60),
  seconds: z.tuple([z.number(), z.number()]),
  voice: z.string(),
  /** extra whiteboard list scenes for repo videos (requirements, estimates, failure modes...) */
  notes: z.array(NotesSlot).default([]),
}).refine((l) => l.minComponents <= l.maxComponents, "minComponents must be <= maxComponents");
export type LevelSpec = z.infer<typeof LevelSpec>;

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_LEVEL_DIR = path.resolve(here, "../levels");

const registry = new Map<string, LevelSpec>();
for (const id of ["five", "new", "interviewing", "senior"]) {
  const spec = LevelSpec.parse(JSON.parse(fs.readFileSync(path.join(BUILTIN_LEVEL_DIR, `${id}.json`), "utf8")));
  registry.set(spec.id, spec);
}

export function getLevel(id: string): LevelSpec {
  const l = registry.get(id);
  if (!l) throw new Error(`unknown level "${id}". Known: ${[...registry.keys()].join(", ")}`);
  return l;
}
/** Plugin point: add your own explanation level (validated). */
export function registerLevel(spec: unknown): LevelSpec {
  const l = LevelSpec.parse(spec);
  registry.set(l.id, l);
  return l;
}
export function loadLevelFile(file: string): LevelSpec {
  return registerLevel(JSON.parse(fs.readFileSync(file, "utf8")));
}
export function listLevels(): LevelSpec[] { return [...registry.values()]; }
