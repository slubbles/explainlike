import { test } from "node:test";
import assert from "node:assert/strict";
import { shortSub, plainCase } from "../src/index.js";

test("box descriptions shorten at whole words, never mid-word", () => {
  assert.equal(shortSub("cloudflare cdn clips.example-app.com edge", 30), "cloudflare cdn");
  assert.equal(shortSub("cloudflare d1 via feedback_db", 30), "cloudflare d1 via feedback_db");
  assert.equal(shortSub("durable object via the websocket hub", 30), "durable object");
  assert.equal(shortSub("supercalifragilisticexpialidocious-service", 30).length, 30);
  for (const s of ["next.js browser feed and home player", "worker that renders the app on example-app.com"]) {
    const out = shortSub(s, 30);
    assert.ok(out.length <= 30 && s.startsWith(out) && !out.endsWith("…"), out);
  }
});

test("a shortened box description never ends on a dangling + or joining word", () => {
  assert.equal(shortSub("ingest via playwright + readability", 36), "ingest via playwright + readability");
  assert.equal(shortSub("ingest via playwright + readability", 30), "ingest via playwright");
  assert.equal(shortSub("zip or git page-to text and more words", 20), "zip or git page-to");
});

test("box descriptions keep code names as the code writes them and lower-case the plain words", () => {
  assert.equal(plainCase("ChatLive Durable Object"), "ChatLive durable object");
  assert.equal(plainCase("Cloudflare D1 via FEEDBACK_DB"), "cloudflare D1 via FEEDBACK_DB");
  assert.equal(plainCase("Cloudflare Worker via OpenNext"), "cloudflare worker via OpenNext");
  assert.equal(plainCase("Whiteboard renderer via roughjs"), "whiteboard renderer via roughjs");
  assert.equal(plainCase("Local Disk Job Store"), "local disk job store");
});

test("box sublabels are big and dark enough to read in a wide shot, and still fit inside their box", { timeout: 60_000 }, async () => {
  const { getTheme, specFromBrief, DEFAULT_BRIEF } = await import("@explainlike/core");
  const { compose, loadIconPack } = await import("../src/index.js");
  const fs = await import("node:fs");
  const fx = new URL("./fixtures/", import.meta.url);
  const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
  const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
  const audio = plan.scenes.map((s: any) => {
    const ws = s.narration.split(/\s+/);
    return { sceneId: s.id, duration: ws.length * 0.38, words: ws.map((w: string, i: number) => ({ word: w, start: i * 0.38, end: i * 0.38 + 0.3 })) };
  });
  const theme = getTheme("pen-light");
  const { film } = await compose({ plan, audio, theme, spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch, pace: "lively" });
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // a sublabel is the text drawn centred under a box name, 34 units lower
  const names = film.elements.filter((e: any) => e.k === "text" && e.size === 36);
  const subs = film.elements.filter((e: any) => e.k === "text" && names.some((n: any) => n.x === e.x && Math.abs(e.y - n.y - 34) < 0.01));
  assert.ok(subs.length >= 3, `found ${subs.length} sublabels`);
  for (const e of subs as any[]) {
    assert.ok(e.size >= 26, `"${e.text}" is ${e.size}px`);
    assert.ok(contrast(e.color, theme.background) >= 4.5, `"${e.text}" color ${e.color} contrast ${contrast(e.color, theme.background).toFixed(2)}`);
  }
  // and it still fits: the box grows to hold it, and descenders stay above its bottom edge
  const { NODE } = await import("../src/layout.js");
  assert.ok(194 + NODE.subSize * 0.3 <= NODE.h);
});
