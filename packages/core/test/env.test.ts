import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adoptLegacyEnv, withLegacyDir, userCacheDir, applyDotenvText, loadDotenvFiles } from "@explanimate/core";

test("old EXPLAINLIKE_* settings are copied to EXPLANIMATE_*, and a new name set as well wins", () => {
  const env: Record<string, string | undefined> = {
    EXPLAINLIKE_VOICE_CAP_USD: "5",
    EXPLAINLIKE_TRUST_PROXY: "1",
    EXPLANIMATE_TRUST_PROXY: "0",
    OTHER: "x",
  };
  adoptLegacyEnv(env);
  assert.equal(env.EXPLANIMATE_VOICE_CAP_USD, "5");
  assert.equal(env.EXPLANIMATE_TRUST_PROXY, "0");
  assert.equal(env.OTHER, "x");
});

test("an existing pre-rename folder is still used when the new one does not exist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-dirs-"));
  try {
    const current = path.join(root, "explanimate-out"),
      legacy = path.join(root, "explainlike-out");
    assert.equal(withLegacyDir(current, legacy), current, "neither exists: the new name wins");
    fs.mkdirSync(legacy);
    assert.equal(withLegacyDir(current, legacy), legacy, "only the old one exists: keep using it");
    fs.mkdirSync(current);
    assert.equal(withLegacyDir(current, legacy), current, "both exist: the new one wins");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the shared cache dir honours the same fallback under a home folder", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-home-"));
  try {
    const current = path.join(home, ".cache", "explanimate", "plans"),
      legacy = path.join(home, ".cache", "explainlike", "plans");
    assert.equal(userCacheDir("plans", home), current, "neither exists: the new cache wins");
    fs.mkdirSync(legacy, { recursive: true });
    assert.equal(userCacheDir("plans", home), legacy, "only the old cache exists: keep using it");
    fs.mkdirSync(current, { recursive: true });
    assert.equal(userCacheDir("plans", home), current, "both exist: the new cache wins");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test(".env text sets only missing or empty uppercase names, strips one layer of quotes, ignores the rest", () => {
  const env: Record<string, string | undefined> = { KEPT: "old", BLANK: "" };
  applyDotenvText(
    `# a comment\n\nKEPT=new\nBLANK=filled\nADDED=plain\nQUOTED="spaced value"\nSINGLE='x'\nEMPTY=\nlower=ignored\nDASHED-NAME=ignored\n`,
    env,
  );
  assert.equal(env.KEPT, "old");
  assert.equal(env.BLANK, "filled");
  assert.equal(env.ADDED, "plain");
  assert.equal(env.QUOTED, "spaced value");
  assert.equal(env.SINGLE, "x");
  assert.equal(env.EMPTY, "");
  assert.equal(env.lower, undefined);
  assert.equal(env["DASHED-NAME"], undefined);
});

test(".env files load in order with later files only filling gaps, then legacy names adopt", () => {
  const files: Record<string, string> = {
    "/r/.env": "FIRST=1\nSHARED=one\n",
    "/r/.env.local": "SHARED=two\nSECOND=2\nEXPLAINLIKE_TRUST_PROXY=1\n",
  };
  const env: Record<string, string | undefined> = {};
  loadDotenvFiles(["/r/.env", "/r/.env.local", "/r/missing"], env, {
    exists: (f) => files[f] !== undefined,
    read: (f) => files[f],
  });
  assert.equal(env.FIRST, "1");
  assert.equal(env.SHARED, "one");
  assert.equal(env.SECOND, "2");
  assert.equal(env.EXPLANIMATE_TRUST_PROXY, "1");
});
