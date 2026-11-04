import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TOPIC_MAX, inputHint, normalizeInput } from "../lib/form.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-input-"));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
});
delete process.env.EXPLANIMATE_AUTH_ENABLED;
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("links typed without https:// get it; topics and real URLs are left alone", () => {
  assert.equal(normalizeInput("github.com/karpathy/micrograd"), "https://github.com/karpathy/micrograd");
  assert.equal(normalizeInput("  x.com/karpathy/status/1977755427569111362 "), "https://x.com/karpathy/status/1977755427569111362");
  assert.equal(normalizeInput("www.example.org"), "https://www.example.org");
  assert.equal(normalizeInput("blog.vllm.ai/2023/06/20/vllm.html"), "https://blog.vllm.ai/2023/06/20/vllm.html");
  assert.equal(normalizeInput("example.com"), "https://example.com");
  for (const keep of ["https://github.com/a/b", "how DNS works", "next.js", "node.js streams", "/home/me/repo", "a/b"])
    assert.equal(normalizeInput(keep), keep.trim(), keep);
});

test("a topic shows a counter near its cap and a plain reason past it; links do not", () => {
  assert.deepEqual(inputHint("how DNS works"), {});
  assert.deepEqual(inputHint(`https://example.com/${"a".repeat(500)}`), {});
  assert.equal(inputHint("w ".repeat(130)).count, `${"w ".repeat(130).trim().length} / ${TOPIC_MAX}`);
  assert.match(inputHint("word ".repeat(80)).over!, /300 characters at most/);
});

const post = (input: string) =>
  new Request("https://explanimate.co/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, voice: "silent" }),
  });

test("the server takes a scheme-less GitHub link and says why an over-long topic is refused", async () => {
  const { POST } = await import("../app/api/jobs/route.ts");
  const ok = await POST(post("github.com/karpathy/micrograd"));
  assert.equal(ok.status, 200);
  const { getJob } = await import("../lib/jobs.ts");
  assert.equal(getJob((await ok.json()).id)?.input, "https://github.com/karpathy/micrograd");
  const long = await POST(post("explain ".repeat(60)));
  assert.equal(long.status, 400);
  assert.match((await long.json()).error, /300 characters at most/);
});
