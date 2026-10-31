import { test } from "node:test";
import assert from "node:assert/strict";
import { Architecture, NoteItem, LevelSpec, listLevels, getLevel, registerLevel, getTheme, registerTheme, listThemes, isKeyword, quoteInSource, strictJsonSchema } from "@metual/core";

test("the four built-in levels load from their JSON config", () => {
  assert.deepEqual(listLevels().map((l) => l.id).sort(), ["five", "interviewing", "new", "senior"]);
  // interviewing and senior carry their own whiteboard list scenes
  assert.ok(getLevel("interviewing").notes.some((n) => /requirement/i.test(n.heading)));
  assert.ok(getLevel("senior").notes.length > 0);
  assert.equal(getLevel("five").notes.length, 0);
});

test("a level file is validated before it is used", () => {
  const good = { id: "pm", label: "a product manager", minComponents: 3, maxComponents: 6, perScene: 2, scaleItems: 1, scaleAt: ["10x"], wordsPerScene: 30, seconds: [60, 90], voice: "plain words" };
  assert.equal(registerLevel(good).id, "pm");
  assert.equal(getLevel("pm").notes.length, 0, "notes default to none");
  assert.throws(() => registerLevel({ ...good, id: "Bad Id" }));
  assert.throws(() => registerLevel({ ...good, minComponents: 9, maxComponents: 4 }), /minComponents/);
  assert.throws(() => registerLevel({ ...good, scaleAt: [] }));
  assert.equal(LevelSpec.safeParse({ ...good, notes: [{ after: "outro", heading: "x", brief: "y" }] }).success, false);
});

test("themes: the built-ins exist, the pen look is the default, unknown ids fail loudly, plugins register", () => {
  assert.deepEqual(listThemes().slice(0, 3), ["pen-light", "caleb-dark", "whiteboard-light"]);
  assert.equal(getTheme().id, "pen-light");
  assert.equal(getTheme().stroke, "pen");
  // each colour must be distinct so the editable board can map it back to a named colour
  for (const id of listThemes()) assert.equal(new Set(Object.values(getTheme(id).colors)).size, 10, id);
  assert.equal(getTheme("whiteboard-light").invertIcons, true);
  assert.throws(() => getTheme("neon"), /unknown theme/);
  registerTheme({ ...getTheme(), id: "test-theme", accent: "#123456" });
  assert.equal(getTheme("test-theme").accent, "#123456");
});

test("Architecture schema rejects a component with an unknown kind", () => {
  const arch = {
    product: "p", one_liner: "x",
    components: [{ id: "web", name: "Next.js", kind: "client", layer: "frontend", keyword: "web app", icon: "browser", what: "ui", evidence: ["app/page.tsx"] }],
    connections: [], walkthrough: { name: "open", steps: [] }, scale: [],
  };
  assert.equal(Architecture.safeParse(arch).success, true);
  arch.components[0].kind = "spaceship";
  assert.equal(Architecture.safeParse(arch).success, false);
});

test("strict JSON schema for the model: every property required, no extras", () => {
  const s = strictJsonSchema(NoteItem) as { required: string[]; additionalProperties: boolean; properties: Record<string, unknown> };
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
  assert.equal(s.additionalProperties, false);
});

test("keywords are 1-3 lowercase words; quotes match with small edits only", () => {
  assert.ok(isKeyword("edge cache"));
  assert.ok(!isKeyword("Edge Cache"));
  assert.ok(!isKeyword("one two three four"));
  const src = "PagedAttention partitions the KV cache of each sequence into blocks.";
  assert.ok(quoteInSource("partitions the KV cache of each sequence", src));
  assert.ok(quoteInSource("“partitions the kv cache of every sequence into blocks”", src), "one changed word is tolerated");
  assert.ok(!quoteInSource("stores the cache on disk forever", src));
  assert.ok(!quoteInSource("", src));
});

test("narration is tidied mechanically before it is voiced", async () => {
  const { tidySpeech } = await import("@metual/core");
  assert.equal(tidySpeech("  the  the cache holds rows ,then  drops them. at 10x traffic, writes queue up"), "The cache holds rows, then drops them. At 10x traffic, writes queue up.");
  assert.equal(tidySpeech("Use a queue, e.g. a durable one. it said that that was fine!"), "Use a queue, e.g. a durable one. It said that that was fine!");
  assert.equal(tidySpeech("How does a pasted link become a video?"), "How does a pasted link become a video?");
});
