import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Architecture, type ScenePlan } from "@explanimate/core";
import { compose, loadIconPack, tidySketch, textBox, widestGap, overlaps } from "@explanimate/render";

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const plan = JSON.parse(fs.readFileSync(path.join(fx, "example-app.plan.json"), "utf8")) as ScenePlan;
const arch = JSON.parse(fs.readFileSync(path.join(fx, "example-app.architecture.json"), "utf8")) as Architecture;
const composed = compose({ plan, audio: [], theme: getTheme("chalk-dark"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });

test("exported whiteboard: notes from different scenes do not sit on each other or on boxes", async () => {
  const sk = tidySketch((await composed).sketch);
  const notes = sk.texts.map(textBox);
  const labels = sk.edges.filter((e) => e.label && e.labelBox).map((e) => e.labelBox!);
  const solid = [...sk.nodes.map((n) => n.box), ...sk.ellipses.map((e) => e.box)];
  notes.forEach((a, i) => {
    for (const b of solid) assert.ok(!overlaps(a, b), `note "${sk.texts[i].text}" covers a box or ring`);
    for (const b of [...labels, ...notes.slice(0, i)]) assert.ok(!overlaps(a, b), `note "${sk.texts[i].text}" covers another note`);
  });
});

test("exported whiteboard: no big empty bands between the title, diagram and side lists", async () => {
  const raw = (await composed).sketch;
  assert.ok(widestGap(raw, "y") > 400, "fixture should start with a big gap under the title");
  const sk = tidySketch(raw);
  assert.ok(widestGap(sk, "y") <= 160 && widestGap(sk, "x") <= 160);
});
