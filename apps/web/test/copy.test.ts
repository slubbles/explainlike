import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isValidCopyCode } from "../lib/copy.ts";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("a copy code is exactly 6 digits, nothing else", () => {
  assert.equal(isValidCopyCode("123456"), true);
  assert.equal(isValidCopyCode("000000"), true);
  const bad: unknown[] = [
    "",
    "12345",
    "1234567",
    "12345a",
    "abcdef",
    " 123456",
    "123456 ",
    "12 3456",
    "123-456",
    null,
    undefined,
    123456,
    ["123456"],
    {},
  ];
  for (const v of bad) assert.equal(isValidCopyCode(v), false, JSON.stringify(v));
});

test("the /copy page stays out of search and validates ?c before rendering it", async () => {
  const page = await import("../app/copy/page.tsx");
  const meta = page.metadata as { title: string; description: string; robots?: { index: boolean; follow: boolean } };
  assert.match(meta.title, /sign-in code/i);
  assert.ok(meta.description.length > 20, "a description for the tab and unfurls");
  assert.equal(meta.robots?.index, false);
  const s = src("app/copy/page.tsx");
  assert.match(s, /isValidCopyCode\(c\)/);
  assert.match(s, /<CopyCode code=\{code\} \/>/);
  assert.match(s, /isn&apos;t valid/);
  assert.match(s, /Back to explanimate\.co/);
  assert.match(s, /href="\/"/);
  assert.match(s, /<Nav \/>/);
  assert.match(s, /<Footer \/>/);
});

test("the code copies on load and on tap, with a Copied state for Safari's tap-to-copy", () => {
  const s = src("app/copy/CopyCode.tsx");
  assert.match(s, /navigator\.clipboard\?\.writeText/);
  assert.match(s, /useEffect/);
  assert.match(s, /void copy\(\)/);
  assert.match(s, /execCommand\("copy"\)/);
  assert.match(s, /Copy code/);
  assert.match(s, /Copied/);
  assert.match(s, /aria-live="polite"/);
  assert.match(s, /className=\{styles\.code\}/);
});

test("the code shows large with a big copy button, in the v4 dark style", () => {
  const css = src("app/copy/copy.module.css");
  assert.match(css, /\.code\s*\{[^}]*font-size:\s*clamp\(44px, 12vw, 64px\)/);
  assert.match(css, /\.code\s*\{[^}]*letter-spacing:\s*10px/);
  assert.match(css, /\.copy\s*\{[^}]*min-height:\s*52px/);
  assert.match(css, /\.copy\s*\{[^}]*background:\s*#0866ff/);
  assert.match(css, /\.page\s*\{[^}]*background:\s*#0a0a0a/);
});
