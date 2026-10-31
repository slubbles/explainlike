import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Architecture, type ScenePlan } from "@explainlike/core";
import { compose, loadIconPack, spokenHeading, unspokenWords } from "@explainlike/render";

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const plan = JSON.parse(fs.readFileSync(path.join(fx, "spotibai.plan.json"), "utf8")) as ScenePlan;
const arch = JSON.parse(fs.readFileSync(path.join(fx, "spotibai.architecture.json"), "utf8")) as Architecture;
const composed = compose({ plan, audio: [], theme: getTheme("chalk-dark"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "github.com/slubbles/spotibai", arch, colorOf: (c) => (c.kind === "database" ? "blue" : "white") as any });

test("the heading uses words the narrator says", () => {
  const n = "At ten times traffic, d1 read overload hits because every feed scans all rows.";
  assert.deepEqual(unspokenWords("d1 catalog overload", n), ["catalog"]);
  assert.equal(spokenHeading("d1 catalog overload", n, ["d1 read overload"]), "d1 read overload");
  assert.equal(spokenHeading("Cache Purge Pain", "purge rate limits stall year-long cache, the pain", []), "cache purge pain");
  assert.equal(spokenHeading("product requirements", "It must scroll", []), "product requirements");
});

test("spotibai scale scenes read the same words they say", async () => {
  const { film, timeline } = await composed;
  for (const s of plan.scenes.filter((x) => x.kind === "scale")) {
    const at = timeline.find((x) => x.id === s.id)!;
    const h = film.headings.find((x) => x.t0 === at.start)!;
    assert.deepEqual(unspokenWords(h.text, s.narration), [], `heading "${h.text}" vs "${s.narration}"`);
  }
});
