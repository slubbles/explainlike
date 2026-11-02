import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a second request waits its turn instead of being told the renderer is busy", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-queue-"));
  Object.assign(process.env, {
    EXPLAINLIKE_JOBS_DIR: dir,
    EXPLAINLIKE_RESUME: "0",
    EXPLAINLIKE_ROOT: path.resolve(import.meta.dirname, "../../.."),
    EXPLAINLIKE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
    FAKE_DELAY_MS: "400",
  });
  const { startJob, getJob } = await import("../lib/jobs.ts");

  const first = startJob("how DNS works", "silent");
  assert.equal(getJob(first.id)!.state, "running");

  const second = startJob("how TCP works", "silent");
  const queued = getJob(second.id)!;
  assert.equal(queued.state, "queued");
  assert.equal(queued.ahead, 1);
  assert.equal(queued.pct, 0);

  const until = async (id: string, state: string) => {
    for (let i = 0; i < 200 && getJob(id)!.state !== state; i++) await new Promise((r) => setTimeout(r, 100));
    return getJob(id)!;
  };
  assert.equal((await until(first.id, "done")).state, "done");
  // the queue starts the next one by itself, on the same render slot
  assert.equal((await until(second.id, "done")).state, "done");
  fs.rmSync(dir, { recursive: true, force: true });
});
