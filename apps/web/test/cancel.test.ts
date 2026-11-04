import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the fake CLI stands in for a render that takes a while: nothing paid runs
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-cancel-"));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
  EXPLANIMATE_REQ_PER_MIN: "1000",
  FAKE_DELAY_MS: "20000",
});
delete process.env.EXPLANIMATE_AUTH_ENABLED;
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const start = async (input: string, cookie?: string) => {
  const { POST } = await import("../app/api/jobs/route.ts");
  const r = await POST(
    new Request("https://explanimate.co/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ input, voice: "silent" }),
    }),
  );
  assert.equal(r.status, 200);
  return { id: (await r.json()).id as string, cookie: cookie ?? (r.headers.get("set-cookie") ?? "").split(";")[0] };
};
const cancel = async (id: string, cookie?: string) => {
  const { POST } = await import("../app/api/jobs/[id]/cancel/route.ts");
  return POST(new Request(`https://explanimate.co/api/jobs/${id}/cancel`, { method: "POST", headers: cookie ? { cookie } : {} }), ctx(id));
};
const until = async (ok: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

test("only the owner can cancel a running video, and it stops for good", async () => {
  const { getJob } = await import("../lib/jobs.ts");
  const a = await start("how a zipper works");
  await until(() => getJob(a.id)?.state === "running");

  assert.equal((await cancel(a.id)).status, 403, "no owner cookie");
  assert.equal((await cancel(a.id, `ex_owner=${"0".repeat(32)}`)).status, 403, "someone else's cookie");
  assert.equal(getJob(a.id)?.state, "running");

  const r = await cancel(a.id, a.cookie);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const seen = await r.json();
  assert.equal(seen.state, "error");
  assert.equal(seen.cancelled, true);
  assert.equal(seen.mine, true);
  assert.equal(seen.owner, undefined, "the owner key never leaves the server");

  // the fake render would print "done" after 20 s; a cancelled job never turns into one
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(getJob(a.id)?.state, "error");
  assert.equal(getJob(a.id)?.cancelled, true);
  assert.equal((await cancel(a.id, a.cookie)).status, 409, "nothing left to stop");
});

test("a waiting video leaves the line and never starts", async () => {
  Object.assign(process.env, { EXPLANIMATE_CONCURRENCY: "1" });
  const { getJob } = await import("../lib/jobs.ts");
  const first = await start("how DNS works");
  const second = await start("how TLS works", first.cookie);
  await until(() => getJob(first.id)?.state === "running");
  assert.equal(getJob(second.id)?.state, "queued");

  assert.equal((await cancel(second.id, second.cookie)).status, 200);
  assert.equal(getJob(second.id)?.cancelled, true);
  assert.equal(getJob(second.id)?.began, undefined, "it never took a render slot");

  assert.equal((await cancel(first.id, first.cookie)).status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(getJob(second.id)?.began, undefined, "freeing the slot does not start a cancelled job");
});

test("an unknown id is a 404", async () => {
  assert.equal((await cancel("0123456789ab")).status, 404);
});
