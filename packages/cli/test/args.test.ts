import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFollowUpArgs, checkPackValues, isExplainRequest, parseLook, parsePath, parseVoice, parseWorkers } from "../src/args.ts";

test("explain runs only for component questions, never for a topic starting with explain", () => {
  assert.equal(isExplainRequest(["explain", "--from", "out", "--component", "api"]), true);
  assert.equal(isExplainRequest(["explain", "--component", "api", "--from", "out"]), true);
  assert.equal(isExplainRequest(["explain", "how", "DNS", "works"]), false);
  assert.equal(isExplainRequest(["explain"]), false);
  assert.equal(isExplainRequest(["https://github.com/a/b"]), false);
});

test("--workers takes a positive whole number", () => {
  assert.equal(parseWorkers(undefined), undefined);
  assert.equal(parseWorkers("4"), 4);
  for (const raw of ["abc", "0", "-2", "2.5", "", "NaN"]) {
    assert.throws(() => parseWorkers(raw), /positive whole number/, raw);
  }
});

test("--voice takes deepgram, cartesia or silent, never a silent typo", () => {
  assert.equal(parseVoice(undefined), undefined);
  assert.equal(parseVoice("deepgram"), "deepgram");
  assert.equal(parseVoice("cartesia"), "cartesia");
  assert.equal(parseVoice("silent"), "silent");
  assert.throws(() => parseVoice("deepgrma"), /deepgram, cartesia or silent/);
});

test("--pack with a missing value is refused instead of throwing a TypeError", () => {
  assert.deepEqual(checkPackValues(["a", "b"]), ["a", "b"]);
  assert.throws(() => checkPackValues(["a", undefined]), /--pack needs a value/);
});

test("--look takes dark or default, and is unset when the engine picks", () => {
  assert.equal(parseLook(undefined), undefined);
  assert.equal(parseLook("dark"), "dark");
  assert.equal(parseLook("default"), "default");
  assert.throws(() => parseLook("neon"), /dark or default/);
});

test("--path takes a folder in the repo, and refuses escapes", () => {
  assert.equal(parsePath(undefined), undefined);
  assert.equal(parsePath("packages/cli"), "packages/cli");
  assert.equal(parsePath("packages/cli/"), "packages/cli");
  for (const raw of ["..", "../etc", "/etc", "a//b"]) {
    assert.throws(() => parsePath(raw), /Invalid path/, raw);
  }
});

test("--focus and --what-if need --from, and only one of them", () => {
  assert.throws(() => checkFollowUpArgs("api", undefined, undefined), /need --from/);
  assert.throws(() => checkFollowUpArgs(undefined, "10x", undefined), /need --from/);
  assert.throws(() => checkFollowUpArgs("api", "10x", "out"), /one of/);
  checkFollowUpArgs("api", undefined, "out");
  checkFollowUpArgs(undefined, undefined, undefined);
});
