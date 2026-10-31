import { test } from "node:test";
import assert from "node:assert/strict";
import type { Architecture, NoteItem } from "@metual/core";
import { validateNotes, validateArchitecture } from "@metual/planner";

const item = (text: string, extra: Partial<NoteItem> = {}): NoteItem => ({ text, color: "white", icon: "", target: "", estimate: false, evidence: "", ...extra });
const ids = new Set(["d1-db", "edge"]);
const files = new Set(["wrangler.jsonc", "lib/db.ts"]);
const evidenceOf = (id: string) => (id === "d1-db" ? "lib/db.ts" : "wrangler.jsonc");

test("any number on the board is labelled as an estimate", () => {
  const { items, repairs } = validateNotes([item("~50k plays per day")], { ids, files, evidenceOf });
  assert.equal(items[0].estimate, true);
  assert.match(repairs[0], /marked as estimate/);
});

test("names with digits (d1, r2, s3) are not numbers", () => {
  const { items, repairs } = validateNotes([item("d1 holds every clip", { target: "d1-db" }), item("r2 serves audio")], { ids, files, evidenceOf });
  assert.equal(items[0].estimate, false);
  assert.equal(items[1].estimate, false);
  assert.equal(repairs.length, 0);
});

test("an estimate tag without a number is dropped, so plain claims do not read as doubts", () => {
  const { items, repairs } = validateNotes([item("writes are serialized", { estimate: true, target: "d1-db" })], { ids, files, evidenceOf });
  assert.equal(items[0].estimate, false);
  assert.match(repairs[0], /estimate tag dropped/);
  assert.equal(items[0].evidence, "lib/db.ts", "a grounded claim gets its component's evidence file");
});

test("unknown targets and invented evidence paths are repaired, not trusted", () => {
  const { items } = validateNotes([item("cache misses spike", { target: "redis", evidence: "src/made-up.ts" }), item("one writer", { target: "d1-db", evidence: "nope.ts" })], { ids, files, evidenceOf });
  assert.equal(items[0].target, "");
  assert.equal(items[0].evidence, "");
  assert.equal(items[1].evidence, "lib/db.ts");
});

test("text is lowercased, capped at 7 words and 6 items", () => {
  const many = Array.from({ length: 9 }, (_, i) => item(`Item Number ${"word ".repeat(10)}${i}`));
  const { items } = validateNotes(many, { ids, files, evidenceOf });
  assert.equal(items.length, 6);
  for (const it of items) { assert.equal(it.text, it.text.toLowerCase()); assert.ok(it.text.split(" ").length <= 7); }
});

test("post/article notes need a verbatim quote from the source", () => {
  const source = "Continuous batching lets new requests join a running batch.";
  const { items, repairs } = validateNotes([item("join running batch", { evidence: "new requests join a running batch" }), item("made up", { evidence: "batches are sorted by length" })], { source });
  assert.equal(items.length, 1);
  assert.match(repairs[0], /quote not in source/);
});

const comp = (id: string, evidence: string[], over: Partial<Architecture["components"][number]> = {}): Architecture["components"][number] => ({ id, name: id, kind: "api", layer: "backend", keyword: id, icon: "server", what: "x", evidence, ...over });

test("validateArchitecture: no box without a real file", () => {
  const repo = ["src/api/index.ts", "src/db/client.ts", "wrangler.toml"];
  const arch: Architecture = {
    product: "p", one_liner: "x",
    components: [
      comp("api", ["./src/api/index.ts"]),
      comp("db", ["client.ts"], { kind: "db", icon: "spaceship", keyword: "Postgres DB!!" }),
      comp("ghost", ["src/ghost.ts"]),
    ],
    connections: [
      { from: "api", to: "db", label: "Reads Rows", evidence: "src/api/index.ts" },
      { from: "api", to: "ghost", label: "x", evidence: "src/api/index.ts" },
    ],
    walkthrough: { name: "read", steps: [{ from: "db", to: "api", label: "returns", evidence: "invented.ts" }] },
    scale: [{ component: "ghost", at: "10x", problem: "x", why: "y", fix: "z", fix_detail: "w", evidence: "a" }],
  };
  const { arch: a, issues } = validateArchitecture(arch, repo, (n) => (["server", "database"].includes(n) ? n : undefined), (k) => (k === "db" ? "database" : "box"));
  assert.deepEqual(a.components.map((c) => c.id), ["api", "db"]);
  assert.deepEqual(a.components[0].evidence, ["src/api/index.ts"], "leading ./ is normalised");
  assert.deepEqual(a.components[1].evidence, ["src/db/client.ts"], "a unique basename resolves to its path");
  assert.equal(a.components[1].icon, "database", "unknown icon falls back by kind");
  assert.equal(a.components[1].keyword, "postgres db");
  assert.equal(a.connections.find((c) => c.to === "db")!.label, "reads rows");
  assert.ok(!a.connections.some((c) => c.to === "ghost"));
  assert.equal(a.walkthrough.steps[0].evidence, "");
  assert.equal(a.scale.length, 0);
  assert.ok(issues.some((i) => i.target === "ghost" && /no evidence/.test(i.problem)));
});
