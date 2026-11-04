import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  adminEmails,
  fallbackUsage,
  getAdminLive,
  isAdminEmail,
  listAdminUsers,
  listAdminVideos,
  parseLimitEdit,
  requireAdmin,
  selectActiveJobs,
  selectFailures,
  setUserLimit,
  spendSummary,
  usagePerDay,
  type LiveSnapshotJob,
} from "../lib/admin.ts";
import type { D1Bound, D1Db } from "../lib/db.ts";

// the route-level tests need the jobs folder on disk, like the auth tests
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-admin-"));
Object.assign(process.env, { EXPLANIMATE_JOBS_DIR: dir, EXPLANIMATE_RESUME: "0" });
delete process.env.EXPLANIMATE_AUTH_ENABLED;
delete process.env.EXPLANIMATE_ADMIN_EMAILS;
delete process.env.ADMIN_EMAILS;

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const adminUsers = () => import("../app/api/admin/users/route.ts");
const adminLimits = () => import("../app/api/admin/limits/route.ts");
const adminMetrics = () => import("../app/api/admin/metrics/route.ts");
const adminLive = () => import("../app/api/admin/live/route.ts");

/** An in-memory D1 handle that answers the exact statements admin.ts issues. */
class FakeD1 implements D1Db {
  users: { id: string; email: string; createdAt: string }[] = [];
  limits = new Map<string, number>();
  usage: { userId: string; day: string; videos: number }[] = [];
  videos: { id: string; userId: string; input: string; inputLen: number; createdAt: number }[] = [];

  prepare = (sql: string) => {
    const norm = sql.replace(/\s+/g, " ").trim();
    const bind = (...params: unknown[]): D1Bound => ({
      first: async <T>(): Promise<T | null> => {
        if (norm.startsWith("SELECT id FROM user")) {
          const u = this.users.find((x) => x.email === params[0]);
          return (u ? { id: u.id } : null) as T | null;
        }
        return null;
      },
      all: async <T>(): Promise<T[]> => {
        if (norm.startsWith("SELECT id, email, createdAt FROM user")) return this.users as T[];
        if (norm.startsWith("SELECT user_id AS userId, daily_videos")) {
          return [...this.limits].map(([userId, daily]) => ({ userId, daily })) as T[];
        }
        if (norm.startsWith("SELECT user_id AS userId, videos FROM usage")) {
          return this.usage.filter((u) => u.day === params[0]).map(({ userId, videos }) => ({ userId, videos })) as T[];
        }
        if (norm.includes("FROM videos v LEFT JOIN user u")) {
          const byId = new Map(this.users.map((u) => [u.id, u.email]));
          return [...this.videos]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, params[0] as number)
            .map((v) => ({ ...v, email: byId.get(v.userId) ?? null })) as T[];
        }
        if (norm.includes("FROM usage GROUP BY day")) {
          const byDay = new Map<string, { videos: number; users: Set<string> }>();
          for (const u of this.usage) {
            const d = byDay.get(u.day) ?? { videos: 0, users: new Set<string>() };
            d.videos += u.videos;
            d.users.add(u.userId);
            byDay.set(u.day, d);
          }
          return [...byDay]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .slice(0, params[0] as number)
            .map(([day, d]) => ({ day, videos: d.videos, users: d.users.size })) as T[];
        }
        return [] as T[]; // CREATE TABLE, PRAGMA, ALTER and anything else
      },
      run: async () => {
        if (norm.startsWith("INSERT INTO user_limits")) {
          this.limits.set(params[0] as string, params[1] as number);
          return { changes: 1, lastRowId: 0 };
        }
        return { changes: 0, lastRowId: 0 };
      },
    });
    return { bind };
  };
}

test("ADMIN_EMAILS works as a short alias, and the long name wins when both are set", () => {
  try {
    process.env.ADMIN_EMAILS = "alias@example.com";
    assert.deepEqual(adminEmails(), ["alias@example.com"]);
    process.env.EXPLANIMATE_ADMIN_EMAILS = "long@example.com";
    assert.deepEqual(adminEmails(), ["long@example.com"]);
  } finally {
    delete process.env.ADMIN_EMAILS;
    delete process.env.EXPLANIMATE_ADMIN_EMAILS;
  }
});

test("the admin list parses as lowercase addresses and matches case-insensitively", () => {
  const saved = process.env.EXPLANIMATE_ADMIN_EMAILS;
  try {
    delete process.env.EXPLANIMATE_ADMIN_EMAILS;
    assert.deepEqual(adminEmails(), []);
    assert.equal(isAdminEmail("boss@example.com"), false);
    assert.equal(isAdminEmail(null), false);
    process.env.EXPLANIMATE_ADMIN_EMAILS = " Boss@Example.com ,,ops@example.com ";
    assert.deepEqual(adminEmails(), ["boss@example.com", "ops@example.com"]);
    assert.equal(isAdminEmail("BOSS@example.com"), true);
    assert.equal(isAdminEmail("ops@example.com"), true);
    assert.equal(isAdminEmail("somebody@example.com"), false);
  } finally {
    if (saved === undefined) delete process.env.EXPLANIMATE_ADMIN_EMAILS;
    else process.env.EXPLANIMATE_ADMIN_EMAILS = saved;
  }
});

test("the gate is 404 unless auth is on and the signed-in address is listed", async () => {
  const saved = { ...process.env };
  const req = new Request("http://x/api/admin/users");
  try {
    delete process.env.EXPLANIMATE_AUTH_ENABLED;
    process.env.EXPLANIMATE_ADMIN_EMAILS = "boss@example.com";
    const off = await requireAdmin(req, async () => ({ id: "u1", email: "boss@example.com" }));
    assert.equal(off.ok, false);
    assert.equal(off.ok === false && off.response.status, 404);
    process.env.EXPLANIMATE_AUTH_ENABLED = "1";
    const out = await requireAdmin(req, async () => null);
    assert.equal(out.ok === false && out.response.status, 404, "signed out");
    const stranger = await requireAdmin(req, async () => ({ id: "u2", email: "somebody@example.com" }));
    assert.equal(stranger.ok === false && stranger.response.status, 404, "signed in but not an admin");
    const admin = await requireAdmin(req, async () => ({ id: "u1", email: "BOSS@EXAMPLE.COM" }));
    assert.equal(admin.ok, true, "case-insensitive match");
    assert.equal(admin.ok === true && admin.user.id, "u1");
  } finally {
    for (const k of ["EXPLANIMATE_AUTH_ENABLED", "EXPLANIMATE_ADMIN_EMAILS"]) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("admin routes answer 404 with auth off, without touching the database", async () => {
  delete process.env.EXPLANIMATE_AUTH_ENABLED;
  const { GET } = await adminUsers();
  const r = await GET(new Request("http://x/api/admin/users"), undefined as never);
  assert.equal(r.status, 404);
  const { POST } = await adminLimits();
  const w = await POST(
    new Request("http://x/api/admin/limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@x.co", limit: 5 }),
    }),
    undefined as never,
  );
  assert.equal(w.status, 404);
  const { GET: metrics } = await adminMetrics();
  const m = await metrics(new Request("http://x/api/admin/metrics"), undefined as never);
  assert.equal(m.status, 404, "the metrics endpoint is admin-only too");
  const { GET: liveGet } = await adminLive();
  const l = await liveGet(new Request("http://x/api/admin/live"), undefined as never);
  assert.equal(l.status, 404);
});

test("a limit edit is an email and a whole number from 0 to 1000", () => {
  assert.deepEqual(parseLimitEdit({ email: " a@x.co ", limit: 10 }), { ok: true, email: "a@x.co", limit: 10 });
  assert.deepEqual(parseLimitEdit({ email: "a@x.co", limit: 0 }), { ok: true, email: "a@x.co", limit: 0 });
  assert.deepEqual(parseLimitEdit({ email: "a@x.co", limit: 1000 }), { ok: true, email: "a@x.co", limit: 1000 });
  assert.deepEqual(parseLimitEdit({ email: "a@x.co", limit: "25" }), { ok: true, email: "a@x.co", limit: 25 });
  for (const body of [
    { email: "a@x.co", limit: -1 },
    { email: "a@x.co", limit: 1001 },
    { email: "a@x.co", limit: 2.5 },
    { email: "a@x.co", limit: "many" },
    { email: "a@x.co" },
  ]) {
    const r = parseLimitEdit(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.match(r.ok === false && r.error, /0 to 1000/);
  }
  for (const body of [{ email: "not-an-email", limit: 5 }, { email: "", limit: 5 }, { limit: 5 }]) {
    const r = parseLimitEdit(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.match(r.ok === false && r.error, /email/);
  }
});

test("setting a limit needs an account, and the lookup is case-insensitive", async () => {
  const db = new FakeD1();
  assert.deepEqual(await setUserLimit("nobody@x.co", 5, db), {
    ok: false,
    error: "No account for nobody@x.co yet. They sign in once first, then try again.",
  });
  db.users.push({ id: "u1", email: "a@x.co", createdAt: "2026-05-01T10:00:00.000Z" });
  assert.deepEqual(await setUserLimit("A@X.CO", 7, db), { ok: true, userId: "u1", limit: 7 });
  assert.equal(db.limits.get("u1"), 7);
});

test("users list merges accounts with today's usage and limits", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  db.users.push(
    { id: "u1", email: "a@x.co", createdAt: "2026-04-01T10:00:00.000Z" },
    { id: "u2", email: "b@x.co", createdAt: "2026-04-02T10:00:00.000Z" },
  );
  db.limits.set("u1", 10);
  db.usage.push({ userId: "u1", day: "2026-05-01", videos: 2 });
  db.usage.push({ userId: "u1", day: "2026-04-30", videos: 9 });
  assert.deepEqual(await listAdminUsers(now, db), [
    { id: "u1", email: "a@x.co", created: "2026-04-01T10:00:00.000Z", usedToday: 2, limit: 10 },
    { id: "u2", email: "b@x.co", created: "2026-04-02T10:00:00.000Z", usedToday: 0, limit: 3 },
  ]);
});

test("videos join owners from D1 with live status and cost from disk", async () => {
  const db = new FakeD1();
  const at = Date.parse("2026-05-01T12:00:00Z");
  db.users.push({ id: "u1", email: "a@x.co", createdAt: "2026-04-01T10:00:00.000Z" });
  db.videos.push(
    { id: "aaa", userId: "u1", input: "how DNS works", inputLen: 13, createdAt: at },
    { id: "bbb", userId: "gone", input: "old video", inputLen: 0, createdAt: at - 1000 },
  );
  const jobs = [{ id: "aaa", state: "done", costUsd: 0.25, started: at, began: at + 2000, finished: at + 62000, renderWaitMs: 500 }];
  assert.deepEqual(await listAdminVideos(jobs, db), [
    {
      id: "aaa",
      input: "how DNS works",
      inputLen: 13,
      owner: "a@x.co",
      created: new Date(at).toISOString(),
      status: "done",
      cost: 0.25,
      waitMs: 2000,
      renderWaitMs: 500,
      renderMs: 60000,
      totalMs: 62000,
    },
    {
      id: "bbb",
      input: "old video",
      inputLen: 9,
      owner: "gone",
      created: new Date(at - 1000).toISOString(),
      status: "gone",
      cost: 0,
      waitMs: null,
      renderWaitMs: null,
      renderMs: null,
      totalMs: null,
    },
  ]);
});

test("usage per day sums videos and counts accounts, newest first", async () => {
  const db = new FakeD1();
  db.usage.push(
    { userId: "u1", day: "2026-05-01", videos: 2 },
    { userId: "u2", day: "2026-05-01", videos: 1 },
    { userId: "u1", day: "2026-04-30", videos: 3 },
  );
  assert.deepEqual(await usagePerDay(db), [
    { day: "2026-05-01", videos: 3, users: 2 },
    { day: "2026-04-30", videos: 3, users: 1 },
  ]);
});

test("the live queue shows running and waiting jobs oldest first, with their place in line", () => {
  const jobs: LiveSnapshotJob[] = [
    { id: "b", state: "queued", started: 200, input: "b" },
    { id: "a", state: "running", stage: "voice", message: "recording", pct: 40, started: 100, usd: { total: 0.05 } },
    { id: "c", state: "queued", started: 300 },
    { id: "d", state: "done", started: 50 },
  ];
  assert.deepEqual(selectActiveJobs(jobs, ["b", "c"]), [
    {
      id: "a",
      kind: "video",
      state: "running",
      stage: "voice",
      message: "recording",
      pct: 40,
      started: 100,
      queuePosition: null,
      cost: 0.05,
    },
    { id: "b", kind: "video", state: "queued", stage: "start", message: "", pct: 0, started: 200, queuePosition: 1, cost: 0 },
    { id: "c", kind: "video", state: "queued", stage: "start", message: "", pct: 0, started: 300, queuePosition: 2, cost: 0 },
  ]);
});

test("live failures are failed runs newest first, without the cancelled ones", () => {
  const jobs: LiveSnapshotJob[] = [
    { id: "old", state: "error", started: 100, finished: 150, error: "boom", input: "how DNS works" },
    { id: "new", kind: "focus", state: "error", started: 200, error: "bust", input: "x".repeat(200) },
    { id: "stop", state: "error", cancelled: true, started: 300, error: "Cancelled." },
    { id: "ok", state: "done", started: 400 },
  ];
  assert.deepEqual(selectFailures(jobs), [
    { id: "new", kind: "focus", input: "x".repeat(120), started: 200, finished: null, error: "bust" },
    { id: "old", kind: "video", input: "how DNS works", started: 100, finished: 150, error: "boom" },
  ]);
  assert.equal(selectFailures(jobs, 1).length, 1);
});

test("fallback usage prefers the recorded flags and reads older manifests once", () => {
  const jdir = fs.mkdtempSync(path.join(os.tmpdir(), "el-admin-fb-"));
  try {
    const jobs: LiveSnapshotJob[] = [
      { id: "aaaaaaaaaaaa", state: "done", started: 1, fallbacks: { llm: true, tts: false } },
      { id: "bbbbbbbbbbbb", state: "done", started: 2 },
      { id: "cccccccccccc", state: "done", started: 3 },
      { id: "dddddddddddd", state: "done", started: 4 },
      { id: "not-an-id!", state: "done", started: 5 },
      { id: "eeeeeeeeeeee", state: "running", started: 6 },
    ];
    fs.mkdirSync(path.join(jdir, "bbbbbbbbbbbb"), { recursive: true });
    fs.writeFileSync(
      path.join(jdir, "bbbbbbbbbbbb", "manifest.json"),
      JSON.stringify({ cost: { voice: "deepgram+cartesia", byModel: { "muse-spark-1.3-contributor": {} } } }),
    );
    fs.mkdirSync(path.join(jdir, "dddddddddddd"), { recursive: true });
    fs.writeFileSync(path.join(jdir, "dddddddddddd", "manifest.json"), "{oops");
    const cache = new Map();
    assert.deepEqual(fallbackUsage(jdir, jobs, cache), { llm: 1, tts: 1, checked: 2 });
    // the manifests were read once: removing one changes nothing afterwards
    fs.rmSync(path.join(jdir, "bbbbbbbbbbbb", "manifest.json"));
    assert.deepEqual(fallbackUsage(jdir, jobs, cache), { llm: 1, tts: 1, checked: 2 });
  } finally {
    fs.rmSync(jdir, { recursive: true, force: true });
  }
});

test("the live snapshot joins the queue, signups, usage, failures, spend, fallbacks and timings", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.EXPLANIMATE_META_CAP_USD;
    delete process.env.EXPLANIMATE_VOICE_CAP_USD;
    delete process.env.EXPLANIMATE_DAILY_CAP_USD;
    const db = new FakeD1();
    const now = Date.parse("2026-05-01T12:00:00Z");
    db.users.push({ id: "u1", email: "a@x.co", createdAt: "2026-04-01T10:00:00.000Z" });
    db.usage.push({ userId: "u1", day: "2026-05-01", videos: 2 });
    const jobs: LiveSnapshotJob[] = [
      {
        id: "aaaaaaaaaaaa",
        state: "running",
        stage: "voice",
        message: "recording",
        pct: 40,
        started: now - 60000,
        began: now - 50000,
        usd: { meta: 0.1, voice: 0.02, total: 0.12 },
        input: "how DNS works",
      },
      { id: "bbbbbbbbbbbb", state: "queued", started: now - 10000, input: "how TCP works" },
      {
        id: "cccccccccccc",
        state: "done",
        started: now - 3600000,
        began: now - 3600000,
        finished: now - 3500000,
        usd: { meta: 0.15, voice: 0.05, total: 0.2 },
        fallbacks: { llm: true, tts: false },
        input: "x",
      },
      {
        id: "dddddddddddd",
        state: "error",
        started: now - 7200000,
        finished: now - 7100000,
        error: "the renderer stopped (exit 1)",
        input: "y",
      },
      { id: "eeeeeeeeeeee", state: "error", cancelled: true, started: now - 8000000, error: "Cancelled.", input: "z" },
    ];
    const live = await getAdminLive({ jobs, queue: ["bbbbbbbbbbbb"], jobsDir: dir, db, cache: new Map(), nowMs: now });
    assert.equal(live.now, now);
    assert.equal(live.dbOff, false);
    assert.deepEqual(
      live.active.map((j) => [j.id, j.queuePosition]),
      [
        ["aaaaaaaaaaaa", null],
        ["bbbbbbbbbbbb", 1],
      ],
    );
    assert.deepEqual([live.queued, live.running], [1, 1]);
    assert.deepEqual(live.signups, [{ email: "a@x.co", created: "2026-04-01T10:00:00.000Z" }]);
    assert.deepEqual(live.videosPerDay, [{ day: "2026-05-01", videos: 2, users: 1 }]);
    assert.deepEqual(
      live.failures.map((f) => f.id),
      ["dddddddddddd"],
    );
    assert.match(live.failures[0].error, /renderer stopped/);
    assert.deepEqual(live.spend.caps, { meta: 25, voice: 10 });
    assert.ok(Math.abs(live.spend.today - 0.32) < 1e-9, String(live.spend.today));
    assert.deepEqual(live.fallbacks, { llm: 1, tts: 0, checked: 1 });
    assert.deepEqual([live.metrics.total, live.metrics.done, live.metrics.failed, live.metrics.cancelled], [5, 1, 1, 1]);
    assert.equal(live.metrics.p95RenderMs, 100000);
    assert.equal(live.metrics24h.total, 5);
  } finally {
    for (const k of ["EXPLANIMATE_META_CAP_USD", "EXPLANIMATE_VOICE_CAP_USD", "EXPLANIMATE_DAILY_CAP_USD"]) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("the live snapshot still answers when the database is down, with the account parts empty", async () => {
  const broken = {
    prepare: () => {
      throw new Error("D1 is down");
    },
  } as unknown as D1Db;
  const live = await getAdminLive({
    jobs: [{ id: "a", state: "running", started: 1 }],
    queue: [],
    jobsDir: dir,
    db: broken,
    cache: new Map(),
    nowMs: 1000,
  });
  assert.equal(live.dbOff, true);
  assert.deepEqual(live.signups, []);
  assert.deepEqual(live.videosPerDay, []);
  assert.deepEqual(
    live.active.map((j) => j.id),
    ["a"],
  );
  assert.deepEqual(live.spend.caps, { meta: 25, voice: 10 });
});

test("the spend summary reads today, the daily cap and the lifetime caps", () => {
  const saved = { ...process.env };
  try {
    delete process.env.EXPLANIMATE_META_CAP_USD;
    delete process.env.EXPLANIMATE_VOICE_CAP_USD;
    delete process.env.EXPLANIMATE_DAILY_CAP_USD;
    const now = Date.parse("2026-05-01T12:00:00Z");
    const s = spendSummary([{ started: now, usd: { meta: 0.2, voice: 0.05 } }], dir, now);
    assert.ok(Math.abs(s.today - 0.25) < 1e-9, String(s.today));
    assert.equal(s.dailyCap, 3);
    assert.equal(s.dailyOk, true);
    assert.deepEqual(s.lifetime, { meta: 0.2, voice: 0.05 });
    assert.deepEqual(s.caps, { meta: 25, voice: 10 });
    assert.deepEqual(s.warnings, []);
  } finally {
    for (const k of ["EXPLANIMATE_META_CAP_USD", "EXPLANIMATE_VOICE_CAP_USD", "EXPLANIMATE_DAILY_CAP_USD"]) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
