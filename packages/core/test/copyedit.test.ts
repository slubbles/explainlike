import { test } from "node:test";
import assert from "node:assert/strict";
import { addMissingArticle, copyeditPlan, splitGluedTld, tidySpeech } from "../src/text.ts";

// lines like the ones an external review heard in real videos, before and after the copyedit
test("the slips heard in shipped videos are fixed before the voice reads them", () => {
  assert.equal(tidySpeech("Each job gets its own row."), "Each job gets its own row.");
  assert.equal(
    tidySpeech("The root server points you to the servers for .com, then .com points you on."),
    "The root server points you to the servers for .com, then .com points you on.",
  );
  assert.equal(tidySpeech("Ask the servers for.com, then.com answers."), "Ask the servers for .com, then .com answers.");
  assert.equal(tidySpeech("The last step shows how answer returns to you."), "The last step shows how the answer returns to you.");
  assert.equal(tidySpeech("Tests that ping a server break when it is down."), "Tests that ping a server break when it is down.");
});

test("a top-level domain stays its own word, and real domains and dotted names stay whole", () => {
  for (const [said, want] of [
    ["visit example.com today", "Visit example.com today."],
    ["look it up for example.com first", "Look it up for example.com first."],
    ["it calls api.github.com", "It calls api.github.com."],
    ["it runs on node.js", "It runs on node.js."],
    ["use a queue, e.g. a durable one", "Use a queue, e.g. a durable one."],
    ["it takes 3.5 seconds", "It takes 3.5 seconds."],
    ["version v1.2 fixed it", "Version v1.2 fixed it."],
    ["the keys live in .env", "The keys live in .env."],
    ["the servers for .org and .io", "The servers for .org and .io."],
    ["it holds rows , then drops them", "It holds rows, then drops them."],
  ])
    assert.equal(tidySpeech(said), want, said);
  assert.equal(splitGluedTld("the servers for.com and then.org"), "the servers for .com and then .org");
  assert.equal(splitGluedTld("to.com.au stays"), "to.com.au stays");
  assert.equal(splitGluedTld("google.com and x.com"), "google.com and x.com");
});

test("a dropped article is put back only on a singular subject after a clause word", () => {
  assert.equal(addMissingArticle("so request returns fast"), "so the request returns fast");
  for (const ok of ["how answers return", "how the answer returns", "how it returns", "how answer is built", "when users sign in"])
    assert.equal(addMissingArticle(ok), ok);
});

test("agreement is fixed on a subject, never on an object or after 'its'", () => {
  assert.equal(tidySpeech("A request return the page."), "A request returns the page.");
  assert.equal(tidySpeech("Then a worker fetch the repo."), "Then a worker fetches the repo.");
  for (const ok of ["Each user keeps its own list.", "You send a message back home.", "Their tests that call a service fail often."])
    assert.equal(tidySpeech(ok), ok);
});

test("the plan copyedit touches only the lines it fixes, and narration and captions read the same words", () => {
  const plan = {
    title: "dns",
    scenes: [
      { id: "s01", narration: "Ask the servers for.com first." },
      { id: "s02", narration: "It is fine." },
    ],
  };
  const r = copyeditPlan(plan);
  assert.deepEqual(r.changed, ["s01"]);
  assert.equal(r.plan.scenes[0]!.narration, "Ask the servers for .com first.");
  assert.equal(r.plan.scenes[1], plan.scenes[1]);
  assert.deepEqual(copyeditPlan(r.plan).changed, [], "a second pass changes nothing");
  // the voice and the captions both cut the narration on whitespace, so every said word is a shown word
  const words = r.plan.scenes[0]!.narration.split(/\s+/);
  assert.ok(words.includes(".com") && words.includes("for"), "the domain is its own caption word");
  assert.equal(copyeditPlan(plan).plan.scenes[0]!.narration, tidySpeech(plan.scenes[0]!.narration));
});
