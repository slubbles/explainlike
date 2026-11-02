import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Architecture, type ScenePlan } from "@explanimate/core";
import { compose, loadIconPack, wordOpacities, revealWords, stageHtml } from "@explanimate/render";

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const plan = JSON.parse(fs.readFileSync(path.join(fx, "spotibai.plan.json"), "utf8")) as ScenePlan;
const arch = JSON.parse(fs.readFileSync(path.join(fx, "spotibai.architecture.json"), "utf8")) as Architecture;
const composed = compose({ plan, audio: [], theme: getTheme("chalk-dark"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "github.com/slubbles/spotibai", arch, colorOf: (c) => (c.kind === "database" ? "blue" : "white") as any });

test("text reveals whole words only: every word is either hidden, fading as a unit, or shown", () => {
  for (const n of [1, 2, 4, 9]) {
    assert.deepEqual(wordOpacities(n, 0), Array(n).fill(0));
    assert.deepEqual(wordOpacities(n, 1), Array(n).fill(1));
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const o = wordOpacities(n, p);
      for (let i = 1; i < n; i++) assert.ok(o[i] <= o[i - 1] + 1e-9, "earlier words first");
    }
  }
  assert.deepEqual(revealWords("repo to whiteboard video"), ["repo ", "to ", "whiteboard ", "video"]);
  assert.equal(revealWords("repo to whiteboard video").join(""), "repo to whiteboard video");
  // the stage runs the same function; it must survive being serialised into the page
  const again = new Function(`return (${wordOpacities.toString()})`)();
  assert.deepEqual(again(3, 0.5), wordOpacities(3, 0.5));
});

test("the stage no longer wipes text by pixels", async () => {
  const { film } = await composed;
  const html = stageHtml(film);
  assert.ok(html.includes("const wordOpacities = "));
  assert.ok(!/clipPath = `inset/.test(html), "heading reveal is per word, not a clip");
  assert.ok(!/clip-path", `url\(#c_/.test(html), "canvas text is not clipped");
});
