import { test } from "node:test";
import assert from "node:assert/strict";
import type { Architecture, Beat, Scene } from "@explanimate/core";
import {
  alignBeats,
  checkBeats,
  checkStory,
  earPhrases,
  commandWords,
  groundToReadme,
  readmeExcerpt,
  speechIssues,
  spokenSlips,
} from "@explanimate/planner";

const comp = (id: string, keyword: string, kind = "service") => ({
  id,
  name: keyword,
  kind,
  layer: "backend",
  keyword,
  icon: "box",
  what: "x",
  evidence: ["README.md"],
});
const arch = {
  product: "agent-browser",
  one_liner: "browser automation for AI agents",
  components: [
    comp("agent", "ai agent", "client"),
    comp("cli", "agent-browser cli"),
    comp("daemon", "daemon"),
    comp("chrome", "chrome"),
    comp("dash", "dashboard"),
  ],
  connections: [
    { from: "agent", to: "cli", label: "run command", evidence: "README.md" },
    { from: "cli", to: "daemon", label: "send command", evidence: "README.md" },
    { from: "daemon", to: "chrome", label: "drive page", evidence: "README.md" },
    { from: "dash", to: "daemon", label: "watch", evidence: "README.md" },
  ],
  walkthrough: {
    name: "w",
    steps: [
      { from: "agent", to: "cli", label: "run command" },
      { from: "cli", to: "daemon", label: "send command" },
      { from: "daemon", to: "chrome", label: "drive page" },
    ],
  },
  scale: [
    { component: "daemon", load: "1k", problem: "too many browsers", why: "x", fix: "reuse contexts", evidence: "x" },
    { component: "daemon", load: "1k", problem: "slow start", why: "x", fix: "shard across regions", evidence: "x" },
  ],
} as unknown as Architecture;
const sc = (kind: Scene["kind"], narration: string, beats?: Beat[]): Scene =>
  ({
    id: kind,
    kind,
    heading: kind,
    narration: narration || (beats ?? []).map((b) => b.line).join(" "),
    add_components: [],
    add_connections: [],
    callouts: [],
    highlights: [],
    board_nodes: [],
    board_edges: [],
    items: [],
    ...(beats ? { beats } : {}),
  }) as unknown as Scene;
const plan = (...scenes: Scene[]) => ({ title: "agent-browser", subtitle: "", scenes });

test("lines nobody says aloud are caught: garbled pronouns, bare part names, re-introductions and a long name twice running", () => {
  assert.match(spokenSlips("It is a tool for you user to use.", arch).join(" "), /garbled/);
  const p = plan(
    sc("layer", "Your agent types a command. The daemon keeps Chrome open."),
    sc("walkthrough", "Daemon keeps the page open."),
  );
  assert.match(spokenSlips("Daemon keeps the page open.", arch, p).join(" "), /bare name "daemon"/);
  assert.match(spokenSlips("It runs the daemon. That daemon, a background process, waits.", arch).join(" "), /re-introduces "daemon"/);
  assert.match(
    spokenSlips("Commands go to the agent-browser CLI. The agent-browser CLI starts every job.", arch).join(" "),
    /said in two sentences in a row/,
  );
  assert.deepEqual(spokenSlips("Commands go to the agent-browser CLI, a small Rust program. It starts fast.", arch), []);
  assert.deepEqual(
    spokenSlips("Commands go to the agent-browser CLI. The agent-browser CLI starts it.", arch, undefined, false),
    [],
    "the recap may retell the names",
  );
});

test("'your' on a part of the system is flagged even once, never on what is really the viewer's", () => {
  const issues = speechIssues(plan(sc("layer", "Your daemon keeps the browser open.")), arch);
  assert.ok(
    issues.some((i) => /"your daemon"/.test(i)),
    issues.join("; "),
  );
  assert.ok(!speechIssues(plan(sc("layer", "Your ai agent types a command, and the daemon runs it.")), arch).some((i) => /"your /.test(i)));
});

test("a journey hook opens on the 'What if ...?' question; other shapes and old callers are unchanged", () => {
  const p = plan(sc("hook", "AI agents can't see web pages. That's agent-browser."));
  assert.ok(checkStory(p, arch, "", "journey").some((i) => /What if/.test(i)));
  assert.ok(
    !checkStory(plan(sc("hook", "What if your AI could really click around the web? That's agent-browser.")), arch, "", "journey").some(
      (i) => /What if/.test(i),
    ),
  );
  assert.ok(!checkStory(p, arch).some((i) => /What if/.test(i)));
});

test("a journey hook may also open on a direct question about your payoff", () => {
  const p = plan(sc("hook", "How does one file turn into answers you can trust? That is the question this tool answers for you."));
  assert.ok(!checkStory(p, arch, "", "journey").some((i) => /should be the .What if/.test(i)));
});

test("a journey hook that names parts, the client included, says what it is instead", () => {
  const p = plan(sc("hook", "What if your AI agent drove the daemon for you? That is the tool: it drives browsers for you."));
  assert.ok(checkStory(p, arch, "", "journey").some((i) => /before the story starts/.test(i)));
});

test("the video's scope follows the README: a side part its opening never names, and a fix it never says, are left out", () => {
  const readme = `# agent-browser\nBrowser automation CLI for AI agents. The daemon keeps Chrome open.${" filler".repeat(3000)}\n## Observability Dashboard\nReuse browser contexts between runs.`;
  const g = groundToReadme(arch, readme);
  assert.deepEqual(
    g.arch.components.map((c) => c.id),
    ["agent", "cli", "daemon", "chrome"],
  );
  assert.ok(!g.arch.connections.some((c) => c.from === "dash" || c.to === "dash"));
  assert.deepEqual(
    g.arch.scale.map((r) => r.fix),
    ["reuse contexts"],
  );
  assert.equal(g.dropped.length, 2, g.dropped.join("; "));
  assert.equal(groundToReadme(arch, "").arch, arch, "no README keeps the map as it is");
});

test("a terminal card needs its command said: the words after the program, refs and file names read aloud", () => {
  assert.deepEqual(commandWords('agent-browser fill @e3 "test@example.com"'), ["fill", "e3"]);
  assert.deepEqual(commandWords("agent-browser screenshot page.png --full"), ["screenshot", "page"]);
  assert.deepEqual(commandWords("agent-browser"), ["agent", "browser"]);
  const t = (line: string, text: string): Beat => ({
    line,
    visual: "terminal",
    anchor: line.split(" ").slice(0, 2).join(" "),
    text,
    items: [],
    focus: "",
  });
  const src = 'agent-browser snapshot\nagent-browser fill @e3 "test@example.com"';
  const out = checkBeats(
    plan(
      sc("walkthrough", "", [
        t("So it types snapshot.", "agent-browser snapshot"),
        t("Then it fills the form.", 'agent-browser fill @e3 "a@b.c"'),
      ]),
    ),
    { arch, source: src },
  );
  assert.deepEqual(
    out.plan.scenes[0].beats!.map((b) => b.visual),
    ["terminal", "kinetic"],
  );
  assert.ok(
    out.report.repairs.some((r) => /never says "e3"/.test(r)),
    out.report.repairs.join("; "),
  );
});

test("kinetic cards are capped at about a third of the cards; the hook and recap keep theirs", () => {
  const k = (line: string): Beat => ({
    line,
    visual: "kinetic",
    anchor: line.split(" ")[0],
    text: line.replace(/\.$/, ""),
    items: [],
    focus: "",
  });
  const c = (line: string, items: string[]): Beat => ({ line, visual: "chips", anchor: line.split(" ")[0], text: "", items, focus: "" });
  const scenes = [
    sc("hook", "", [k("Pages are hard."), c("Claude Code and Cursor work.", ["Claude Code", "Cursor"])]),
    sc("layer", "", [
      k("Browsers are slow."),
      c("Chrome and Safari exist.", ["Chrome", "Safari"]),
      k("Scripts break often."),
      c("Claude Code or Cursor types.", ["Claude Code", "Cursor"]),
      k("Pages change daily."),
    ]),
    sc("recap", "", [k("Your agent clicks for real.")]),
  ];
  const out = checkBeats(plan(...scenes), { arch, source: "Claude Code" });
  const v = out.plan.scenes.map((s) => s.beats!.map((b) => b.visual));
  assert.deepEqual(v[0], ["kinetic", "chips"]);
  assert.equal(v[1].filter((x) => x === "kinetic").length, 1, v[1].join(","));
  assert.deepEqual(v[2], ["kinetic"]);
  assert.ok(out.report.repairs.some((r) => /capped/.test(r)));
});

test("the README excerpt carries its feature claims, trimmed to the sentence that says them", () => {
  const readme = `# x\nintro\n${"words ".repeat(1500)}\n- **Authentication Vault**: Store credentials locally (always encrypted), reference by name. The LLM never sees passwords. \`auth login\` navigates with \`load\` and then waits.\n`;
  assert.match(
    readmeExcerpt(readme),
    /Authentication Vault: Store credentials locally \(always encrypted\), reference by name\. The LLM never sees passwords\.$/m,
  );
});

test('a journey hook says "That\'s <name>:" after the question, and cute stand-ins for real parts are flagged', () => {
  const without = plan(sc("hook", "What if your AI could really click around the web? Not guess. Actually open it."));
  assert.ok(checkStory(without, arch, "", "journey").some((i) => /That's agent-browser/.test(i)));
  const withIt = plan(
    sc("hook", "What if your AI could really click around the web? That's agent-browser: a tool that lets an AI agent drive Chrome."),
  );
  assert.ok(!checkStory(withIt, arch, "", "journey").some((i) => /That's agent-browser/.test(i)));
  assert.match(spokenSlips("Your helper can't see the screen.", arch).join(" "), /made-up nickname/);
  assert.deepEqual(spokenSlips("Your AI agent can't see the screen.", arch), []);
});

test("two beats starting in one sentence keep the card, so the sentence is never said twice", () => {
  const s = sc("walkthrough", "", [
    { line: "The CLI sends it on.", visual: "board", anchor: "The CLI sends", text: "", items: [], focus: "" },
    {
      line: "The CLI sends it on.",
      visual: "browser",
      anchor: "sends it",
      text: "example.com",
      items: ["email box", "button submit"],
      focus: "",
    },
    { line: "Chrome opens example.com.", visual: "board", anchor: "Chrome opens", text: "", items: [], focus: "" },
  ]);
  s.narration = "The CLI sends it on. Chrome opens example.com.";
  const lines = alignBeats(s).beats.map((b) => `${b.visual}:${b.line}`);
  assert.deepEqual(lines, ["browser:The CLI sends it on.", "board:Chrome opens example.com."]);
});

test("a contrast must say what tells its sides apart, problem first", () => {
  const line = "A new browser for each click eats memory. So one browser stays open.";
  const b = (items: string[]): Beat => ({ line, visual: "contrast", anchor: "A new browser", text: "", items, focus: "" });
  const swapped = checkBeats(plan(sc("scale", line, [b(["one browser", "new browser each click"])])), { arch });
  assert.deepEqual(swapped.plan.scenes[0].beats![0].items, ["new browser each click", "one browser"]);
  const unsaid = checkBeats(plan(sc("scale", line, [b(["ten browsers", "one browser"])])), { arch });
  assert.equal(unsaid.plan.scenes[0].beats![0].visual, "kinetic");
});

test("a speech fix keeps each part name once, not card anchors or step labels", () => {
  const s = sc("walkthrough", "The ai agent asks. The daemon and label buttons. The daemon drives chrome.");
  assert.deepEqual(earPhrases(s, arch), ["ai agent", "daemon", "chrome"]);
});

test("the trip back may be one sentence naming where it lands, and a journey hook's \"That's\" line may name the client", () => {
  const round = {
    ...arch,
    walkthrough: {
      name: "w",
      steps: [
        ...arch.walkthrough.steps,
        { from: "chrome", to: "daemon", label: "return page" },
        { from: "daemon", to: "cli", label: "pass result" },
        { from: "cli", to: "agent", label: "show output" },
      ],
    },
  } as unknown as Architecture;
  const walk = (n: string) =>
    checkStory(
      plan(sc("hook", "What if? That's agent-browser: it lets an ai agent drive chrome."), sc("walkthrough", n)),
      round,
      "",
      "journey",
    );
  const told = walk(
    "Your ai agent types a command for the agent-browser cli. The daemon keeps it warm, and chrome opens the page. A short list comes back to the ai agent.",
  );
  assert.ok(!told.some((i) => /tell each step/.test(i)), told.join("; "));
  assert.ok(!told.some((i) => /hook names parts/.test(i)), told.join("; "));
  const cut = walk("Your ai agent types a command for the agent-browser cli. The daemon keeps it warm, and chrome opens the page.");
  assert.ok(cut.some((i) => /tell each step/.test(i)));
});

test("a line that says an element's ref shows the README's element list with that row circled", () => {
  const source =
    'agent-browser snapshot\n# - heading "Example Domain" [ref=e1]\n# - button "Submit" [ref=e2]\n# - textbox "Email" [ref=e3]\n';
  const line = "It reads a short list, so it fills e3.";
  const r = checkBeats(plan(sc("walkthrough", line, [{ line, visual: "board", anchor: "It reads", text: "", items: [], focus: "" }])), {
    arch,
    source,
  });
  const b = r.plan.scenes[0].beats![0];
  assert.equal(b.visual, "output");
  assert.equal(b.focus, 'textbox "Email" [ref=e3]');
  assert.ok(b.items.length >= 2);
});

test("a README safety promise is found and must be said", async () => {
  const { readmePromises } = await import("../src/beats.js");
  const { promiseIssues } = await import("../src/scenes.js");
  const ps = readmePromises(
    "Features:\n- Authentication Vault: Store credentials locally. The LLM never sees passwords.\n- Snapshots: Read the page.",
  );
  assert.deepEqual(ps, [{ feature: "Authentication Vault", sentence: "The LLM never sees passwords." }]);
  const plan = (n: string) => ({ scenes: [{ narration: n }] }) as any;
  assert.equal(promiseIssues(plan("It clicks things."), ps).length, 1);
  assert.equal(promiseIssues(plan("Save it in the auth vault, and the LLM never sees your password."), ps).length, 0);
});

test("a said safety promise becomes a contrast card, and bare sentences naming a part point the board", async () => {
  const { promiseBeat } = await import("../src/beats.js");
  const b = promiseBeat("It fills the form. An AI that types your password could leak it. But the AI never sees passwords.");
  assert.equal(b?.visual, "contrast");
  assert.deepEqual(b?.items, ["types your password", "never sees passwords"]);
  const s = {
    id: "w",
    kind: "walkthrough",
    narration: "You type open. Then the daemon keeps Chrome ready. Chrome opens the page.",
    beats: [{ line: "You type open.", visual: "kinetic", anchor: "You type open", text: "You type open", items: [], focus: "" }],
  } as unknown as Scene;
  const out = alignBeats(s, [
    { id: "d", keyword: "daemon" },
    { id: "c", keyword: "chrome" },
  ]).beats;
  assert.deepEqual(
    out.map((x) => `${x.visual}:${x.focus}`),
    ["kinetic:", "board:d", "board:c"],
  );
});
