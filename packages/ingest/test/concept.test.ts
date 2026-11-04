import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchArticle, readCapped, MAX_PAGE_BYTES } from "@explanimate/ingest";

test("garbage that is not a link is refused with a friendly message, not a TypeError", async () => {
  await assert.rejects(fetchArticle("just some words"), (e: Error) => {
    assert.equal(e.name, "Error");
    assert.match(e.message, /not a link I can read/);
    return true;
  });
});

test("a chunked body is cut at the cap instead of read whole", async () => {
  const big = "a".repeat(100_000);
  const r = new Response(big);
  assert.equal((await readCapped(r, 1000)).length, 1000);
  const small = new Response("hello");
  assert.equal(await readCapped(small, MAX_PAGE_BYTES), "hello");
});
