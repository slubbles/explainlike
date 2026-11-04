import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";

const script = path.resolve(import.meta.dirname, "../../../scripts/loadtest.mjs");
const run = (args: string[]) =>
  new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile(process.execPath, [script, ...args], (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, out: String(stdout), err: String(stderr) });
    });
  });

test("the load test prints its plan with --dry and sends nothing", async () => {
  const r = await run(["10", "--dry", "--base", "http://localhost:3000"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /target: http:\/\/localhost:3000 {2}videos: 10/);
  assert.match(r.out, /dry run: would POST 10 concurrent jobs/);
});

test("production is refused without --allow-prod", async () => {
  const r = await run(["2", "--dry", "--base", "https://explanimate.co"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /refusing to load test production/);
});

test("--help names the metrics sampling options", async () => {
  const r = await run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /--cookie/);
  assert.match(r.out, /--metrics-interval/);
});
