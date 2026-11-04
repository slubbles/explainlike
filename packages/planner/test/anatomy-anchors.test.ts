import { test } from "node:test";
import assert from "node:assert/strict";
import { specFromBrief, DEFAULT_BRIEF, type Architecture, type Scene, type ScenePlan } from "@explanimate/core";
import {
  repoSystem,
  anatomyTraceAnchors,
  exportedSymbols,
  checkFormatBeats,
  scoreRubric,
  shouldRejectRubric,
  shouldRegeneratePlan,
  isBetterRubric,
  type RubricScore,
} from "@explanimate/planner";

const part = (id: string, keyword: string, evidence: string) => ({
  id,
  name: id,
  kind: "api",
  layer: "backend",
  keyword,
  what: `${keyword} does its job`,
  icon: "box",
  evidence: [evidence],
});
const traceArch = {
  product: "explanimate",
  one_liner: "paste a repo link, get a whiteboard explainer video",
  components: [
    part("web", "job page", "apps/web/app/api/jobs/route.ts"),
    part("api", "job queue", "packages/api/src/jobs.ts"),
    part("planner", "scene planner", "packages/planner/src/scenes.ts"),
    part("voice", "voiceover", "packages/voice/src/speak.ts"),
    part("render", "film renderer", "packages/render/src/film.ts"),
  ],
  connections: [
    { from: "web", to: "api", label: "send job", evidence: "apps/web/app/api/jobs/route.ts" },
    { from: "api", to: "planner", label: "plan scenes", evidence: "packages/api/src/jobs.ts" },
    { from: "planner", to: "voice", label: "voice scenes", evidence: "packages/planner/src/scenes.ts" },
    { from: "voice", to: "render", label: "mix film", evidence: "packages/voice/src/speak.ts" },
  ],
  walkthrough: {
    name: "render one video",
    steps: [
      { from: "web", to: "api", label: "send job", evidence: "apps/web/app/api/jobs/route.ts" },
      { from: "api", to: "planner", label: "plan scenes", evidence: "packages/api/src/jobs.ts" },
      { from: "planner", to: "voice", label: "voice scenes", evidence: "packages/planner/src/scenes.ts" },
      { from: "voice", to: "render", label: "mix film", evidence: "packages/voice/src/speak.ts" },
    ],
  },
  scale: [],
} as unknown as Architecture;

const sc = (kind: Scene["kind"], narration: string, over: Partial<Scene> = {}): Scene =>
  ({
    id: kind,
    kind,
    heading: kind,
    narration,
    add_components: [],
    add_connections: [],
    board_nodes: [],
    board_edges: [],
    highlights: [],
    callouts: [],
    items: [],
    ...over,
  }) as unknown as Scene;
const plan = (...scenes: Scene[]): ScenePlan => ({ title: "x", subtitle: "", scenes });

test("the anatomy prompt quotes the traced request's real files and exported symbols", () => {
  const spec = specFromBrief(DEFAULT_BRIEF, { format: "anatomy" }, "repo");
  assert.equal(spec.format, "anatomy");
  const read = (p: string) => (p.endsWith("route.ts") ? "export async function POST() {}\nexport const config = {};\n" : "");
  const prompt = repoSystem(traceArch, spec, 90, 150, [], read);
  for (const p of [
    "apps/web/app/api/jobs/route.ts",
    "packages/api/src/jobs.ts",
    "packages/planner/src/scenes.ts",
    "packages/voice/src/speak.ts",
  ])
    assert.ok(prompt.includes(p), `prompt quotes ${p}`);
  assert.ok(prompt.includes("`POST`"), "prompt quotes the route's exported symbol");
  assert.ok(prompt.includes("cites at least one file path or `symbol`"), "each layer beat must cite a path or symbol");
  const deep = specFromBrief(DEFAULT_BRIEF, undefined, "repo");
  assert.ok(!repoSystem(traceArch, deep, 90, 120).includes("Traced-request facts"), "deep prompts carry no traced-request facts");
});

test("the traced request lists each hop's real file, with symbols when the file can be read", () => {
  const lines = anatomyTraceAnchors(traceArch, (p) => (p.endsWith("route.ts") ? "export async function POST() {}\n" : ""));
  assert.ok(lines[0].includes("apps/web/app/api/jobs/route.ts"), lines[0]);
  assert.ok(lines[0].includes("`POST`"), lines[0]);
  assert.ok(
    lines.some((l) => l.includes("packages/api/src/jobs.ts")),
    lines.join("\n"),
  );
  const bare = anatomyTraceAnchors(traceArch);
  assert.ok(bare[0].includes("apps/web/app/api/jobs/route.ts"), bare[0]);
  assert.ok(!bare[0].includes("exports"), "no file reader means paths without symbols");
});

test("exported symbols are read from the file, never guessed", () => {
  assert.deepEqual(exportedSymbols("export async function POST() {}\nexport const config = {};\n"), ["POST", "config"]);
  assert.deepEqual(exportedSymbols("export { a, b as c };\n"), ["a", "c"]);
  assert.deepEqual(exportedSymbols("const x = 1;\nfunction local() {}\n"), []);
});

test("an anatomy layer beat without a file path or symbol goes back", () => {
  const noCite = plan(
    sc("hook", "How does one link become a video you can watch today?"),
    sc("layer", "The job page owns the screen and hands your link to the job queue, because every request starts with you.", {
      add_components: ["web"],
    }),
  );
  assert.ok(
    checkFormatBeats(noCite, "anatomy", traceArch, 2.6).some((i) => /names no file or symbol/.test(i)),
    "a generic layer beat is flagged",
  );
  const cited = plan(
    sc("hook", "How does one link become a video you can watch today?"),
    sc(
      "layer",
      "The job page owns the screen and hands your link from `apps/web/app/api/jobs/route.ts` to the job queue, because every request starts with you.",
      { add_components: ["web"] },
    ),
  );
  assert.ok(
    !checkFormatBeats(cited, "anatomy", traceArch, 2.6).some((i) => /names no file or symbol/.test(i)),
    "a layer beat citing its file passes",
  );
});

test("a zero-anchor anatomy script regenerates instead of rendering", () => {
  const generic = plan(
    sc("hook", "What if one link became a video you can watch today?"),
    sc("layer", "The web app and the planner help. They do work for you.", { add_components: ["web", "api"] }),
    sc("layer", "The voice and the renderer help. They do work for you.", { add_components: ["voice", "render"] }),
    sc("layer", "The queue and the planner help. They do work for you.", { add_components: ["api", "planner"] }),
  );
  const score = scoreRubric(generic, { arch: traceArch, manifest: [], format: "anatomy", wps: 2.6 });
  assert.equal(score.anchors, 0);
  assert.equal(score.causal, 0);
  assert.equal(shouldRegeneratePlan(score), true);
  assert.equal(shouldRejectRubric(score), true);
  const weak: RubricScore = { hook: 2, causal: 0, anchors: 1, visual: 1, payoff: 2, total: 6, issues: ["a", "b"] };
  assert.equal(shouldRegeneratePlan(weak), true);
  const ok: RubricScore = { hook: 2, causal: 1, anchors: 1, visual: 1, payoff: 2, total: 7, issues: ["a"] };
  assert.equal(shouldRegeneratePlan(ok), false);
});

test("the best-scoring draft wins: higher total, then fewer issues", () => {
  const weak: RubricScore = { hook: 2, causal: 0, anchors: 0, visual: 1, payoff: 2, total: 5, issues: ["a", "b", "c"] };
  const strong: RubricScore = { hook: 2, causal: 2, anchors: 1, visual: 1, payoff: 2, total: 8, issues: ["a"] };
  assert.equal(isBetterRubric(strong, weak), true);
  assert.equal(isBetterRubric(weak, strong), false);
  const tidy: RubricScore = { hook: 2, causal: 1, anchors: 1, visual: 1, payoff: 2, total: 7, issues: ["a"] };
  const noisy: RubricScore = { hook: 2, causal: 1, anchors: 1, visual: 1, payoff: 2, total: 7, issues: ["a", "b"] };
  assert.equal(isBetterRubric(tidy, noisy), true);
  assert.equal(isBetterRubric(noisy, tidy), false);
});
