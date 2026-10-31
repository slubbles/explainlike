import { test } from "node:test";
import assert from "node:assert/strict";
import type { Architecture, NoteItem, Scene } from "@explainlike/core";
import { validateNotes, validateArchitecture, repairRepoPlan, checkStory, journeyOrder, speechIssues, keepsSync, syncPhrases } from "@explainlike/planner";

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
    sc("hook", "A chat app where your contacts are bots."),
    sc("layer", "The login worker checks who you are.", ["auth"]),
    sc("layer", "The bot harness and the agent drivers.", ["srv", "bot"]),
    sc("layer", "The team chat and the front door.", ["ui", "edge"]),
    sc("recap", "Team chat, front door, bot harness, agent drivers."),
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
  assert.ok(issues.some((i) => /"send message", "forward", "run bot"/.test(i)));
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
