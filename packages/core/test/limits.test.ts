import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, estimateFilmSeconds, formatCap, getTheme, resolveLook, titleForPlan, trimPlanToCap, type Scene } from "@explanimate/core";

const scene = (id: string, narration: string): Scene => ({
  id,
  kind: "board",
  heading: "test scene",
  narration,
  add_components: [],
  add_connections: [],
  board_nodes: [],
  board_edges: [],
  highlights: [],
  callouts: [],
  items: [],
});

const line = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => `${seed} part ${i + 1} says something concrete here.`).join(" ");

test("the job name wins over the planned title, and a missing name keeps it", () => {
  assert.equal(titleForPlan("agent browser", "my-video"), "my-video");
  assert.equal(titleForPlan("agent browser", "  my-video  "), "my-video");
  assert.equal(titleForPlan("agent browser", undefined), "agent browser");
  assert.equal(titleForPlan("agent browser", "   "), "agent browser");
});

test("each format caps at the top of its range", () => {
  assert.deepEqual(
    [formatCap("short"), formatCap("deep"), formatCap("anatomy")],
    [FORMATS.short.seconds[1], FORMATS.deep.seconds[1], FORMATS.anatomy.seconds[1]],
  );
  assert.deepEqual([formatCap("short"), formatCap("deep"), formatCap("anatomy")], [60, 120, 150]);
});

test("an over-long narration is trimmed until the film fits the cap, one sentence kept per scene", () => {
  const plan = { title: "t", subtitle: "s", scenes: [scene("s1", line(12, "First")), scene("s2", line(12, "Second"))] };
  assert.ok(estimateFilmSeconds(plan, 2.6, 0.8) > 60);
  const { plan: cut, trimmed } = trimPlanToCap(plan, 60, 2.6, 0.8);
  assert.ok(estimateFilmSeconds(cut, 2.6, 0.8) <= 60);
  assert.ok(trimmed.length > 0);
  for (const s of cut.scenes) assert.ok(s.narration.trim().length > 0, `${s.id} keeps a sentence`);
  const kept = trimPlanToCap(plan, 600, 2.6, 0.8);
  assert.deepEqual(kept.trimmed, []);
  assert.deepEqual(
    kept.plan.scenes.map((s) => s.narration),
    plan.scenes.map((s) => s.narration),
  );
});

test("dark resolves to the chalk-dark theme on a black board, anything else keeps the brief's look", () => {
  assert.equal(resolveLook("dark", "pen-light"), "chalk-dark");
  assert.equal(resolveLook(undefined, "pen-light"), "pen-light");
  assert.equal(resolveLook("default", "whiteboard-light"), "whiteboard-light");
  assert.equal(getTheme(resolveLook("dark", "pen-light")).background, "#000000");
});
