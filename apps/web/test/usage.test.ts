import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimVideoSlot,
  dailyLimitFor,
  defaultDailyVideos,
  recordVideo,
  releaseVideoSlot,
  setUserLimitByEmail,
  utcDay,
  videosLeftToday,
  videosUsedToday,
  type Claim,
} from "../lib/usage.ts";
import type { D1Bound, D1Db } from "../lib/db.ts";

/** An in-memory D1 handle that answers the exact statements usage.ts issues. */
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
          const limit = params[2] as number;
          const cur = this.usage.get(key);
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
  return c as { ok: true; used: number; limit: number };
};

test("three videos go through, the fourth is a 429 that names the reset", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  assert.deepEqual(ok(await claimVideoSlot("u1", now, db)), { ok: true, used: 1, limit: 3 });
  assert.deepEqual(ok(await claimVideoSlot("u1", now, db)), { ok: true, used: 2, limit: 3 });
  assert.deepEqual(ok(await claimVideoSlot("u1", now, db)), { ok: true, used: 3, limit: 3 });
  assert.deepEqual(await claimVideoSlot("u1", now, db), {
    ok: false,
    status: 429,
    error: "You've used all 3 videos for today. Your limit resets at 00:00 UTC.",
  });
  assert.equal(await videosUsedToday("u1", now, db), 3);
  assert.equal(await videosUsedToday("u2", now, db), 0, "another account has its own count");
});

test("a user_limits row overrides the default, and the count resets on the next UTC day", async () => {
  const db = new FakeD1();
  db.users.set("a@x.co", "u1");
  assert.deepEqual(await setUserLimitByEmail("a@x.co", 1, db), { ok: true, userId: "u1", limit: 1 });
  assert.equal(await dailyLimitFor("u1", db), 1);
  assert.equal(await dailyLimitFor("nobody", db), 3);
  const day1 = Date.parse("2026-05-01T23:59:00Z");
  assert.equal(ok(await claimVideoSlot("u1", day1, db)).used, 1);
  assert.equal((await claimVideoSlot("u1", day1, db)).ok, false);
  const day2 = Date.parse("2026-05-02T00:01:00Z");
  assert.notEqual(utcDay(day1), utcDay(day2));
  assert.deepEqual(ok(await claimVideoSlot("u1", day2, db)), { ok: true, used: 1, limit: 1 });
});

test("the claim is one atomic upsert that only counts under the limit", async () => {
  const db = new FakeD1();
  await claimVideoSlot("u1", Date.parse("2026-05-01T12:00:00Z"), db);
  const upsert = db.seen.find((s) => s.sql.includes("ON CONFLICT"));
  assert.ok(upsert);
  assert.match(
    upsert.sql,
    /INSERT INTO usage.*ON CONFLICT \(user_id, day\) DO UPDATE SET videos = videos \+ 1 WHERE videos < \? RETURNING videos/,
  );
  assert.deepEqual(upsert.params, ["u1", "2026-05-01", 3]);
});

test("releasing a slot gives it back, never below zero; the left-count line does the math", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  await claimVideoSlot("u1", now, db);
  await claimVideoSlot("u1", now, db);
  await releaseVideoSlot("u1", now, db);
  await releaseVideoSlot("nobody", now, db);
  assert.deepEqual(await videosLeftToday("u1", now, db), { used: 1, limit: 3, left: 2 });
  assert.deepEqual(await videosLeftToday("nobody", now, db), { used: 0, limit: 3, left: 3 });
});

test("every started video records which account started it", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  await recordVideo("job1", "u1", "how DNS works", now, db);
  assert.deepEqual(db.videos, [{ id: "job1", userId: "u1", input: "how DNS works", at: now }]);
});

test("setting a limit needs an account that signed in once, and a positive whole number", async () => {
  const db = new FakeD1();
  assert.deepEqual(await setUserLimitByEmail("nobody@x.co", 5, db), {
    ok: false,
    error: "No account for nobody@x.co yet. They sign in once first, then try again.",
  });
  db.users.set("a@x.co", "u1");
  assert.deepEqual(await setUserLimitByEmail("A@X.CO ", 5, db), { ok: true, userId: "u1", limit: 5 });
  assert.equal(db.limits.get("u1"), 5);
  assert.deepEqual(await setUserLimitByEmail("a@x.co", 0, db), {
    ok: false,
    error: "The limit is a whole number of videos per day, at least 1.",
  });
  assert.deepEqual(await setUserLimitByEmail("a@x.co", 2.5, db), {
    ok: false,
    error: "The limit is a whole number of videos per day, at least 1.",
  });
});

test("the default comes from EXPLANIMATE_DAILY_VIDEOS, nonsense falls back to 3", () => {
  const saved = process.env.EXPLANIMATE_DAILY_VIDEOS;
  process.env.EXPLANIMATE_DAILY_VIDEOS = "7";
  assert.equal(defaultDailyVideos(), 7);
  for (const v of ["0", "-2", "2.5x", "nope", ""]) {
    process.env.EXPLANIMATE_DAILY_VIDEOS = v;
    assert.equal(defaultDailyVideos(), 3, JSON.stringify(v));
  }
  if (saved === undefined) delete process.env.EXPLANIMATE_DAILY_VIDEOS;
  else process.env.EXPLANIMATE_DAILY_VIDEOS = saved;
});
