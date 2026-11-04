import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATS,
  formatFor,
  specFromBrief,
  DEFAULT_BRIEF,
  type Architecture,
  type FactsManifest,
  type Scene,
  type ScenePlan,
} from "@explanimate/core";
import {
  checkFormatBeats,
  checkHookQuestion,
  checkPayoffAnswersHook,
  checkManifestNumbers,
  anchorDensity,
  checkScenePurpose,
  isInventoryScene,
  dropUntiedSides,
  countVisualMoments,
  checkVisualReasoning,
  pathPartsInOrder,
  scoreRubric,
  shouldRejectRubric,
} from "@explanimate/planner";

const part = (id: string, keyword: string) => ({
  id,
  name: id,
  kind: "api",
  layer: "backend",
  keyword,
  what: `${keyword} does its job`,
  icon: "box",
  evidence: ["a.ts"],
});
const arch = {
  product: "chatbot",
  one_liner: "a chat app with bots",
  components: [part("ui", "team chat"), part("edge", "front door"), part("srv", "bot harness"), part("bot", "agent drivers")],
  connections: [
    { from: "ui", to: "edge", label: "send message", evidence: "a.ts" },
    { from: "edge", to: "srv", label: "forward", evidence: "a.ts" },
    { from: "srv", to: "bot", label: "run bot", evidence: "a.ts" },
  ],
  walkthrough: {
    name: "ask a bot",
    steps: [
      { from: "ui", to: "edge", label: "send message", evidence: "a.ts" },
      { from: "edge", to: "srv", label: "forward", evidence: "a.ts" },
      { from: "srv", to: "bot", label: "run bot", evidence: "a.ts" },
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
const pad = (t: string, n: number) => {
  let w = t.split(/\s+/).length;
  let out = t;
  while (w < n) {
    out += " It keeps working for you.";
    w += 5;
  }
  return out;
};

test("formats: short has four timed beats, deep has six, repos are always deep", () => {
  assert.deepEqual(
    FORMATS.short.beats.map((b) => b.id),
    ["hook", "mechanism", "evidence", "payoff"],
  );
  assert.deepEqual(FORMATS.short.seconds, [45, 60]);
  assert.deepEqual(FORMATS.short.beats[0].seconds, [5, 8]);
  assert.deepEqual(FORMATS.short.beats[1].seconds, [20, 25]);
  assert.deepEqual(FORMATS.short.beats[2].seconds, [10, 15]);
  assert.deepEqual(FORMATS.short.beats[3].seconds, [5, 8]);
  assert.deepEqual(
    FORMATS.deep.beats.map((b) => b.id),
    ["problem", "model", "mechanism", "trace", "failure", "payoff"],
  );
  assert.deepEqual(FORMATS.deep.seconds, [90, 120]);
  assert.equal(formatFor("repo", "overview"), "deep");
  assert.equal(formatFor("topic", "overview"), "short");
  assert.equal(formatFor("topic", "working"), "deep");
  assert.equal(specFromBrief(DEFAULT_BRIEF, undefined, "repo").format, "deep");
  assert.equal(specFromBrief({ ...DEFAULT_BRIEF, depth: "overview" }, undefined, "topic").format, "short");
});

test("format beats: a short plan needs hook, mechanism, evidence and payoff in 45-60s", () => {
  const hook = "How does one click travel from your mouse all the way to the screen today?";
  const mechanism = pad(
    "Opening a fresh browser for every command would be slow, so the front door keeps one browser open for you. Your message goes from the team chat to the front door, which forwards it to the bot harness.",
    60,
  );
  const evidence = pad("When two writers arrive at once the queue lines them up, so nothing is lost for you.", 30);
  const payoff = "So your click reaches the screen through the front door, ready for you to use daily.";
  const good = plan(
    { ...sc("hook", `${hook} This app is for teams.`), id: "s01-hook" },
    { ...sc("walkthrough", mechanism), id: "s02-walkthrough" },
    {
      ...sc("scale", evidence, { callouts: [{ target: "srv", text: "queue", color: "green" }] }),
      id: "s03-scale",
    },
    { ...sc("recap", payoff), id: "s04-recap" },
  );
  assert.deepEqual(checkFormatBeats(good, "short", arch, 2.6), []);
  const noEvidence = plan(sc("hook", `${hook} This app is for teams.`), sc("walkthrough", mechanism), sc("recap", payoff));
  assert.ok(checkFormatBeats(noEvidence, "short", arch, 2.6).some((i) => /failure case or concrete example/.test(i)));
  const tooShort = plan(sc("hook", hook), sc("recap", payoff));
  assert.ok(checkFormatBeats(tooShort, "short", arch, 2.6).some((i) => /45-60s/.test(i)));
});

test("format beats: a deep plan needs six beats including a code trace and a failure", () => {
  const mk = (trace: string, failure: Scene | null) => {
    const scenes = [
      sc("hook", pad("How does one message travel from your chat to a working bot reply for you?", 18)),
      sc("layer", pad("The team chat is where you type, because every request starts with your words for you.", 50), {
        add_components: ["ui"],
      }),
      sc("walkthrough", pad("Your message goes from the team chat to the front door, which forwards it to the bot harness for you.", 50)),
      sc("walkthrough", pad(trace, 50)),
      ...(failure ? [failure] : []),
      sc("recap", pad("So your message becomes a bot reply through the team chat and the front door for you.", 18)),
    ];
    return plan(...scenes.map((s, i) => ({ ...s, id: `s0${i + 1}-${s.kind}` })));
  };
  const trace = "It types `snapshot` from `src/snapshot.ts` and reads back the rows, so your agent sees e3 for you.";
  const failure = sc("scale", pad("At 10x traffic writes queue up, so the fix is a write queue that lines them up for you.", 50), {
    callouts: [{ target: "srv", text: "queue", color: "green" }],
  });
  assert.deepEqual(checkFormatBeats(mk(trace, failure), "deep", arch, 2.6), []);
  assert.ok(
    checkFormatBeats(mk("It reads the page and shows you the reply for you.", failure), "deep", arch, 2.6).some((i) =>
      /code trace/.test(i),
    ),
  );
  assert.ok(checkFormatBeats(mk(trace, null), "deep", arch, 2.6).some((i) => /failure case or tradeoff/.test(i)));
});

test("hook asks a question it never answers in its first line", () => {
  const good = plan(sc("hook", "How does one click reach the screen? This chat app is for teams like you."));
  assert.deepEqual(checkHookQuestion(good), []);
  const statement = plan(sc("hook", "Your dashboard is slow. This tool fixes that slowness for you."));
  assert.ok(checkHookQuestion(statement).some((i) => /must ask a question/.test(i)));
  const answered = plan(sc("hook", "Why is it fast because it caches every page for you? That is why."));
  assert.ok(checkHookQuestion(answered).some((i) => /never answers/.test(i)));
  const late = plan(sc("layer", "The team chat holds your words."), sc("hook", "How does it work for you?"));
  assert.ok(checkHookQuestion(late).some((i) => /must open/.test(i)));
});

test("payoff answers the hook", () => {
  const hook = "How does one click reach the screen?";
  const good = plan(
    sc("hook", `${hook} This app is for you.`),
    sc("recap", "So your click reaches the screen through the front door for you."),
  );
  assert.deepEqual(checkPayoffAnswersHook(good), []);
  const unrelated = plan(sc("hook", `${hook} This app is for you.`), sc("recap", "So your team ships faster every single week for you."));
  assert.ok(checkPayoffAnswersHook(unrelated).some((i) => /answer the hook/.test(i)));
  assert.ok(checkPayoffAnswersHook(plan(sc("hook", hook))).some((i) => /payoff/.test(i)));
});

const manifest: FactsManifest = [
  {
    value: "about 600 lines",
    source_url: "https://github.com/o/r/tree/abc",
    retrieved_at: "2026-11-04T00:00:00Z",
    commit: "abc",
    kind: "lines",
    note: "non-empty lines in source files",
  },
  {
    value: "1234 stars",
    source_url: "https://github.com/o/r/stargazers",
    retrieved_at: "2026-11-04T00:00:00Z",
    commit: "abc",
    kind: "stars",
    note: "adoption only",
  },
  {
    value: "10x",
    source_url: "https://github.com/o/r/blob/abc/README.md",
    retrieved_at: "2026-11-04T00:00:00Z",
    commit: "abc",
    kind: "benchmark",
    note: "the project claims this; say so",
  },
  {
    value: "2026-03-01",
    source_url: "https://github.com/o/r/commit/abc",
    retrieved_at: "2026-11-04T00:00:00Z",
    commit: "abc",
    kind: "commit",
  },
];

test("numbers need a manifest entry; stars are adoption only; benchmarks say claims; lines stay approximate", () => {
  const ok = plan(
    sc("walkthrough", "It holds about 600 lines in `src/`, and the project claims 10x faster for you."),
    sc("layer", "It is popular with teams, holding 1234 stars for you."),
  );
  assert.deepEqual(checkManifestNumbers(ok, manifest, arch), []);
  const invented = plan(sc("walkthrough", "It serves 50k users every day for you."));
  assert.ok(checkManifestNumbers(invented, manifest, arch).some((i) => /50k.*no manifest entry/.test(i)));
  const starsBrag = plan(sc("layer", "It has 1234 stars, so it is the best tool for you."));
  assert.ok(checkManifestNumbers(starsBrag, manifest, arch).some((i) => /adoption/.test(i)));
  const bareClaim = plan(sc("walkthrough", "It runs 10x faster for you."));
  assert.ok(checkManifestNumbers(bareClaim, manifest, arch).some((i) => /project claims/.test(i)));
  const exactLines = plan(sc("layer", "It has 612 lines for you."));
  assert.ok(checkManifestNumbers(exactLines, manifest, arch).some((i) => /about .* lines/.test(i)));
  const scaleOk = plan(sc("scale", "At 10x traffic writes queue up for you."));
  assert.deepEqual(checkManifestNumbers(scaleOk, manifest, arch), []);
});

test("anchors: 2+ real anchors per minute", () => {
  const thin = plan(sc("walkthrough", pad("Your message goes from the team chat to the front door for you.", 156)));
  const d = anchorDensity(thin, manifest, 2.6);
  assert.ok(d.perMinute < 2, `${d.perMinute} should be under 2`);
  const rich = plan(
    sc(
      "walkthrough",
      pad(
        "Your message goes from the team chat to the front door, holding about 600 lines in `src/snapshot.ts` with 1234 stars for you.",
        156,
      ),
    ),
  );
  const r = anchorDensity(rich, manifest, 2.6);
  assert.ok(r.perMinute >= 2, `${r.perMinute} should reach 2`);
  assert.equal(r.anchors, 4);
});

test("every scene advances, shows evidence, or asks; inventories are flagged", () => {
  const inventory = sc("layer", "The bot harness and the agent drivers help. They do work for you.", {
    add_components: ["srv", "bot"],
  });
  assert.equal(isInventoryScene(inventory, arch), true);
  const issues = checkScenePurpose(plan(sc("hook", "Hi."), inventory, sc("recap", "Bye.")), arch);
  assert.ok(issues.some((i) => /inventory|without advancing/.test(i)));
  const causal = sc("layer", "Opening a fresh browser would be slow, so the front door keeps one open for you.", {
    add_components: ["edge"],
  });
  const evidence = sc("walkthrough", "It types `snapshot` and reads `src/snapshot.ts`, showing e3 for you.");
  const question = sc("layer", "What happens when two writers arrive at once? The queue lines them up for you.", {
    add_components: ["srv"],
  });
  assert.deepEqual(checkScenePurpose(plan(sc("hook", "Hi."), causal, evidence, question, sc("recap", "Bye.")), arch), []);
});

test("side parts that never touch the spine are dropped", () => {
  const wide = {
    ...arch,
    components: [...arch.components, part("auth", "login worker"), part("lonely", "lonely widget")],
    connections: [...arch.connections, { from: "ui", to: "auth", label: "log in", evidence: "a.ts" }],
  } as unknown as Architecture;
  const { arch: kept, dropped } = dropUntiedSides(wide);
  assert.deepEqual(kept.components.map((c) => c.id).sort(), ["bot", "edge", "srv", "ui", "auth"].sort());
  assert.ok(dropped.some((d) => /lonely widget/.test(d)));
});

test("visuals: one mechanism drawing plus evidence (2 short, 3 deep); labels alone fail specificity", () => {
  const mech = sc(
    "walkthrough",
    "Your message goes from the team chat to the front door, which forwards it because routing matters for you.",
    {
      beats: [{ line: "Your message goes.", visual: "board", anchor: "Your message", text: "", items: [], focus: "edge" }],
    },
  );
  const proof = sc("walkthrough", "It types snapshot and reads back the rows for you.", {
    beats: [{ line: "It types snapshot.", visual: "terminal", anchor: "It types", text: "snapshot", items: [], focus: "" }],
  });
  const fail = sc("scale", "At 10x traffic writes queue up for you.", {
    callouts: [{ target: "srv", text: "queue", color: "green" }],
    beats: [{ line: "At 10x traffic.", visual: "board", anchor: "At 10x", text: "", items: [], focus: "" }],
  });
  assert.deepEqual(checkVisualReasoning(plan(mech, proof), "short", arch), []);
  assert.ok(checkVisualReasoning(plan(mech), "short", arch).some((i) => /2 visual/.test(i)));
  assert.deepEqual(checkVisualReasoning(plan(mech, proof, fail), "deep", arch), []);
  assert.ok(checkVisualReasoning(plan(mech, proof), "deep", arch).some((i) => /3 visual/.test(i)));
  const labelsOnly = sc("board", "Things go from input to output for you.", {
    board_nodes: [
      { id: "a", keyword: "input", icon: "box", color: "blue", evidence: "x", count: 1 },
      { id: "b", keyword: "process", icon: "box", color: "blue", evidence: "y", count: 1 },
      { id: "c", keyword: "output", icon: "box", color: "blue", evidence: "z", count: 1 },
    ],
    board_edges: [
      { from: "a", to: "b", label: "" },
      { from: "b", to: "c", label: "" },
    ],
  });
  const counted = countVisualMoments(plan(labelsOnly), arch);
  assert.equal(counted.mechanism, 0);
  assert.ok(counted.generic.some((g) => /too generic/.test(g)));
});

test("rubric scores hook, chain, anchors, visual, payoff and rejects weak scripts", () => {
  const hook = "How does one click travel from your mouse all the way to the screen today?";
  const strong = plan(
    { ...sc("hook", `${hook} This chat app is for teams like yours.`), id: "s01-hook" },
    {
      ...sc(
        "walkthrough",
        pad(
          "Opening a fresh browser would be slow, so the front door keeps one open holding about 600 lines in `src/snapshot.ts` with 1234 stars popular for you. Your message goes from the team chat to the front door, which forwards it to the bot harness that runs the bot for you.",
          70,
        ),
        {
          beats: [
            { line: "Opening a fresh browser.", visual: "board", anchor: "Opening a fresh", text: "", items: [], focus: "edge" },
            { line: "It types snapshot.", visual: "terminal", anchor: "It types", text: "snapshot", items: [], focus: "" },
          ],
        },
      ),
      id: "s02-walkthrough",
    },
    {
      ...sc("scale", pad("When two writers arrive the queue lines them up, so nothing is lost for you.", 20), {
        callouts: [{ target: "srv", text: "queue", color: "green" }],
      }),
      id: "s03-scale",
    },
    {
      ...sc("recap", "So your click reaches the screen through the front door, ready for you to use daily."),
      id: "s04-recap",
    },
  );
  const good = scoreRubric(strong, { arch, manifest, format: "short", wps: 2.6 });
  assert.ok(good.total >= 7, `strong total ${good.total} should reach 7`);
  assert.equal(shouldRejectRubric(good), false);
  const weak = plan(
    sc("hook", "This is a chat app. It has bots for teams."),
    sc("layer", "The bot harness and the agent drivers help. They do work.", { add_components: ["srv", "bot"] }),
    sc("walkthrough", "It serves 50k users and has 612 lines."),
    sc("recap", "Teams ship faster."),
  );
  const bad = scoreRubric(weak, { arch, manifest, format: "short", wps: 2.6 });
  assert.ok(bad.total < 7 || [bad.hook, bad.causal, bad.anchors, bad.visual, bad.payoff].includes(0));
  assert.equal(shouldRejectRubric(bad), true);
  assert.ok(bad.issues.length >= 4, bad.issues.join("; "));
});

test("formats: anatomy tours a repo in 90-150s, picked by tour intent or explicit format", () => {
  assert.deepEqual(
    FORMATS.anatomy.beats.map((b) => b.id),
    ["hook", "entry", "tour", "trace", "map", "payoff"],
  );
  assert.deepEqual(FORMATS.anatomy.seconds, [90, 150]);
  assert.equal(FORMATS.anatomy.visuals, 4);
  assert.equal(formatFor("repo", "working", "give me a tour of the codebase"), "anatomy");
  assert.equal(formatFor("repo", "overview", "how does auth work"), "deep");
  assert.equal(formatFor("repo", "overview"), "deep");
  assert.equal(formatFor("topic", "working", "tour of the project"), "deep");
  assert.equal(specFromBrief(DEFAULT_BRIEF, { goal: "anatomy of this repo" }, "repo").format, "anatomy");
  assert.equal(specFromBrief(DEFAULT_BRIEF, { format: "anatomy" }, "repo").format, "anatomy");
  assert.equal(specFromBrief(DEFAULT_BRIEF, { format: "anatomy" }, "topic").format, "deep");
  assert.equal(specFromBrief(DEFAULT_BRIEF, { format: "short" }, "repo").format, "short");
});

const aHook = "How does one message travel from your chat to a working bot reply today?";
const anatomyTour = () => {
  const scenes = [
    sc("hook", aHook),
    sc(
      "layer",
      pad(
        "Your words land in the team chat, which owns the screen you type in, because every request starts with you. It hands your message to the front door next, and it is popular with teams holding 1234 stars.",
        60,
      ),
      {
        add_components: ["ui"],
        beats: [{ line: "Your words land.", visual: "board", anchor: "Your words", text: "", items: [], focus: "ui" }],
      },
    ),
    sc(
      "layer",
      pad(
        "Opening a fresh browser for every command would be slow, so the front door keeps one browser open for you. It forwards your message to the bot harness, which runs the bot for you.",
        60,
      ),
      { add_components: ["edge"] },
    ),
    sc(
      "layer",
      pad(
        "Your agent cannot read a screen, so the bot harness keeps the running bots and hands each reply back through the front door for you. The agent drivers do the clicking, because pointing beats guessing.",
        60,
      ),
      { add_components: ["srv", "bot"] },
    ),
    sc(
      "walkthrough",
      pad(
        "It types `snapshot` from `src/snapshot.ts`, holding about 600 lines, and the team chat hands the rows to the front door, which forwards them to the bot harness that runs the agent drivers for you.",
        45,
      ),
      {
        beats: [
          { line: "It types snapshot.", visual: "terminal", anchor: "It types", text: "snapshot", items: [], focus: "" },
          { line: "The team chat hands.", visual: "board", anchor: "team chat hands", text: "", items: [], focus: "edge" },
        ],
      },
    ),
    sc("scale", pad("At 10x traffic two writers collide, so the queue lines them up and nothing is lost for you.", 25), {
      callouts: [{ target: "srv", text: "queue", color: "green" }],
    }),
    sc(
      "recap",
      pad(
        "So your message reaches the bot through the team chat, the front door, the bot harness and the agent drivers, ready for you to use daily.",
        22,
      ),
    ),
  ];
  return plan(...scenes.map((s, i) => ({ ...s, id: `s0${i + 1}-${s.kind}` })));
};

test("path order counts the parts named along the request path", () => {
  assert.equal(pathPartsInOrder("The team chat hands it to the front door, which forwards it to the bot harness.", arch), 3);
  assert.equal(pathPartsInOrder("The bot harness runs, and the team chat shows it.", arch), 1);
  assert.equal(pathPartsInOrder("Teams ship faster every week.", arch), 0);
});

test("format beats: anatomy tours the parts on one traced request in 90-150s", () => {
  assert.deepEqual(checkFormatBeats(anatomyTour(), "anatomy", arch, 2.6), []);
  const noTrace = plan(sc("hook", `${aHook} This app is for teams.`), sc("recap", "Bye."));
  assert.ok(checkFormatBeats(noTrace, "anatomy", arch, 2.6).some((i) => /traced end to end/.test(i)));
  const untraced = anatomyTour();
  untraced.scenes = untraced.scenes.map((s) =>
    s.kind === "walkthrough"
      ? {
          ...s,
          narration: pad(
            "The team chat hands the rows to the front door, which forwards them to the bot harness that runs the agent drivers for you.",
            45,
          ),
        }
      : s,
  );
  assert.ok(checkFormatBeats(untraced, "anatomy", arch, 2.6).some((i) => /traced end to end/.test(i)));
  const noHandoff = anatomyTour();
  noHandoff.scenes = noHandoff.scenes.map((s) =>
    s.id === "s03-layer"
      ? {
          ...s,
          narration: pad(
            "Opening a fresh browser for every command would be slow, because waiting hurts you. The front door is the browser keeper for you.",
            60,
          ),
        }
      : s,
  );
  assert.ok(checkFormatBeats(noHandoff, "anatomy", arch, 2.6).some((i) => /hands on/.test(i)));
  const unlit = anatomyTour();
  unlit.scenes = unlit.scenes.map((s) =>
    s.kind === "recap" ? { ...s, narration: pad("So your message reaches the bot quickly, ready for you to use daily.", 22) } : s,
  );
  assert.ok(checkFormatBeats(unlit, "anatomy", arch, 2.6).some((i) => /naming the parts in order/.test(i)));
  const tooShort = plan(sc("hook", aHook), sc("recap", "So your message reaches the bot for you."));
  assert.ok(checkFormatBeats(tooShort, "anatomy", arch, 2.6).some((i) => /90-150s/.test(i)));
});

test("visuals: anatomy needs 4 moments including the mechanism drawing", () => {
  assert.deepEqual(checkVisualReasoning(anatomyTour(), "anatomy", arch), []);
  const three = anatomyTour();
  three.scenes = three.scenes.filter((s) => s.kind !== "scale");
  assert.ok(checkVisualReasoning(three, "anatomy", arch).some((i) => /4 visual/.test(i)));
});

test("rubric rejects an anatomy inventory without the request path and accepts a traced tour", () => {
  const good = scoreRubric(anatomyTour(), { arch, manifest, format: "anatomy", wps: 2.6 });
  assert.equal(good.total, 10);
  assert.equal(shouldRejectRubric(good), false);
  const weak = plan(
    sc("hook", "This is a chat app. It has bots for teams."),
    {
      ...sc("layer", "The team chat and the front door help. They do work for you.", { add_components: ["ui", "edge"] }),
      id: "s02-layer",
    },
    {
      ...sc("layer", "The bot harness and the agent drivers help. They do work for you.", { add_components: ["srv", "bot"] }),
      id: "s03-layer",
    },
    sc("recap", "Teams ship faster every week."),
  );
  const bad = scoreRubric(weak, { arch, manifest, format: "anatomy", wps: 2.6 });
  assert.ok(bad.total < 7);
  assert.equal(shouldRejectRubric(bad), true);
  const beats = checkFormatBeats(weak, "anatomy", arch, 2.6);
  assert.ok(
    beats.some((i) => /traced end to end/.test(i)),
    beats.join("; "),
  );
  assert.ok(
    beats.some((i) => /hands on/.test(i)),
    beats.join("; "),
  );
  assert.ok(
    beats.some((i) => /naming the parts in order/.test(i)),
    beats.join("; "),
  );
});
