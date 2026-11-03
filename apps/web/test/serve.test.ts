import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileResponse } from "../lib/serve.ts";

test("files stream in byte ranges so a video can seek", async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "serve-")), "v.mp4");
  fs.writeFileSync(f, "0123456789");
  const get = (range?: string) =>
    fileResponse(new Request("http://x/v.mp4", { headers: range ? { range } : {} }), f, { "content-type": "video/mp4" });

  const whole = get();
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("accept-ranges"), "bytes");
  assert.equal(whole.headers.get("content-length"), "10");
  assert.equal(await whole.text(), "0123456789");

  const part = get("bytes=2-5");
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(part.headers.get("content-length"), "4");
  assert.equal(await part.text(), "2345");

  const open = get("bytes=7-");
  assert.equal(open.headers.get("content-range"), "bytes 7-9/10");
  assert.equal(await open.text(), "789");

  const over = get("bytes=8-100");
  assert.equal(over.headers.get("content-range"), "bytes 8-9/10");
  assert.equal(await over.text(), "89");

  const tail = get("bytes=-3");
  assert.equal(tail.headers.get("content-range"), "bytes 7-9/10");
  assert.equal(await tail.text(), "789");

  for (const r of ["bytes=10-", "bytes=20-30", "bytes=5-2"]) {
    const no = get(r);
    assert.equal(no.status, 416, r);
    assert.equal(no.headers.get("content-range"), "bytes */10");
  }
  assert.equal(get("bytes=a-b").status, 200);
});
