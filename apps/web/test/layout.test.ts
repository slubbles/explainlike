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

test("the nav stays one row on phones, with the links behind a menu button", () => {
  const narrow = css.slice(css.lastIndexOf("@media (max-width: 360px)"));
  assert.match(narrow, /\.nav \.wrap\s*\{[^}]*width:/);
  assert.match(css, /\.navuser \.who\s*\{\s*display:\s*none/);
  // the narrow bar never wraps: the inline links hide and a menu button takes their place
  const mid = css.slice(css.indexOf("@media (max-width: 600px)"), css.indexOf("@media (max-width: 360px)"));
  const navRules = (mid.match(/\.nav[^{]*\{[^}]*\}/g) ?? []).join("\n");
  assert.doesNotMatch(navRules, /flex-wrap:\s*wrap/);
  assert.match(mid, /\.navr > a\.navl[^}]*display:\s*none/);
  assert.match(mid, /\.navmenu\s*\{[^}]*display:\s*block/);
  // the menu is a button dropdown: hidden on desktop, its links render when opened
  assert.match(css, /\.navmenu\s*\{\s*display:\s*none/);
  // the menu carries the same three links as the desktop bar, and the sign-in stays put
  const nav = fs.readFileSync(path.join(import.meta.dirname, "../components/Nav.tsx"), "utf8");
  for (const href of ['href="/gallery"', 'href="/docs"', 'href="https://github.com/slubbles/explanimate"'])
    assert.equal(nav.split(href).length - 1, 2, `${href} appears inline and in the menu`);
  assert.match(nav, /<button[^>]*aria-label="Menu"/);
  assert.match(nav, /aria-expanded=\{open\}/);
  assert.match(nav, /\{open && \(/);
  assert.match(nav, /<AuthNav \/>/);
});

test("the docs page shows all three columns at 1024px and up", () => {
  const docs = fs.readFileSync(path.join(import.meta.dirname, "../app/docs/docs.module.css"), "utf8");
  assert.match(docs, /\.layout\s*\{[^}]*grid-template-columns:\s*264px minmax\(0, 1fr\) 232px/);
  // 1024-1180 only tightens the rails; the right rail stays visible
  const compact = docs.slice(docs.indexOf("@media (max-width: 1180px)"), docs.indexOf("@media (max-width: 1023px)"));
  assert.match(compact, /\.layout\s*\{[^}]*grid-template-columns:\s*232px minmax\(0, 1fr\) 200px/);
  assert.doesNotMatch(compact, /\.toc\s*\{[^}]*display:\s*none/);
});

test("below 1024px the docs sidebar collapses into the section menu", () => {
  const docs = fs.readFileSync(path.join(import.meta.dirname, "../app/docs/docs.module.css"), "utf8");
  const small = docs.slice(docs.indexOf("@media (max-width: 1023px)"));
  assert.match(small, /\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(small, /\.side\s*\{[^}]*display:\s*none/);
  assert.match(small, /\.toc\s*\{[^}]*display:\s*none/);
  assert.match(small, /\.menu\s*\{[^}]*display:\s*block/);
});
