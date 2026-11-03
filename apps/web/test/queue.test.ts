import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// every render here is the fake CLI: it reports one step, waits, then finishes. Nothing paid runs.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-queue-"));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
  // each fake render takes at least this long (the CLI environment is read once, when jobs.ts loads)
  FAKE_DELAY_MS: "300",
});
// loaded on first use (the test files run as CommonJS, so no top-level await); the env above is set by then
const jobs = () => import("../lib/jobs.ts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("past the render slots, every request is accepted and waits its turn, first in first out", async () => {
  const { admit, getJob, startJob, touch } = await jobs();
  const settled = (id: string) => getJob(id)!.state === "done" || getJob(id)!.state === "error";
  Object.assign(process.env, { EXPLANIMATE_CONCURRENCY: "2" });
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    assert.equal(admit("someone"), undefined, `request ${i + 1} is not turned away`);
    ids.push(startJob(`topic number ${i}`, "silent").id);
  }
  assert.deepEqual(
    ids.map((id) => getJob(id)!.state),
    ["running", "running", "queued", "queued", "queued", "queued"],
  );
  assert.equal(getJob(ids[2])!.pct, 0);
  assert.equal(getJob(ids[2])!.stage, "start");

  for (let i = 0; i < 400 && !ids.every(settled); i++) {
    ids.forEach(touch); // the pages are still open and polling
    const states = ids.map((id) => getJob(id)!.state);
    // never more than two at once, and a later job never starts while an earlier one still waits
    assert.ok(states.filter((s) => s === "running").length <= 2, states.join());
    const firstWaiting = states.indexOf("queued");
    if (firstWaiting >= 0)
      assert.ok(
        states.slice(firstWaiting).every((s) => s === "queued"),
        states.join(),
      );
    await sleep(50);
  }
  assert.deepEqual(
    ids.map((id) => getJob(id)!.state),
    Array(6).fill("done"),
  );
  const began = ids.map((id) => getJob(id)!.began!);
  assert.deepEqual(
    [...began].sort((a, b) => a - b),
    began,
    "started in the order they came in",
  );
});

test("a waiting job whose page closed is dropped, so it never takes a slot", async () => {
  const { getJob, startJob, touch } = await jobs();
  const settled = (id: string) => getJob(id)!.state === "done" || getJob(id)!.state === "error";
  Object.assign(process.env, { EXPLANIMATE_CONCURRENCY: "1", EXPLANIMATE_WAIT_IDLE_S: "0.1" });
  const first = startJob("how DNS works", "silent").id;
  const gone = startJob("how TCP works", "silent").id; // nobody polls this one
  const watched = startJob("how TLS works", "silent").id;
  assert.equal(getJob(gone)!.state, "queued");
  for (let i = 0; i < 400 && !settled(watched); i++) {
    touch(first);
    touch(watched);
    await sleep(50);
  }
  assert.equal(getJob(first)!.state, "done");
  assert.equal(getJob(gone)!.state, "error");
  assert.match(getJob(gone)!.error!, /page was closed/);
  assert.equal(getJob(gone)!.began, undefined, "it never ran");
  assert.equal(getJob(watched)!.state, "done");
  delete process.env.EXPLANIMATE_WAIT_IDLE_S;
});

test("only a very high, configurable ceiling on waiting jobs refuses a request", async () => {
  const { admit, getJob, startJob, touch } = await jobs();
  const settled = (id: string) => getJob(id)!.state === "done" || getJob(id)!.state === "error";
  Object.assign(process.env, { EXPLANIMATE_CONCURRENCY: "1", EXPLANIMATE_QUEUE_MAX: "2" });
  const ids = [startJob("one", "silent").id, startJob("two", "silent").id, startJob("three", "silent").id];
  assert.match(admit("someone") ?? "", /very busy/);
  delete process.env.EXPLANIMATE_QUEUE_MAX;
  assert.equal(admit("someone"), undefined, "the default ceiling is far higher");
  for (let i = 0; i < 400 && !ids.every(settled); i++) {
    ids.forEach(touch);
    await sleep(50);
  }
  assert.deepEqual(
    ids.map((id) => getJob(id)!.state),
    ["done", "done", "done"],
  );
});
