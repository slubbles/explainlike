import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenWords, scriptTimes, alignWords, misheard, hinted, namesIn } from "../src/index.ts";

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

// the Silk Road hook: Aura said "silk reached Rome" so Deepgram heard "reached Gromo", while "Parthian" came out fine
test("a name the recogniser did not hear is found, and only that name is respelled for the voice", () => {
  const script = "You wonder how silk reached Rome when no traveler crossed all Asia.";
  assert.deepEqual(misheard(script, "You wonder how silk reached Gromo no travel across all Asia."), ["rome"]);
  assert.deepEqual(misheard(script, "You wonder how silk reached Rome when no traveler crossed all Asia."), []);
  assert.deepEqual(misheard("The Parthian Empire bridges east and west.", "The Parthian Empire bridges east and west."), []);
  assert.deepEqual(misheard("Silk leaves China's workshops.", "Silk leaves China's workshops."), [], "a possessive is the same name");
  const sayAs = spokenWords(script);
  assert.equal(hinted(sayAs, ["rome"]).join(" "), "You wonder how silk reached Rohm when no traveler crossed all Asia.");
  assert.equal(hinted(sayAs, ["asia"]).join(" "), script, "a name with no known respelling is voiced as written");
  // captions keep the script spelling: the respelled take still maps one spoken word per script word
  assert.equal(hinted(sayAs, ["rome"]).length, sayAs.length);
});

test("names are capitalised words after a sentence's first word, plus names with a known respelling", () => {
  assert.deepEqual(namesIn("Rome pays gold. No courier runs from China to Rome. The SDL window paints."), ["rome", "courier", "china"]);
  assert.deepEqual(namesIn("A parcel relay moves silk."), ["parcel"]);
  assert.deepEqual(namesIn("Couriers guard the road."), ["couriers"]);

// Silk Road retake: Aura heard "parcel relay" as "personal relay" and "Couriers" as "Curriers"
test("risky common words are caught and respelled for the retake", () => {
  const script = "A parcel relay moves silk while Couriers guard the road.";
  assert.deepEqual(misheard(script, "A personal relay moves silk while Curriers guard the road."), ["parcel", "couriers"]);
  const sayAs = spokenWords(script);
  const hint = hinted(sayAs, ["parcel", "couriers"]);
  assert.equal(hint.length, sayAs.length);
  assert.ok(hint.join(" ").toLowerCase().includes("parsel"), "parcel is respelled");
  assert.ok(hint.join(" ").toLowerCase().includes("cooriers"), "couriers is respelled");
});
});
