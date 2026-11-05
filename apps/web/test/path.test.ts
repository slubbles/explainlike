import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-path-"));
Object.assign(process.env, {
  EXPLANIMATE_PRECHECK: "0",
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
});
delete process.env.EXPLANIMATE_AUTH_ENABLED;
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const post = (body: unknown) =>
  new Request("https://explanimate.co/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST /api/jobs takes a repo subfolder through to the job", async () => {
  const { POST } = await import("../app/api/jobs/route.ts");
  const ok = await POST(post({ input: "https://github.com/owner/repo", voice: "silent", path: "packages/cli" }));
  assert.equal(ok.status, 200);
  const { getJob } = await import("../lib/jobs.ts");
  const job = getJob((await ok.json()).id);
  assert.equal(job?.path, "packages/cli");
  assert.ok(job?.args?.includes("--path"));
  assert.equal(job?.args?.[job.args.indexOf("--path") + 1], "packages/cli");
});

test("a bad path, or a path for a non-repo, is refused", async () => {
  const { POST } = await import("../app/api/jobs/route.ts");
  const bad = await POST(post({ input: "https://github.com/owner/repo", path: "../etc" }));
  assert.equal(bad.status, 400);
  const topic = await POST(post({ input: "how DNS works", path: "packages/cli" }));
  assert.equal(topic.status, 400);
  assert.match((await topic.json()).error, /GitHub repo links/);
});
