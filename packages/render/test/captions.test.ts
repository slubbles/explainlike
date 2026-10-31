import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTheme, getLevel, agreementSlips } from "@metual/core";
import { compose, loadIconPack, captureFrames, captionsFor, type Film } from "../src/index.js";

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

test("a caption phrase never reads as a grammar slip on its own: 'how does' stays with 'a pasted link become'", () => {
  const said = "The question: how does a pasted link become a watchable video?".split(" ");
  const words = said.map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const caps = captionsFor("s1", words, 0, 10, 4, 26);
  const shown = caps.map((c) => c.words.map((w) => w.w).join(" "));
  assert.equal(shown.join(" "), said.join(" "));
  assert.ok(shown.includes("how does a pasted link become"), shown.join(" | "));
  for (const p of shown) assert.deepEqual(agreementSlips(p), [], p);
});
