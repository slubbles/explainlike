import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_FORM, FORMATS, formatForRequest, formFromJob } from "../lib/form.ts";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("the picker offers Auto plus the three engine formats", () => {
  assert.deepEqual(
    FORMATS.map((f) => f.id),
    ["auto", "short", "deep", "anatomy"],
  );
  assert.deepEqual(
    FORMATS.map((f) => f.label),
    ["Auto", "Short", "Deep", "Anatomy"],
  );
  assert.equal(DEFAULT_FORM.format, "auto");
});

test("Auto leaves the format out of the job request, so the engine decides", () => {
  assert.deepEqual(formatForRequest("auto"), {});
  assert.deepEqual(formatForRequest("short"), { format: "short" });
  assert.deepEqual(formatForRequest("deep"), { format: "deep" });
  assert.deepEqual(formatForRequest("anatomy"), { format: "anatomy" });
});

test("reopening a saved job brings back the format it was made with", () => {
  assert.equal(formFromJob({ input: "x", ask: { format: "anatomy" } }).format, "anatomy");
  assert.equal(formFromJob({ input: "x", ask: { format: "short" } }).format, "short");
  assert.equal(formFromJob({ input: "x" }).format, "auto");
  assert.equal(formFromJob({ input: "x", ask: { format: "wizard" } }).format, "auto");
});

test("the home prompt form has a labelled format picker, with what anatomy means", () => {
  const s = src("components/InputScreen.tsx");
  assert.match(s, /<label[^>]*>[\s\S]*?Format[\s\S]*?<select/, "a visible Format label wraps the picker");
  assert.match(s, /aria-label="Format"/, "the picker is labelled for screen readers");
  for (const id of ["auto", "short", "deep", "anatomy"]) assert.match(s, new RegExp(`value="${id}"|f\\.id|FORMATS`), id);
  assert.match(s, /FORMATS\.map/, "options come from the shared format list");
  assert.match(s, /tour of a repo(&apos;|')s parts/, "anatomy is explained in plain words");
});

test("the picker row wraps instead of overflowing a 390px phone", () => {
  const css = src("app/globals.css");
  const row = css.match(/\.frow\s*\{[^}]*\}/);
  assert.ok(row, ".frow has a rule");
  assert.match(row[0], /flex-wrap:\s*wrap/);
});

test("submitting sends the format only when it is not Auto", () => {
  const home = src("components/Home.tsx");
  assert.match(home, /\.\.\.formatForRequest\(format\)/, "the request body omits Auto");
  assert.doesNotMatch(home, /\{\s*\.\.\.form,\s*input\s*\}/, "the raw form (with Auto) is not posted as-is");
});

test("POST /api/jobs takes the format through to the job", () => {
  const route = src("app/api/jobs/route.ts");
  assert.match(route, /read\.body\.format/, "the route reads format off the request");
  assert.match(route, /short.*deep.*anatomy/, "only the three engine formats pass");
  assert.match(route, /startJob\([\s\S]*?format \? \{ format \}/, "the format reaches startJob");
});
