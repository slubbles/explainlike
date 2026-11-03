import { test } from "node:test";
import assert from "node:assert/strict";
import { grammarSlips } from "../src/index.js";

// lines from real runs (microui7 s04 and s05, the Silk Road s05) that a listener trips on
test("a noun stack with the 'and' left out is flagged", () => {
  assert.deepEqual(grammarSlips("Bandits harsh deserts make travel costly."), [
    'noun stack "Bandits harsh deserts": two things run together with no "and" or verb between them',
  ]);
});

test("an action said twice and a sentence ending on a vague word are flagged", () => {
  const g = grammarSlips("To trail one press, you press keys on the OK button for action.");
  assert.equal(g.length, 2);
  assert.match(g[0], /"press keys on the OK button" says the action twice; say "press the OK button"/);
  assert.match(g[1], /"for action" ends the sentence on a vague word/);
});

test("the borrowed picture's word said bare where a part belongs is flagged", () => {
  const metaphor = ["tickets", "kitchen"];
  assert.match(
    grammarSlips("Then the sdl renderer reads commands from tickets.", { metaphor })[0],
    /"from tickets" uses the picture word "tickets"/,
  );
  assert.match(
    grammarSlips("Behind tickets the sdl renderer, an SDL drawing helper, paints for you.", { metaphor })[0],
    /"behind tickets"/,
  );
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
  ])
    assert.deepEqual(grammarSlips(s, { metaphor }), [], s);
});

// real lines from microui7 and microui8 that end on a "with you" or "for you" the sentence does not need
test("a dangling 'with you' or 'for you' and 'you' said twice are flagged", () => {
  const twice = grammarSlips(
    "It works like the forgetful diner where the kitchen re-takes your whole order on every visit, and you'll follow one click with you.",
  );
  assert.equal(twice.length, 1);
  assert.match(twice[0], /"you'll follow one click with you" says "you" twice; drop the ending "with you"/);
  assert.match(
    grammarSlips("Then the ui core follows one click with you.")[0],
    /"with you" dangles at the end of "Then the ui core follows one click"/,
  );
  assert.match(grammarSlips("It shows the frame with OK lit for you.")[0], /"for you" is tacked onto "It shows the frame with OK lit"/);
  assert.match(grammarSlips("So forgetting each frame keeps the kit tiny, yet familiar for you.")[0], /tacked onto "yet familiar"/);
  assert.match(
    grammarSlips("The demo app declares widgets for the open window for you.")[0],
    /tacked onto "The demo app declares widgets for the open window"/,
  );
});

test("the same word twice in a row is flagged", () => {
  assert.match(
    grammarSlips("Caravans load bolts of brocade, lacquer, and porcelain porcelain for the desert.")[0],
    /"porcelain porcelain" says the same word twice in a row/,
  );
  assert.deepEqual(grammarSlips("He said that that rule had had its day."), []);
});

test("'with you' and 'for you' that belong to the sentence are left alone", () => {
  for (const s of [
    "Names find pages for you.",
    "The back wall rewrites boxes for you.",
    "Pixels appear at the front window for you.",
    "The ui core, microui, a tiny C library, rebuilds widgets, clickable buttons, from scratch for you.",
    "Your phone stays with you.",
    "The parcel travels with you.",
    "Shared rules let old networks stay unchanged yet still deliver to you.",
  ])
    assert.deepEqual(grammarSlips(s), [], s);
});
