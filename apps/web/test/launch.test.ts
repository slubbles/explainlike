import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-launch-"));
const id = "abcdef123457";
fs.mkdirSync(path.join(dir, id), { recursive: true });
fs.writeFileSync(path.join(dir, id, "x.mp4"), "x");
fs.mkdirSync(path.join(dir, id, "audio"), { recursive: true });
// a render cut off mid-run: resumeInterrupted picks it up, and the quiet CLI exits 0 without a done event
fs.writeFileSync(
  path.join(dir, id, "job.json"),
  JSON.stringify({
    id,
    kind: "video",
    input: "https://github.com/a/b",
    voice: "silent",
    state: "running",
    stage: "render",
    message: "",
    pct: 80,
    started: Date.now(),
    args: ["https://github.com/a/b", "--out", path.join(dir, id)],
  }),
);
// a job file with a corrupt timestamp must not break the jobs list or /admin
const bad = "abcdef123458";
fs.mkdirSync(path.join(dir, bad), { recursive: true });
fs.writeFileSync(
  path.join(dir, bad, "job.json"),
  JSON.stringify({ id: bad, kind: "video", input: "x", voice: "silent", state: "done", started: "soon" }),
);
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  FAKE_QUIET_EXIT: "1",
});
const jobs = () => import("../lib/jobs.ts");

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("exit 0 without a done event is an error, not a phantom success", async () => {
  const { getJob, resumeInterrupted } = await jobs();
  const j = resumeInterrupted();
  assert.equal(j?.id, id);
  for (let i = 0; i < 300 && getJob(id)!.state === "running"; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(getJob(id)!.state, "error");
  assert.match(getJob(id)!.error!, /finished without a video/);
});

test("job files are real files: no dots, no directories, no job.json", async () => {
  const { jobFile } = await jobs();
  assert.equal(jobFile(id, "x.mp4"), path.join(dir, id, "x.mp4"));
  assert.equal(jobFile(id, "."), undefined);
  assert.equal(jobFile(id, ".."), undefined);
  assert.equal(jobFile(id, "audio"), undefined);
  assert.equal(jobFile(id, "job.json"), undefined);
  assert.equal(jobFile(id, "missing.mp4"), undefined);
  assert.equal(jobFile("not-an-id", "x.mp4"), undefined);
});

test("a garbage hourly cap falls back to 20 instead of letting everyone through", async () => {
  const { admit } = await jobs();
  process.env.EXPLANIMATE_JOBS_PER_HOUR = "soon";
  try {
    for (let i = 0; i < 20; i++) assert.equal(admit("launch-cap"), undefined, `request ${i + 1}`);
    assert.match(admit("launch-cap")!, /Hourly limit/);
  } finally {
    delete process.env.EXPLANIMATE_JOBS_PER_HOUR;
  }
});

test("a corrupt started timestamp is coerced at load", async () => {
  const { getJob } = await jobs();
  assert.ok(Number.isFinite(getJob(bad)!.started));
});
