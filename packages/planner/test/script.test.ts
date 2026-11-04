import { test } from "node:test";
import assert from "node:assert/strict";
import type { Architecture, Scene } from "@explanimate/core";
import { checkStory, fillerIn, speechIssues } from "@explanimate/planner";
import { SHAPES, analogyRule } from "../src/shapes.ts";

const arch = {
  product: "chatbot",
  one_liner: "a chat app with bots",
  components: [
    { id: "ui", name: "ui", kind: "api", layer: "app", keyword: "team chat", what: "x", icon: "box", evidence: ["a.ts"] },
    { id: "edge", name: "edge", kind: "api", layer: "app", keyword: "front door", what: "x", icon: "box", evidence: ["a.ts"] },
  ],
  connections: [{ from: "ui", to: "edge", label: "send message", evidence: "a.ts" }],
  walkthrough: { name: "ask", steps: [] },
  scale: [],
} as unknown as Architecture;
const sc = (kind: Scene["kind"], narration: string): Scene =>
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
  }) as unknown as Scene;
const plan = (...scenes: Scene[]) => ({ title: "x", subtitle: "", scenes });

test("the hook opens on the concrete problem or payoff: a question, a 'you' line or a number", () => {
  const hook = (n: string) => checkStory(plan(sc("hook", n)), arch).filter((i) => /concrete problem or payoff/.test(i));
  assert.equal(hook("The team chat talks to the bot harness through the front door. It works.").length, 1);
  assert.deepEqual(hook("What if every contact in your chat were a bot? This chat app is for teams."), []);
  assert.deepEqual(hook("Your dashboard takes nine seconds to open. This tool fixes that for you."), []);
  assert.deepEqual(hook("Every deploy takes 40 minutes today. This tool cuts that down for you."), []);
});

test("a long hook line must become one short problem-or-payoff line of about 8 seconds", () => {
  const issues = checkStory(
    plan(sc("hook", "This is a chat app where every one of your contacts is actually a little bot that can do jobs for you.")),
    arch,
  );
  assert.ok(
    issues.some((i) => /first sentence has 22 words.*about 8 seconds/.test(i)),
    issues.join("; "),
  );
});

test("long sentences go back for short lines of one idea each; short ones pass", () => {
  const paced = (n: string) => speechIssues(plan(sc("layer", n)), arch).filter((i) => /short lines of one idea/.test(i));
  assert.equal(
    paced(
      "The team chat takes every message you type and hands it to the front door, which checks who you are before letting anything through the gate.",
    ).length,
    1,
  );
  assert.deepEqual(paced("You type a note in the team chat, and it goes to the front door."), []);
});

test("the recap opens with what it does for you, then the retrace", () => {
  const recapped = (n: string) => checkStory(plan(sc("recap", n)), arch).filter((i) => /what it does for you/.test(i));
  assert.equal(recapped("Team chat to front door and back again.").length, 1);
  assert.deepEqual(recapped("So your team chat gets real jobs done. Your message goes from the team chat to the front door."), []);
});

test("more filler goes back: delving, game changers and nutshells", () => {
  assert.deepEqual(fillerIn("Let's delve into the code. It is a game changer, in a nutshell."), ["delve", "game changer", "in a nutshell"]);
  assert.deepEqual(fillerIn("Needless to say, at the end of the day it goes without saying."), [
    "needless to say",
    "at the end of the day",
    "it goes without saying",
  ]);
});

test("every shape hooks within about 8 seconds on the viewer's problem or payoff", () => {
  assert.match(SHAPES.journey.hook, /about 8 seconds/);
  assert.match(SHAPES.build.hook, /about 8 seconds/);
  assert.match(SHAPES.build.hook, /you already get answers/);
  assert.match(SHAPES.fault.hook, /about 8 seconds/);
});

test("a hook line over 14 words goes back for one short line", () => {
  const issues = checkStory(plan(sc("hook", "This chat app turns every single contact into a bot that does jobs for teams.")), arch);
  assert.ok(
    issues.some((i) => /first sentence has 15 words.*at most 14 words/.test(i)),
    issues.join("; "),
  );
});

test("the analogy counts only when its words are really said, not on a shared prefix", () => {
  const told = (hook: string) => checkStory(plan(sc("hook", hook)), arch, "a hotel front desk").filter((i) => /analogy/.test(i));
  assert.deepEqual(told("What if your stay were smoother? This app works like a hotel front desk for bots."), []);
  assert.equal(told("What if your frontend shipped faster? This tool faces the backlog for you.").length, 1);
});

test("a build ends on a payoff for you plus a retrace, and analogies stay concrete", () => {
  assert.match(SHAPES.build.close, /in one sentence for .you., then one short sentence retracing the limits/);
  assert.match(analogyRule("journey", "a kitchen"), /concrete and familiar/);
});
