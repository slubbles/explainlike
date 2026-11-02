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
  const { getTheme, specFromBrief, DEFAULT_BRIEF } = await import("@explanimate/core");
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

test("a map card frames its places with room, keeps coastlines and labels on the card, and labels never cover each other", async () => {
  const { mapLayout, sceneMap, MAP } = await import("../src/cutins.js");
  const { countries, findPlace } = await import("@explanimate/core/places");
  const place = (target: string, text: string) => ({ ...row(text), target });
  // three cities close together, where a naive label to the right of each would collide
  const L = mapLayout([place("geneva", "web is born"), place("zurich", "the second lab"), place("bern", "the capital listens"), place("france", "next door")], countries(), findPlace);
  const inCard = (x: number, y: number) => x >= -0.01 && y >= -0.01 && x <= MAP.w + 0.01 && y <= MAP.h + 0.01;
  assert.ok(L.land.length > 3, "neighbouring countries are drawn for context");
  assert.ok(L.land.every((c) => c.rings.every((r) => r.every(([x, y]) => inCard(x, y)))), "no coastline spills past the card");
  assert.ok(L.land.some((c) => c.iso === "CHE") && L.land.some((c) => c.iso === "FRA"));
  for (const p of L.pins) assert.ok(p.x > MAP.w * 0.1 && p.x < MAP.w * 0.9 && p.y > MAP.h * 0.1 && p.y < MAP.h * 0.9, `${p.label} has room around it`);
  const { textWidth } = await import("../src/measure.js");
  const boxes = L.pins.map((p) => { const w = textWidth(p.label, MAP.label); const x = p.anchor === "start" ? p.lx : p.lx - w / 2; return { x, y: p.ly - MAP.label * 0.9, w, h: MAP.label * 1.2 }; });
  for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.w <= MAP.w && b.y >= 0 && b.y + b.h <= MAP.h, "every label stays on the card");
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h, `"${L.pins[i].label}" and "${L.pins[j].label}" overlap`);
  }
  assert.ok(sceneMap([place("japan", "a"), place("tokyo", "b")]).pins.length === 2);
});

test("a map cut-in in a real plan shows its places and the Natural Earth credit, all on screen", async () => {
  const fs = await import("node:fs");
  const { getTheme, specFromBrief, DEFAULT_BRIEF } = await import("@explanimate/core");
  const { compose, loadIconPack, cameraAt, boxOf } = await import("../src/index.js");
  const plan = JSON.parse(fs.readFileSync(new URL("./fixtures/internet-cutins.plan.json", import.meta.url), "utf8"));
  const s = plan.scenes.find((x: { kind: string }) => x.kind === "chart");
  Object.assign(s, { kind: "map", heading: "where it began", narration: "It began in the united states, then geneva gave it the web, and japan joined soon after.",
    items: [{ ...row("arpanet starts here"), target: "united states", color: "orange" }, { ...row("the web is born"), target: "geneva" }, { ...row("asia joins"), target: "japan" }] });
  const audio = plan.scenes.map((x: { id: string; narration: string }) => {
    const ws = x.narration.split(/\s+/);
    return { sceneId: x.id, duration: ws.length * 0.38, words: ws.map((w, i) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
  });
  const { film } = await compose({ plan, audio, theme: getTheme("whiteboard-light"), spec: specFromBrief({ ...DEFAULT_BRIEF, style: "explainer" }), pack: loadIconPack(), sourceLabel: "x" });
  const els = film.elements.filter((e) => e.g?.startsWith(`ci:${s.id}`) && e.k === "text") as { text: string; t0: number; dur: number }[];
  assert.deepEqual(els.map((e) => e.text).sort(), ["Made with Natural Earth", "arpanet starts here", "asia joins", "the web is born"]);
  const caps = film.captions.filter((c) => c.scene === s.id);
  const end = Math.max(...caps.map((c) => c.t1));
  for (let t = Math.max(...els.map((e) => e.t0 + e.dur)); t < end - 0.3; t += 0.5) {
    const v = cameraAt(film, t);
    for (const e of els) {
      const b = boxOf(e as never)!;
      assert.ok(b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h, `"${e.text}" off screen at ${t.toFixed(1)}s`);
    }
  }
});
