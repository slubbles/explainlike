import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTheme, getLevel, agreementSlips } from "@metual/core";
import { compose, loadIconPack, captureFrames, captionsFor, type Film } from "../src/index.js";
import { ringOf } from "../src/annotate.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});

test("captions find free space: none covers a box, an arrow or a label on a still frame, and barely brushes one mid-glide", { timeout: 120_000 }, async () => {
  for (const theme of ["pen-light", "caleb-dark"]) {
    const { film } = await compose({ plan, audio, theme: getTheme(theme), level: getLevel("interviewing"), pack: loadIconPack(), sourceLabel: "x", arch, pace: "lively" });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metual-cap-"));
    const { captions } = await captureFrames(film, dir, { only: [0], workers: 1 });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(captions.length, film.captions.length);
    const covering = captions.filter((c) => c.overlapPx > 0 || c.movingPx > 4).map((c) => `${c.t0.toFixed(1)}s "${c.text}" ${c.spot} ${c.overlapPx}px still, ${c.movingPx}px moving`);
    assert.deepEqual(covering, [], theme);
  }
});

test("beside a screenshot, captions use its empty margins, stacking on two lines, and stay put", { timeout: 60_000 }, async () => {
  // a page screenshot: plain light margins around a dark post in the middle
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#f4f1ea"/><rect x="420" y="0" width="760" height="900" fill="#15171c"/></svg>`;
  const href = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const words = (text: string, at: number) => text.split(" ").map((w, i) => ({ w, s: at + i * 0.3, e: at + i * 0.3 + 0.25 }));
  const film = {
    width: 1920, height: 1080, fps: 30, duration: 6,
    theme: { background: "#f4f1ea", ink: "#222", accent: "#0866FF", caption: { color: "#fff", highlight: "#0866FF", background: "#111" } },
    fonts: { hand: "sans-serif", sans: "sans-serif" },
    elements: [{ k: "img", id: "shot", t0: 0, dur: 0.2, href, x: 0, y: 0, w: 1920, h: 1080, anim: "fade" }],
    groups: {}, camera: [{ t: 0, x: 0, y: 0, w: 1920, h: 1080, move: 0 }], headings: [], fades: [], brand: "metual",
    captions: [
      { t0: 1, t1: 2.6, scene: "s1", words: words("This is Karpathy’s post", 1) },
      { t0: 2.6, t1: 4.2, scene: "s1", words: words("announcing a tiny chat", 2.6) },
    ],
  } as Film;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metual-cap-"));
  const { captions } = await captureFrames(film, dir, { only: [0], workers: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(captions.map((c) => c.overlapPx), [0, 0]);
  assert.ok(captions[0].stacked, "one line is too wide for the margin");
  assert.equal(captions[1].spot, captions[0].spot);
});

test("a caption spoken over a black section card stays on screen", { timeout: 60_000 }, async () => {
  const words = (text: string, at: number) => text.split(" ").map((w, i) => ({ w, s: at + i * 0.3, e: at + i * 0.3 + 0.25 }));
  const film = {
    width: 1920, height: 1080, fps: 30, duration: 4,
    theme: { background: "#f4f1ea", ink: "#222", accent: "#0866FF", caption: { color: "#111", highlight: "#0866FF", background: "#fff" } },
    fonts: { hand: "sans-serif", sans: "sans-serif" },
    elements: [], groups: {}, camera: [{ t: 0, x: 0, y: 0, w: 1920, h: 1080, move: 0 }], headings: [], fades: [], brand: "metual",
    cards: [{ t0: 1, t1: 3, text: "what breaks" }],
    captions: [{ t0: 1.5, t1: 2.8, scene: "s1", words: words("and fixes or drops", 1.5) }],
  } as unknown as Film;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metual-cap-"));
  await captureFrames(film, dir, { only: [66], workers: 1 });
  const sharp = (await import("sharp")).default;
  // the bottom band of the frame: the card is black there, the caption pill is light
  const { data } = await sharp(path.join(dir, "f000066.jpg")).extract({ left: 0, top: 820, width: 1920, height: 200 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  fs.rmSync(dir, { recursive: true, force: true });
  const light = data.filter((v) => v > 200).length;
  assert.ok(light > 5000, `caption hidden under the card (${light} light pixels)`);
});

test("a caption phrase never reads as a grammar slip on its own: 'a pasted link become' is never shown without 'how does'", () => {
  const said = "The question: how does a pasted link become a watchable video?".split(" ");
  const words = said.map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const caps = captionsFor("s1", words, 0, 10, 4, 26);
  const shown = caps.map((c) => c.words.map((w) => w.w).join(" "));
  assert.equal(shown.join(" "), said.join(" "));
  assert.ok(!shown.some((p) => /(^| )how$/.test(p)), shown.join(" | "));
  for (const p of shown) assert.deepEqual(agreementSlips(p), [], p);
});

test("a sentence's last word stays with its phrase instead of opening the next one alone", () => {
  const said = "This box is you, the viewer, pasting a link into the web app. You paste and watch here. You paste a GitHub, X, or article link.".split(" ");
  const words = said.map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const shown = captionsFor("s1", words, 0, 20, 4, 26).map((c) => c.words.map((w) => w.w).join(" "));
  assert.equal(shown.join(" "), said.join(" "));
  assert.ok(shown.includes("You paste and watch here."), shown.join(" | "));
  for (const p of shown) assert.ok(!/[.!?] \S/.test(p), `a phrase runs across a sentence end: "${p}"`);
});

test("a phrase spoken fast is not flashed on its own: it takes the next words, so every phrase stays up long enough to read", () => {
  // real timings from the voiceover: "the back of the" was spoken in under half a second
  const t = [["and", 3.44, 3.52], ["it", 3.52, 3.68], ["does", 3.68, 3.92], ["the", 3.92, 4], ["back", 4, 4.24], ["of", 4.24, 4.4], ["the", 4.4, 4.48], ["envelope", 4.48, 4.96], ["math,", 4.96, 5.68], ["and", 5.76, 6], ["shows", 6, 6.32], ["where", 6.32, 6.56], ["the", 6.56, 6.72], ["design", 6.72, 7.04], ["breaks.", 7.04, 7.44]] as const;
  const words = t.map(([word, start, end]) => ({ word, start, end }));
  const caps = captionsFor("s1", words, 0, 20, 4, 26);
  assert.equal(caps.flatMap((c) => c.words.map((w) => w.w)).join(" "), t.map((x) => x[0]).join(" "));
  for (const [i, c] of caps.entries()) {
    const up = (caps[i + 1]?.t0 ?? c.t1) - c.t0;
    assert.ok(up >= 0.7 || i === caps.length - 1, `"${c.words.map((w) => w.w).join(" ")}" is up for only ${up.toFixed(2)} s`);
    assert.ok(c.words.map((w) => w.w).join(" ").length <= 30);
  }
});

test("when even a stacked caption is too wide for the only free margin, a smaller stacked caption fits there instead of covering the post", { timeout: 60_000 }, async () => {
  // a dark post filling all but a thin light strip on each side (the corner pixel is the page colour)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#f4f1ea"/><rect x="30" y="0" width="1220" height="900" fill="#15171c"/></svg>`;
  const href = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const words = (text: string, at: number) => text.split(" ").map((w, i) => ({ w, s: at + i * 0.3, e: at + i * 0.3 + 0.25 }));
  const film = {
    width: 1920, height: 1080, fps: 30, duration: 4,
    theme: { background: "#f4f1ea", ink: "#222", accent: "#0866FF", caption: { color: "#fff", highlight: "#0866FF", background: "#111" } },
    fonts: { hand: "sans-serif", sans: "sans-serif" },
    elements: [{ k: "img", id: "shot", t0: 0, dur: 0.2, href, x: 0, y: 0, w: 1920, h: 1080, anim: "fade" }],
    groups: {}, camera: [{ t: 0, x: 0, y: 0, w: 1920, h: 1080, move: 0 }], headings: [], fades: [], brand: "metual",
    captions: [{ t0: 1, t1: 2.6, scene: "s1", words: words("and it explains the", 1) }],
  } as Film;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metual-cap-"));
  const { captions } = await captureFrames(film, dir, { only: [0], workers: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(captions[0].overlapPx, 0, JSON.stringify(captions[0]));
  assert.ok(captions[0].small, JSON.stringify(captions[0]));
});

test("a caption keeps clear of the box it talks about and its ring, also while the camera drifts slowly", { timeout: 60_000 }, async () => {
  const words = (text: string, at: number) => text.split(" ").map((w, i) => ({ w, s: at + i * 0.3, e: at + i * 0.3 + 0.25 }));
  // the ring ends ~20 px above the lowest caption spot, as at "because every job's files" in the 10x film
  const box = { x: 760, y: 618, w: 400, h: 260 };
  const ring = ringOf(box);
  const d = "M" + ring.points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
  const film = {
    width: 1920, height: 1080, fps: 30, duration: 6,
    theme: { background: "#f4f1ea", ink: "#222", accent: "#0866FF", caption: { color: "#111", highlight: "#0866FF", background: "#fff" } },
    fonts: { hand: "sans-serif", sans: "sans-serif" },
    elements: [
      { k: "path", id: "box", t0: 0, dur: 0.2, d: `M${box.x} ${box.y} h${box.w} v${box.h} h${-box.w} Z`, stroke: "#4465e9", sw: 4 },
      { k: "path", id: "ring", t0: 0.2, dur: 0.3, d, stroke: "#e03131", sw: 5, anim: "draw" },
    ],
    groups: {},
    // a slow drift over the whole caption, like the scale scenes' glides
    camera: [{ t: 0, x: 0, y: 0, w: 1920, h: 1080, move: 0 }, { t: 1, x: 8, y: 4, w: 1904, h: 1071, move: 3 }],
    headings: [], fades: [], brand: "metual",
    captions: [{ t0: 1, t1: 3, scene: "s1", at: box, words: words("because every job's files", 1) }],
  } as unknown as Film;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metual-cap-"));
  const { captions } = await captureFrames(film, dir, { only: [0], workers: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
  const r = captions[0].rect!;
  assert.equal(captions[0].overlapPx, 0, JSON.stringify(captions[0]));
  // a slow drift is not a fast move: nothing is covered while it runs either
  assert.equal(captions[0].movingPx, 0, JSON.stringify(captions[0]));
  // the ring on screen when the caption appears (the glide has just begun), and a clear border beyond it
  const rb = ring.box;
  const gap = Math.max(rb.x - (r.x + r.w), r.x - (rb.x + rb.w), rb.y - (r.y + r.h), r.y - (rb.y + rb.h));
  assert.ok(gap >= 24, `caption ${JSON.stringify(r)} sits ${gap.toFixed(0)} px from the ring ${JSON.stringify(rb)}`);
});

test("a phrase does not end on a word that leads into the next, and is not replaced before its last word is said", () => {
  // the real voiceover timings ("just" was said 0.08 s after the next phrase replaced it), and a faster read
  const t = [["Want", 0.16, 0.48], ["more?", 0.48, 1.12], ["Render", 1.12, 1.44], ["a", 1.76, 1.92], ["twenty", 1.92, 2.16], ["second", 2.16, 2.4], ["deep", 2.4, 2.72], ["dive", 2.72, 2.96], ["on", 2.96, 3.12], ["just", 3.12, 3.28], ["that", 3.28, 3.52], ["box.", 3.52, 3.92]] as const;
  const fast = [["Want", 0, 0.2], ["more?", 0.2, 0.6], ["Render", 0.9, 1.2], ["a", 1.2, 1.28], ["twenty", 1.28, 1.6], ["second", 1.6, 1.96], ["deep", 1.96, 2.2], ["dive", 2.2, 2.5], ["on", 2.5, 2.62], ["just", 2.62, 2.92], ["that", 2.84, 3.04], ["box.", 3.04, 3.5]] as const;
  for (const tt of [t, fast]) check(tt);
});
function check(t: readonly (readonly [string, number, number])[]) {
  const words = t.map(([word, start, end]) => ({ word, start, end }));
  const caps = captionsFor("s1", words, 0, 20, 4, 26);
  const shown = caps.map((c) => c.words.map((w) => w.w).join(" "));
  assert.equal(shown.join(" "), t.map((x) => x[0]).join(" "));
  for (const p of shown.slice(0, -1)) assert.ok(!/ (a|the|of|on|to|just)$/i.test(p), `a phrase ends on a leading word: "${p}" (${shown.join(" | ")})`);
  for (const c of caps) for (const w of c.words) assert.ok(c.t0 <= w.s + 1e-9 && c.t1 >= w.e - 1e-9, `"${w.w}" is said ${w.s}-${w.e} but its phrase is up ${c.t0.toFixed(2)}-${c.t1.toFixed(2)}`);
  // moving the leading words on must not leave a phrase that flashes by ("deep dive" for half a second)
  for (const c of caps) assert.ok(c.t1 - c.t0 >= 0.7, `"${c.words.map((w) => w.w).join(" ")}" is up only ${(c.t1 - c.t0).toFixed(2)} s (${shown.join(" | ")})`);
}

test("a phrase does not break inside a noun phrase: 'the back of the envelope math' and 'the resulting video' stay whole", () => {
  for (const [line, whole] of [
    ["Point it at a real app, at interview level, and it does the back of the envelope math, and shows where the design breaks.", "the back of the envelope math,"],
    ["You paste a GitHub, X, or article link into the box to start a video. Then you watch the resulting video in the player.", "the resulting video"],
    ["A few minutes later, you get a narrated whiteboard video, drawn piece by piece.", "a narrated whiteboard video,"],
  ]) {
    for (const [maxWords, maxChars] of [[4, 26], [8, 46]]) {
      const said = line.split(" ");
      const words = said.map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
      const shown = captionsFor("s1", words, 0, 30, maxWords, maxChars).map((c) => c.words.map((w) => w.w).join(" "));
      assert.equal(shown.join(" "), line);
      assert.ok(shown.some((p) => p.includes(whole)), `"${whole}" is split: ${shown.join(" | ")}`);
    }
  }
});
