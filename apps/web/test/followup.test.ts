import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("every paid follow-up asks once before it posts, like cancel does", () => {
  const s = src("components/ResultView.tsx");
  // the only followUp call sits behind the confirm's "Yes" button
  assert.equal(s.match(/followUp\(\{/g)?.length, 1);
  assert.match(s, /className="confirm" role="group" aria-label=\{`Render \$\{asking\.label\}\?`\}/);
  assert.match(s, /is a new paid clip\. Render it\?/);
  assert.match(s, /Yes, render it/);
  // all three entry points open the confirm instead of posting
  for (const label of ['label: "A deep dive on this box"', 'label: "A 10x what-if"', 'label: "A 100x what-if"'])
    assert.match(s, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  assert.match(s, /disabled=\{explBusy \|\| followBusy\}/);
  assert.match(s, /disabled=\{followBusy\}/);
});

test("a double-click on a paid follow-up starts a single clip", () => {
  const s = src("components/Home.tsx");
  assert.match(s, /if \(!job \|\| followingUp\) return;/);
  assert.match(s, /setFollowingUp\(true\)/);
  assert.match(s, /setFollowingUp\(false\)/);
  assert.match(s, /followBusy=\{followingUp\}/);
});

test("a finished clip without an mp4 shows no dead links", () => {
  const s = src("components/ResultView.tsx");
  assert.match(s, /const href = job\.state === "done" && mp4 \? fileUrl\(id, mp4\) : undefined;/);
  assert.match(s, /\{href \? \(\s*<a className="screen" href=\{href\}/);
  assert.match(s, /<span className="screen" aria-hidden="true">/);
  assert.match(s, /\{mp4 && \(\s*<>\s*\{" · "\}\s*<a href=\{fileUrl\(id, mp4, true\)\}>download<\/a>/);
});
