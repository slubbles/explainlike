import { test } from "node:test";
import assert from "node:assert/strict";
import { plainSlips, practitionerTerm, PLAIN_LANGUAGE, PLAIN_LABELS } from "../src/index.js";

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
  assert.match(PLAIN_LABELS, /web page/);
  assert.equal(practitionerTerm("web page"), "");
  assert.equal(practitionerTerm("dashboard ui"), "");
});
