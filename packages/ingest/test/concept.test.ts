import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchArticle, readCapped, MAX_PAGE_BYTES, screenshotCard, SCREENSHOT_TIMEOUT_MS } from "@explanimate/ingest";

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

test("the card screenshot gets 90s and succeeds first try", async () => {
  assert.equal(SCREENSHOT_TIMEOUT_MS, 90_000);
  const seen: Array<{ path: string; timeout: number }> = [];
  const el = { screenshot: async (opts: { path: string; timeout: number }) => void seen.push(opts) };
  await screenshotCard(el, "card.png", 0);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { path: "card.png", timeout: 90_000 });
});

test("the card screenshot retries once, then throws the original error", async () => {
  let flaky = 0;
  const el = {
    screenshot: async () => {
      flaky++;
      if (flaky === 1) throw new Error("elementHandle.screenshot: Timeout 30000ms exceeded");
    },
  };
  await screenshotCard(el as any, "card.png", 0);
  assert.equal(flaky, 2);

  const first = new Error("elementHandle.screenshot: Timeout 30000ms exceeded");
  const second = new Error("elementHandle.screenshot: Timeout 30000ms exceeded (retry)");
  let n = 0;
  const failing = {
    screenshot: async () => {
      n++;
      throw n === 1 ? first : second;
    },
  };
  await assert.rejects(screenshotCard(failing as any, "card.png", 0), (e: Error) => {
    assert.equal(e, first);
    return true;
  });
  assert.equal(n, 2);
});
