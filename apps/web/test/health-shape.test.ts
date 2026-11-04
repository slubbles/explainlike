import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-health-shape-"));
Object.assign(process.env, { EXPLANIMATE_JOBS_DIR: dir, EXPLANIMATE_RESUME: "0" });
delete process.env.EXPLANIMATE_AUTH_ENABLED;

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const health = () => import("../app/api/health/route.ts");

test("the public health answer is only {ok}, with a 200/503 to match and nothing cached", async () => {
  const { GET } = await health();
  const r = await GET(new Request("http://x/api/health"), undefined as never);
  const body = (await r.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["ok"]);
  assert.equal(typeof body.ok, "boolean");
  assert.equal(r.status, body.ok ? 200 : 503);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(JSON.stringify(body), /checks|problems|errors24h|paused|fallbacks/);
});
