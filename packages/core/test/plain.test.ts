import { test } from "node:test";
import assert from "node:assert/strict";
import { plainSlips, practitionerTerm, PLAIN_LANGUAGE, PLAIN_LABELS, PLAIN_SUBTITLE, PLAIN_HEADINGS, figurative, subtitleSlip } from "../src/index.js";

test("a sentence with unexplained jargon is flagged with the word it stumbles on", () => {
  const slips = plainSlips("The rust cli sends the send cdp instruction onward.");
  assert.equal(slips.length, 1);
  assert.match(slips[0], /uses "(rust|cli|cdp)" with no everyday words beside it/);
});

test("a term explained in the same breath passes", () => {
  assert.deepEqual(plainSlips("It talks to Chrome through the Chrome DevTools Protocol, basically a remote control for Chrome."), []);
  assert.deepEqual(plainSlips("Your AI says click the login button, and the tool clicks it in a real browser."), []);
});

test("box names the board already shows are not counted as jargon", () => {
  assert.equal(plainSlips("The command line tool hands it to the browser driver.", ["browser driver"]).length, 0);
  assert.equal(plainSlips("Then the cdp client clicks it.", ["cdp client"]).length, 0);
});

test("a sentence too long to follow by ear is flagged", () => {
  const long = "It goes to the fast command program written in Rust, a quick systems language, that reads what your assistant asked for and turns it into steps for the browser.";
  assert.ok(plainSlips(long).some((s) => /has \d+ words; split it/.test(s)));
});

test("the standard every prompt carries names the bar and its examples", () => {
  assert.match(PLAIN_LANGUAGE, /doesn't write code|non-programmer/);
  assert.match(PLAIN_LANGUAGE, /same breath/);
  assert.match(PLAIN_LABELS, /real name/);
  assert.match(PLAIN_LANGUAGE, /Claude Code or Cursor/);
  assert.equal(practitionerTerm("web page"), "");
  assert.equal(practitionerTerm("dashboard ui"), "");
});

test("travel metaphors are caught in headings and lines, but box names that share the words are not", () => {
  assert.equal(figurative("a real car door"), "car door");
  assert.equal(figurative("too many riders"), "riders");
  assert.equal(figurative("where it starts"), "");
  assert.equal(figurative("the front door takes it", ["front door"]), "");
});

test("a box subtitle must say what the part does, in a few everyday words", () => {
  assert.match(subtitleSlip("CDP client over chrome DevTools", "browser link"), /says "cdp"/);
  assert.match(subtitleSlip("vercel sandbox runner that boots chrome in a remote cloud machine", "hosted sandbox"), /over 7 words/);
  assert.match(subtitleSlip("Command line", "command line"), /repeats the box name/);
  assert.match(subtitleSlip("", "chrome"), /no plain line/);
  assert.equal(subtitleSlip("clicks and types for your AI", "browser tool"), "");
  assert.match(PLAIN_SUBTITLE, /clicks and types/);
  assert.match(PLAIN_HEADINGS, /where it starts/);
  assert.match(PLAIN_LANGUAGE, /No running metaphor/);
});

test("stiff lines and proper names: a repeated word is flagged, product names are capitalised", async () => {
  const { stiffLines } = await import("../src/plain.ts");
  const { tidySpeech } = await import("../src/text.ts");
  assert.ok(stiffLines("Chrome opens Chrome tabs for you.").length > 0);
  assert.deepEqual(stiffLines("Your AI agent says click, and the daemon clicks it in Chrome."), []);
  assert.equal(tidySpeech("it opens chrome from github."), "It opens Chrome from GitHub.");
});
