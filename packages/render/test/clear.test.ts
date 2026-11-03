import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Architecture, type ScenePlan } from "@explanimate/core";
import { compose, loadIconPack, maskGroup, backdropSlips, clearShots, HEADING_ZONE } from "@explanimate/render";

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => ({
  plan: JSON.parse(fs.readFileSync(path.join(fx, `${name}.plan.json`), "utf8")) as ScenePlan,
  arch: JSON.parse(fs.readFileSync(path.join(fx, `${name}.architecture.json`), "utf8")) as Architecture,
});
const voiced = (plan: ScenePlan) => plan.scenes.map((s) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w, i) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});
const build = (name: string) => {
  const { plan, arch } = load(name);
  return compose({ plan, arch, audio: voiced(plan), theme: getTheme("chalk-dark"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: `github.com/x/${name}` });
};

test("maskGroup fades a group out over a span and back after it, keeping its own keys", () => {
  const keys: [number, number][] = [[0, 1], [0.5, 0.3]];
  const m = maskGroup(keys, [{ from: 2, to: 4, fade: 0.5 }]);
  const at = (t: number) => { for (let i = 1; i < m.length; i++) if (t < m[i][0]) { const [a, va] = m[i - 1], [b, vb] = m[i]; return va + ((vb - va) * (t - a)) / Math.max(1e-6, b - a); } return m[m.length - 1][1]; };
  assert.equal(at(1), 0.3);
  assert.equal(at(3), 0);
  assert.equal(at(4.2), 0.15);
  assert.equal(at(5), 0.3);
  // two spans that touch are one hidden stretch, with no flash back in between
  const two = maskGroup([[0, 0.3]], [{ from: 2, to: 4, fade: 0.5 }, { from: 4, to: 6, fade: 0.5 }]);
  assert.ok(two.filter(([t]) => t > 2.5 && t < 6).every(([, v]) => v === 0), JSON.stringify(two));
});

test("a dimmed box the shot would slice, or that sits under the heading, is faded for that hold", () => {
  const film = {
    width: 1920, height: 1080, fps: 24, duration: 10,
    camera: [{ t: 0, x: 0, y: 0, w: 1920, h: 1080, move: 0 }, { t: 5, x: 0, y: 0, w: 1920, h: 1080, move: 1 }],
    groups: { cut: [[0, 0.3]], top: [[0, 0.3]], fine: [[0, 0.3]], lit: [[0, 1]] },
    elements: [], headings: [], captions: [], fades: [],
  } as any;
  const hidden = clearShots(film, [
    { g: "cut", t0: 0, box: { x: 1800, y: 400, w: 300, h: 200 } },
    { g: "top", t0: 0, box: { x: 300, y: HEADING_ZONE - 40, w: 300, h: 200 } },
    { g: "fine", t0: 0, box: { x: 600, y: 400, w: 300, h: 200 } },
    { g: "lit", t0: 0, box: { x: 1800, y: 600, w: 300, h: 200 } },
  ]);
  assert.deepEqual([...new Set(hidden.map((h) => h.g))].sort(), ["cut", "top"]);
  assert.deepEqual(film.groups.fine, [[0, 0.3]]);
  assert.deepEqual(film.groups.lit, [[0, 1]], "what the shot is about is never faded by this pass");
});

for (const name of ["nanochat", "clipfeed", "microui"]) {
  test(`${name}: no dimmed box or label is sliced by the frame or drawn under the heading`, async () => {
    const { film, backdrops, cleared } = await build(name);
    const slips = backdropSlips(film, backdrops);
    assert.deepEqual(slips.slice(0, 5), [], `${slips.length} slip(s)`);
    if (name === "nanochat") assert.ok(cleared.length > 0, "the nanochat film had dimmed boxes at the frame edge to clear");
  });
}
