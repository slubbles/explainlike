import { test } from "node:test";
import assert from "node:assert/strict";
import { ScenePlan, RepoPlanWire, strictJsonSchema, type Architecture, type Beat, type Scene } from "@explanimate/core";
import { checkBeats, alignBeats, nicknames, shownIsSaid, figureOf, wordNumbers, kineticFrom, readmeExcerpt } from "@explanimate/planner";

const arch = {
  product: "agent-browser",
  one_liner: "browser automation for AI agents",
  components: [
    {
      id: "agent",
      name: "AI agent",
      kind: "client",
      layer: "client",
      keyword: "ai agent",
      icon: "robot",
      what: "x",
      evidence: ["README.md"],
    },
    {
      id: "cli",
      name: "agent-browser CLI",
      kind: "service",
      layer: "backend",
      keyword: "agent-browser cli",
      icon: "terminal",
      what: "x",
      evidence: ["cli/src/main.rs"],
    },
    {
      id: "daemon",
      name: "agent-browser daemon",
      kind: "service",
      layer: "backend",
      keyword: "daemon",
      icon: "server",
      what: "x",
      evidence: ["cli/src/daemon.rs"],
    },
  ],
  connections: [],
  walkthrough: { name: "w", steps: [] },
  scale: [],
} as unknown as Architecture;
const beat = (line: string, visual: Beat["visual"], anchor: string, over: Partial<Beat> = {}): Beat => ({
  line,
  visual,
  anchor,
  text: "",
  items: [],
  focus: "",
  ...over,
});
const scene = (kind: Scene["kind"], beats: Beat[]): Scene => ({
  id: kind,
  kind,
  heading: kind,
  narration: beats.map((b) => b.line).join(" "),
  add_components: [],
  add_connections: [],
  board_nodes: [],
  board_edges: [],
  highlights: [],
  callouts: [],
  items: [],
  beats,
});
const SOURCE = 'agent-browser open example.com\nagent-browser snapshot\n- button "Submit" [ref=e2]';

test("a repo plan's wire schema requires beats on every scene; the parse schema keeps them optional", () => {
  const wire = strictJsonSchema(RepoPlanWire) as {
    properties: { scenes: { items: { required: string[]; properties: { beats: { items: { required: string[] } } } } } };
  };
  assert.ok(wire.properties.scenes.items.required.includes("beats"));
  assert.deepEqual([...wire.properties.scenes.items.properties.beats.items.required].sort(), [
    "anchor",
    "focus",
    "items",
    "line",
    "text",
    "visual",
  ]);
  assert.ok(ScenePlan.safeParse({ title: "t", subtitle: "", scenes: [{ ...scene("hook", []), beats: undefined }] }).success);
});

test("cards that show what the line says are kept, and the rest fall back to words from the line", () => {
  const plan = {
    title: "agent-browser",
    subtitle: "",
    scenes: [
      scene("hook", [
        beat("Can your AI agent click a button?", "title", "Can your"),
        beat("You use Claude Code or Cursor every day.", "chips", "Claude Code", { items: ["Claude Code", "Cursor", "Codex"] }),
        beat("One command opens example.com.", "terminal", "One command", { text: "$ agent-browser open example.com" }),
        beat("It types a command nobody wrote.", "terminal", "types", { text: "agent-browser fly mars" }),
        beat("That takes seven steps.", "number", "seven steps", { text: "7 steps" }),
      ]),
    ],
  };
  const { plan: out, report } = checkBeats(plan, { arch, source: SOURCE });
  const b = out.scenes[0].beats!;
  assert.deepEqual(
    b.map((x) => x.visual),
    ["title", "chips", "terminal", "kinetic", "kinetic"],
  );
  assert.deepEqual(b[1].items, ["Claude Code", "Cursor"], "a chip the line never says is dropped");
  assert.equal(b[2].text, "agent-browser open example.com");
  assert.ok(
    report.repairs.some((r) => /never shows/.test(r)) && report.repairs.some((r) => /never states/.test(r)),
    report.repairs.join("; "),
  );
  assert.ok(shownIsSaid(b[3].text, b[3].line));
  assert.equal(report.issues.length, 0, report.issues.join("; "));
});

test("never the same card three lines running, and a missing familiar anchor or a nickname is reported", () => {
  const k = (line: string) => beat(line, "kinetic", line.split(" ").slice(0, 2).join(" "), { text: line.replace(/\.$/, "") });
  const plan = {
    title: "x",
    subtitle: "",
    scenes: [
      scene("hook", [k("Browsers are slow."), k("Scripts break often."), k("Pages change daily.")]),
      scene("layer", [beat("The browser link drives Chrome.", "board", "The browser")]),
    ],
  };
  const { plan: out, report } = checkBeats(plan, { arch, source: "works with Claude Code" });
  assert.deepEqual(
    out.scenes[0].beats!.map((b) => b.visual),
    ["kinetic", "kinetic", "board"],
  );
  assert.ok(report.issues.some((i) => /^no chips line in the first scenes/.test(i)));
  assert.ok(report.issues.some((i) => /"browser link" is a made-up name/.test(i)));
});

test("a rewrite that moves the words re-cuts each beat's line from the narration", () => {
  const s = {
    ...scene("layer", [
      beat("The daemon keeps Chrome open.", "board", "The daemon"),
      beat("So each command is quick.", "kinetic", "each command", { text: "each command is quick" }),
    ]),
    narration: "The daemon, a program that stays running, keeps Chrome open. So each command is quick.",
  };
  const { beats, dropped } = alignBeats(s);
  assert.deepEqual(dropped, []);
  assert.equal(beats[0].line, "The daemon, a program that stays running, keeps Chrome open.");
  assert.equal(beats[1].line, "So each command is quick.");
});

test("helpers: nicknames, figures, kinetic words and the README excerpt", () => {
  assert.deepEqual(nicknames("the terminal tool talks to the daemon"), ["terminal tool"]);
  assert.deepEqual(nicknames("the daemon and the agent-browser cli"), []);
  assert.equal(figureOf("1 command"), 1);
  assert.equal(figureOf("seven steps"), 7);
  assert.equal(kineticFrom("So the page loads, and you get it back."), "page loads");
  const ex = readmeExcerpt(
    `# x\n<p><img src="a"></p>\n${"intro ".repeat(1200)}\n## Snapshot\n\`\`\`\n# - button "Submit" [ref=e2]\n\`\`\``,
    2000,
  );
  assert.ok(!ex.includes("<img") && ex.includes("[ref=e2]"));
});

test("word numbers read past twenty, and a figure matches the source only as a whole number", () => {
  assert.equal(figureOf("thirty two browsers"), 32);
  assert.equal(figureOf("one hundred requests"), 100);
  assert.equal(figureOf("two thousand rows"), 2000);
  assert.deepEqual(wordNumbers("a hundred and five"), [100, 5]);
  const num = (text: string) => scene("layer", [beat("It drives 2 browsers at once.", "number", "drives", { text })]);
  // 2 is said but the source only states 200: demoted, instead of matching the substring
  const bad = checkBeats({ title: "x", subtitle: "", scenes: [num("2 browsers")] }, { arch, source: "the grid runs 200 browsers" });
  assert.equal(bad.plan.scenes[0].beats![0].visual, "kinetic");
  assert.ok(
    bad.report.repairs.some((r) => /never states/.test(r)),
    bad.report.repairs.join("; "),
  );
  // the source states 2, and the word form counts too
  for (const source of ["the grid runs 2 browsers", "the grid runs two browsers"]) {
    const good = checkBeats({ title: "x", subtitle: "", scenes: [num("2 browsers")] }, { arch, source });
    assert.equal(good.plan.scenes[0].beats![0].visual, "number", source);
  }
});

test("a scene with no beats gets one board beat per line instead of skipping the check", () => {
  const s = { ...scene("layer", []), beats: undefined, narration: "First it opens the page. Then it reads the rows." };
  const { plan, report } = checkBeats({ title: "x", subtitle: "", scenes: [s] }, { arch, source: SOURCE });
  assert.deepEqual(
    plan.scenes[0].beats!.map((b) => b.visual),
    ["board", "board"],
  );
  assert.deepEqual(
    plan.scenes[0].beats!.map((b) => b.line),
    ["First it opens the page.", "Then it reads the rows."],
  );
  assert.ok(
    report.repairs.some((r) => /no visuals were planned/.test(r)),
    report.repairs.join("; "),
  );
});

test("a browser bar the line never says is dropped; one it says is kept", () => {
  const page = (line: string, text: string) =>
    scene("layer", [
      beat(line, "browser", line.split(" ").slice(0, 2).join(" "), {
        text,
        items: ["login page", "Submit button"],
        focus: "Submit button",
      }),
    ]);
  const dropped = checkBeats(
    { title: "x", subtitle: "", scenes: [page("Open the login page and press Submit.", "myapp.internal/login")] },
    { arch, source: SOURCE },
  );
  assert.equal(dropped.plan.scenes[0].beats![0].visual, "browser");
  assert.equal(dropped.plan.scenes[0].beats![0].text, "");
  assert.ok(
    dropped.report.repairs.some((r) => /browser bar/.test(r)),
    dropped.report.repairs.join("; "),
  );
  const kept = checkBeats(
    { title: "x", subtitle: "", scenes: [page("Open the dashboard and press Submit.", "dashboard")] },
    { arch, source: SOURCE },
  );
  assert.equal(kept.plan.scenes[0].beats![0].text, "dashboard");
});

test("past the kinetic cap, a kinetic beside another kinetic goes back to the board first", () => {
  const k = (line: string) => beat(line, "kinetic", line.split(" ").slice(0, 2).join(" "), { text: line.replace(/\.$/, "") });
  const lines = [
    "Alpha teams ship daily.",
    "Beta fixes land hourly.",
    "Gamma pages render fast.",
    "Delta cache fills first.",
    "Epsilon flags flip safely.",
  ];
  const plan = {
    title: "x",
    subtitle: "",
    scenes: [scene("hook", [beat("Can it scale well?", "board", "Can it")]), scene("layer", lines.map(k))],
  };
  const { plan: out } = checkBeats(plan, { arch, source: SOURCE });
  // five kinetics: the third becomes board (never three running), then the cap keeps two
  assert.deepEqual(
    out.scenes[1].beats!.map((b) => b.visual),
    ["board", "kinetic", "board", "board", "kinetic"],
  );
});
