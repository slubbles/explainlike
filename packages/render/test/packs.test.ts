import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadIconPack, builtinPackIds, parsePack, mergePacks, detectComponents, packHints, resolveIcon } from "@metual/render";

test("built-in packs load and every component icon exists in the base doodle pack", () => {
  assert.deepEqual(builtinPackIds(), ["cloud-generic", "cloudflare"]);
  const base = loadIconPack();
  for (const id of builtinPackIds()) {
    const p = loadIconPack(id);
    assert.ok(p.components.length >= 5, `${id} has components`);
    for (const c of p.components) assert.ok(resolveIcon(base, c.icon), `${id}/${c.id} icon ${c.icon}`);
  }
});

test("a broken pack lists every problem at once", () => {
  const bad = { id: "My Pack", icons: { db: { file: "missing.png" } }, components: [{ id: "x", name: "X", kind: "db", layer: "data", keyword: "Too Many Words Here", icon: "database", detect: { files: ["("] } }] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-"));
  assert.throws(() => parsePack(bad, dir), (e: Error) => /kebab-case/.test(e.message) && /missing\.png not found/.test(e.message) && /lowercase words/.test(e.message) && /bad regex/.test(e.message));
  assert.throws(() => parsePack({ id: "ok", components: [{ id: "a", name: "A", kind: "db", layer: "data", keyword: "a", icon: "database", detect: {} }] }, dir), /needs files or contains/);
});

test("later packs override icons and components by id", () => {
  const a = parsePack({ id: "a", icons: {}, components: [{ id: "q", name: "Queue A", kind: "queue", layer: "async", keyword: "queue", icon: "queue", detect: { files: ["a"] } }] }, "");
  const b = parsePack({ id: "b", icons: {}, components: [{ id: "q", name: "Queue B", kind: "queue", layer: "async", keyword: "queue", icon: "queue", detect: { files: ["b"] } }] }, "");
  const m = mergePacks([a, b]);
  assert.equal(m.components.length, 1);
  assert.equal(m.components[0].name, "Queue B");
});

test("detection reads only matching files and returns evidence paths", () => {
  const repo: Record<string, string> = {
    "wrangler.toml": 'main = "src/index.ts"\n[[d1_databases]]\nbinding = "DB"\n[[r2_buckets]]\nbinding = "FILES"\n[triggers]\ncrons = ["0 * * * *"]\n',
    "src/index.ts": "export class Room extends DurableObject {}",
    "README.md": "we might use kv_namespaces later",
    "Dockerfile": "FROM node:22",
  };
  const reads: string[] = [];
  const found = detectComponents(builtinPackIds().map((id) => loadIconPack(id)), Object.keys(repo), (f) => { reads.push(f); return repo[f]; });
  const ids = found.map((d) => d.component.id).sort();
  assert.deepEqual(ids, ["cf-cron", "cf-d1", "cf-durable-object", "cf-r2", "cf-worker", "container"]);
  assert.deepEqual(found.find((d) => d.component.id === "cf-durable-object")!.evidence, ["src/index.ts"]);
  assert.ok(!reads.includes("README.md"), "README never matches a rule's file pattern, so it is never read");
  assert.match(packHints(found), /Cloudflare D1: kind db.*seen in wrangler\.toml/);
  assert.equal(packHints([]), "");
});

test("the docs example pack loads", () => {
  const p = loadIconPack(path.join(import.meta.dirname, "../../../examples/packs/supabase"));
  assert.equal(p.components.length, 5);
});

test("tests, fixtures and examples are not evidence", () => {
  const files = ["packages/x/test/packs.test.ts", "examples/wrangler.toml", "src/app.spec.ts"];
  const found = detectComponents([loadIconPack("cloudflare")], files, () => "extends DurableObject\n[[d1_databases]]");
  assert.deepEqual(found, []);
});
