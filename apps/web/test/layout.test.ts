import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// a browser check (Playwright at 305/345/375/1440) backs these; the CSS guards keep the fix from sliding back
const css = fs.readFileSync(path.join(import.meta.dirname, "../app/globals.css"), "utf8");

test("the result page reads title, video, downloads, then the Q&A panel on phones", () => {
  assert.doesNotMatch(css, /\.col\s*\{[^}]*display:\s*contents/);
  assert.doesNotMatch(css, /\.side\s*\{[^}]*[;{\s]order:/);
  const view = fs.readFileSync(path.join(import.meta.dirname, "../components/ResultView.tsx"), "utf8");
  assert.ok(view.indexOf('className="under"') < view.indexOf("<Player"));
  assert.ok(view.indexOf("<Player") < view.indexOf('className="dl"'));
  assert.ok(view.indexOf('className="dl"') < view.indexOf('className="side'));
  // wide screens keep the video above the title through order, not source
  const wide = css.slice(css.indexOf("@media (min-width: 901px)"));
  assert.match(wide, /\.main \.col > \.player\s*\{[^}]*order:\s*-1/);
  assert.match(wide, /\.main \.col > \.under\s*\{[^}]*order:\s*0/);
});

test("a long unbroken result title wraps instead of scrolling the page sideways", () => {
  assert.match(css, /\.under \.t\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test("hover labels on edge tap targets flip inside the video instead of clipping", () => {
  assert.match(css, /\.hit\.below \.tipchip\s*\{[^}]*bottom:\s*-6px/);
  assert.match(css, /\.hit\.rl \.tipchip\s*\{[^}]*left:\s*0/);
  assert.match(css, /\.hit\.rr \.tipchip\s*\{[^}]*right:\s*0/);
});

test("the nav has narrow-screen rules so it never scrolls sideways", () => {
  const narrow = css.slice(css.lastIndexOf("@media (max-width: 360px)"));
  assert.match(narrow, /\.nav \.wrap\s*\{[^}]*width:/);
  assert.match(narrow, /\.gh\s*\{[^}]*padding:/);
  assert.match(css, /\.navuser \.who\s*\{\s*display:\s*none/);
  // with auth on, the pills outgrow 305px: the narrow nav wraps instead of overflowing
  const mid = css.slice(css.indexOf("@media (max-width: 600px)"), css.indexOf("@media (max-width: 360px)"));
  assert.match(mid, /\.nav \.wrap\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(mid, /\.navr\s*\{[^}]*flex-wrap:\s*wrap/);
});
