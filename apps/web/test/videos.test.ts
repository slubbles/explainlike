import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ago,
  deleteUserAccount,
  deleteUserVideo,
  formatLabel,
  listVideosForUser,
  mss,
  updateVideoResult,
  videoOwnerId,
  when,
  type VideoJobLike,
  type VideoResult,
} from "../lib/videos.ts";
import type { D1Bound, D1Db } from "../lib/db.ts";

interface Row {
  id: string;
  userId: string;
  input: string;
  at: number;
  status: string;
  cost: number;
  title: string;
  format: string;
  durationSec: number;
  poster: string;
  files: string;
}

/** An in-memory D1 handle that answers the exact statements videos.ts issues. */
class FakeD1 implements D1Db {
  videos: Row[] = [];
  usage = new Map<string, number>();
  limits = new Map<string, number>();
  sessions = new Set<string>();
  accounts = new Set<string>();
  users = new Set<string>();
  seen: { sql: string; params: unknown[] }[] = [];
  fail: string | null = null;

  prepare = (sql: string) => {
    const norm = sql.replace(/\s+/g, " ").trim();
    const bind = (...params: unknown[]): D1Bound => {
      this.seen.push({ sql: norm, params });
      if (this.fail && norm.startsWith(this.fail)) throw new Error("the database is down");
      const first = async <T>(): Promise<T | null> => {
        if (norm.startsWith("SELECT user_id AS userId FROM videos")) {
          const v = this.videos.find((x) => x.id === params[0]);
          return (v ? { userId: v.userId } : null) as T | null;
        }
        return null;
      };
      return {
        first,
        all: async <T>(): Promise<T[]> => {
          if (norm.includes("FROM videos WHERE user_id = ? ORDER BY created_at DESC")) {
            return [...this.videos]
              .filter((v) => v.userId === params[0])
              .sort((a, b) => b.at - a.at)
              .slice(0, params[1] as number)
              .map((v) => ({ ...v, createdAt: v.at }) as unknown as T);
          }
          if (norm === "SELECT id FROM videos WHERE user_id = ?") {
            return this.videos.filter((v) => v.userId === params[0]).map((v) => ({ id: v.id }) as unknown as T);
          }
          return [] as T[];
        },
        run: async () => {
          if (norm.startsWith("UPDATE videos SET")) {
            const v = this.videos.find((x) => x.id === params[params.length - 1]);
            if (v) {
              const cols = [...norm.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
              for (let i = 0; i < cols.length; i++) {
                const c = cols[i];
                if (c === "title") v.title = params[i] as string;
                else if (c === "format") v.format = params[i] as string;
                else if (c === "duration_sec") v.durationSec = params[i] as number;
                else if (c === "poster") v.poster = params[i] as string;
                else if (c === "files") v.files = params[i] as string;
                else if (c === "status") v.status = params[i] as string;
                else if (c === "cost") v.cost = params[i] as number;
              }
              return { changes: 1, lastRowId: 0 };
            }
            return { changes: 0, lastRowId: 0 };
          }
          if (norm === "DELETE FROM videos WHERE id = ?") {
            const before = this.videos.length;
            this.videos = this.videos.filter((x) => x.id !== params[0]);
            return { changes: before - this.videos.length, lastRowId: 0 };
          }
          if (norm === "DELETE FROM videos WHERE user_id = ?") {
            const before = this.videos.length;
            this.videos = this.videos.filter((x) => x.userId !== params[0]);
            return { changes: before - this.videos.length, lastRowId: 0 };
          }
          if (norm === "DELETE FROM usage WHERE user_id = ?") {
            for (const k of [...this.usage.keys()]) if (k.startsWith(`${params[0]}|`)) this.usage.delete(k);
            return { changes: 1, lastRowId: 0 };
          }
          if (norm === "DELETE FROM user_limits WHERE user_id = ?") {
            this.limits.delete(params[0] as string);
            return { changes: 1, lastRowId: 0 };
          }
          if (norm === "DELETE FROM session WHERE userId = ?") {
            this.sessions.delete(params[0] as string);
            return { changes: 1, lastRowId: 0 };
          }
          if (norm === "DELETE FROM account WHERE userId = ?") {
            this.accounts.delete(params[0] as string);
            return { changes: 1, lastRowId: 0 };
          }
          if (norm === "DELETE FROM user WHERE id = ?") {
            const had = this.users.delete(params[0] as string);
            return { changes: had ? 1 : 0, lastRowId: 0 };
          }
          return { changes: 0, lastRowId: 0 }; // CREATE TABLE and anything else
        },
      };
    };
    return { bind };
  };
}

const row = (over: Partial<Row> = {}): Row => ({
  id: "aaaabbbbcccc",
  userId: "u1",
  input: "https://github.com/karpathy/minbpe",
  at: Date.parse("2026-05-01T12:00:00Z"),
  status: "started",
  cost: 0,
  title: "",
  format: "",
  durationSec: 0,
  poster: "",
  files: "",
  ...over,
});

const job = (over: Partial<VideoJobLike> = {}): VideoJobLike => ({ id: "aaaabbbbcccc", ...over });

test("a finished row reads from the database, newest first, other accounts excluded", async () => {
  const db = new FakeD1();
  db.videos.push(
    row({ id: "old", at: 1000, title: "Old", format: "short", durationSec: 65, poster: "poster.jpg", files: '{"mp4":"a.mp4"}' }),
    row({ id: "new", at: 2000, title: "New", format: "deep", cost: 0.5 }),
    row({ id: "theirs", userId: "u2", at: 3000, title: "Theirs" }),
  );
  const videos = await listVideosForUser("u1", [], db);
  assert.deepEqual(
    videos.map((v) => v.id),
    ["new", "old"],
  );
  assert.deepEqual(videos[0], {
    id: "new",
    input: "https://github.com/karpathy/minbpe",
    createdAt: 2000,
    title: "New",
    format: "deep",
    files: {},
    status: "gone",
    cost: 0.5,
  });
  assert.equal(videos[1].durationSec, 65);
  assert.equal(videos[1].poster, "poster.jpg");
  assert.deepEqual(videos[1].files, { mp4: "a.mp4" });
});

test("a row from before the result columns joins its live job", async () => {
  const db = new FakeD1();
  db.videos.push(row({ status: "started" }));
  const [v] = await listVideosForUser(
    "u1",
    [
      job({
        state: "done",
        kind: "video",
        title: "Live title",
        ask: { format: "short" },
        durationSec: 83,
        costUsd: 0.12,
        outputs: { mp4: "m.mp4", tldr: "b.tldr", poster: "p.jpg" },
      }),
    ],
    db,
  );
  assert.equal(v.title, "Live title");
  assert.equal(v.format, "short");
  assert.equal(v.durationSec, 83);
  assert.equal(v.poster, "p.jpg");
  assert.deepEqual(v.files, { mp4: "m.mp4", tldr: "b.tldr" });
  assert.equal(v.status, "done");
  assert.equal(v.kind, "video");
  assert.equal(v.cost, 0.12);
});

test("a row with no job and no title falls back to the input, and a stale status reads as gone", async () => {
  const db = new FakeD1();
  db.videos.push(row({ input: "https://github.com/a/b/", status: "started" }));
  const [v] = await listVideosForUser("u1", [], db);
  assert.equal(v.title, "github.com/a/b");
  assert.equal(v.format, "auto");
  assert.equal(v.status, "gone");
  assert.equal(v.durationSec, undefined);
});

test("a terminal row status survives its job, and broken file lists read as empty", async () => {
  const db = new FakeD1();
  db.videos.push(row({ status: "done", title: "Kept", files: "{" }));
  const [v] = await listVideosForUser("u1", [], db);
  assert.equal(v.status, "done");
  assert.deepEqual(v.files, {});
});

test("the list query is one bound statement scoped to the account", async () => {
  const db = new FakeD1();
  await listVideosForUser("u1", [], db, 10);
  assert.equal(db.seen.length, 1);
  assert.match(db.seen[0].sql, /FROM videos WHERE user_id = \? ORDER BY created_at DESC LIMIT \?/);
  assert.deepEqual(db.seen[0].params, ["u1", 10]);
});

test("a result update touches only the fields given, and never throws", async () => {
  const db = new FakeD1();
  db.videos.push(row());
  const fields: VideoResult = {
    title: "T",
    format: "deep",
    durationSec: 90,
    poster: "p.jpg",
    files: { mp4: "m.mp4" },
    status: "done",
    cost: 0.3,
  };
  await updateVideoResult("aaaabbbbcccc", fields, db);
  const v = db.videos[0];
  assert.equal(v.title, "T");
  assert.equal(v.format, "deep");
  assert.equal(v.durationSec, 90);
  assert.equal(v.poster, "p.jpg");
  assert.equal(v.files, '{"mp4":"m.mp4"}');
  assert.equal(v.status, "done");
  assert.equal(v.cost, 0.3);
  db.seen.length = 0;
  await updateVideoResult("aaaabbbbcccc", { status: "error" }, db);
  assert.equal(db.seen.length, 1);
  assert.match(db.seen[0].sql, /^UPDATE videos SET status = \? WHERE id = \?$/);
  assert.deepEqual(db.seen[0].params, ["error", "aaaabbbbcccc"]);
  db.seen.length = 0;
  await updateVideoResult("aaaabbbbcccc", {}, db);
  assert.equal(db.seen.length, 0, "no fields, no statement");

  const orig = console.error;
  console.error = () => {};
  try {
    const down = new FakeD1();
    down.fail = "UPDATE videos";
    await updateVideoResult("aaaabbbbcccc", { status: "done" }, down);
  } finally {
    console.error = orig;
  }
});

test("deleting needs ownership: a stranger's video is a 404 that removes nothing", async () => {
  const db = new FakeD1();
  db.videos.push(row({ id: "mine" }), row({ id: "theirs", userId: "u2" }));
  const removed: string[] = [];
  assert.deepEqual(await deleteUserVideo("u1", "mine", [], db, (id) => void removed.push(id)), { ok: true });
  assert.deepEqual(removed, ["mine"]);
  assert.deepEqual(
    db.videos.map((v) => v.id),
    ["theirs"],
  );
  assert.deepEqual(await deleteUserVideo("u1", "theirs", [], db, (id) => void removed.push(id)), {
    ok: false,
    status: 404,
    error: "Not found.",
  });
  assert.deepEqual(removed, ["mine"], "nothing removed for a stranger's video");
  assert.deepEqual(await deleteUserVideo("u1", "missing", [], db, (id) => void removed.push(id)), {
    ok: false,
    status: 404,
    error: "Not found.",
  });
  assert.equal(await videoOwnerId("theirs", db), "u2");
  assert.equal(await videoOwnerId("missing", db), null);
});

test("a missing row does not pin an owned job's files forever", async () => {
  const db = new FakeD1();
  const removed: string[] = [];
  const r = await deleteUserVideo("u1", "aaaabbbbcccc", [job({ owner: "u:u1" })], db, (id) => void removed.push(id));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(removed, ["aaaabbbbcccc"]);
});

test("an ownership check the database cannot answer fails closed with a 500", async () => {
  const db = new FakeD1();
  db.fail = "SELECT user_id";
  const orig = console.error;
  console.error = () => {};
  try {
    const removed: string[] = [];
    const r = await deleteUserVideo("u1", "aaaabbbbcccc", [], db, (id) => void removed.push(id));
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.status, 500);
    assert.deepEqual(removed, []);
  } finally {
    console.error = orig;
  }
});

test("deleting an account removes its videos, usage, limits and sign-in rows", async () => {
  const db = new FakeD1();
  db.videos.push(row({ id: "v1" }), row({ id: "v2" }), row({ id: "keep", userId: "u2" }));
  db.usage.set("u1|2026-05-01", 3);
  db.limits.set("u1", 5);
  db.sessions.add("u1");
  db.accounts.add("u1");
  db.users.add("u1");
  db.users.add("u2");
  const removed: string[] = [];
  assert.deepEqual(await deleteUserAccount("u1", db, (id) => void removed.push(id)), { videos: 2 });
  assert.deepEqual(removed.sort(), ["v1", "v2"]);
  assert.deepEqual(
    db.videos.map((v) => v.id),
    ["keep"],
  );
  assert.equal(db.usage.size, 0);
  assert.equal(db.limits.has("u1"), false);
  assert.equal(db.sessions.has("u1"), false);
  assert.equal(db.accounts.has("u1"), false);
  assert.equal(db.users.has("u1"), false, "the user row is gone");
  assert.equal(db.users.has("u2"), true, "other accounts are untouched");
  await assert.rejects(
    deleteUserAccount("ghost", db, () => {}),
    /no user row/,
    "without a user row the delete fails loudly",
  );
});

test("dashboard labels: formats, durations, dates and start times", () => {
  assert.equal(formatLabel("short"), "Short");
  assert.equal(formatLabel("deep"), "Deep");
  assert.equal(formatLabel("anatomy"), "Anatomy");
  assert.equal(formatLabel("auto"), "Auto");
  assert.equal(formatLabel(undefined), "Auto");
  assert.equal(mss(175), "2:55");
  assert.equal(mss(61), "1:01");
  assert.equal(mss(0), undefined);
  assert.equal(mss(undefined), undefined);
  const noon = Date.parse("2026-05-01T12:00:00Z");
  assert.equal(when(Date.parse("2026-05-01T21:12:00Z"), noon, "UTC"), "Today, 9:12 PM");
  assert.equal(when(Date.parse("2026-05-01T00:40:00Z"), noon, "UTC"), "Today, 12:40 AM");
  assert.equal(when(Date.parse("2026-04-30T18:00:00Z"), noon, "UTC"), "Yesterday");
  assert.equal(when(Date.parse("2026-04-02T10:00:00Z"), noon, "UTC"), "Apr 2");
  assert.equal(when(Date.parse("2025-12-31T10:00:00Z"), noon, "UTC"), "Dec 31, 2025");
  const manilaNow = Date.parse("2026-05-01T18:30:00Z"); // May 2, 2:30 AM in Manila
  assert.equal(when(Date.parse("2026-05-01T18:27:00Z"), manilaNow, "Asia/Manila"), "Today, 2:27 AM");
  assert.equal(when(Date.parse("2026-05-01T18:27:00Z"), manilaNow, "UTC"), "Today, 6:27 PM");
  assert.equal(when(Date.parse("2026-05-01T15:00:00Z"), manilaNow, "Asia/Manila"), "Yesterday");
  assert.equal(when(Date.parse("2026-05-01T15:00:00Z"), manilaNow, "UTC"), "Today, 3:00 PM");
  assert.equal(when(Date.parse("2025-12-31T16:30:00Z"), Date.parse("2026-01-05T12:00:00Z"), "Asia/Manila"), "Jan 1");
  assert.equal(when(Date.parse("2025-12-31T16:30:00Z"), Date.parse("2026-01-05T12:00:00Z"), "UTC"), "Dec 31, 2025");
  assert.equal(ago(noon - 12_000, noon), "12s ago");
  assert.equal(ago(noon - 100_000, noon), "1m 40s ago");
  assert.equal(ago(noon - (3 * 3600 + 5 * 60) * 1000, noon), "3h 5m ago");
});
