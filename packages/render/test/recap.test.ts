import { test } from "node:test";
import assert from "node:assert/strict";

const opAt = (k: [number, number][] | undefined, t: number) => {
  if (!k?.length || t <= k[0][0]) return k?.[0]?.[1] ?? 1;
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) { const [a, va] = k[i - 1], [b, vb] = k[i]; return va + ((vb - va) * (t - a)) / Math.max(1e-6, b - a); }
  return k[k.length - 1][1];
};

test("the recap's whole-wall shot shows no lit words too small to read", async () => {
  const fs = await import("node:fs");
  const { getTheme, specFromBrief, DEFAULT_BRIEF } = await import("@explainlike/core");
  const { compose, loadIconPack, cameraAt, MIN_TEXT_PX, MIN_SMALL_TEXT_PX } = await import("../src/index.js");
  const plan = JSON.parse(fs.readFileSync(new URL("./fixtures/internet-cutins.plan.json", import.meta.url), "utf8"));
  const audio = plan.scenes.map((s: { id: string; narration: string }) => {
    const ws = s.narration.split(/\s+/);
    return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w, i) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
  });
  const { film } = await compose({ plan, audio, theme: getTheme("whiteboard-light"), spec: specFromBrief({ ...DEFAULT_BRIEF, style: "explainer" }), pack: loadIconPack(), sourceLabel: "x" });
  const recap = plan.scenes.find((s: { kind: string }) => s.kind === "recap");
  const caps = film.captions.filter((c) => c.scene === recap.id);
  const head = { t0: Math.min(...caps.map((c) => c.t0)), t1: Math.max(...caps.map((c) => c.t1)) };
  let wide = 0, kept = 0;
  for (let t = head.t0 + 0.5; t < head.t1 - 0.3; t += 0.25) {
    const c = cameraAt(film, t);
    if (c.w > 3500) wide++;
    for (const e of film.elements) {
      if (e.k !== "text" || e.t0 > t || opAt(film.groups[e.g ?? ""], t) < 0.6) continue;
      const px = (e.size * 1920) / c.w;
      if (c.w > 3500) kept++;
      assert.ok(px >= (e.size >= 34 ? MIN_TEXT_PX : MIN_SMALL_TEXT_PX), `"${e.text}" is ${px.toFixed(1)} px at ${t.toFixed(1)}s`);
    }
  }
  assert.ok(wide > 0, "the recap does pull back over the whole wall");
  assert.ok(kept > 0, "the board titles and box names stay up on the wall");
});
