import { test } from "node:test";
import assert from "node:assert/strict";
import { Architecture, NoteItem, Brief, DEFAULT_BRIEF, LOOKS, MIN_CUTS_PER_MIN, TEMPOS, coverageSeconds, specFromBrief, getTheme, listThemes, isKeyword, quoteInSource, strictJsonSchema, agreementSlips, tidySpeech, soundsLikeKeywords } from "@explanimate/core";

test("the brief sets tempo from complexity and list scenes from depth", () => {
  const tech = specFromBrief({ ...DEFAULT_BRIEF, complexity: "technical", depth: "deep", extras: ["requirements", "trade-offs", "failure modes"] });
  assert.equal(tech.tempo.id, "slow");
  assert.ok(tech.tempo.minBeat >= 3.5);
  assert.equal(tech.perScene, 2, "technical topics add fewer boxes per beat");
  assert.deepEqual(tech.notes.map((n) => n.heading), ["requirements"], "deep allows one short extra beat after the flow");
  assert.equal(specFromBrief({ ...DEFAULT_BRIEF, extras: ["trade-offs"] }).notes.length, 0, "working depth stays on the core flow");
  const easy = specFromBrief({ ...DEFAULT_BRIEF, complexity: "simple", depth: "overview", approach: "analogy", analogy: "a post office", extras: ["requirements"] });
  assert.equal(easy.tempo.id, "brisk");
  assert.equal(easy.notes.length, 0, "an overview has no list scenes");
  assert.match(easy.voice, /post office/);
  for (const t of Object.values(TEMPOS)) assert.ok(t.minBeat >= 4 && 60 / t.minBeat >= MIN_CUTS_PER_MIN);
  assert.equal(Brief.safeParse({ ...DEFAULT_BRIEF, approach: "interpretive dance" }).success, false);
});

test("video length follows what has to be covered", () => {
  const spec = specFromBrief(DEFAULT_BRIEF);
  const small = coverageSeconds(spec, { components: 4, steps: 3, scale: 1 });
  const big = coverageSeconds(spec, { components: 10, steps: 6, scale: 2 });
  assert.ok(big[0] > small[0]);
  assert.ok(small[0] >= 34 && big[1] <= 276);
});

test("themes: the built-in looks exist, the pen look is the default, unknown ids fail loudly", () => {
  assert.deepEqual(listThemes().slice(0, 3).sort(), Object.keys(LOOKS).sort());
  assert.equal(getTheme().id, "pen-light");
  assert.equal(getTheme().stroke, "pen");
  // each colour must be distinct so the editable board can map it back to a named colour
  for (const id of listThemes()) assert.equal(new Set(Object.values(getTheme(id).colors)).size, 10, id);
  assert.equal(getTheme("whiteboard-light").invertIcons, true);
  assert.throws(() => getTheme("neon"), /unknown theme/);
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
  const { tidySpeech } = await import("@explanimate/core");
  assert.equal(tidySpeech("  the  the cache holds rows ,then  drops them. at 10x traffic, writes queue up"), "The cache holds rows, then drops them. At 10x traffic, writes queue up.");
  assert.equal(tidySpeech("Use a queue, e.g. a durable one. it said that that was fine!"), "Use a queue, e.g. a durable one. It said that that was fine!");
  assert.equal(tidySpeech("How does a pasted link become a video?"), "How does a pasted link become a video?");
});

test("subject-verb agreement: 'a pasted link become' is a slip, but 'how does a pasted link become' is not", () => {
  assert.deepEqual(agreementSlips("a pasted link become").map((s) => s.phrase), ["a pasted link become"]);
  assert.equal(tidySpeech("A pasted link become a watchable video."), "A pasted link becomes a watchable video.");
  assert.equal(tidySpeech("Each worker fetch the repo."), "Each worker fetches the repo.");
  assert.equal(tidySpeech("An api call return data."), "An API call returns data.");
  // a helper verb carries the agreement, and two singular subjects make a plural one
  for (const ok of ["The question: how does a pasted link become a watchable video?", "Let a worker run it.", "A user and a bot send links.", "Why can a single room become hot?", "Paste a repo, an X post, or an article."])
    assert.equal(tidySpeech(ok), ok);
});

test("a keyword list is told apart from spoken sentences", () => {
  assert.ok(soundsLikeKeywords("Browser user sits at frontend start pasting links for video."));
  assert.ok(soundsLikeKeywords("Paste link watch starts with browser user pasting github x article link. Next watch resulting video in player."));
  assert.ok(!soundsLikeKeywords("This box is you, the viewer, pasting a GitHub, X, or article link into the web app."));
  assert.ok(!soundsLikeKeywords("Short label text."));
});

test("a noun after a singular subject is not read as a verb: 'a write queue that lines up'", () => {
  for (const ok of ["The fix is a write queue that lines up the saves.", "The fix is a write queue.", "Each message cache is small.", "Then it asks a concierge to run the agent.", "A guest can send a message."])
    assert.equal(tidySpeech(ok), ok);
});

test("phraseAt finds a step label as people say it", async () => {
  const { phraseAt, spokenWords } = await import("@explanimate/core");
  const w = spokenWords("Then the agent sends the message back, and the app shows you the reply.");
  assert.equal(phraseAt(w, "send message"), 3);
  assert.equal(phraseAt(w, "show reply"), 10);
  assert.equal(phraseAt(spokenWords("and the harness runs the bot"), "run bot"), 3);
  assert.equal(phraseAt(w, "save messages"), -1);
  assert.equal(phraseAt(spokenWords("send it to the very busy server"), "send server"), -1, "only two small words may sit between");
});

test("phraseAt finds a hyphenated label said as one hyphenated word, and still as separate words", async () => {
  const { phraseAt, spokenWords } = await import("@explanimate/core");
  assert.equal(phraseAt(spokenWords("The harness will load follow-ups from your past chat."), "load follow-ups"), 3);
  assert.equal(phraseAt(spokenWords("It will load the follow ups next."), "load follow-ups"), 2);
  assert.equal(phraseAt(spokenWords("It will load the follow-ups next."), "load follow ups"), -1, "only the label's own hyphen joins words");
});

test("missing articles before common nouns are caught", async () => {
  const { missingArticles } = await import("@explanimate/core");
  assert.deepEqual(missingArticles("The guest will send message to manager, then we run agent."), ["send message", "run agent", "to manager"]);
  assert.deepEqual(missingArticles("The guest sends a message to the manager, who saves messages and runs the agent."), []);
  assert.deepEqual(missingArticles("The demo app declares widgets for the open window, then a used file."), []);
});

test("what the viewer asked for reaches the script", () => {
  const v = specFromBrief(DEFAULT_BRIEF, { goal: "how a message flows through it", also: "where chats are saved" }).voice;
  assert.match(v, /asked to understand: how a message flows through it/);
  assert.match(v, /also asked to cover: where chats are saved/);
  assert.doesNotMatch(specFromBrief(DEFAULT_BRIEF).voice, /asked/);
});

test("a long scene heading is cut to a name, not mid-phrase", async () => {
  const { shortHeading } = await import("../src/text.ts");
  assert.equal(shortHeading("one message, start to end"), "one message");
  assert.equal(shortHeading("The Front Desk"), "the front desk");
  assert.equal(shortHeading("the whole trip from you and back"), "the whole trip");
  assert.equal(shortHeading("one message start to"), "one message");
});
