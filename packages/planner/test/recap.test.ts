import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Architecture, Scene } from "@explanimate/core";
import { checkStory, recapInOrder, recapNeeds, recapWords, repairRepoPlan, retellTrip, journeyOrder, speechIssues, syncProblem, syncPhrases } from "@explanimate/planner";

const arch = JSON.parse(fs.readFileSync(new URL("./fixtures/nanochat.architecture.json", import.meta.url), "utf8")) as Architecture;
const kw = (id: string) => arch.components.find((c) => c.id === id)!.keyword;
const sc = (kind: Scene["kind"], narration: string, add: string[] = []): Scene => ({ id: kind, kind, heading: kind, narration, add_components: add, add_connections: [], callouts: [], highlights: [], board_nodes: [], board_edges: [], items: [] } as unknown as Scene);
const recapIssue = (narration: string) => checkStory({ title: "x", subtitle: "", scenes: [sc("recap", narration)] }, arch).filter((i) => /recap must retell/.test(i));

test("a recap counts only the journey parts it names in the journey's order", () => {
  const ks = ["training scripts", "token shards", "gpt transformer", "checkpoint store", "cli chat", "inference engine"];
  assert.equal(recapInOrder("The training scripts stream the token shards, train the gpt transformer and fill the checkpoint store; the cli chat calls the inference engine.", ks), 6);
  assert.equal(recapInOrder("The cli chat, the inference engine, the token shards and the training scripts.", ks), 2);
  // a part said again later does not break the order
  assert.equal(recapInOrder("The training scripts feed the gpt transformer, the checkpoint store keeps it, the inference engine runs the gpt transformer.", ks), 4);
  assert.equal(recapNeeds(6), 4);
  assert.equal(recapNeeds(2), 2);
});

test("the nanochat recap that shipped is flagged, and the issue lists the parts to name", () => {
  const thin = recapIssue("You streamed text to train a brain, saved memory, chatted for answers, then graded trust.");
  assert.equal(thin.length, 1);
  assert.match(thin[0], new RegExp(journeyOrder(arch).path.map(kw).join(", ")));
  assert.deepEqual(recapIssue("Your text streams from the token shards into the training scripts, which train the gpt transformer and save it to the checkpoint store; then the cli chat loads it and sends your words to the inference engine."), []);
  assert.equal(recapIssue("The cli chat sends to the inference engine, the checkpoint store holds the gpt transformer, and the training scripts read the token shards.").length, 1, "the right parts in the wrong order still fail");
});

test("a plan without a recap gets one that names every walkthrough part in order, as speech", () => {
  const plan = repairRepoPlan({ title: "x", subtitle: "", scenes: [sc("hook", "Can one script train a chat model?"), sc("walkthrough", "You follow one batch.")] }, arch, { perScene: 3 });
  const recap = plan.scenes.find((s) => s.kind === "recap")!;
  assert.equal(recap.narration, retellTrip(arch));
  assert.match(recap.narration, /^Here's the whole trip you just followed\. It goes from the training scripts to the token shards, the gpt transformer and the checkpoint store\. Then it goes from the cli chat to the checkpoint store and the inference engine\. And finally it goes from the inference engine to the gpt transformer\.$/);
  assert.deepEqual(recapIssue(recap.narration), []);
  assert.deepEqual(speechIssues({ title: "x", subtitle: "", scenes: [recap] }, arch).filter((i) => i.startsWith(recap.id)), []);
});

test("a recap rewrite may grow to retell the trip; other scenes keep the 125% cap", () => {
  const short = "You streamed text, trained it and chatted with it.";
  const long = "Your text streams from the token shards into the training scripts, which train the gpt transformer and save it to the checkpoint store; then the cli chat loads it and sends your words to the inference engine.";
  const phrases = syncPhrases(sc("recap", long), arch);
  assert.match(syncProblem(short, long, phrases) ?? "", /over the \d+ allowed/);
  assert.equal(syncProblem(short, long, phrases, recapWords(journeyOrder(arch).path.length)), undefined);
});
