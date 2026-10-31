import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, specFromBrief, DEFAULT_BRIEF, type Brief } from "@explainlike/core";
import { compose, loadIconPack, checkPlacement, placementPass, type Film, type FText, type Mark, type Sketch } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("spotibai.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("spotibai.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});

test("every tempo: every ring, arrow and label passes the placement check before render", async () => {
  for (const complexity of ["simple", "moderate", "technical"] as Brief["complexity"][]) {
    const r = await compose({ plan, audio, theme: getTheme("chalk-dark"), spec: specFromBrief({ ...DEFAULT_BRIEF, complexity }), pack: loadIconPack(), sourceLabel: "x", arch });
    assert.deepEqual(r.placement.issues, [], complexity);
    assert.ok(r.placement.ok);
    // the check really looked: rings, arrows, wires, labels and the frame
    for (const rule of ["ring-pad", "ring-centre", "ring-crosses", "label-overlap", "arrow-touch", "cropped", "text-small"]) assert.ok((r.placement.checked[rule] ?? 0) > 0, `${complexity}: nothing checked for ${rule}`);
    assert.deepEqual(checkPlacement(r), [], `${complexity}: a fresh check after the fixes still finds problems`);
  }
});

// a tiny hand-made board, one fault at a time
const film = (elements: FText[], cam = { x: 0, y: 0, w: 1920, h: 1080 }): Film => ({
  width: 1920, height: 1080, fps: 30, duration: 10, elements, groups: {}, headings: [], captions: [], fades: [], brand: "",
  camera: [{ t: 0, ...cam, move: 0 }],
  theme: { background: "#000", ink: "#fff", accent: "#f00", caption: { color: "#fff", highlight: "#ff0", background: "#000" } }, fonts: { hand: "", sans: "" },
});
const sketch = (nodes: Sketch["nodes"] = []): Sketch => ({ nodes, edges: [], ellipses: [], polygons: [], texts: [], images: [] });
const text = (s: string, x: number, y: number, size = 40): FText => ({ k: "text", id: s, text: s, x, y, size, color: "#fff", t0: 0.5, dur: 0.5 });
const box = { x: 400, y: 400, w: 300, h: 200 };
const rules = (marks: Mark[], els: FText[] = [], nodes: Sketch["nodes"] = [], cam?: { x: number; y: number; w: number; h: number }) =>
  checkPlacement({ film: film(els, cam), sketch: sketch(nodes), marks }).map((i) => i.rule);

test("a ring that hugs its box, sits off centre or runs through a word is caught", () => {
  assert.deepEqual(rules([{ kind: "ring", t0: 1, dur: 0.5, shape: { k: "rect", box: { x: 390, y: 390, w: 320, h: 220 } }, target: box }]), []);
  assert.deepEqual(rules([{ kind: "ring", t0: 1, dur: 0.5, shape: { k: "rect", box: { x: 400, y: 400, w: 300, h: 200 } }, target: box }]), ["ring-pad"]);
  assert.ok(rules([{ kind: "ring", t0: 1, dur: 0.5, shape: { k: "circle", cx: 580, cy: 500, r: 260 }, target: box }]).includes("ring-centre"));
  assert.deepEqual(rules([{ kind: "ring", t0: 1, dur: 0.5, shape: { k: "rect", box: { x: 390, y: 390, w: 320, h: 220 } }, target: box }], [text("crossed", 300, 400)]), ["ring-crosses"]);
});

test("labels on a line or an arrow, and arrows short of what they join, are caught", () => {
  const wire: Mark = { kind: "wire", t0: 0, dur: 0.5, points: [[100, 300], [900, 300]] };
  assert.deepEqual(rules([wire], [text("on the line", 300, 315)]), ["label-overlap"]);
  assert.deepEqual(rules([wire], [text("clear of it", 300, 260)]), []);
  const arrow = (gap: number): Mark => {
    const x0 = 700 + gap, tip = 1000;
    return { kind: "arrow", t0: 1, dur: 0.5, points: [[tip, 500], [tip - 60, 450], [tip - 60, 480], [x0, 480], [x0, 520], [tip - 60, 520], [tip - 60, 550]], fromBox: { x: 400, y: 400, w: 300, h: 200 }, toBox: { x: 1006, y: 400, w: 200, h: 200 } };
  };
  assert.deepEqual(rules([{ ...arrow(4), line: false } as Mark].map((m) => ({ ...m, fromBox: undefined, fromShape: { k: "rect", box: { x: 400, y: 400, w: 304, h: 200 } } }) as Mark)), []);
  assert.deepEqual(rules([{ ...arrow(60), fromBox: undefined, fromShape: { k: "rect", box: { x: 400, y: 400, w: 300, h: 200 } } } as Mark]), ["arrow-touch"]);
});

test("words cut off by the frame or too small to read are caught, and the fix passes mend what they can", () => {
  assert.deepEqual(rules([], [text("half out", 1850, 500)]), ["cropped"]);
  assert.deepEqual(rules([], [text("tiny", 500, 500, 20)], [], { x: 0, y: 0, w: 3840, h: 2160 }), ["text-small"]);
  // a free label too small in a wide shot is enlarged; a label off the edge widens the shot
  const p = { film: film([text("tiny", 500, 500, 20), text("half out", 1850, 500)], { x: 0, y: 0, w: 3840, h: 2160 }), sketch: sketch(), marks: [] as Mark[] };
  p.film.elements[1] = { ...(p.film.elements[1] as FText), x: 3790 };
  const rep = placementPass(p);
  assert.ok(rep.ok, JSON.stringify(rep.issues));
  assert.deepEqual(rep.fixed.map((f) => f.rule).sort(), ["cropped", "text-small"]);
});
