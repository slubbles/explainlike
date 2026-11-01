import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenWords, scriptTimes, alignWords } from "../src/index.ts";

test("letter-name acronyms are spoken letter by letter, and code names built on them split", () => {
  assert.deepEqual(spokenWords("Minbpe is tiny; the regex bpe, and gpt4 apis."), ["Minbpe", "is", "tiny;", "the", "regex", "BPE,", "and", "GPT 4", "APIs."]);
  assert.deepEqual(spokenWords("minbpe chops text"), ["min BPE", "chops", "text"]);
  // ordinary words that happen to end in the letters stay as they are
  assert.deepEqual(spokenWords("a rapi grip, the platform, your json and the API"), ["a", "rapi", "grip,", "the", "platform,", "your", "json", "and", "the", "API"]);
});

test("captions keep the script spelling while timing follows the spoken form", () => {
  const script = "minbpe chops text";
  const sayAs = spokenWords(script);
  const stt = [{ word: "min", start: 0, end: 0.2 }, { word: "BPE", start: 0.2, end: 0.6 }, { word: "chops", start: 0.7, end: 1 }, { word: "text", start: 1, end: 1.3 }];
  const out = scriptTimes(script, sayAs, alignWords(sayAs.join(" "), stt));
  assert.deepEqual(out, [{ word: "minbpe", start: 0, end: 0.6 }, { word: "chops", start: 0.7, end: 1 }, { word: "text", start: 1, end: 1.3 }]);
});
