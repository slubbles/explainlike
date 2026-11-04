import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "kysely";
import {
  D1RestDialect,
  authTablesExist,
  createD1Db,
  createKysely,
  d1ConfigFromEnv,
  d1Configured,
  defaultLocalD1Path,
  ensureTables,
  getD1Db,
  localD1Path,
  type D1Config,
} from "../lib/db.ts";

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
  // 4 CREATEs, the videos column check, and the 8 columns missing on an old table
  assert.equal(fetchImpl.calls.length, 13);
  const sql = fetchImpl.calls.map((c) => String(c.body.sql)).join("\n");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS usage/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_limits/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS videos/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS errors/);
  assert.match(sql, /input_len.*status.*cost.*title.*format.*duration_sec.*poster.*files/s);
  assert.match(sql, /PRAGMA table_info\(videos\)/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN input_len/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN status/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN cost/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN title/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN format/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN duration_sec/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN poster/);
  assert.match(sql, /ALTER TABLE videos ADD COLUMN files/);
});

test("ensureTables skips the videos columns a database already has", async () => {
  const cols = [
    "id",
    "user_id",
    "input",
    "created_at",
    "input_len",
    "status",
    "cost",
    "title",
    "format",
    "duration_sec",
    "poster",
    "files",
  ].map((name) => ({ name }));
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

/** Production D1 refuses (SQLITE_AUTH, code 7500) any query touching its internal _cf_ tables. */
function strictD1(
  seen: string[],
  tables: { name: string; type: string; sql: string } = [
    { name: "account", type: "table", sql: "CREATE TABLE account (id TEXT PRIMARY KEY)" },
    { name: "session", type: "table", sql: "CREATE TABLE session (id TEXT PRIMARY KEY)" },
    { name: "usage", type: "table", sql: "CREATE TABLE usage (user_id TEXT)" },
    { name: "user", type: "table", sql: "CREATE TABLE user (id TEXT PRIMARY KEY)" },
    { name: "verification", type: "table", sql: "CREATE TABLE verification (id TEXT PRIMARY KEY)" },
  ],
  opts: { failIndexDiscovery?: boolean } = {},
) {
  const refusals: string[] = [];
  const deny = (sql: string) => {
    refusals.push(sql);
    return new Response(JSON.stringify({ success: false, errors: [{ code: 7500, message: "SQLITE_AUTH" }] }), { status: 400 });
  };
  const f = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { sql: string; params: unknown[] };
    seen.push(body.sql);
    if (/\bpragma\s+table_list\b/i.test(body.sql)) return deny(body.sql);
    if (/_cf_[A-Za-z0-9_]+/.test(body.sql)) return deny(body.sql);
    if (opts.failIndexDiscovery && body.sql.includes("pragma_index_list")) return deny(body.sql);
    if (/\bsqlite_(temp_)?(master|schema)\b/i.test(body.sql) && !/_cf_/i.test(body.sql)) return deny(body.sql);
    const pragmaParam =
      (/\bpragma_(table_info|table_xinfo|index_list|index_info|foreign_key_list)\s*\(\s*\?/i.test(body.sql) ||
        /^\s*pragma\s+\w+\s*\(\s*\?\s*\)/i.test(body.sql)) &&
      body.params.some((p) => typeof p === "string" && p.startsWith("_cf_"));
    if (pragmaParam) return deny(body.sql);
    if (body.sql.includes("pragma_index_list")) return d1ok([]);
    if (/\bpragma_table_info\s*\(/i.test(body.sql)) return d1ok([{ name: "id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 }]);
    if (/\bAS schema\b/i.test(body.sql) && /\bsqlite_master\b/i.test(body.sql))
      return d1ok(tables.map((t) => ({ schema: "main", name: t.name, type: t.type, ncol: 0, wr: 0, strict: 0 })));
    if (/\bsqlite_(temp_)?(master|schema)\b/i.test(body.sql)) return d1ok(tables);
    if (/^\s*pragma\s+table_info\b/i.test(body.sql)) return d1ok([]);
    return d1ok([]);
  }) as typeof fetch & { seen: string[]; refusals: string[] };
  f.seen = seen;
  f.refusals = refusals;
  return f;
}

test("schema scans reach D1 with the _cf_ tables filtered out, never as PRAGMA table_list", async () => {
  const seen: string[] = [];
  const fetchImpl = strictD1(seen);
  const db = createD1Db({ ...base, fetchImpl });
  await ensureTables(db);
  const tables = await createKysely({ ...base, fetchImpl }).introspection.getTables();
  assert.deepEqual(
    tables.map((t) => t.name),
    ["account", "session", "usage", "user", "verification"],
  );
  // Better Auth's index discovery joins sqlite_master to pragma_index_list with no _cf_
  // filter of its own (better-auth/db migration); our layer adds one before D1 sees it.
  const indexDiscovery = `SELECT tables.name AS "tableName", index_list.name AS "indexName",
    index_info.name AS "columnName", index_list."unique" AS "isUnique",
    index_list.partial AS "isPartial", index_info.seqno AS "columnPosition"
    FROM sqlite_master AS tables
    INNER JOIN pragma_index_list(tables.name) AS index_list
    INNER JOIN pragma_index_info(index_list.name) AS index_info
    WHERE tables.type = 'table'`;
  assert.deepEqual(await db.prepare(indexDiscovery).bind().all(), []);
  const sent = seen.find((s) => s.includes("pragma_index_list")) ?? "";
  assert.match(sent, /_cf_/);
  // a bare schema scan is guarded too
  assert.equal((await db.prepare("SELECT name FROM sqlite_master").bind().all()).length, 5);
  // PRAGMA table_list would read the internals, so it goes out as a filtered scan
  const listed = await db.prepare("PRAGMA table_list").bind().all<{ name: string }>();
  assert.deepEqual(
    listed.map((r) => r.name),
    ["account", "session", "usage", "user", "verification"],
  );
  assert.ok(
    seen.every((s) => !/\bpragma\s+table_list\b/i.test(s)),
    "PRAGMA table_list never reaches D1",
  );
  // a direct read of an internal table still fails loudly, with its code
  await logged(() => db.prepare("SELECT * FROM _cf_KV").bind().all()).then(
    () => assert.fail("a direct _cf_KV read must be refused"),
    (e: Error) => assert.match(e.message, /codes 7500/),
  );
  assert.equal(fetchImpl.refusals.length, 1);
});

test("a pragma aimed at an internal table answers empty without touching D1", async () => {
  const seen: string[] = [];
  const fetchImpl = strictD1(seen);
  const db = createD1Db({ ...base, fetchImpl });
  assert.deepEqual(await db.prepare('PRAGMA table_info("_cf_KV")').bind().all(), []);
  assert.deepEqual(await db.prepare("PRAGMA index_list('_cf_KV')").bind().all(), []);
  assert.deepEqual(await db.prepare("PRAGMA foreign_key_list(_cf_KV)").bind().all(), []);
  assert.deepEqual(await db.prepare("SELECT * FROM pragma_table_info(?)").bind("_cf_KV").all(), []);
  assert.deepEqual(await db.prepare("SELECT * FROM pragma_index_list(?)").bind("_cf_KV").all(), []);
  assert.equal(seen.length, 0);
  assert.equal(fetchImpl.refusals.length, 0);
});

test("a refused query reports the first 120 chars of its SQL, never the params", async () => {
  const secret = "otp-value-never-logged-8f3e";
  const statement =
    "SELECT * FROM verification WHERE identifier = ? AND value = ? /* padding xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx */";
  assert.ok(statement.length > 120);
  const fetchImpl = stub(new Response(JSON.stringify({ success: false, errors: [{ code: 7500 }] }), { status: 400 }));
  const err = await logged(() =>
    createD1Db({ ...base, fetchImpl })
      .prepare(statement)
      .bind("a@example.com", secret)
      .all(),
  ).then(
    () => null,
    (e) => e as Error & { lines: string[] },
  );
  assert.ok(err);
  const snippet = statement.replace(/\s+/g, " ").trim().slice(0, 120);
  assert.ok(err.lines.join("\n").includes(snippet), "the log carries the SQL snippet");
  assert.doesNotMatch(err.lines.join("\n"), new RegExp(secret));
  assert.ok(err.message.includes(snippet), "the error carries the SQL snippet");
  assert.doesNotMatch(err.message, new RegExp(secret));
});

test("authTablesExist needs user, session, account and verification", async () => {
  const names = (rows: string[]) => stub(d1ok(rows.map((name) => ({ name }))));
  assert.equal(
    await authTablesExist(createD1Db({ ...base, fetchImpl: names(["user", "session", "account", "verification", "usage"]) })),
    true,
  );
  assert.equal(await authTablesExist(createD1Db({ ...base, fetchImpl: names(["user", "session", "account"]) })), false);
  const fetchImpl = names(["user", "session", "account", "verification"]);
  await authTablesExist(createD1Db({ ...base, fetchImpl }));
  assert.match(String(fetchImpl.calls[0].body.sql), /_cf_/);
});

/** Runs a function with the auth/D1 settings set and global fetch answered by a fake D1. */
async function withStrictAuthEnv<T>(fetchImpl: typeof fetch, fn: () => Promise<T>): Promise<{ result: T; errs: string[] }> {
  const saved = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    EXPLANIMATE_CF_ACCOUNT_ID: process.env.EXPLANIMATE_CF_ACCOUNT_ID,
    EXPLANIMATE_D1_DATABASE_ID: process.env.EXPLANIMATE_D1_DATABASE_ID,
    EXPLANIMATE_D1_TOKEN: process.env.EXPLANIMATE_D1_TOKEN,
  };
  process.env.BETTER_AUTH_SECRET = "test-secret-for-auth-schema";
  process.env.EXPLANIMATE_CF_ACCOUNT_ID = "acct";
  process.env.EXPLANIMATE_D1_DATABASE_ID = "db";
  process.env.EXPLANIMATE_D1_TOKEN = TOKEN;
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as unknown as typeof fetch;
  const errs: string[] = [];
  const _warns: string[] = [];
  const origErr = console.error;
  const origWarn = console.warn;
  console.error = (...a: unknown[]) => void errs.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void _warns.push(a.map(String).join(" "));
  try {
    const result = await fn();
    return { result, errs };
  } finally {
    console.error = origErr;
    console.warn = origWarn;
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("migrations run cleanly against a strict D1, with the index scan guarded", async () => {
  const { ensureAuthSchema, resetAuthForTests } = await import("../lib/auth.ts");
  resetAuthForTests();
  const seen: string[] = [];
  const fetchImpl = strictD1(seen);
  const { errs } = await withStrictAuthEnv(fetchImpl, () => ensureAuthSchema());
  assert.equal(fetchImpl.refusals.length, 0);
  const sent = seen.find((s) => s.includes("pragma_index_list")) ?? "";
  assert.match(sent, /_cf_/, "the real index-discovery query went out guarded");
  assert.equal(errs.join("\n"), "");
});

test("ensureAuthSchema still resolves when migrations fail but the sign-in tables exist", async () => {
  const { ensureAuthSchema, resetAuthForTests } = await import("../lib/auth.ts");
  resetAuthForTests();
  const seen: string[] = [];
  const fetchImpl = strictD1(seen, undefined, { failIndexDiscovery: true });
  const { errs } = await withStrictAuthEnv(fetchImpl, () => ensureAuthSchema());
  assert.equal(fetchImpl.refusals.length, 1);
  assert.match(fetchImpl.refusals[0], /_cf_/);
  assert.match(errs.join("\n"), /already exist/);
});

test("introspection skips D1's internal _cf_ tables, which D1 refuses to describe", async () => {
  const seen: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { sql: string; params: unknown[] };
    seen.push(body.sql);
    if (/sqlite_master/.test(body.sql)) {
      // a real D1 would return _cf_KV here unless the query filters it out
      if (!/_cf_/.test(body.sql))
        return d1ok([
          { name: "_cf_KV", type: "table", sql: "" },
          { name: "usage", type: "table", sql: "" },
        ]);
      return d1ok([{ name: "usage", type: "table", sql: "CREATE TABLE usage (user_id TEXT)" }]);
    }
    if (/pragma_table_info/.test(body.sql)) {
      if (body.params[0] === "_cf_KV") return new Response(JSON.stringify({ success: false, errors: [{ code: 7500 }] }), { status: 400 });
      return d1ok([{ name: "user_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 }]);
    }
    return d1ok();
  }) as typeof fetch;
  const tables = await createKysely({ ...base, fetchImpl }).introspection.getTables();
  assert.deepEqual(
    tables.map((t) => t.name),
    ["usage"],
  );
  assert.equal(tables[0].columns[0].name, "user_id");
  assert.equal(tables[0].columns[0].isNullable, false);
});

test("local dev defaults the sign-in database to a SQLite file next to the jobs folder", () => {
  const keys = [
    "EXPLANIMATE_AUTH_ENABLED",
    "EXPLANIMATE_CF_ACCOUNT_ID",
    "EXPLANIMATE_D1_DATABASE_ID",
    "EXPLANIMATE_D1_TOKEN",
    "EXPLANIMATE_D1_LOCAL_PATH",
    "EXPLANIMATE_JOBS_DIR",
    "NODE_ENV",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];
  try {
    delete process.env.EXPLANIMATE_D1_LOCAL_PATH;
    delete process.env.EXPLANIMATE_CF_ACCOUNT_ID;
    delete process.env.EXPLANIMATE_D1_DATABASE_ID;
    delete process.env.EXPLANIMATE_D1_TOKEN;
    process.env.EXPLANIMATE_JOBS_DIR = "/tmp/jobs-dir-test";
    // auth off: no default, as today
    delete process.env.EXPLANIMATE_AUTH_ENABLED;
    delete process.env.NODE_ENV;
    assert.equal(localD1Path(), undefined);
    // auth on outside production: the default file
    process.env.EXPLANIMATE_AUTH_ENABLED = "1";
    process.env.NODE_ENV = "development";
    assert.equal(localD1Path(), defaultLocalD1Path());
    assert.match(defaultLocalD1Path(), /auth\.db$/);
    // an explicit path still wins
    process.env.EXPLANIMATE_D1_LOCAL_PATH = "/tmp/custom.db";
    assert.equal(localD1Path(), "/tmp/custom.db");
    delete process.env.EXPLANIMATE_D1_LOCAL_PATH;
    // D1 configured: no default, D1 is used
    process.env.EXPLANIMATE_CF_ACCOUNT_ID = "a";
    process.env.EXPLANIMATE_D1_DATABASE_ID = "b";
    process.env.EXPLANIMATE_D1_TOKEN = "c";
    assert.equal(localD1Path(), undefined);
    delete process.env.EXPLANIMATE_CF_ACCOUNT_ID;
    delete process.env.EXPLANIMATE_D1_DATABASE_ID;
    delete process.env.EXPLANIMATE_D1_TOKEN;
    // production without D1: no default, so the missing config still throws
    process.env.NODE_ENV = "production";
    assert.equal(localD1Path(), undefined);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
