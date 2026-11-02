import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, specFromBrief, DEFAULT_BRIEF, walkCues, type Brief } from "@explanimate/core";
import { compose, loadIconPack, checkPlacement, placementPass, textWidth, cameraAt, readableWidth, shotStarts, type Film, type FText, type Mark, type Sketch } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});

test("every tempo: every ring, arrow and label passes the placement check before render", async () => {
  for (const complexity of ["simple", "moderate", "technical"] as Brief["complexity"][]) {
    const r = await compose({ plan, audio, theme: getTheme("chalk-dark"), spec: specFromBrief({ ...DEFAULT_BRIEF, complexity }), pack: loadIconPack(), sourceLabel: "x", arch });
    assert.deepEqual([r.placement.issues, r.placement.warnings], [[], []], complexity);
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

// a box with its name written in it (so the name cannot be enlarged), and a line arrow joining two spots
const named = (cam: { x: number; y: number; w: number; h: number }, size = 34) => {
  const f = film([{ ...text("background queue", 550, 560, size), anchor: "middle", t0: 0, dur: 0.5 }], cam);
  return { f, nodes: [{ id: "q", box: { x: 400, y: 400, w: 300, h: 200 }, color: "#fff", keyword: "background queue", t0: 0 }] as Sketch["nodes"] };
};
const line = (x0: number, x1: number, t0 = 2): Mark => ({ kind: "arrow", t0, dur: 0.5, line: true, points: [[x0, 1000], [x1, 1000]], fromBox: { x: x0 - 200, y: 950, w: 200, h: 100 }, toBox: { x: x1, y: 950, w: 200, h: 100 } });

test("an arrow past the frame edge is panned into view, not fixed by widening until the box names are too small", () => {
  // widening to take the arrow in would drop the box name under 17 px; sliding the shot keeps it at full size
  const { f, nodes } = named({ x: 0, y: 0, w: 3800, h: 2137.5 });
  const p = { film: f, sketch: sketch(nodes), marks: [line(3500, 3820)] };
  assert.deepEqual(checkPlacement(p).map((i) => i.rule), ["cropped"]);
  const rep = placementPass(p);
  assert.ok(rep.ok);
  assert.deepEqual([rep.issues, rep.warnings], [[], []]);
  assert.match(rep.fixed[0].how, /^panned/);
  assert.equal(p.film.camera[0].w, 3800);
});

test("a board arrow whose source box is out of shot is caught, and the fix brings a piece of that box in", () => {
  // the arrow is whole on screen, but the box it leaves sits left of the frame, so it seems to come from nowhere
  const nodes: Sketch["nodes"] = [
    { id: "a", box: { x: -440, y: 400, w: 400, h: 200 }, color: "#fff", keyword: "a", t0: 0 },
    { id: "b", box: { x: 800, y: 400, w: 400, h: 200 }, color: "#fff", keyword: "b", t0: 0 },
  ];
  const wire = (g: string): Mark => ({ kind: "wire", t0: 1, dur: 0.5, g, from: "a", to: "b", points: [[-40, 500], [800, 500]] });
  const p = { film: film([], { x: -60, y: 0, w: 1920, h: 1080 }), sketch: sketch(nodes), marks: [wire("b:s01-board")] };
  assert.deepEqual(checkPlacement(p).map((i) => i.rule), ["cropped"]);
  assert.ok(placementPass(p).ok);
  assert.ok(cameraAt(p.film, 2).x <= -150, "a piece of the source box is in shot");
  // a system wire may still lead off screen to a part out of shot
  assert.deepEqual(rules([wire("e:a>b")], [], nodes, { x: -60, y: 0, w: 1920, h: 1080 }), []);
});

test("an arrow cut off in a later shot is fixed in every shot it is on screen, in one fix", () => {
  const { f, nodes } = named({ x: 0, y: 0, w: 1920, h: 1080 });
  // the arrow is drawn at 2s past the right edge, and the shot at 4s slides left and cuts it again
  f.camera.push({ t: 4, x: -150, y: 0, w: 1920, h: 1080, move: 0.5 });
  const p = { film: f, sketch: sketch(nodes), marks: [line(1700, 1960)] };
  assert.equal(checkPlacement(p).filter((i) => i.rule === "cropped").length, 1);
  const rep = placementPass(p);
  assert.ok(rep.ok, JSON.stringify(rep));
  assert.deepEqual([rep.issues, rep.warnings], [[], []]);
  assert.equal(rep.fixed.length, 1);
  assert.match(rep.fixed[0].how, /0\.0s, 4\.0s/);
  assert.deepEqual(checkPlacement(p), []);
});

test("a slow pan that drags a lit word half off the frame is caught and fixed, though both shots are clean", () => {
  // the shot at 3s slides 420 px right over 1.66s: "separate networks" is whole before and gone after, but half cut for most of the move
  const mk = (move: number) => {
    const f = film([text("separate networks", 40, 500), { ...text("shared rules", 1900, 500), t0: 5 }]);
    f.camera.push({ t: 3, x: 420, y: 0, w: 1920, h: 1080, move });
    f.duration = 8;
    return { film: f, sketch: sketch(), marks: [] as Mark[] };
  };
  const p = mk(1.66);
  const found = checkPlacement(p);
  assert.deepEqual(found.map((i) => i.rule), ["cropped"]);
  assert.match(found[0].what, /while the camera moves/);
  const rep = placementPass(p);
  assert.ok(rep.ok);
  assert.deepEqual([rep.issues, rep.warnings], [[], []]);
  assert.deepEqual(checkPlacement(p), []);
  // every frame of the move now shows the word whole or for under half a second cut
  const w = textWidth("separate networks", 40);
  let cut = 0;
  for (let t = 3; t < 3 + p.film.camera[1].move; t += 0.05) {
    const c = cameraAt(p.film, t);
    if (c.x > 40 - 1 && c.x < 40 + w) cut += 0.05;
  }
  assert.ok(cut <= 0.55, `cut for ${cut.toFixed(2)}s`);
  // a quick pan that sweeps it out at once is fine as it is
  assert.deepEqual(checkPlacement(mk(0.4)), []);
});

test("text just under the minimum is a warning that does not stop the video; text far too small still fails", () => {
  // 15.4 px against 17, the leftover that used to abort a run
  const slip = named({ x: 0, y: 0, w: (34 * 1920) / 15.4, h: (34 * 1080) / 15.4 });
  const ok = placementPass({ film: slip.f, sketch: sketch(slip.nodes), marks: [] });
  assert.ok(ok.ok);
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.warnings.map((w) => w.rule), ["text-small"]);
  const broken = named({ x: 0, y: 0, w: 1920 * 4, h: 1080 * 4 });
  const bad = placementPass({ film: broken.f, sketch: sketch(broken.nodes), marks: [] });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.issues.map((w) => w.rule), ["text-small"]);
});

test("an arrow too long for any readable shot falls back to a wider one and the video goes on, with warnings", () => {
  const { f, nodes } = named({ x: 0, y: 0, w: 3800, h: 2137.5 });
  const p = { film: f, sketch: sketch(nodes), marks: [line(-200, 4100)] };
  const rep = placementPass(p);
  assert.ok(rep.ok, JSON.stringify(rep));
  assert.ok(rep.fixed.some((x) => x.rule === "cropped" && x.fallback));
  assert.ok(rep.warnings.every((w) => w.rule === "text-small"));
  assert.ok(rep.warnings.length > 0);
});

test("widening a shot to reach one word never slices another lit word at the frame edge", async () => {
  // rxi/microui at its recorded scene lengths: a new scene once panned across "feed input", and reaching step "5"
  // widened the walk's shot through "built in controls"
  const mplan = JSON.parse(fs.readFileSync(new URL("microui.plan.json", fx), "utf8"));
  const march = JSON.parse(fs.readFileSync(new URL("microui.architecture.json", fx), "utf8"));
  const secs: Record<string, number> = { "s01-hook": 10.64, "s02-layer": 11.2, "s03-layer": 11.96, "s04-layer": 7.96, "s05-walkthrough": 21.28, "s06-recap": 10.32 };
  const maudio = mplan.scenes.map((s: any) => {
    const ws = s.narration.split(/\s+/), st = secs[s.id] / ws.length;
    return { sceneId: s.id, duration: secs[s.id], words: ws.map((w: string, i: number) => ({ word: w, start: i * st, end: i * st + st * 0.8 })) };
  });
  const brief: Brief = JSON.parse(fs.readFileSync(new URL("microui.brief.json", fx), "utf8"));
  const spec = specFromBrief(brief);
  const { film } = await compose({ plan: mplan, audio: maudio, theme: getTheme(spec.look), spec, pack: loadIconPack(), sourceLabel: "x", arch: march });
  const op = (g: string | undefined, t: number) => {
    const k = g ? film.groups[g] : undefined;
    if (!k?.length) return 1;
    let v = k[0][1];
    for (const [kt, kv] of k) if (kt <= t) v = kv;
    return v;
  };
  const end = film.end?.t0 ?? film.duration;
  for (const k of film.camera) {
    const r = k.t + k.move + 0.05;
    if (r >= end) continue;
    for (const e of film.elements) {
      if (e.k !== "text" || e.t0 + e.dur > r || op(e.g, r) < 0.6 || (e as FText).size < 20) continue;
      const t = e as FText, w = textWidth(t.text, t.size), x = t.anchor === "middle" ? t.x - w / 2 : t.anchor === "end" ? t.x - w : t.x;
      const inside = x >= k.x && x + w <= k.x + k.w, outside = x + w <= k.x || x >= k.x + k.w;
      assert.ok(inside || outside, `"${t.text}" sliced by the shot at ${k.t.toFixed(1)}s`);
    }
  }
});

test("the walkthrough follows the walk up close instead of showing the whole board the whole time", async () => {
  // rxi/microui (run microui7): the last step runs back across the whole board, and that one wide shot
  // used to pull the entire 19 s walk out to an unreadable full-board view
  const read = (n: string) => JSON.parse(fs.readFileSync(new URL(`microui7.${n}.json`, fx), "utf8"));
  const mplan = read("plan"), march = read("architecture"), brief: Brief = read("brief");
  const secs: Record<string, number> = { "s01-hook": 10.82, "s02-layer": 10.02, "s03-layer": 13.98, "s04-layer": 8.66, "s05-walkthrough": 19.42, "s06-recap": 14.74 };
  const maudio = mplan.scenes.map((s: any) => {
    const ws = s.narration.split(/\s+/), st = (secs[s.id] - 1.2) / ws.length;
    return { sceneId: s.id, duration: secs[s.id] - 1.2, words: ws.map((w: string, i: number) => ({ word: w, start: i * st, end: i * st + st * 0.8 })) };
  });
  const spec = specFromBrief(brief);
  const { film, pace, timeline } = await compose({ plan: mplan, audio: maudio, theme: getTheme(spec.look), spec, pack: loadIconPack(), sourceLabel: "x", arch: march });
  const walk = timeline.find((s) => s.kind === "walkthrough")!;
  const RW = readableWidth(film);
  let close = 0;
  for (let t = walk.start + 0.05; t < walk.end; t += 0.1) if (cameraAt(film, t).w <= RW) close += 0.1;
  assert.ok(close / (walk.end - walk.start) >= 0.6, `readable for ${close.toFixed(1)} of ${(walk.end - walk.start).toFixed(1)} s`);
  assert.ok(shotStarts(film).filter((t) => t > walk.start - 0.01 && t < walk.end).length >= 3, "the walk gets a shot per stretch of steps");
  assert.ok(pace.shortestHold >= 4 - 0.05, `no shot under 4 s: shortest hold ${pace.shortestHold}`);
  assert.ok(pace.cutsPerMin >= 6.5 && pace.cutsPerMin <= 9, `${pace.cutsPerMin} cuts a minute`);
});

test("a long repo recap moves through the trip instead of holding one wide frame", async () => {
  // rxi/microui (run microui8): a small five-part board sat on one frame for the last 30 s, the recipe
  // drawer scene and the whole 16 s recap, at 3.7 cuts a minute
  const read = (n: string) => JSON.parse(fs.readFileSync(new URL(`microui8.${n}.json`, fx), "utf8"));
  const mplan = read("plan"), march = read("architecture"), brief: Brief = read("brief");
  const secs: Record<string, number> = { "s01-hook": 15.82, "s02-layer": 10.78, "s03-layer": 12.3, "s04-walkthrough": 17.5, "s05-layer": 8.54, "s06-recap": 16.3 };
  const maudio = mplan.scenes.map((s: any) => {
    const ws = s.narration.split(/\s+/), st = (secs[s.id] - 1.2) / ws.length;
    return { sceneId: s.id, duration: secs[s.id] - 1.2, words: ws.map((w: string, i: number) => ({ word: w, start: i * st, end: i * st + st * 0.8 })) };
  });
  const spec = specFromBrief(brief);
  const { film, pace, timeline } = await compose({ plan: mplan, audio: maudio, theme: getTheme(spec.look), spec, pack: loadIconPack(), sourceLabel: "x", arch: march });
  const recap = timeline.find((s) => s.kind === "recap")!, layer = timeline.find((s) => s.id === "s05-layer")!;
  const inRecap = shotStarts(film).filter((t) => t > recap.start - 0.01 && t < recap.end);
  assert.ok(inRecap.length >= 2, `recap shots at ${inRecap.join(", ")}`);
  assert.ok(pace.shortestHold >= 4 - 0.05, `no shot under 4 s: shortest hold ${pace.shortestHold}`);
  assert.ok(pace.cutsPerMin >= 5, `${pace.cutsPerMin} cuts a minute`);
  // the 15.8 s opening was one shot; it is now the hook line, a push-in on the title, and a pull back at a sentence end
  const hook = timeline[0], inHook = shotStarts(film).filter((t) => t < hook.end - 0.01);
  assert.equal(inHook.length, 2, `hook shots at ${inHook.join(", ")}`);
  const words = maudio[0].words, said = (t: number) => words.filter((w: any) => w.end + 0.3 <= t).pop();
  assert.match(said(inHook[1])!.word, /[.!?]$/, `the pull back at ${inHook[1]} s comes after a full sentence`);
  const icons = film.elements.filter((e) => e.g === "hook" && e.k === "img");
  assert.ok(icons.every((e) => e.t0 > inHook[1]), "the preview icons are drawn after the reveal starts, not off frame");
});

test("each walkthrough step fires on the words that tell it, not on a recited label", async () => {
  // the example-app walk is told in plain sentences; every dot must leave when its step is said
  const { film, timeline } = await compose({ plan, audio, theme: getTheme("chalk-dark"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });
  const walk = timeline.find((s) => s.kind === "walkthrough")!;
  const scene = plan.scenes.find((s: any) => s.kind === "walkthrough");
  const ws = audio.find((a: any) => a.sceneId === scene.id).words;
  const cues = walkCues(ws.map((w: any) => w.word), arch);
  assert.ok(cues.every((k) => k >= 0), `every step is told: ${cues}`);
  const dots = film.elements.filter((e: any) => e.k === "dot" && e.g === "walk").map((e) => e.t0).sort((a, b) => a - b);
  assert.equal(dots.length, arch.walkthrough.steps.length);
  // the said word's time in the film is the scene's voice start plus its offset; spacing may push a step back by under a second
  const lead = Math.min(...dots.slice(1).map((t, i) => t - ws[cues[i + 1]].start));
  assert.ok(lead >= walk.start - 0.01 && lead < walk.start + 1, `voice starts ${(lead - walk.start).toFixed(2)} s into the walk`);
  dots.slice(1).forEach((t, i) => assert.ok(t - lead - ws[cues[i + 1]].start < 1.0, `step ${i + 2} at ${t.toFixed(2)}, said at ${(lead + ws[cues[i + 1]].start).toFixed(2)}`));
  // the first dot leaves as the scene opens (the board never waits on an empty walk) and never after its step is said
  assert.ok(dots[0] <= lead + ws[cues[0]].start + 0.01 && dots[0] >= walk.start, `step 1 at ${dots[0].toFixed(2)}`);
});
