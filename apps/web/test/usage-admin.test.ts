import { test } from "node:test";
import assert from "node:assert/strict";
import { claimVideoSlot, dailyLimitFor, videosLeftToday, videosUsedToday, type Claim } from "../lib/usage.ts";
import type { D1Bound, D1Db } from "../lib/db.ts";

/** An in-memory D1 handle that answers the exact statements usage.ts issues, limited and unlimited claims alike. */
class FakeD1 implements D1Db {
  usage = new Map<string, number>();
  limits = new Map<string, number>();
  users = new Map<string, string>();
  videos: { id: string; userId: string; input: string; at: number }[] = [];
  seen: { sql: string; params: unknown[] }[] = [];

  prepare = (sql: string) => {
    const norm = sql.replace(/\s+/g, " ").trim();
    const bind = (...params: unknown[]): D1Bound => {
      this.seen.push({ sql: norm, params });
      const first = async <T>(): Promise<T | null> => {
        if (norm.startsWith("SELECT daily_videos")) {
          const n = this.limits.get(params[0] as string);
          return (n === undefined ? null : { n }) as T | null;
        }
        if (norm.startsWith("SELECT videos")) {
          const n = this.usage.get(`${params[0]}|${params[1]}`);
          return (n === undefined ? null : { n }) as T | null;
        }
        if (norm.includes("ON CONFLICT (user_id, day)")) {
          const key = `${params[0]}|${params[1]}`;
          const cur = this.usage.get(key);
          // the admin claim has no WHERE videos < ? and always counts
          if (!norm.includes("WHERE videos <")) {
            const next = (cur ?? 0) + 1;
            this.usage.set(key, next);
            return { videos: next } as T;
          }
          const limit = params[2] as number;
          if (cur === undefined) {
            this.usage.set(key, 1);
            return { videos: 1 } as T;
          }
          // the WHERE videos < ? decides atomically, like the real statement
          if (cur >= limit) return null;
          this.usage.set(key, cur + 1);
          return { videos: cur + 1 } as T;
        }
        if (norm.startsWith("SELECT id FROM user")) {
          const id = this.users.get(params[0] as string);
          return (id === undefined ? null : { id }) as T | null;
        }
        return null;
      };
      return {
        first,
        all: async <T>(): Promise<T[]> => {
          const one = await first<T>();
          return one === null ? [] : [one];
        },
        run: async () => {
          if (norm.startsWith("UPDATE usage SET videos = MAX(0, videos - 1)")) {
            const key = `${params[0]}|${params[1]}`;
            this.usage.set(key, Math.max(0, (this.usage.get(key) ?? 0) - 1));
            return { changes: 1, lastRowId: 0 };
          }
          if (norm.startsWith("INSERT INTO videos")) {
            const [id, userId, input, at] = params as [string, string, string, number];
            this.videos.push({ id, userId, input, at });
            return { changes: 1, lastRowId: 0 };
          }
          if (norm.startsWith("INSERT INTO user_limits")) {
            this.limits.set(params[0] as string, params[1] as number);
            return { changes: 1, lastRowId: 0 };
          }
          return { changes: 0, lastRowId: 0 }; // CREATE TABLE and anything else
        },
      };
    };
    return { bind };
  };
}

const ok = (c: Claim) => {
  assert.equal(c.ok, true);
  return c as { ok: true; used: number; limit: number | null };
};

function setAdminEnv(value: string | undefined, alias?: string) {
  const saved = { main: process.env.EXPLANIMATE_ADMIN_EMAILS, alias: process.env.ADMIN_EMAILS };
  if (value === undefined) delete process.env.EXPLANIMATE_ADMIN_EMAILS;
  else process.env.EXPLANIMATE_ADMIN_EMAILS = value;
  if (alias === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = alias;
  return () => {
    if (saved.main === undefined) delete process.env.EXPLANIMATE_ADMIN_EMAILS;
    else process.env.EXPLANIMATE_ADMIN_EMAILS = saved.main;
    if (saved.alias === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = saved.alias;
  };
}

test("an admin address is never refused past the default limit, and still counts up", async () => {
  const restore = setAdminEnv("boss@x.co");
  try {
    const db = new FakeD1();
    const now = Date.parse("2026-05-01T12:00:00Z");
    assert.equal(await dailyLimitFor("u-admin", db, "boss@x.co"), null);
    for (let i = 1; i <= 5; i++)
      assert.deepEqual(ok(await claimVideoSlot("u-admin", now, db, "boss@x.co")), { ok: true, used: i, limit: null });
    assert.equal(await videosUsedToday("u-admin", now, db), 5);
    assert.deepEqual(await videosLeftToday("u-admin", now, db, "boss@x.co"), { used: 5, limit: null, left: null });
    const upsert = db.seen.find((s) => s.sql.includes("ON CONFLICT"));
    assert.ok(upsert);
    assert.doesNotMatch(upsert.sql, /WHERE videos </);
    assert.deepEqual(upsert.params, ["u-admin", "2026-05-01"]);
  } finally {
    restore();
  }
});

test("anyone else still stops at 3 with the 429 that names the reset", async () => {
  const restore = setAdminEnv("boss@x.co");
  try {
    const db = new FakeD1();
    const now = Date.parse("2026-05-01T12:00:00Z");
    assert.equal(await dailyLimitFor("u1", db, "fan@x.co"), 3);
    assert.deepEqual(ok(await claimVideoSlot("u1", now, db, "fan@x.co")), { ok: true, used: 1, limit: 3 });
    assert.deepEqual(ok(await claimVideoSlot("u1", now, db, "fan@x.co")), { ok: true, used: 2, limit: 3 });
    assert.deepEqual(ok(await claimVideoSlot("u1", now, db, "fan@x.co")), { ok: true, used: 3, limit: 3 });
    assert.deepEqual(await claimVideoSlot("u1", now, db, "fan@x.co"), {
      ok: false,
      status: 429,
      error: "You've used all 3 videos for today. Your limit resets at 00:00 UTC.",
    });
    assert.deepEqual(await videosLeftToday("u1", now, db, "fan@x.co"), { used: 3, limit: 3, left: 0 });
  } finally {
    restore();
  }
});

test("admin matching ignores case and surrounding spaces", async () => {
  const restore = setAdminEnv("  Boss@X.Co ");
  try {
    const db = new FakeD1();
    const now = Date.parse("2026-05-01T12:00:00Z");
    assert.equal(await dailyLimitFor("u-admin", db, "boss@x.co"), null);
    assert.equal(await dailyLimitFor("u-admin", db, "BOSS@x.CO"), null);
    for (let i = 1; i <= 4; i++) assert.equal(ok(await claimVideoSlot("u-admin", now, db, "BOSS@X.CO")).used, i);
  } finally {
    restore();
  }
});

test("the ADMIN_EMAILS alias lists admins too", async () => {
  const restore = setAdminEnv(undefined, "boss@x.co");
  try {
    const db = new FakeD1();
    const now = Date.parse("2026-05-01T12:00:00Z");
    assert.equal(await dailyLimitFor("u-admin", db, "boss@x.co"), null);
    for (let i = 1; i <= 4; i++) assert.equal(ok(await claimVideoSlot("u-admin", now, db, "boss@x.co")).used, i);
  } finally {
    restore();
  }
});
