import { test } from "node:test";
import assert from "node:assert/strict";
import { strictJsonSchema, practitionerTerm, type Architecture, type NoteItem, type Scene } from "@explanimate/core";
import { validateNotes, validateArchitecture, repairRepoPlan, checkStory, journeyOrder, speechIssues, keepsSync, syncPhrases, fillerIn, hookLine, validateCutIn, cutInRules, applyReviewPatch, actionName, archWire, reviewWire, undrawnLinks, retellCutIn, validateConcept, structural, pictureWords, conceptSlips, namesPlace, respeak, emptyPoint, groundedSummary, labelEchoes } from "@explanimate/planner";

const item = (text: string, extra: Partial<NoteItem> = {}): NoteItem => ({ text, color: "white", icon: "", target: "", estimate: false, evidence: "", ...extra });
const ids = new Set(["d1-db", "edge"]);
const files = new Set(["wrangler.jsonc", "lib/db.ts"]);
const evidenceOf = (id: string) => (id === "d1-db" ? "lib/db.ts" : "wrangler.jsonc");

test("any number on the board is labelled as an estimate", () => {
  const { items, repairs } = validateNotes([item("~50k plays per day")], { ids, files, evidenceOf });
  assert.equal(items[0].estimate, true);
  assert.match(repairs[0], /marked as estimate/);
});

test("names with digits (d1, r2, s3) are not numbers", () => {
  const { items, repairs } = validateNotes([item("d1 holds every clip", { target: "d1-db" }), item("r2 serves audio")], { ids, files, evidenceOf });
  assert.equal(items[0].estimate, false);
  assert.equal(items[1].estimate, false);
  assert.equal(repairs.length, 0);
});

test("an estimate tag without a number is dropped, so plain claims do not read as doubts", () => {
  const { items, repairs } = validateNotes([item("writes are serialized", { estimate: true, target: "d1-db" })], { ids, files, evidenceOf });
  assert.equal(items[0].estimate, false);
  assert.match(repairs[0], /estimate tag dropped/);
  assert.equal(items[0].evidence, "lib/db.ts", "a grounded claim gets its component's evidence file");
});

test("unknown targets and invented evidence paths are repaired, not trusted", () => {
  const { items } = validateNotes([item("cache misses spike", { target: "redis", evidence: "src/made-up.ts" }), item("one writer", { target: "d1-db", evidence: "nope.ts" })], { ids, files, evidenceOf });
  assert.equal(items[0].target, "");
  assert.equal(items[0].evidence, "");
  assert.equal(items[1].evidence, "lib/db.ts");
});

test("text is lowercased, capped at 7 words and 6 items", () => {
  const many = Array.from({ length: 9 }, (_, i) => item(`Item Number ${"word ".repeat(10)}${i}`));
  const { items } = validateNotes(many, { ids, files, evidenceOf });
  assert.equal(items.length, 6);
  for (const it of items) { assert.equal(it.text, it.text.toLowerCase()); assert.ok(it.text.split(" ").length <= 7); }
});

test("post/article notes need a verbatim quote from the source", () => {
  const source = "Continuous batching lets new requests join a running batch.";
  const { items, repairs } = validateNotes([item("join running batch", { evidence: "new requests join a running batch" }), item("made up", { evidence: "batches are sorted by length" })], { source });
  assert.equal(items.length, 1);
  assert.match(repairs[0], /quote not in source/);
});

const comp = (id: string, evidence: string[], over: Partial<Architecture["components"][number]> = {}): Architecture["components"][number] => ({ id, name: id, kind: "api", layer: "backend", keyword: id, icon: "server", what: "x", evidence, ...over });

test("validateArchitecture: no box without a real file", () => {
  const repo = ["src/api/index.ts", "src/db/client.ts", "wrangler.toml"];
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [
      comp("api", ["./src/api/index.ts"]),
      comp("db", ["client.ts"], { kind: "db", icon: "spaceship", keyword: "Postgres DB!!" }),
      comp("ghost", ["src/ghost.ts"]),
    ],
    connections: [
      { from: "api", to: "db", label: "Reads Rows", evidence: "src/api/index.ts" },
      { from: "api", to: "ghost", label: "x", evidence: "src/api/index.ts" },
    ],
    walkthrough: { name: "read", steps: [{ from: "db", to: "api", label: "returns", evidence: "invented.ts" }] },
    scale: [{ component: "ghost", at: "10x", problem: "x", why: "y", fix: "z", fix_detail: "w", evidence: "a" }],
  };
  const { arch: a, issues } = validateArchitecture(arch, repo, (n) => (["server", "database"].includes(n) ? n : undefined), (k) => (k === "db" ? "database" : "box"));
  assert.deepEqual(a.components.map((c) => c.id), ["api", "db"]);
  assert.deepEqual(a.components[0].evidence, ["src/api/index.ts"], "leading ./ is normalised");
  assert.deepEqual(a.components[1].evidence, ["src/db/client.ts"], "a unique basename resolves to its path");
  assert.equal(a.components[1].icon, "database", "unknown icon falls back by kind");
  assert.equal(a.components[1].keyword, "postgres db");
  assert.equal(a.connections.find((c) => c.to === "db")!.label, "reads rows");
  assert.ok(!a.connections.some((c) => c.to === "ghost"));
  assert.equal(a.walkthrough.steps[0].evidence, "");
  assert.equal(a.scale.length, 0);
  assert.ok(issues.some((i) => i.target === "ghost" && /no evidence/.test(i.problem)));
});

test("validateArchitecture: a loop back says 'again' instead of repeating a step", () => {
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [comp("loop", ["a.ts"]), comp("model", ["a.ts"])],
    connections: [{ from: "loop", to: "model", label: "get completion", evidence: "a.ts" }],
    walkthrough: { name: "chat", steps: [
      { from: "loop", to: "model", label: "get completion", evidence: "a.ts" },
      { from: "model", to: "loop", label: "return completion", evidence: "a.ts" },
      { from: "loop", to: "model", label: "Get Completion", evidence: "a.ts" },
    ] },
    scale: [],
  };
  const { arch: a } = validateArchitecture(arch, ["a.ts"], (n) => n, () => "box");
  assert.deepEqual(a.walkthrough.steps.map((s) => s.label), ["get completion", "return completion", "get completion again"]);
});

test("validateArchitecture: a part named by what it does gets the noun from its name", () => {
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [comp("app", ["app.c"], { keyword: "frame loop", kind: "client" }), comp("core", ["ui.c"], { name: "microUI via microui.h", keyword: "rebuild widgets" })],
    connections: [{ from: "app", to: "core", label: "rebuild widgets", evidence: "app.c" }],
    walkthrough: { name: "w", steps: [{ from: "app", to: "core", label: "rebuild widgets", evidence: "app.c" }] },
    scale: [],
  };
  const { arch: a, issues, open } = validateArchitecture(arch, ["app.c", "ui.c"], (n) => n, () => "box");
  assert.deepEqual(a.components.map((c) => c.keyword), ["frame loop", "microui"]);
  assert.match(issues[0].problem, /is an action, renamed "microui"/);
  assert.deepEqual(open, []);
  assert.ok(actionName("poll input") && actionName("draw rects") && actionName("send queue"));
  assert.ok(!actionName("host renderer") && !actionName("command list") && !actionName("job queue") && !actionName("cache") && !actionName("build tool"));
});

test("validateArchitecture: a map with no client part is sent back to add who starts the flow", () => {
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [comp("app", ["app.c"], { keyword: "demo app", kind: "api" }), comp("core", ["ui.c"], { keyword: "ui core", kind: "api" })],
    connections: [{ from: "app", to: "core", label: "call widgets", evidence: "app.c" }],
    walkthrough: { name: "w", steps: [{ from: "app", to: "core", label: "call widgets", evidence: "app.c" }] },
    scale: [],
  };
  const { open } = validateArchitecture(arch, ["app.c", "ui.c"], (n) => n, () => "box");
  assert.equal(open.length, 1);
  assert.equal(open[0].target, "app", "aimed at where the walkthrough starts");
  assert.match(open[0].problem, /no client part/);
  const withUser = { ...arch, components: [...arch.components, comp("user", ["app.c"], { keyword: "app user", kind: "client" })] };
  assert.deepEqual(validateArchitecture(withUser, ["app.c", "ui.c"], (n) => n, () => "box").open, []);
});

test("archWire caps the map the API may send: parts, arrows, steps, scale and long sentences", () => {
  const w = strictJsonSchema(archWire({ maxComponents: 6, scaleItems: 1 })) as any;
  assert.equal(w.properties.components.maxItems, 6);
  assert.equal(w.properties.connections.maxItems, 10);
  assert.equal(w.properties.walkthrough.properties.steps.maxItems, 7);
  assert.equal(w.properties.scale.maxItems, 1);
  assert.equal(w.properties.components.items.properties.what.maxLength, 200);
  assert.equal(w.properties.components.items.properties.evidence.maxItems, 3);
  assert.equal(w.properties.components.items.additionalProperties, false, "still strict");
});

test("reviewWire caps the review the same way, with at most 10 short issues", () => {
  const w = strictJsonSchema(reviewWire({ maxComponents: 6, scaleItems: 1 })) as any;
  assert.equal(w.properties.issues.maxItems, 10);
  assert.equal(w.properties.issues.items.properties.problem.maxLength, 300);
  assert.equal(w.properties.upsert_components.maxItems, 6);
  assert.equal(w.properties.upsert_components.items.properties.what.maxLength, 200);
  assert.equal(w.properties.walkthrough_steps.maxItems, 7);
  assert.equal(w.properties.scale.maxItems, 1);
  assert.deepEqual(w.required.sort(), ["issues", "remove_components", "remove_connections", "scale", "upsert_components", "upsert_connections", "verdict", "walkthrough_steps"]);
});

test("validateArchitecture: an arrow against the code's includes is dropped or sent for a fix", () => {
  const src: Record<string, string> = { "demo/main.c": '#include "microui.h"\n#include "renderer.h"\nint main() {}', "src/microui.c": '#include "microui.h"', "src/microui.h": "", "demo/renderer.c": '#include "renderer.h"', "demo/renderer.h": "" };
  const files = Object.keys(src);
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [comp("app", ["demo/main.c"], { keyword: "demo app", kind: "client" }), comp("core", ["src/microui.c", "src/microui.h"], { keyword: "ui core" }), comp("gfx", ["demo/renderer.c"], { keyword: "renderer" })],
    connections: [
      { from: "app", to: "core", label: "build widgets", evidence: "demo/main.c" },
      { from: "core", to: "app", label: "emit commands", evidence: "src/microui.c" },
      { from: "gfx", to: "app", label: "ask for rects", evidence: "demo/renderer.c" },
    ],
    walkthrough: { name: "w", steps: [
      { from: "app", to: "core", label: "build widgets", evidence: "demo/main.c" },
      { from: "core", to: "app", label: "emit commands", evidence: "src/microui.c" },
      { from: "app", to: "gfx", label: "draw rects", evidence: "demo/main.c" },
      { from: "core", to: "app", label: "return result", evidence: "src/microui.c" },
    ] },
    scale: [],
  };
  const { arch: a, issues, open } = validateArchitecture(arch, files, (n) => n, () => "box", (p) => src[p] ?? "");
  assert.deepEqual(a.connections.map((c) => `${c.from}>${c.to}`), ["app>core", "gfx>app"], "the backwards duplicate of a drawn arrow goes");
  assert.ok(issues.some((i) => i.target === "core>app" && /dropped "emit commands"/.test(i.problem)));
  assert.equal(open.length, 2);
  assert.ok(open.some((i) => i.target === "gfx>app" && /points the wrong way/.test(i.problem)));
  assert.ok(open.some((i) => i.target === "walkthrough" && /step 2 core>app "emit commands"/.test(i.problem)));
  assert.ok(!open.some((i) => /return result/.test(i.problem)), "an answer worded as an answer is fine");
});

test("undrawnLinks: two parts said back to back need an arrow between them", () => {
  const plan = { title: "x", subtitle: "", scenes: [
    sc("walkthrough", "The team chat sends a message to the front door. The front door hands it to the agent drivers."),
    sc("recap", "You go from the team chat to the front door to the bot harness. The team chat and the login worker sit side by side."),
  ] };
  assert.deepEqual(undrawnLinks(plan, storyArch), ["walkthrough: says the front door and the agent drivers talk directly, but the board draws no arrow between them; tell the hop through the part that really sits between them"]);
});

// ---------------------------------------------------------------------------
// story order and the plan-stage self-check (docs/explaining-playbook.md)
// ---------------------------------------------------------------------------
const part = (id: string, keyword: string) => ({ id, name: id, kind: "api", layer: "app", keyword, what: `${keyword} does its job`, icon: "box", evidence: ["a.ts"] });
const storyArch = {
  product: "chatbot", one_liner: "a chat app with bots",
  components: [part("ui", "team chat"), part("edge", "front door"), part("srv", "bot harness"), part("bot", "agent drivers"), part("auth", "login worker")],
  connections: [{ from: "ui", to: "edge", label: "send message", evidence: "a.ts" }, { from: "edge", to: "srv", label: "forward", evidence: "a.ts" }, { from: "srv", to: "bot", label: "run bot", evidence: "a.ts" }, { from: "ui", to: "auth", label: "log in", evidence: "a.ts" }],
  walkthrough: { name: "ask a bot", steps: [{ from: "ui", to: "edge", label: "send message", evidence: "a.ts" }, { from: "edge", to: "srv", label: "forward", evidence: "a.ts" }, { from: "srv", to: "bot", label: "run bot", evidence: "a.ts" }] },
  scale: [],
} as unknown as Architecture;
const sc = (kind: Scene["kind"], narration: string, add: string[] = []): Scene => ({ id: kind, kind, heading: kind, narration, add_components: add, add_connections: [], board_nodes: [], board_edges: [], highlights: [], callouts: [], items: [] });

test("repo plans are put in story order: journey parts, the walk, side parts, then the recap", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "What if every contact in your chat were a bot? This chat app works like a hotel front desk."),
    sc("layer", "The login worker checks who you are.", ["auth"]),
    sc("layer", "The bot harness and the agent drivers.", ["srv", "bot"]),
    sc("layer", "The team chat and the front door.", ["ui", "edge"]),
    sc("recap", "Your message goes from the team chat to the front door, the bot harness and the agent drivers."),
    sc("walkthrough", "You send a message, the door will forward it, and the harness runs the bot."),
  ] }, storyArch, { perScene: 2 });
  assert.deepEqual(plan.scenes.map((s) => s.kind), ["hook", "layer", "layer", "walkthrough", "layer", "recap"]);
  assert.deepEqual(plan.scenes[1].add_components, ["ui", "edge"]);
  assert.deepEqual(plan.scenes[4].add_components, ["auth"], "the side part comes after the core flow");
  assert.ok(plan.repairs.includes("scenes put in story order"));
  assert.deepEqual(checkStory(plan, storyArch, "a hotel front desk"), []);
});

test("the self-check flags a flow that is not narrated hop by hop, a jargon-heavy hook and a missing analogy", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "The team chat talks to the bot harness through the front door."),
    sc("layer", "The team chat and the front door.", ["ui", "edge"]),
    sc("layer", "The bot harness and the agent drivers.", ["srv", "bot"]),
    sc("walkthrough", "Then it runs."),
    sc("layer", "The login worker.", ["auth"]),
    sc("recap", "That is it."),
  ] }, storyArch, { perScene: 2 });
  const issues = checkStory(plan, storyArch, "a restaurant kitchen");
  assert.ok(issues.some((i) => /hook names parts/.test(i)));
  assert.ok(issues.some((i) => /missing or out of order: team chat to front door \(send message\), front door to bot harness \(forward\), bot harness to agent drivers \(run bot\)/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /analogy/.test(i)));
  assert.ok(issues.some((i) => /recap must retell/.test(i)));
});

test("the self-check flags a numbered-list walkthrough and a repeated opener", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "A chat where bots help you, like a hotel front desk. Let's follow one message."),
    sc("layer", "The team chat is the front desk. The front door is the doorman.", ["ui", "edge"]),
    sc("layer", "The bot harness is the manager. The agent drivers are the concierges.", ["srv", "bot"]),
    sc("walkthrough", "Step one is send message. Step two is forward. Step three is run bot."),
    sc("layer", "Off to the side, the login worker checks keys. Off to the side, it logs. Off to the side, it naps.", ["auth"]),
    sc("recap", "Team chat to front door to bot harness to agent drivers and back."),
  ] }, storyArch, { perScene: 2 });
  const issues = checkStory(plan, storyArch, "a hotel front desk");
  assert.ok(issues.some((i) => /numbered list/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /open with 'off to the'/.test(i)), issues.join("; "));
});

test("splitting a crowded one-sentence layer never speaks a line twice", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "A chat where bots help you."),
    sc("layer", "Around the desk sit the team chat that you type in, the front door that lets you in, the bot harness that routes work, and the agent drivers that do it.", ["ui", "edge", "srv", "bot"]),
    sc("walkthrough", "You send message, the door will forward, the harness will run bot."),
    sc("recap", "Team chat to front door to bot harness to agent drivers."),
  ] }, storyArch, { perScene: 2 });
  const layers = plan.scenes.filter((x) => x.kind === "layer" && x.add_components.some((id) => ["ui", "edge", "srv", "bot"].includes(id)));
  assert.equal(layers.length, 2);
  assert.notEqual(layers[0].narration, layers[1].narration);
  assert.match(layers[0].narration, /team chat/);
  assert.match(layers[1].narration, /agent drivers/);
});

test("journeyOrder lists parts in the order one request meets them", () => {
  assert.deepEqual(journeyOrder(storyArch), { path: ["ui", "edge", "srv", "bot"], side: ["auth"] });
});

test("the speech check flags missing articles and a heading read out as a part", () => {
  const plan = { title: "x", subtitle: "", scenes: [
    { ...sc("walkthrough", "The guest will send message to the manager, and the harness will run bot."), id: "s04-walkthrough", heading: "ask the desk" },
    { ...sc("layer", "Next it reaches save then work, where the bot harness keeps notes.", ["srv"]), id: "s05-layer", heading: "save then work" },
  ] };
  const issues = speechIssues(plan, storyArch, "a hotel front desk");
  assert.ok(issues.some((i) => /s04-walkthrough: missing article in "send message", "run bot"/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /heading "save then work" is spoken/.test(i)), issues.join("; "));
  const fine = { title: "x", subtitle: "", scenes: [{ ...sc("layer", "Your message lands in the team chat at the back office, and the front door lets it in.", ["ui", "edge"]), heading: "the back office" }] };
  assert.deepEqual(speechIssues(fine, storyArch, "a hotel front desk"), []);
});

test("the speech check flags a part explained a second time", () => {
  const plan = { title: "x", subtitle: "", scenes: [
    { ...sc("layer", "Your words land in the team chat, a window where you type.", ["ui"]), id: "s02-layer", heading: "the back office" },
    { ...sc("recap", "You typed in the team chat, a window where you type, and got a reply."), id: "s09-recap", heading: "the whole trip" },
  ] };
  const issues = speechIssues(plan, storyArch, "a hotel front desk");
  assert.deepEqual(issues.filter((i) => /explained again/.test(i)), ['s09-recap: "team chat" is explained again; say what it is only the first time, then just its name']);
});

test("a polished line is kept only if the board can still sync to it", () => {
  const s = sc("walkthrough", "You send message, the door will forward, the harness will run bot.");
  const want = syncPhrases(s, storyArch);
  assert.deepEqual(want, ["send message", "forward", "run bot"]);
  assert.ok(keepsSync(s.narration, "You send a message, the door forwards it, and the harness runs the bot.", want));
  assert.ok(!keepsSync(s.narration, "The harness runs the bot after you send a message and the door forwards it.", want), "order changed");
  assert.ok(!keepsSync(s.narration, "You send a message and it all just works out somehow in the end, more or less, with the bot doing things.", want), "a step is gone");
});

test("the speech check keeps the viewer as 'you', plain names first, and openers varied even twice", () => {
  const plan = { title: "x", subtitle: "", scenes: [
    { ...sc("layer", "Around the desk, you meet the team chat, called React Web. It lets you type.", ["ui"]), id: "s02-layer", heading: "the desk" },
    { ...sc("layer", "Around the desk sit helpers. Then it waits for the guest. Then it moves on.", ["edge"]), id: "s03-layer", heading: "the desk" },
  ] };
  const issues = speechIssues(plan, storyArch, "a hotel front desk");
  assert.ok(issues.some((i) => /s02-layer and s03-layer both open with 'around the'/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /s03-layer: two sentences in a row open with 'then it'/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /s03-layer: says "the guest"/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /"called React Web" puts a code name up front/.test(i)), issues.join("; "));
});

test("the self-check wants a short hook line up front and no filler", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "This is a chat app where every one of your contacts is actually a little bot that can do jobs for you."),
    sc("layer", "First you'll meet the team chat, and then you've got the front door.", ["ui", "edge"]),
    sc("layer", "The bot harness is the manager, and the agent drivers are the concierges.", ["srv", "bot"]),
    sc("walkthrough", "You send a message, the door will forward it, and the harness will run the bot."),
    sc("recap", "Team chat, front door, bot harness, agent drivers, and it's special."),
  ] }, storyArch, { perScene: 2 });
  const issues = checkStory(plan, storyArch, "a hotel front desk");
  assert.ok(issues.some((i) => /first sentence has 2\d words/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /hook opens with "This is a"/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /hook is a single sentence/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /filler "you'll meet", "then you've got"/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /recap: filler "it's special"/.test(i)), issues.join("; "));
  assert.deepEqual(fillerIn("You’ll see the desk. Basically, it waits."), ["you'll see", "basically"]);
  assert.equal(hookLine("How does a computer learn? It keeps receipts."), "How does a computer learn?");
});

const row = (text: string, evidence: string): NoteItem => ({ text, evidence, color: "blue", icon: "", target: "", estimate: false });

test("a chart keeps only bars whose quote is in the source and states the number, all in one unit", () => {
  const source = "Chrome holds about 65 percent of browsers. Safari is near 18 percent. There are 13 root server names.";
  const dropped: string[] = [];
  const bars = validateCutIn("chart", [
    row("chrome 65%", "Chrome holds about 65 percent of browsers"),
    row("safari 18%", "Safari is near 18 percent"),
    row("firefox 3%", "Firefox has 3 percent"),
    row("edge 5%", "Chrome holds about 65 percent of browsers"),
    row("root servers 13", "There are 13 root server names"),
  ], source, dropped);
  assert.deepEqual(bars.map((b) => b.text), ["chrome 65%", "safari 18%"]);
  assert.equal(dropped.length, 2, "a made-up quote and a quote that does not say 5 are both reported");
});

test("a timeline sorts its dates oldest first and drops dates its quote does not state", () => {
  const source = "In 1983 DNS was invented. The first .com came in 1985. ARPANET started in 1969.";
  const dropped: string[] = [];
  const rows = validateCutIn("timeline", [
    row("1985 first .com", "The first .com came in 1985"),
    row("1969 arpanet starts", "ARPANET started in 1969"),
    row("1983 dns is invented", "In 1983 DNS was invented"),
    row("1991 web is born", "In 1983 DNS was invented"),
  ], source, dropped);
  assert.deepEqual(rows.map((r) => r.text), ["1969 arpanet starts", "1983 dns is invented", "1985 first .com"]);
  assert.equal(dropped.length, 1);
});

test("a map keeps only real places that its quote names, each once", () => {
  const source = "The web was invented at CERN in Geneva. It spread to Stanford in the United States. Atlantis had none.";
  const dropped: string[] = [];
  const place = (target: string, text: string, evidence: string): NoteItem => ({ ...row(text, evidence), target });
  const rows = validateCutIn("map", [
    place("Geneva", "web is born", "The web was invented at CERN in Geneva"),
    place("the United States", "it spreads to stanford", "It spread to Stanford in the United States"),
    place("atlantis", "nothing here", "Atlantis had none"),
    place("france", "web is born nearby", "The web was invented at CERN in Geneva"),
    place("geneva", "again", "The web was invented at CERN in Geneva"),
    place("tokyo", "it reaches japan", "It reached Tokyo by 1993"),
  ], source, dropped);
  assert.deepEqual(rows.map((r) => r.target), ["geneva", "united states"]);
  assert.equal(dropped.length, 4, "a made-up place, a quote that does not name it, a repeat and a quote not in the source");
});

test("a map place counts when its quote says it the way a history source would", () => {
  // silk road (run silkroad2): china and "merv, turkmenistan" were dropped, which left too few places and lost the whole map
  const source = "Chinese silk reached Merv on the way west. Persian merchants carried it on to Roman buyers. Romania is not part of it.";
  const dropped: string[] = [];
  const place = (target: string, text: string, evidence: string): NoteItem => ({ ...row(text, evidence), target });
  const rows = validateCutIn("map", [
    place("china", "silk starts here", "Chinese silk reached Merv on the way west"),
    place("merv, turkmenistan", "silk passes here", "Chinese silk reached Merv on the way west"),
    place("persia", "the bridge", "Persian merchants carried it on to Roman buyers"),
    place("rome", "the buyers", "Persian merchants carried it on to Roman buyers"),
    place("france", "not named", "Persian merchants carried it on to Roman buyers"),
  ], source, dropped);
  assert.deepEqual(rows.map((r) => r.target), ["china", "merv, turkmenistan", "persia", "rome"]);
  assert.deepEqual(dropped, ['map "france": the quote does not name it']);
  assert.ok(namesPlace("chinese silk", ["china"]) && namesPlace("persian merchants", ["persia"]) && namesPlace("roman buyers", ["rome"]));
  assert.ok(!namesPlace("romania is not part of it", ["rome"]), "a different place that starts the same way does not count");
  assert.ok(!namesPlace("the french king", ["france"]) && !namesPlace("an indian ocean", ["india ink"]));
});

test("only the explainer style asks for cut-ins", () => {
  assert.match(cutInRules("whiteboard", "").join(" "), /No 'chart', 'timeline' or 'map'/);
  assert.match(cutInRules("explainer", "").join(" "), /'chart'.*exactly as the source writes it/);
});

test("a review's changes fix only what it names and keep the rest of the map", () => {
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [comp("app", ["main.c"]), comp("lib", ["lib.c"]), comp("gfx", ["gfx.c"])],
    connections: [
      { from: "app", to: "lib", label: "build ui", evidence: "main.c" },
      { from: "lib", to: "app", label: "push draws", evidence: "lib.h" },
      { from: "gfx", to: "app", label: "show frame", evidence: "gfx.c" },
    ],
    walkthrough: { name: "click", steps: [{ from: "app", to: "lib", label: "build ui", evidence: "main.c" }] },
    scale: [{ component: "lib", at: "10x", problem: "a", why: "b", fix: "c", fix_detail: "d", evidence: "lib.c" }],
  };
  const out = applyReviewPatch(arch, {
    upsert_components: [{ ...comp("gfx", ["gfx.c"]), name: "SDL renderer" }, comp("input", ["main.c"])],
    remove_components: [],
    upsert_connections: [{ from: "lib", to: "app", label: "pull draws", evidence: "main.c" }, { from: "app", to: "gfx", label: "draw rects", evidence: "main.c" }],
    remove_connections: ["gfx > app"],
    walkthrough_steps: [],
    scale: [],
  });
  assert.deepEqual(out.components.map((c) => [c.id, c.name]), [["app", "app"], ["lib", "lib"], ["gfx", "SDL renderer"], ["input", "input"]]);
  assert.deepEqual(out.connections.map((c) => `${c.from}>${c.to} ${c.label}`), ["app>lib build ui", "lib>app pull draws", "app>gfx draw rects"]);
  // an empty walkthrough or scale list means "unchanged", never "delete them all"
  assert.deepEqual(out.walkthrough, arch.walkthrough);
  assert.deepEqual(out.scale, arch.scale);
});

test("the walkthrough heading the prompt asks for ('follow one click') is not read as a part", () => {
  const plan = { title: "x", subtitle: "", scenes: [{ ...sc("walkthrough", "Now follow one click from your mouse all the way to the screen."), id: "s05-walkthrough", heading: "follow one click" }] };
  assert.ok(!speechIssues(plan, storyArch, "a hotel front desk").some((i) => /heading "follow one click"/.test(i)));
});

test("retellCutIn: the voice and heading match the rows left on the map", () => {
  const before = [item("china silk starts here", { target: "china" }), item("persia bridges the middle", { target: "persia" }), item("rome pays gold here", { target: "rome" })];
  const r = retellCutIn({ kind: "map", heading: "three relay stations", narration: "Three relay stations anchor your map. China silk starts here as the maker. Persia bridges the middle as the vital connector. Rome pays gold here as the end market." }, before, [before[0], before[2]]);
  assert.equal(r.heading, "two relay stations");
  assert.equal(r.narration, "Two relay stations anchor your map. China silk starts here as the maker. Rome pays gold here as the end market.");
  assert.deepEqual(r.left, []);
  const mixed = retellCutIn({ kind: "map", heading: "the route", narration: "Silk went from China through Persia to Rome." }, before, [before[0], before[2]]);
  assert.deepEqual(mixed.left, ["persia"], "a sentence that also names a kept place is left for a rewrite");
  const same = retellCutIn({ kind: "map", heading: "three stops", narration: "Three stops." }, before, before);
  assert.equal(same.narration, "Three stops.");
});

test("validateConcept: a map scene that loses a row says the new count", () => {
  const source = "Chinese silk reached Rome. China made silk for export. Rome paid in gold for silk.";
  const scene = { ...sc("map", "Three markets mattered. China made the silk. Atlantis bought it. Rome paid gold."), heading: "three markets", items: [
    item("china made silk", { target: "china", evidence: "China made silk for export" }),
    item("atlantis bought it", { target: "atlantis", evidence: "Atlantis bought silk" }),
    item("rome paid gold", { target: "rome", evidence: "Rome paid in gold for silk" }),
  ] };
  const { plan, unsaid } = validateConcept({ title: "x", subtitle: "", scenes: [scene] }, source);
  assert.equal(plan.scenes[0].items.length, 2);
  assert.equal(plan.scenes[0].narration, "Two markets mattered. China made the silk. Rome paid gold.");
  assert.equal(plan.scenes[0].heading, "two markets");
  assert.deepEqual(unsaid, []);
});

test("undrawnLinks: a push told against an arrow that pulls is flagged", () => {
  const arch = { ...storyArch, components: [...storyArch.components, part("list", "command list"), part("draw", "frame renderer")],
    connections: [...storyArch.connections, { from: "draw", to: "list", label: "read commands", evidence: "a.ts" }] } as unknown as Architecture;
  const back = { title: "x", subtitle: "", scenes: [sc("recap", "The command list hands slips to the frame renderer.")] };
  assert.deepEqual(undrawnLinks(back, arch), ["recap: says the command list hands to the frame renderer, but the frame renderer read commands from the command list; tell it in the board's direction"]);
  const right = { title: "x", subtitle: "", scenes: [sc("recap", "The frame renderer reads commands from the command list.")] };
  assert.deepEqual(undrawnLinks(right, arch), []);
});

test("the speech check does not take a chain of parts for an explanation", () => {
  const plan = { title: "x", subtitle: "", scenes: [
    { ...sc("layer", "Your words land in the team chat, a window where you type.", ["ui"]), id: "s02-layer", heading: "the back office" },
    { ...sc("recap", "You type in the team chat, the team chat sends to the front door, the front door forwards it."), id: "s09-recap", heading: "the whole trip" },
  ] };
  assert.deepEqual(speechIssues(plan, storyArch, "a hotel front desk").filter((i) => /explained again/.test(i)), []);
});

test("structural issues replan the scenes; wording issues only fix the narration", () => {
  assert.ok(structural("the video must open with a 'hook' scene"));
  assert.ok(structural("there is no 'walkthrough' scene"));
  assert.ok(!structural('s05-recap: "ui core" is explained again; say what it is only the first time, then just its name'));
  assert.ok(!structural("walkthrough: says the front door and the agent drivers talk directly, but the board draws no arrow between them; tell the hop through the part that really sits between them"));
});

test("the speech check flags the picture word used as a part, but only words the map never uses", () => {
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [comp("core", ["ui.c"], { keyword: "ui core", kind: "client" }), comp("list", ["ui.c"], { keyword: "command list", what: "drawing commands for rectangles" }), comp("gfx", ["r.c"], { keyword: "sdl renderer" })],
    connections: [{ from: "gfx", to: "list", label: "read commands", evidence: "r.c" }],
    walkthrough: { name: "w", steps: [] }, scale: [],
  };
  const analogy = "a kitchen that hands simple cook tickets for rectangles to whoever does the drawing";
  assert.deepEqual(pictureWords(analogy, arch), ["kitchen", "hands", "cook", "tickets"]);
  assert.ok(!pictureWords(analogy, arch).includes("rectangles"), "a word the map uses is a real thing, not the picture");
  const plan = { title: "t", subtitle: "", scenes: [{ ...sc("walkthrough", "Then the sdl renderer reads commands from tickets for rectangles."), id: "s04-walkthrough" }] } as any;
  const issues = speechIssues(plan, arch, analogy);
  assert.ok(issues.some((i) => /s04-walkthrough: "from tickets" uses the picture word/.test(i)), issues.join("; "));
  assert.ok(!issues.some((i) => /for rectangles/.test(i)));
});

test("a topic plan's broken sentences are listed by scene for the narration fix", () => {
  const plan = { title: "t", subtitle: "", scenes: [
    { ...sc("board", "Faith rides with parcels. Bandits harsh deserts make travel costly."), id: "s05-board" },
    { ...sc("map", "Rome pays gold here as the end market."), id: "s06-map" },
  ] } as any;
  assert.deepEqual(conceptSlips(plan), ['s05-board: noun stack "Bandits harsh deserts": two things run together with no "and" or verb between them']);
});

test("a cached plan with clean speech is kept as is, with no model call", async () => {
  const plan = { title: "t", subtitle: "", scenes: [{ ...sc("hook", "Names find pages for you."), id: "s01-hook" }] } as any;
  const ledger = new Proxy({}, { get: () => { throw new Error("no model call expected"); } }) as any;
  const r = await respeak({ ledger, plan, audience: "a newcomer" });
  assert.equal(r.plan, plan);
  assert.deepEqual(r.changed, []);
  assert.equal(r.note, undefined);
});

test("a board node a topic scene draws is a phrase its rewrite must keep", () => {
  const s = { ...sc("board", "Silk makers hand cloth to the relay hubs."), board_nodes: [{ id: "a", keyword: "silk makers", icon: "box", color: "blue", evidence: "", count: 1 }, { id: "b", keyword: "relay hubs", icon: "box", color: "blue", evidence: "", count: 1 }] } as any;
  const none: Architecture = { product: "", one_liner: "", components: [], connections: [], walkthrough: { name: "", steps: [] }, scale: [] };
  assert.deepEqual(syncPhrases(s, none), ["silk makers", "relay hubs"]);
});

test("a tapped box's answer drops points that only say the files don't show something", () => {
  // real point from the microui "ui core" answer, cited to src/microui.c
  assert.ok(emptyPoint("The files provided do not show host-app widget-declaration calls."));
  assert.ok(emptyPoint("Host-side declaration code is not visible here."));
  assert.ok(!emptyPoint("It connects outward by emitting MU_COMMAND_* rect/text/icon/clip items into command_list for a renderer to draw."));
  assert.ok(!emptyPoint("The core is mu_Context, holding style, hover/focus, fixed-size stacks, and container pools with no dynamic allocation shown."));
});

test("a tapped box's summary drops rendering-mode claims the evidence does not show", () => {
  // microui is immediate-mode; the model once called it "retained"
  const ev = "### src/microui.c\nimmediate mode gui, redrawn each frame";
  assert.ok(!groundedSummary("It is a retained mode gui.", ev).toLowerCase().includes("retained"));
  assert.ok(groundedSummary("It is an immediate mode gui.", ev).toLowerCase().includes("immediate"));
  assert.ok(groundedSummary("It is a retained mode gui.", "### src/x.c\nretained widgets").toLowerCase().includes("retained"));
});

test("the walkthrough may tell its steps in plain words: no step label has to be recited", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "What if every contact in your chat were a bot? This chat app works like a hotel front desk."),
    sc("layer", "The team chat is the front desk. The front door is the doorman.", ["ui", "edge"]),
    sc("layer", "The bot harness is the manager. The agent drivers are the concierges.", ["srv", "bot"]),
    sc("walkthrough", "You type a note in the team chat, and it goes to the front door. The door passes it to the bot harness, which wakes the agent drivers to answer."),
    sc("layer", "Off to the side, the login worker checks who you are.", ["auth"]),
    sc("recap", "Team chat to front door to bot harness to agent drivers."),
  ] }, storyArch, { perScene: 2 });
  const issues = checkStory(plan, storyArch, "a hotel front desk");
  assert.ok(!issues.some((i) => /walkthrough must tell|label turned into a noun/.test(i)), issues.join("; "));
});

test("the self-check flags step labels recited as nouns", () => {
  const n = "The team chat performs the send message step, the front door completes the forward step, and then the run bot instruction goes to the agent drivers.";
  assert.deepEqual(labelEchoes(n, storyArch), ["performs the send message", "completes the forward", "the run bot instruction"]);
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [sc("hook", "Why? It is a chat."), sc("layer", "The team chat and the front door.", ["ui", "edge"]), sc("layer", "The bot harness and the agent drivers.", ["srv", "bot"]), sc("walkthrough", n)] }, storyArch, { perScene: 2 });
  assert.ok(checkStory(plan, storyArch).some((i) => /says "performs the send message", a step label turned into a noun/.test(i)));
  assert.deepEqual(labelEchoes("You send a message, the door will forward it, and the harness runs the bot.", storyArch), []);
});

test("a walkthrough's sync phrases are what it says, not its step labels", () => {
  const s = sc("walkthrough", "You type a note in the team chat, and it goes to the front door. The door passes it to the bot harness, which wakes the agent drivers.");
  const p = syncPhrases(s, storyArch);
  assert.ok(!p.some((x) => ["send message", "forward", "run bot"].includes(x)), p.join(", "));
  assert.deepEqual(p.filter((x, i) => p.indexOf(x) === i), ["team chat", "front door", "bot harness", "agent drivers"]);
});

test("the stand-in walkthrough passes the story check", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [sc("hook", "Why talk to a bot? It is a chat."), sc("layer", "The team chat and the front door.", ["ui", "edge"]), sc("layer", "The bot harness and the agent drivers.", ["srv", "bot"])] }, storyArch, { perScene: 2 });
  const w = plan.scenes.find((s) => s.kind === "walkthrough")!;
  assert.ok(w, "a walkthrough was added");
  assert.ok(!checkStory(plan, storyArch).some((i) => /walkthrough must tell|label turned into a noun/.test(i)), w.narration);
});

test("box names and step labels with practitioner words go back for plain ones", () => {
  assert.equal(practitionerTerm("cdp client"), "cdp");
  assert.equal(practitionerTerm("rust cli"), "rust");
  assert.equal(practitionerTerm("browser driver"), "");
  assert.equal(practitionerTerm("command line tool"), "");
  const arch = { ...storyArch, components: storyArch.components.map((c) => (c.id === "srv" ? { ...c, keyword: "rust cli" } : c)), walkthrough: { ...storyArch.walkthrough, steps: storyArch.walkthrough.steps.map((s, i) => (i === 1 ? { ...s, label: "send cdp command" } : s)) } } as Architecture;
  const { open } = validateArchitecture(arch, ["a.ts"], (n) => n, () => "box");
  assert.ok(open.some((i) => i.target === "srv" && /"rust cli" uses "rust"/.test(i.problem)), open.map((i) => i.problem).join("; "));
  assert.ok(open.some((i) => i.target === "walkthrough" && /"send cdp command" uses "cdp"/.test(i.problem)));
});

test("the self-check holds every line and heading to the plain-language bar", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [
    sc("hook", "Can your chat run little bots? Your team chat hands each message to a bot that does the job for you."),
    sc("layer", "The front door parses the json payload over a websocket.", ["ui", "edge"]),
    { ...sc("layer", "The bot harness is the manager, and it runs your bots for you.", ["srv", "bot"]), heading: "the rpc daemon" },
    sc("walkthrough", "You send a message, the door forwards it, and the harness runs the bot."),
    sc("recap", "So your team chat gets real jobs done. Your message goes from the team chat to the front door, the bot harness and the agent drivers."),
  ] }, storyArch, { perScene: 2 });
  const issues = speechIssues(plan, storyArch);
  assert.ok(issues.some((i) => /"The front door parses the json payload over a websocket\." uses "(json|payload|websocket|parses?)"/.test(i)), issues.join("; "));
  assert.ok(issues.some((i) => /heading "the rpc daemon" uses "(rpc|daemon)"/.test(i)), issues.join("; "));
  assert.ok(!issues.some((i) => /recap/.test(i) && /uses "|never talks/.test(i)), issues.join("; "));
  const cold = repairRepoPlan({ title: "x", subtitle: "", scenes: [sc("hook", "Can a chat run bots? It can."), sc("walkthrough", "The door forwards it, and the harness runs the bot."), sc("recap", "Team chat to front door to bot harness to agent drivers.")] }, storyArch, { perScene: 2 });
  assert.ok(speechIssues(cold, storyArch).some((i) => /walkthrough: never talks to the viewer/.test(i)));
});
