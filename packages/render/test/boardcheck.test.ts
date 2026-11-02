import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, specFromBrief, DEFAULT_BRIEF } from "@explanimate/core";
import { compose, loadIconPack, toTldraw, toExcalidraw, checkTldr, checkExcalidraw } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => ({ sceneId: s.id, duration: 6, words: [] }));
const theme = getTheme("chalk-dark");
const boards = async () => {
  const { sketch } = await compose({ plan, audio, theme, spec: specFromBrief(DEFAULT_BRIEF), pack: loadIconPack(), sourceLabel: "x", arch });
  const colorNames = Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => [v.toLowerCase(), k]));
  const tldr = await toTldraw(sketch, { colorNames, darkIcons: true });
  const exc = toExcalidraw(sketch, { background: theme.background, ink: theme.ink, muted: theme.colors.gray, edgeLabel: theme.edgeLabel });
  // a round trip through JSON is what lands on disk
  return { sketch, tldr: JSON.parse(JSON.stringify(tldr)), exc: JSON.parse(JSON.stringify(exc)) };
};

test("both boards pass their own check", async () => {
  const { sketch, tldr, exc } = await boards();
  const a = checkTldr(tldr, sketch), b = checkExcalidraw(exc, sketch);
  assert.deepEqual(a.problems, []);
  assert.deepEqual(b.problems, []);
  assert.equal(a.counts.arrows, b.counts.arrows);
});

test("a broken board is caught", async () => {
  const { sketch, tldr, exc } = await boards();
  const box = tldr.records.find((r: any) => r.type === "geo" && r.props.geo === "rectangle");
  box.props.richText = { type: "doc", content: [] };
  tldr.records.find((r: any) => r.typeName === "binding").toId = "shape:gone";
  const a = checkTldr(tldr, sketch);
  assert.ok(a.problems.some((p) => p.includes("lost its name")), a.problems.join("; "));
  assert.ok(a.problems.some((p) => p.includes("points at nothing")));

  const arrow = exc.elements.find((e: any) => e.type === "arrow" && e.startBinding);
  arrow.startBinding.elementId = "missing";
  exc.elements.find((e: any) => e.type === "image").fileId = "nope";
  exc.elements.splice(exc.elements.findIndex((e: any) => e.type === "text"), 1);
  const b = checkExcalidraw(exc, sketch);
  assert.ok(b.problems.some((p) => p.includes("not tied back")), b.problems.join("; "));
  assert.ok(b.problems.some((p) => p.includes("has no file")));
  assert.ok(b.problems.some((p) => p.includes("missing") || p.includes("lost its name")));
});
