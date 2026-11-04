import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// a browser check (Playwright at 305/345/375/1440) backs these; the CSS guards keep the fix from sliding back
const css = fs.readFileSync(path.join(import.meta.dirname, "../app/globals.css"), "utf8");

test("the result page keeps source order on phones: video, title and downloads, then the Q&A panel", () => {
  assert.doesNotMatch(css, /\.col\s*\{[^}]*display:\s*contents/);
  assert.doesNotMatch(css, /\.side\s*\{[^}]*[;{\s]order:/);
  const view = fs.readFileSync(path.join(import.meta.dirname, "../components/ResultView.tsx"), "utf8");
  assert.ok(view.indexOf("<Player") < view.indexOf('className="under"'));
  assert.ok(view.indexOf('className="under"') < view.indexOf('className="side'));
});

test("the nav has narrow-screen rules so it never scrolls sideways", () => {
  const narrow = css.slice(css.lastIndexOf("@media (max-width: 360px)"));
  assert.match(narrow, /\.nav \.wrap\s*\{[^}]*width:/);
  assert.match(narrow, /\.gh\s*\{[^}]*padding:/);
  assert.match(css, /\.navuser \.who\s*\{\s*display:\s*none/);
});
