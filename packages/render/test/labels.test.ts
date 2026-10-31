import { test } from "node:test";
import assert from "node:assert/strict";
import { shortSub } from "../src/index.js";

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
