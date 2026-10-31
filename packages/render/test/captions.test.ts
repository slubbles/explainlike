import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTheme, getLevel } from "@metual/core";
import { compose, loadIconPack, captureFrames } from "../src/index.js";

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
