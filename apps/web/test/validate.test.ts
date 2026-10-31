import { test } from "node:test";
import assert from "node:assert/strict";
import { validInput } from "../lib/validate.ts";

test("public repo, post and article URLs are accepted", () => {
  for (const u of ["https://github.com/umami-software/umami", "https://x.com/karpathy/status/1977755427569111362", "https://blog.vllm.ai/2023/06/20/vllm.html"]) assert.ok(validInput(u), u);
});

test("the server never fetches its own network", () => {
  for (const u of [
    "http://localhost:3000/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://10.0.0.5/", "http://192.168.1.1/",
    "http://172.20.0.1/", "http://169.254.169.254/latest/meta-data/", "http://100.100.100.200/", "http://0.0.0.0/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://metadata.google.internal/", "http://printer.local/", "http://app.localhost/", "http://intranet/", "https://github.com@127.0.0.1/",
  ]) assert.ok(!validInput(u), u);
});

test("local paths only with EXPLAINLIKE_ALLOW_LOCAL=1, and only absolute existing ones", () => {
  delete process.env.EXPLAINLIKE_ALLOW_LOCAL;
  assert.ok(!validInput("/tmp"));
  process.env.EXPLAINLIKE_ALLOW_LOCAL = "1";
  assert.ok(validInput("/tmp"));
  assert.ok(!validInput("../etc"));
  assert.ok(!validInput("/definitely/not/here"));
  delete process.env.EXPLAINLIKE_ALLOW_LOCAL;
});
