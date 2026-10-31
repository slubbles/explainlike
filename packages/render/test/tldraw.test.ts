import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTheme, getLevel } from "@explainlike/core";
import { compose, loadIconPack, toTldraw, indexKey, TLDR_SCHEMA } from "../src/index.js";

const fx = new URL("./fixtures/", import.meta.url);
const plan = JSON.parse(fs.readFileSync(new URL("example-app.plan.json", fx), "utf8"));
const arch = JSON.parse(fs.readFileSync(new URL("example-app.architecture.json", fx), "utf8"));
const audio = plan.scenes.map((s: any) => ({ sceneId: s.id, duration: 6, words: [] }));
const theme = getTheme("caleb-dark");
const board = async () => {
  const { sketch } = await compose({ plan, audio, theme, level: getLevel("interviewing"), pack: loadIconPack(), sourceLabel: "x", arch });
  const colorNames = Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => [v.toLowerCase(), k]));
  return { sketch, doc: await toTldraw(sketch, { colorNames, darkIcons: true }) };
};

test("index keys sort in drawing order", () => {
  const keys = Array.from({ length: 300 }, (_, i) => indexKey(i));
  assert.deepEqual([...keys].sort(), keys);
  assert.equal(new Set(keys).size, keys.length);
});

test(".tldr board: one page, every box, arrow and note, and arrows tied to their boxes", async () => {
  const { sketch, doc } = await board();
  assert.equal(doc.tldrawFileFormatVersion, 1);
  assert.equal(doc.schema, TLDR_SCHEMA);
  const recs = doc.records, byId = new Map(recs.map((r: any) => [r.id, r]));
  assert.equal(byId.size, recs.length, "ids are unique");
  assert.ok(byId.has("document:document") && byId.has("page:page"));
  const shapes = recs.filter((r: any) => r.typeName === "shape");
  const of = (t: string) => shapes.filter((s: any) => s.type === t);
  assert.equal(of("arrow").length, sketch.edges.length);
  assert.ok(of("geo").filter((g: any) => g.props.geo === "rectangle").length >= arch.components.length);
  for (const s of shapes) assert.ok(byId.has(s.parentId), `${s.id} has a parent`);
  for (const s of of("image")) assert.equal(byId.get(s.props.assetId)?.typeName, "asset");
  const binds = recs.filter((r: any) => r.typeName === "binding");
  assert.ok(binds.length >= sketch.edges.filter((e) => e.from && e.to).length);
  for (const b of binds) {
    assert.equal(byId.get(b.fromId)?.type, "arrow");
    assert.equal(byId.get(b.toId)?.type, "geo");
    for (const v of [b.props.normalizedAnchor.x, b.props.normalizedAnchor.y]) assert.ok(v >= 0 && v <= 1);
  }
  // everything uses tldraw's own colour names and fonts, so its light and dark modes both work
  const names = new Set(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"]);
  for (const s of shapes) if (s.props.color) assert.ok(names.has(s.props.color), s.props.color);
  for (const s of shapes) if (s.props.font) assert.equal(s.props.font, "draw");
});
