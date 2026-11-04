import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// every render here is the fake CLI; nothing paid runs and no session exists
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-auth-"));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
  FAKE_DELAY_MS: "50",
});
delete process.env.EXPLANIMATE_AUTH_ENABLED;
delete process.env.BETTER_AUTH_SECRET;

const postJobs = () => import("../app/api/jobs/route.ts");
const postFollowUp = () => import("../app/api/jobs/[id]/followup/route.ts");
const postExplain = () => import("../app/api/jobs/[id]/explain/route.ts");
const turn = () => import("../app/api/voice/turn/route.ts");
const token = () => import("../app/api/voice/token/route.ts");
const speak = () => import("../app/api/voice/speak/route.ts");
const authConfig = () => import("../app/api/auth-config/route.ts");
const authAll = () => import("../app/api/auth/[...all]/route.ts");

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The 401 path logs why the session check failed; keep the test output quiet. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

test("flag off: creating a video works without a session, exactly as today", async () => {
  const { POST } = await postJobs();
  const r = await POST(post("http://x/api/jobs", { input: "how DNS works", voice: "silent" }));
  assert.equal(r.status, 200);
  const j = (await r.json()) as { id: string };
  assert.match(j.id, /^[a-f0-9]{12}$/);
});

test("flag off: reading stays open and the auth endpoints stay dark", async () => {
  const { GET: jobs } = await postJobs();
  assert.equal((await jobs(new Request("http://x/api/jobs"))).status, 200);
  const { GET: config } = await authConfig();
  assert.deepEqual(await (await config(new Request("http://x/api/auth-config"))).json(), { enabled: false });
  const { GET: all } = await authAll();
  const r = await all(new Request("http://x/api/auth/session"));
  assert.equal(r.status, 404);
});

test("flag on: creating needs a session", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  try {
    await quiet(async () => {
      const { POST } = await postJobs();
      const r = await POST(post("http://x/api/jobs", { input: "how DNS works", voice: "silent" }));
      assert.equal(r.status, 401);
      assert.deepEqual(await r.json(), { error: "Sign in to make a video." });
    });
  } finally {
    delete process.env.EXPLANIMATE_AUTH_ENABLED;
  }
});

test("flag on: follow-ups, explanations and the voice routes need a session too", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  try {
    await quiet(async () => {
      const ctx = { params: Promise.resolve({ id: "abcdef123456" }) };
      const { POST: followUp } = await postFollowUp();
      assert.equal((await followUp(post("http://x/f", { whatIf: "10x" }), ctx)).status, 401);
      const { POST: explain } = await postExplain();
      assert.equal((await explain(post("http://x/e", { component: "api" }), ctx)).status, 401);
      // voice mode only answers on localhost, so these carry a localhost host
      const local = (url: string, body?: unknown) =>
        new Request(url, {
          method: body === undefined ? "GET" : "POST",
          headers: { host: "localhost:3000", "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const { POST: voiceTurn } = await turn();
      assert.equal((await voiceTurn(local("http://localhost:3000/api/voice/turn", { turns: [] }))).status, 401);
      const { POST: voiceToken } = await token();
      assert.equal((await voiceToken(local("http://localhost:3000/api/voice/token", {}))).status, 401);
      const { GET: voiceSpeak } = await speak();
      assert.equal((await voiceSpeak(local("http://localhost:3000/api/voice/speak?text=hi"))).status, 401);
    });
  } finally {
    delete process.env.EXPLANIMATE_AUTH_ENABLED;
  }
});

test("flag on: reading still stays open, and auth-config names the site key", async () => {
  process.env.EXPLANIMATE_AUTH_ENABLED = "1";
  process.env.EXPLANIMATE_TURNSTILE_SITE_KEY = "test-site-key";
  try {
    await quiet(async () => {
      const { GET: jobs } = await postJobs();
      assert.equal((await jobs(new Request("http://x/api/jobs"))).status, 200);
      const { GET: config } = await authConfig();
      const body = (await (await config(new Request("http://x/api/auth-config"))).json()) as Record<string, unknown>;
      assert.deepEqual(body, { enabled: true, turnstileSiteKey: "test-site-key", user: null, videos: null });
    });
  } finally {
    delete process.env.EXPLANIMATE_AUTH_ENABLED;
    delete process.env.EXPLANIMATE_TURNSTILE_SITE_KEY;
  }
});

test("anything but the exact value 1 leaves auth off", async () => {
  const { POST } = await postJobs();
  for (const v of ["0", "yes", "TRUE", " 1", ""]) {
    process.env.EXPLANIMATE_AUTH_ENABLED = v;
    const r = await POST(post("http://x/api/jobs", { input: "how DNS works", voice: "silent" }));
    assert.equal(r.status, 200, JSON.stringify(v));
  }
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
});
