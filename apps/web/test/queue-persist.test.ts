import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// a server restart, from the queue's point of view: three jobs that were waiting when the old
// server died, and the wait line it had stored. This file runs in its own process, so importing
// the job store below is the restart: it must pick the line back up, not fail the jobs.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-queue-persist-"));
const ids = ["a1a1a1a1a1a1", "b2b2b2b2b2b2", "c3c3c3c3c3c3"];
const t0 = Date.now();
ids.forEach((id, i) => {
  fs.mkdirSync(path.join(dir, id));
  fs.writeFileSync(
    path.join(dir, id, "job.json"),
    JSON.stringify({
      id,
      kind: "video",
      input: `topic number ${i}`,
      voice: "silent",
      state: "queued",
      stage: "start",
      message: "starting",
      pct: 0,
      started: t0 + i,
      args: [],
    }),
  );
});
// the stored line names two of the three: the third rejoins at the back, oldest first
fs.writeFileSync(path.join(dir, "queue.json"), JSON.stringify([ids[2], ids[0]]));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
  EXPLANIMATE_MAX_CONCURRENT: "1",
  FAKE_DELAY_MS: "100",
});
const jobs = () => import("../lib/jobs.ts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("a restart resumes the stored wait line in order, and no waiting job fails", async () => {
  const { getJob, touch } = await jobs();
  const settled = (id: string) => getJob(id)!.state === "done" || getJob(id)!.state === "error";
  // node + tsx can take several seconds to boot on Windows when the whole suite runs at once
  for (let i = 0; i < 600 && !ids.every(settled); i++) {
    ids.forEach(touch);
    for (const id of ids) assert.notEqual(getJob(id)!.state, "error", `${id}: ${getJob(id)!.error}`);
    await sleep(50);
  }
  assert.deepEqual(
    ids.map((id) => getJob(id)!.state),
    ["done", "done", "done"],
  );
  const began = ids.map((id) => getJob(id)!.began!);
  assert.ok(began.every(Boolean), "every job ran");
  const order = [...ids].sort((a, b) => getJob(a)!.began! - getJob(b)!.began!);
  assert.deepEqual(order, [ids[2], ids[0], ids[1]], "the stored line first, then the missing job at the back");
});
