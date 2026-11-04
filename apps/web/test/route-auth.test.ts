import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// route guards: who may call what, and how often. The rate-limit test runs last because
// it exhausts the per-minute windows the other tests in this file would otherwise use.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-route-auth-"));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
});
delete process.env.EXPLANIMATE_AUTH_ENABLED;
delete process.env.BETTER_AUTH_SECRET;
delete process.env.EXPLANIMATE_GALLERY_DIR;

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The 401/404 paths log why the session check failed; keep the test output quiet. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

test("every admin route answers 404 with auth off, without touching the database", async () => {
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
  for (const name of ["users", "videos", "usage", "spend", "errors", "health"]) {
    const { GET } = await import(`../app/api/admin/${name}/route.ts`);
    const r = await GET(new Request(`http://x/api/admin/${name}`), undefined as never);
    assert.equal(r.status, 404, name);
  }
  const { POST } = await import("../app/api/admin/limits/route.ts");
  const w = await POST(post("http://x/api/admin/limits", { email: "a@x.co", limit: 5 }), undefined as never);
  assert.equal(w.status, 404);
});

test("creating, explaining and follow-ups need a session when auth is on; admins still 404", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  try {
    await quiet(async () => {
      const { POST: jobs } = await import("../app/api/jobs/route.ts");
      assert.equal((await jobs(post("http://x/api/jobs", { input: "how DNS works" }), undefined as never)).status, 401);
      const ctx = { params: Promise.resolve({ id: "abcdef123456" }) };
      const { POST: explain } = await import("../app/api/jobs/[id]/explain/route.ts");
      assert.equal((await explain(post("http://x/e", { component: "api" }), ctx)).status, 401);
      const { POST: followup } = await import("../app/api/jobs/[id]/followup/route.ts");
      assert.equal((await followup(post("http://x/f", { whatIf: "10x" }), ctx)).status, 401);
      const { POST: limits } = await import("../app/api/admin/limits/route.ts");
      assert.equal((await limits(post("http://x/l", { email: "a@x.co", limit: 1 }), undefined as never)).status, 404);
    });
  } finally {
    delete process.env.EXPLANIMATE_AUTH_ENABLED;
  }
});

test("malformed job ids are refused before any lookup", async () => {
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
  const { GET: job } = await import("../app/api/jobs/[id]/route.ts");
  assert.equal((await job(new Request("http://x/api/jobs/xyz"), { params: Promise.resolve({ id: "xyz" }) })).status, 404);
  const { GET: captions } = await import("../app/api/jobs/[id]/captions/route.ts");
  assert.equal((await captions(new Request("http://x/api/jobs/xyz/captions"), { params: Promise.resolve({ id: "xyz" }) })).status, 404);
  const { POST: explain } = await import("../app/api/jobs/[id]/explain/route.ts");
  assert.equal((await explain(post("http://x/e", { component: "api" }), { params: Promise.resolve({ id: "xyz" }) })).status, 400);
  const { POST: followup } = await import("../app/api/jobs/[id]/followup/route.ts");
  assert.equal((await followup(post("http://x/f", { whatIf: "10x" }), { params: Promise.resolve({ id: "xyz" }) })).status, 400);
});

test("every public read is rate limited", async () => {
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
  const perMin = Number(process.env.EXPLANIMATE_REQ_PER_MIN ?? 12);
  const health = await import("../app/api/health/route.ts");
  const gallery = await import("../app/api/gallery/route.ts");
  const galleryFile = await import("../app/api/gallery/[name]/route.ts");
  const jobs = await import("../app/api/jobs/route.ts");
  const job = await import("../app/api/jobs/[id]/route.ts");
  const file = await import("../app/api/jobs/[id]/file/[name]/route.ts");
  const captions = await import("../app/api/jobs/[id]/captions/route.ts");
  const authConfig = await import("../app/api/auth-config/route.ts");
  const runtimeConfig = await import("../app/api/runtime-config/route.ts");
  const cases: [string, () => Promise<Response>][] = [
    ["health", () => health.GET(new Request("http://x/api/health"), undefined as never)],
    ["gallery", () => gallery.GET(new Request("http://x/api/gallery"), undefined as never)],
    [
      "gallery-file",
      () => galleryFile.GET(new Request("http://x/api/gallery/nope.mp4"), { params: Promise.resolve({ name: "nope.mp4" }) }),
    ],
    ["jobs-list", () => jobs.GET(new Request("http://x/api/jobs"), undefined as never)],
    ["job", () => job.GET(new Request("http://x/api/jobs/abcdef123456"), { params: Promise.resolve({ id: "abcdef123456" }) })],
    [
      "file",
      () =>
        file.GET(new Request("http://x/api/jobs/abcdef123456/file/nope.mp4"), {
          params: Promise.resolve({ id: "abcdef123456", name: "nope.mp4" }),
        }),
    ],
    [
      "captions",
      () => captions.GET(new Request("http://x/api/jobs/abcdef123456/captions"), { params: Promise.resolve({ id: "abcdef123456" }) }),
    ],
    ["auth-config", () => authConfig.GET(new Request("http://x/api/auth-config"), undefined as never)],
    ["runtime-config", () => runtimeConfig.GET(new Request("http://x/api/runtime-config"), undefined as never)],
  ];
  for (const [name, run] of cases) {
    let limited = false;
    for (let i = 0; i < perMin + 2 && !limited; i++) limited = (await run()).status === 429;
    assert.equal(limited, true, `${name} answers 429 past the per-minute limit`);
  }
});
