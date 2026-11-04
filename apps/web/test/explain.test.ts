import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("an explanation whose render never starts answers with an error instead of crashing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-explain-"));
  const id = "abcdef123459";
  fs.mkdirSync(path.join(dir, id), { recursive: true });
  fs.writeFileSync(
    path.join(dir, id, "job.json"),
    JSON.stringify({ id, kind: "video", input: "x", voice: "silent", state: "done", started: Date.now() }),
  );
  Object.assign(process.env, {
    EXPLANIMATE_JOBS_DIR: dir,
    EXPLANIMATE_RESUME: "0",
    // nowhere to spawn from: the child fails with an 'error' event, never a close with output
    EXPLANIMATE_ROOT: path.join(dir, "nowhere"),
  });
  const { explain } = await import("../lib/jobs.ts");
  const r = (await explain(id, "api")) as { type: string; message?: string };
  assert.equal(r.type, "error");
  assert.match(r.message!, /Could not start the renderer/);
  fs.rmSync(dir, { recursive: true, force: true });
});
