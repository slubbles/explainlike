import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTheme, specFromBrief, DEFAULT_BRIEF, agreementSlips } from "@explainlike/core";
import { compose, loadIconPack, captureFrames, captionsFor, kineticLine, keyWordIndex } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => {
  const ws = s.narration.split(/\s+/);
  return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
});

test("captions sit in one fixed spot at the bottom, on one line, and never cover the drawing at rest", { timeout: 120_000 }, async () => {
  for (const theme of ["pen-light", "chalk-dark"]) {
    const { film } = await compose({ plan, audio, theme: getTheme(theme), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainlike-cap-"));
    const { captions } = await captureFrames(film, dir, { only: [0], workers: 1 });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(captions.length, film.captions.filter((c) => !c.hidden).length);
    const bottoms = new Set(captions.map((c) => c.rect!.y + c.rect!.h));
    assert.equal(bottoms.size, 1, `captions sit at different heights: ${[...bottoms].join(", ")}`);
    for (const c of captions) {
      assert.ok(!c.stacked, `"${c.text}" wraps onto a second line`);
      assert.ok(Math.abs(c.rect!.x + c.rect!.w / 2 - film.width / 2) <= 1, `"${c.text}" is not centred`);
      assert.ok(c.rect!.y >= film.height - 220, `"${c.text}" rises above the bottom band`);
    }
    // the drawing may slide under the opaque caption pill while the camera glides past, never while it rests
    const covering = captions.filter((c) => c.overlapPx > 0).map((c) => `${c.t0.toFixed(1)}s "${c.text}" ${c.overlapPx}px`);
    assert.deepEqual(covering, [], theme);
  }
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

test("'the resulting video' stays whole at real speech speed, where 'Then you watch' alone is too quick to read", () => {
  const t = [["Then", 10.38, 10.62], ["you", 10.62, 10.7], ["watch", 10.7, 10.94], ["the", 10.94, 11.18], ["resulting", 11.18, 11.5], ["video", 11.5, 11.82], ["in", 11.82, 11.98], ["the", 11.98, 12.06], ["player.", 12.06, 12.7]] as const;
  const words = t.map(([word, start, end]) => ({ word, start, end }));
  const shown = captionsFor("s1", words, 0, 14, 4, 26).map((c) => c.words.map((w) => w.w).join(" "));
  assert.ok(shown.some((p) => p.includes("the resulting video")), `"the resulting video" is split: ${shown.join(" | ")}`);
});

test("a compound noun and a relative clause stay whole at real speech speed", () => {
  const cut = (t: readonly (readonly [string, number, number])[]) =>
    captionsFor("s1", t.map(([word, start, end]) => ({ word, start, end })), 0, 60, 4, 26).map((c) => c.words.map((w) => w.w).join(" "));
  const recipe = cut([["Think", 33.14, 33.38], ["of", 33.38, 33.54], ["it", 33.54, 33.7], ["as", 33.7, 33.86], ["a", 33.86, 33.94], ["recipe", 33.94, 34.26], ["card", 34.26, 34.5], ["for", 34.5, 34.66], ["a", 34.66, 34.82], ["language", 34.82, 35.06], ["model.", 35.06, 35.46]]);
  assert.ok(recipe.some((p) => p.includes("recipe card")), `"recipe card" is split: ${recipe.join(" | ")}`);
  const files = cut([["and", 3.2, 3.44], ["Muse", 3.44, 3.76], ["Spark", 3.76, 4], ["explains", 4, 4.48], ["it,", 4.48, 4.96], ["citing", 5.12, 5.44], ["only", 5.44, 5.76], ["the", 5.76, 5.92], ["files", 5.92, 6.16], ["that", 6.16, 6.32], ["box", 6.32, 6.64], ["was", 6.64, 6.8], ["built", 6.8, 7.04], ["from.", 7.04, 7.36]]);
  assert.ok(files.some((p) => p.includes("files that box was built from.")), `the relative clause is split from its noun: ${files.join(" | ")}`);
});

test("the hook's first line is drawn word by word as it is said, and the subtitle bar skips those words", async () => {
  const hook = plan.scenes.find((s: any) => s.kind === "hook");
  const p2 = { ...plan, scenes: plan.scenes.map((s: any) => (s === hook ? { ...s, narration: `What if every song came from a robot? ${s.narration}` } : s)) };
  const a2 = p2.scenes.map((s: any) => {
    const ws = s.narration.split(/\s+/);
    return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
  });
  const { film } = await compose({ plan: p2, audio: a2, theme: getTheme("pen-light"), spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });
  const line = film.elements.filter((e) => e.g === "hookline" && e.k === "text").map((e: any) => e.text);
  assert.deepEqual(line, "What if every song came from a robot?".split(" "));
  assert.ok(film.elements.some((e) => e.g === "hookline" && e.k === "text" && e.t0 < 5), "the hook line starts within five seconds");
  const caps = film.captions.filter((c) => c.scene === hook.id);
  assert.equal(caps.filter((c) => c.hidden).map((c) => c.words.map((w) => w.w).join(" ")).join(" "), line.join(" "));
  // every spoken word is still in the captions, so the caption check still sees the whole narration
  assert.equal(caps.flatMap((c) => c.words.map((w) => w.w)).join(" "), a2.find((x: any) => x.sceneId === hook.id).words.map((w: any) => w.word).join(" "));
});

test("only a short first sentence the voice said word for word becomes the kinetic line", () => {
  const w = (s: string) => s.split(" ").map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const said = "Why does your chat feel slow? It waits for a server across the ocean every time.";
  assert.equal(kineticLine(said, w(said)), 6);
  assert.equal(kineticLine("Hi. " + said, w("Hi. " + said)), 0, "one word is not a line");
  assert.equal(kineticLine(said, w(said.replace("slow?", "slowly?"))), 0, "the recogniser heard something else");
  assert.equal(kineticLine("Why does your chat feel slow?", w("Why does your chat feel slow?")), 0, "nothing follows it");
  assert.equal(keyWordIndex("Why does your chat feel slow?".split(" ")), 5);
  assert.equal(keyWordIndex("What if every song came from a robot?".split(" ")), 7);
});
