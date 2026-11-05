import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/next-path.ts";

test("sign-in only lands on a path on this site", () => {
  for (const ok of ["/app", "/app/videos?x=1", "/gallery#top"]) assert.equal(safeNext(ok), ok);
  for (const bad of [
    undefined,
    3,
    "",
    "app",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "/a\\b",
    "/\tevil",
    "/\nx",
  ])
    assert.equal(safeNext(bad), "/app", String(bad));
});
