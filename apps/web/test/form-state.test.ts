import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LINK_MAX } from "../lib/form.ts";
import { MAX_INPUT_CHARS } from "../lib/guard.ts";

test("the client link cap and the server link cap are the same number", () => {
  assert.equal(LINK_MAX, MAX_INPUT_CHARS);
  const web = path.resolve(import.meta.dirname, "..");
  const input = fs.readFileSync(path.join(web, "components/InputScreen.tsx"), "utf8");
  const bar = fs.readFileSync(path.join(web, "components/JobBar.tsx"), "utf8");
  assert.match(input, /maxLength=\{LINK_MAX\}/);
  assert.match(bar, /maxLength=\{LINK_MAX\}/);
});

test("typing a new link or topic clears the reason the last one was refused", () => {
  const home = fs.readFileSync(path.resolve(import.meta.dirname, "../components/Home.tsx"), "utf8");
  assert.match(home, /if \(f\.input !== undefined\) setErr\(""\)/);
});
