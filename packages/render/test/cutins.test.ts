import { test } from "node:test";
import assert from "node:assert/strict";
import { chartLayout, timelineLayout, CHART } from "../src/cutins.js";

const row = (text: string) => ({ text, evidence: "", color: "blue" as const, icon: "", target: "", estimate: false });

test("bars share one zero-based scale, so a bar twice as long means twice the number", () => {
  const { bars, w } = chartLayout([row("chrome 65%"), row("safari 18%"), row("firefox 3%")]);
  assert.equal(bars[0].bar.w, CHART.maxBar);
  assert.ok(Math.abs(bars[1].bar.w - (18 / 65) * CHART.maxBar) < 0.01);
  assert.equal(bars[2].shown, "3%");
  assert.ok(bars.every((b) => b.bar.x === bars[0].bar.x), "every bar starts at the same axis");
  assert.ok(bars.every((b) => b.value_x < w), "every value label fits in the panel");
  assert.ok(bars[1].bar.y > bars[0].bar.y + CHART.bar, "bars never overlap");
});

test("timeline ticks run oldest first, evenly spaced, whatever order the plan gave", () => {
  const { ticks } = timelineLayout([row("1985 first .com"), row("1969 arpanet starts"), row("1983 dns is invented")]);
  assert.deepEqual(ticks.map((t) => t.when), ["1969", "1983", "1985"]);
  assert.deepEqual(ticks.map((t) => t.item), [1, 2, 0], "each tick remembers its row so it is drawn when that row is said");
  assert.equal(ticks[1].x - ticks[0].x, ticks[2].x - ticks[1].x);
});

test("a chart and a timeline in a real plan stay whole on screen from their last row to the end of the scene", async () => {
  const fs = await import("node:fs");
  const { getTheme, specFromBrief, DEFAULT_BRIEF } = await import("@explainlike/core");
  const { compose, loadIconPack, cameraAt, boxOf } = await import("../src/index.js");
  const plan = JSON.parse(fs.readFileSync(new URL("./fixtures/internet-cutins.plan.json", import.meta.url), "utf8"));
  const audio = plan.scenes.map((s: { id: string; narration: string }) => {
    const ws = s.narration.split(/\s+/);
    return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w, i) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
  });
  const { film } = await compose({ plan, audio, theme: getTheme("whiteboard-light"), spec: specFromBrief({ ...DEFAULT_BRIEF, style: "explainer" }), pack: loadIconPack(), sourceLabel: "x" });
  for (const kind of ["chart", "timeline"]) {
    const s = plan.scenes.find((x: { kind: string }) => x.kind === kind);
    const head = film.headings.find((h) => h.text === s.heading)!;
    const els = film.elements.filter((e) => (e.g === `ci:${s.id}` || e.g === `ci:${s.id}~fine`) && e.k === "text");
    assert.ok(els.length >= s.items.length * 2, `${kind}: a label and a value or date per row`);
    const last = Math.max(...els.map((e) => e.t0 + e.dur));
    for (let t = last; t < head.t1 - 0.3; t += 0.5) {
      const v = cameraAt(film, t);
      for (const e of els) {
        const b = boxOf(e)!;
        assert.ok(b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h, `${kind}: "${(e as { text: string }).text}" off screen at ${t.toFixed(1)}s`);
      }
    }
  }
});
