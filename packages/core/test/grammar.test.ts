import { test } from "node:test";
import assert from "node:assert/strict";
import { grammarSlips } from "../src/index.js";

// lines from real runs (microui7 s04 and s05, the Silk Road s05) that a listener trips on
test("a noun stack with the 'and' left out is flagged", () => {
  assert.deepEqual(grammarSlips("Bandits harsh deserts make travel costly."), ['noun stack "Bandits harsh deserts": two things run together with no "and" or verb between them']);
});

test("an action said twice and a sentence ending on a vague word are flagged", () => {
  const g = grammarSlips("To trail one press, you press keys on the OK button for action.");
  assert.equal(g.length, 2);
  assert.match(g[0], /"press keys on the OK button" says the action twice; say "press the OK button"/);
  assert.match(g[1], /"for action" ends the sentence on a vague word/);
});

test("the borrowed picture's word said bare where a part belongs is flagged", () => {
  const metaphor = ["tickets", "kitchen"];
  assert.match(grammarSlips("Then the sdl renderer reads commands from tickets.", { metaphor })[0], /"from tickets" uses the picture word "tickets"/);
  assert.match(grammarSlips("Behind tickets the sdl renderer, an SDL drawing helper, paints for you.", { metaphor })[0], /"behind tickets"/);
  assert.deepEqual(grammarSlips("Then the sdl renderer reads commands from tickets."), [], "with no picture given, plain words are fine");
});

test("sentences that read fine are left alone", () => {
  const metaphor = ["tickets", "kitchen"];
  for (const s of [
    "Traders cross harsh deserts.",
    "Deserts make travel costly.",
    "It makes harsh roads costly.",
    "Goods like silk, tea, and porcelain travel west.",
    "Bandits, harsh deserts and high taxes make travel costly.",
    "It records the command list, simple kitchen tickets, so drawing stays trivial.",
    "You press the OK button. The renderer reads the tickets.",
    "You press keys, and you click too.",
    "Faith rides with parcels in the same mailbags. Ideas pass from hub to hub.",
    "The kit redraws windows each frame for you.",
  ]) assert.deepEqual(grammarSlips(s, { metaphor }), [], s);
});
