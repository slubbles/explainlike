import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ERROR_KEEP_MS,
  ERROR_MEMORY_CAP,
  buildErrorRow,
  clearMemoryErrors,
  countErrorsSince,
  listRecentErrors,
  recordError,
} from "../lib/errors.ts";
import { withErrors } from "../lib/route.ts";
import type { D1Bound, D1Db } from "../lib/db.ts";

// the memory-path tests need D1 unconfigured; the D1-path tests pass an explicit fake
delete process.env.EXPLANIMATE_CF_ACCOUNT_ID;
delete process.env.EXPLANIMATE_D1_DATABASE_ID;
delete process.env.EXPLANIMATE_D1_TOKEN;

const postClientError = () => import("../app/api/client-error/route.ts");

/** An in-memory D1 handle that answers the exact statements errors.ts issues. */
class FakeD1 implements D1Db {
  rows: { id: number; ts: number; route: string; source: string; name: string; message: string; stack: string; requestId: string }[] = [];
  seq = 0;
  seen: { sql: string; params: unknown[] }[] = [];

  prepare = (sql: string) => {
    const norm = sql.replace(/\s+/g, " ").trim();
    const bind = (...params: unknown[]): D1Bound => {
      this.seen.push({ sql: norm, params });
      return {
        first: async <T>(): Promise<T | null> => {
          if (norm.startsWith("SELECT COUNT(*)")) {
            return { n: this.rows.filter((r) => r.ts >= (params[0] as number)).length } as T;
          }
          return null;
        },
        all: async <T>(): Promise<T[]> => {
          if (norm.includes("FROM errors ORDER BY id DESC")) return [...this.rows].reverse().slice(0, params[0] as number) as T[];
          return [] as T[]; // PRAGMA, CREATE TABLE and anything else
        },
        run: async () => {
          if (norm.startsWith("INSERT INTO errors")) {
            const [ts, route, source, name, message, stack, requestId] = params as [number, string, string, string, string, string, string];
            this.rows.push({ id: ++this.seq, ts, route, source, name, message, stack, requestId });
            return { changes: 1, lastRowId: this.seq };
          }
          if (norm.startsWith("DELETE FROM errors")) {
            const before = this.rows.length;
            this.rows = this.rows.filter((r) => r.ts >= (params[0] as number));
            return { changes: before - this.rows.length, lastRowId: 0 };
          }
          return { changes: 0, lastRowId: 0 };
        },
      };
    };
    return { bind };
  };
}

const row = (message: string, ts = Date.now()) => buildErrorRow("jobs.POST", "server", new Error(message), "req1", ts);

test("errors persist to D1 with bound params and read back newest first", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  await recordError(row("first", now - 2), db, now);
  await recordError(row("second", now - 1), db, now);
  const back = await listRecentErrors(50, db, now);
  assert.deepEqual(
    back.map((r) => r.message),
    ["second", "first"],
  );
  assert.equal(back[0].route, "jobs.POST");
  assert.equal(back[0].source, "server");
  assert.equal(back[0].requestId, "req1");
  const insert = db.seen.find((s) => s.sql.startsWith("INSERT INTO errors"));
  assert.ok(insert);
  assert.equal(insert.params.length, 7);
  assert.doesNotMatch(insert.sql, /first|second/, "values travel as params, never in the SQL");
});

test("rows older than 14 days are pruned on write", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  await recordError(row("old", now - ERROR_KEEP_MS - 1), db, now - ERROR_KEEP_MS - 1);
  assert.equal(db.rows.length, 1);
  await recordError(row("new", now), db, now);
  assert.deepEqual(
    db.rows.map((r) => r.message),
    ["new"],
  );
});

test("the 24 h count counts only recent rows", async () => {
  const db = new FakeD1();
  const now = Date.parse("2026-05-01T12:00:00Z");
  await recordError(row("old", now - 25 * 3600_000), db, now - 25 * 3600_000);
  await recordError(row("new", now - 3600_000), db, now - 3600_000);
  assert.equal(await countErrorsSince(now - 24 * 3600_000, db), 1);
});

test("stored rows never carry an email in full, a token or a code", async () => {
  const db = new FakeD1();
  const e = new Error("send code 123456 to you@example.com with Bearer abcdef failed");
  (e as { otp?: string }).otp = "123456";
  await recordError(buildErrorRow("auth.POST", "server", e, "req2"), db);
  const stored = JSON.stringify(db.rows[0]);
  assert.doesNotMatch(stored, /you@example\.com|abcdef/);
  assert.match(stored, /y\*\*\*@example\.com/);
});

test("without D1 the in-memory ring answers instead, newest first, capped at 200", async () => {
  clearMemoryErrors();
  const now = Date.parse("2026-05-01T12:00:00Z");
  await recordError(row("first", now - 1), undefined, now);
  await recordError(row("second", now), undefined, now);
  assert.deepEqual(
    (await listRecentErrors(50, undefined, now)).map((r) => r.message),
    ["second", "first"],
  );
  assert.equal(await countErrorsSince(now - 24 * 3600_000), 2);
  for (let i = 0; i < ERROR_MEMORY_CAP + 5; i++) await recordError(row(`flood ${i}`, now), undefined, now);
  // reads clamp at 100, but the ring itself holds 200: the 100 newest start at flood 105
  const back = await listRecentErrors(500, undefined, now);
  assert.equal(back.length, 100);
  assert.equal(back[0].message, `flood ${ERROR_MEMORY_CAP + 4}`);
  assert.equal(back[99].message, "flood 105");
  assert.ok(
    back.every((r) => r.message.startsWith("flood")),
    "the oldest rows fell off the ring",
  );
  clearMemoryErrors();
});

test("a wrapped handler passes answers through, and a throw becomes a generic 500 with a reference", async () => {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  clearMemoryErrors();
  try {
    const ok = withErrors("test.GET", async () => Response.json({ fine: true }));
    assert.deepEqual(await (await ok(new Request("http://x/"), undefined as never)).json(), { fine: true });
    const bad = withErrors("jobs.POST", async () => {
      throw new Error("the database password is hunter2");
    });
    const r = await bad(new Request("http://x/"), undefined as never);
    assert.equal(r.status, 500);
    const body = (await r.json()) as { error: string; requestId: string };
    assert.match(body.error, /Something went wrong/);
    assert.match(body.requestId, /^[a-f0-9]{16}$/);
    assert.equal(r.headers.get("x-request-id"), body.requestId);
    assert.doesNotMatch(JSON.stringify(body), /hunter2/, "no internals leak to the caller");
    const logged = lines.map((l) => JSON.parse(l));
    assert.equal(logged.length, 1);
    assert.equal(logged[0].level, "error");
    assert.equal(logged[0].route, "jobs.POST");
    assert.equal(logged[0].requestId, body.requestId);
    const stored = await listRecentErrors();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].route, "jobs.POST");
    assert.equal(stored[0].requestId, body.requestId);
  } finally {
    console.log = orig;
    clearMemoryErrors();
  }
});

const post = (url: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("client errors need a message, stay small, and store with a client source", async () => {
  clearMemoryErrors();
  const { POST } = await postClientError();
  assert.equal((await POST(post("http://x/api/client-error", { path: "/x" }), undefined as never)).status, 400);
  const big = await POST(post("http://x/api/client-error", { message: "x".repeat(5000) }), undefined as never);
  assert.equal(big.status, 413);
  const plain = await POST(post("http://x/api/client-error", "message=hi", { "content-type": "text/plain" }), undefined as never);
  assert.equal(plain.status, 415);
  const evil = await POST(
    post("http://x/api/client-error", { message: "hi" }, { "content-type": "application/json", origin: "https://evil.test" }),
    undefined as never,
  );
  assert.equal(evil.status, 403);
  const r = await POST(post("http://x/api/client-error", { message: "boom", digest: "abc", path: "/gallery" }), undefined as never);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const stored = await listRecentErrors();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].source, "client");
  assert.equal(stored[0].route, "/gallery");
  assert.match(stored[0].message, /boom/);
  clearMemoryErrors();
});
