import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a job cut off by a server restart is marked, then picked up once with the same arguments", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-jobs-"));
  const id = "abcdef123456";
  fs.mkdirSync(path.join(dir, id));
  // --help stands in for a real render: the CLI prints usage and exits 0
  fs.writeFileSync(path.join(dir, id, "job.json"), JSON.stringify({ id, kind: "video", input: "https://github.com/a/b", voice: "silent", state: "running", stage: "plan", message: "", pct: 30, started: Date.now(), args: ["--help"] }));
  Object.assign(process.env, { EXPLAINLIKE_JOBS_DIR: dir, EXPLAINLIKE_RESUME: "0", EXPLAINLIKE_ROOT: path.resolve(import.meta.dirname, "../../..") });
  const { getJob, resumeInterrupted } = await import("../lib/jobs.ts");
  assert.equal(getJob(id)?.state, "error");
  assert.match(getJob(id)!.error!, /server restart/);
  const j = resumeInterrupted();
  assert.equal(j?.id, id);
  assert.equal(j?.state, "running");
  // node + tsx can take several seconds to boot on Windows when the whole suite is running at once
  for (let i = 0; i < 300 && getJob(id)!.state === "running"; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(getJob(id)!.state, "done");
  assert.equal(getJob(id)!.resumed, 1);
  assert.equal(resumeInterrupted(), undefined, "only once");
  fs.rmSync(dir, { recursive: true, force: true });
});
