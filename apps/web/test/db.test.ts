import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "kysely";
import { D1RestDialect, createD1Db, createKysely, d1ConfigFromEnv, d1Configured, ensureTables, getD1Db, type D1Config } from "../lib/db.ts";

const TOKEN = "test-token-never-logged";
const base: D1Config = { accountId: "acct", databaseId: "db", token: TOKEN };

const d1ok = (results: unknown[] = [], meta = {}) =>
  new Response(JSON.stringify({ success: true, errors: [], result: [{ results, success: true, meta }] }), { status: 200 });

/** A stub fetch that answers from a queue and records every call (answers are fresh each time). */
function stub(...answers: (Response | Error | (() => Response))[]) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).authorization ?? null });
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next.clone();
  }) as typeof fetch & { calls: typeof calls };
  f.calls = calls;
  return f;
}

function logged(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  return fn().then(
    () => ((console.error = orig), lines),
    (e) => ((console.error = orig), Promise.reject(Object.assign(e, { lines }))),
  );
}

test("prepare/bind/first/all/run go to the D1 query endpoint with the token in a header", async () => {
  const fetchImpl = stub(d1ok([{ n: 2 }], { changes: 0, last_row_id: 0 }));
  const db = createD1Db({ ...base, fetchImpl });
  assert.deepEqual(await db.prepare("SELECT ? AS n").bind(true).all<{ n: number }>(), [{ n: 2 }]);
  assert.deepEqual(await db.prepare("SELECT 1").bind().first(), { n: 2 });
  assert.deepEqual(await db.prepare("UPDATE usage SET videos = 1").bind().run(), { changes: 0, lastRowId: 0 });
  assert.equal(fetchImpl.calls.length, 3);
  const [first] = fetchImpl.calls;
  assert.equal(first.url, "https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db/query");
  assert.equal(first.auth, `Bearer ${TOKEN}`);
  assert.deepEqual(first.body, { sql: "SELECT ? AS n", params: [1] });
});

test("first() is null when nothing comes back; params map booleans, dates and missing values", async () => {
  const fetchImpl = stub(d1ok([]));
  const db = createD1Db({ ...base, fetchImpl });
  assert.equal(await db.prepare("SELECT 1").bind().first(), null);
  await db.prepare("INSERT INTO t VALUES (?, ?, ?, ?, ?)").bind(false, undefined, 10n, new Date("2026-01-02T03:04:05.000Z"), "x").run();
  assert.deepEqual(fetchImpl.calls[1].body.params, [0, null, 10, "2026-01-02T03:04:05.000Z", "x"]);
});

test("one retry on a 5xx or a network error, none on a 4xx", async () => {
  const flaky = stub(new Response("{}", { status: 500 }), d1ok([{ ok: 1 }]));
  assert.deepEqual(
    await createD1Db({ ...base, fetchImpl: flaky })
      .prepare("SELECT 1")
      .bind()
      .all(),
    [{ ok: 1 }],
  );
  assert.equal(flaky.calls.length, 2);

  const down = stub(new Response("{}", { status: 500 }), new Response("{}", { status: 500 }));
  await assert.rejects(
    createD1Db({ ...base, fetchImpl: down })
      .prepare("SELECT 1")
      .bind()
      .all(),
    /D1/,
  );
  assert.equal(down.calls.length, 2, "one retry, then it gives up");

  const net = stub(new Error("boom"), d1ok([{ ok: 1 }]));
  assert.deepEqual(
    await createD1Db({ ...base, fetchImpl: net })
      .prepare("SELECT 1")
      .bind()
      .all(),
    [{ ok: 1 }],
  );
  assert.equal(net.calls.length, 2);

  const bad = stub(new Response(JSON.stringify({ success: false, errors: [{ code: 7500 }] }), { status: 400 }));
  const lines = await logged(() =>
    createD1Db({ ...base, fetchImpl: bad })
      .prepare("SELECT 1")
      .bind()
      .all(),
  ).then(
    () => assert.fail("a refused query must throw"),
    (e: Error & { lines: string[] }) => e.lines,
  );
  assert.equal(bad.calls.length, 1, "a 4xx is not retried");
  assert.match(lines.join("\n"), /codes 7500/);
});

test("a refused query logs the Cloudflare error codes but never the token", async () => {
  const fetchImpl = stub(new Response(JSON.stringify({ success: false, errors: [{ code: 7003 }, { code: 7500 }] }), { status: 400 }));
  const err = await logged(() =>
    createD1Db({ ...base, fetchImpl })
      .prepare("SELECT 1")
      .bind()
      .all(),
  ).then(
    () => null,
    (e) => e as Error & { lines: string[] },
  );
  assert.ok(err);
  assert.match(err.lines.join("\n"), /7003/);
  assert.doesNotMatch(err.lines.join("\n"), new RegExp(TOKEN));
  assert.doesNotMatch(err.message, new RegExp(TOKEN));
});

test("the env handle needs all three D1 settings", () => {
  const saved = { ...process.env };
  delete process.env.EXPLANIMATE_CF_ACCOUNT_ID;
  delete process.env.EXPLANIMATE_D1_DATABASE_ID;
  delete process.env.EXPLANIMATE_D1_TOKEN;
  assert.throws(() => d1ConfigFromEnv(), /EXPLANIMATE_D1_TOKEN/);
  assert.throws(() => getD1Db(), /EXPLANIMATE_D1_TOKEN/);
  Object.assign(process.env, saved);
});

test("ensureTables creates usage, user_limits, videos and errors when missing", async () => {
  const fetchImpl = stub(d1ok([]));
  await ensureTables(createD1Db({ ...base, fetchImpl }));
  // 4 CREATEs, the videos column check, and the 3 columns missing on an old table
  assert.equal(fetchImpl.calls.length, 8);
  const sql = fetchImpl.calls.map((c) => String(c.body.sql)).join("\n");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS usage/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_limits/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS videos/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS errors/);
  assert.match(sql, /input_len.*status.*cost/s);
  assert.match(sql, /PRAGMA table_info\(videos\)/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN input_len/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN status/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN cost/);
});

test("ensureTables skips the videos columns a database already has", async () => {
  const cols = ["id", "user_id", "input", "created_at", "input_len", "status", "cost"].map((name) => ({ name }));
  const fetchImpl = stub(d1ok([]), d1ok([]), d1ok([]), d1ok([]), d1ok(cols));
  await ensureTables(createD1Db({ ...base, fetchImpl }));
  assert.equal(fetchImpl.calls.length, 5);
  assert.doesNotMatch(fetchImpl.calls.map((c) => String(c.body.sql)).join("\n"), /ALTER TABLE/);
});

test("d1Configured is true only with all three D1 settings", () => {
  const saved = { ...process.env };
  delete process.env.EXPLANIMATE_CF_ACCOUNT_ID;
  delete process.env.EXPLANIMATE_D1_DATABASE_ID;
  delete process.env.EXPLANIMATE_D1_TOKEN;
  assert.equal(d1Configured(), false);
  process.env.EXPLANIMATE_CF_ACCOUNT_ID = "a";
  process.env.EXPLANIMATE_D1_DATABASE_ID = "b";
  assert.equal(d1Configured(), false);
  process.env.EXPLANIMATE_D1_TOKEN = "c";
  assert.equal(d1Configured(), true);
  for (const k of ["EXPLANIMATE_CF_ACCOUNT_ID", "EXPLANIMATE_D1_DATABASE_ID", "EXPLANIMATE_D1_TOKEN"]) delete process.env[k];
  Object.assign(process.env, saved);
});

test("the Kysely dialect runs queries through D1 REST with no-op transactions", async () => {
  const fetchImpl = stub(d1ok([{ id: "u1" }], { changes: 1, last_row_id: 7 }));
  const db = createKysely({ ...base, fetchImpl });
  const rows = await sql`select * from "user"`.execute(db);
  assert.deepEqual(rows.rows, [{ id: "u1" }]);
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(String(fetchImpl.calls[0].body.sql), /select \* from "user"/);

  // begin/commit/rollback are safe no-ops, so a kysely transaction just runs its queries
  const tx = stub(d1ok([{ n: 1 }]));
  const db2 = createKysely({ ...base, fetchImpl: tx });
  await db2.transaction().execute(async (trx) => {
    await sql`select 1`.execute(trx);
  });
  assert.equal(tx.calls.length, 1);

  const dialect = new D1RestDialect({ ...base, fetchImpl: stub(d1ok()) });
  const driver = dialect.createDriver();
  await driver.init();
  const conn = await driver.acquireConnection();
  assert.throws(() => conn.streamQuery({ sql: "select 1", parameters: [] } as never, 100), /streaming/);
  await driver.releaseConnection(conn);
  await driver.destroy();
});
