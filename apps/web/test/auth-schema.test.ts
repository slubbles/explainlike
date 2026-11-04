import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// the sign-in schema check speaks D1 REST in production, where every query is a round trip:
// these tests drive the real lib/auth.ts against a D1 emulator over SQLite and count the calls.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-auth-schema-"));
const sqlite = new DatabaseSync(path.join(dir, "d1.db"));
const mailDir = path.join(dir, "mail");

const savedEnv = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  EXPLANIMATE_AUTH_ENABLED: process.env.EXPLANIMATE_AUTH_ENABLED,
  EXPLANIMATE_CF_ACCOUNT_ID: process.env.EXPLANIMATE_CF_ACCOUNT_ID,
  EXPLANIMATE_D1_DATABASE_ID: process.env.EXPLANIMATE_D1_DATABASE_ID,
  EXPLANIMATE_D1_TOKEN: process.env.EXPLANIMATE_D1_TOKEN,
  EXPLANIMATE_D1_LOCAL_PATH: process.env.EXPLANIMATE_D1_LOCAL_PATH,
  EXPLANIMATE_EMAIL_CAPTURE_DIR: process.env.EXPLANIMATE_EMAIL_CAPTURE_DIR,
  EXPLANIMATE_TURNSTILE_SECRET: process.env.EXPLANIMATE_TURNSTILE_SECRET,
  EXPLANIMATE_TRUST_PROXY: process.env.EXPLANIMATE_TRUST_PROXY,
};
Object.assign(process.env, {
  BETTER_AUTH_SECRET: "test-secret-for-auth-schema",
  BETTER_AUTH_URL: "http://localhost:3000",
  EXPLANIMATE_AUTH_ENABLED: "1",
  EXPLANIMATE_CF_ACCOUNT_ID: "acct",
  EXPLANIMATE_D1_DATABASE_ID: "db",
  EXPLANIMATE_D1_TOKEN: "test-token-never-logged",
  EXPLANIMATE_EMAIL_CAPTURE_DIR: mailDir,
  EXPLANIMATE_TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  EXPLANIMATE_TRUST_PROXY: "1",
});
delete process.env.EXPLANIMATE_D1_LOCAL_PATH;

let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  if (!u.includes("/d1/database/")) return realFetch(url as never, init as never);
  calls++;
  const body = JSON.parse(String((init as { body?: string })?.body ?? "{}")) as { sql: string; params: unknown[] };
  const upper = body.sql.trim().toUpperCase();
  const reads = upper.startsWith("SELECT") || upper.startsWith("PRAGMA") || upper.startsWith("WITH") || upper.includes("RETURNING");
  try {
    if (reads) {
      const results = sqlite.prepare(body.sql).all(...(body.params as []));
      return Response.json({ success: true, result: [{ results, meta: {} }] });
    }
    const r = sqlite.prepare(body.sql).run(...(body.params as []));
    const meta = { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) || 0 };
    return Response.json({ success: true, result: [{ results: [], meta }] });
  } catch (e) {
    return Response.json({ success: false, errors: [{ code: 7500, message: (e as Error).message }], result: [] });
  }
}) as typeof fetch;

test.after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  sqlite.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const auth = () => import("../lib/auth.ts");

const tables = () =>
  (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
    .map((r) => r.name)
    .sort();
const columns = (t: string) => (sqlite.prepare(`SELECT name FROM pragma_table_info(?)`).all(t) as { name: string }[]).map((c) => c.name);

test("a fresh database migrates fully, then later boots take a single query", async () => {
  const { ensureAuthSchema, resetAuthForTests } = await auth();
  resetAuthForTests();
  calls = 0;
  await ensureAuthSchema();
  assert.ok(calls > 5, `a fresh database runs the full migration check (${calls} D1 calls)`);
  assert.deepEqual(tables(), ["account", "errors", "session", "usage", "user", "user_limits", "verification", "videos"]);
  resetAuthForTests();
  calls = 0;
  await ensureAuthSchema();
  assert.equal(calls, 1, "a current schema costs one D1 query, not the whole migration check");
});

test("a dropped column migrates again and comes back", async () => {
  const { ensureAuthSchema, resetAuthForTests } = await auth();
  sqlite.prepare(`ALTER TABLE "user" DROP COLUMN image`).run();
  assert.ok(!columns("user").includes("image"));
  resetAuthForTests();
  calls = 0;
  await ensureAuthSchema();
  assert.ok(calls > 1, `column drift runs the full migration check (${calls} D1 calls)`);
  assert.ok(columns("user").includes("image"), "the missing column is added back");
});

test("a dropped app table migrates again and comes back with every column", async () => {
  const { ensureAuthSchema, resetAuthForTests } = await auth();
  sqlite.prepare(`DROP TABLE videos`).run();
  resetAuthForTests();
  calls = 0;
  await ensureAuthSchema();
  assert.ok(calls > 1, `table drift runs the full migration check (${calls} D1 calls)`);
  assert.deepEqual(columns("videos"), ["id", "user_id", "input", "created_at", "input_len", "status", "cost"]);
});

test("a missing index alone still runs the full check and names the index", async () => {
  const { ensureAuthSchema, resetAuthForTests } = await auth();
  sqlite.prepare(`DROP INDEX verification_identifier_idx`).run();
  resetAuthForTests();
  calls = 0;
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    await ensureAuthSchema();
  } finally {
    console.error = orig;
  }
  assert.ok(calls > 1, `index drift runs the full migration check (${calls} D1 calls)`);
  assert.match(lines.join("\n"), /verification_identifier_idx/);
  sqlite.prepare(`CREATE INDEX verification_identifier_idx ON verification (identifier)`).run();
});

test("verifying a code costs at most seven D1 calls on a warm process", async () => {
  const { ensureAuthSchema, getAuth, resetAuthForTests } = await auth();
  resetAuthForTests();
  const api = getAuth();
  await ensureAuthSchema();
  const email = `budget-${Date.now()}@example.com`;
  const headers = { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "10.7.7.8" };
  const send = await api.handler(
    new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { ...headers, "x-turnstile-token": "XXXX.DUMMY.TOKEN.XXXX" },
      body: JSON.stringify({ email, type: "sign-in" }),
    }),
  );
  if (!send.ok) assert.fail(`sending the code failed: ${send.status} ${await send.text()}`);
  const row = JSON.parse(fs.readFileSync(path.join(mailDir, `${email}.json`), "utf8")) as { otp: string };
  calls = 0;
  const verify = await api.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp: row.otp }),
    }),
  );
  if (!verify.ok) assert.fail(`verifying the code failed: ${verify.status} ${await verify.text()}`);
  assert.ok(calls <= 7, `verifying the code costs ${calls} D1 calls, budget is 7`);
});

test("APP_TABLE_COLUMNS matches the tables ensureTables creates", async () => {
  const { APP_TABLE_COLUMNS } = await import("../lib/db.ts");
  assert.deepEqual(Object.keys(APP_TABLE_COLUMNS).sort(), ["errors", "usage", "user_limits", "videos"]);
  for (const [table, want] of Object.entries(APP_TABLE_COLUMNS))
    assert.deepEqual(columns(table), [...want], `${table} drifted from what ensureTables creates`);
});

test("expired and wrong codes are still rejected", async () => {
  const { getAuth, resetAuthForTests } = await auth();
  resetAuthForTests();
  const api = getAuth();
  const headers = { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "10.7.7.9" };
  const requestCode = async (email: string) => {
    const send = await api.handler(
      new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { ...headers, "x-turnstile-token": "XXXX.DUMMY.TOKEN.XXXX" },
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
    );
    if (!send.ok) assert.fail(`sending the code failed: ${send.status} ${await send.text()}`);
    return (JSON.parse(fs.readFileSync(path.join(mailDir, `${email}.json`), "utf8")) as { otp: string }).otp;
  };
  const attempt = (email: string, otp: string) =>
    api.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email-otp", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, otp }),
      }),
    );
  const stale = `stale-${Date.now()}@example.com`;
  const staleOtp = await requestCode(stale);
  sqlite.prepare(`UPDATE verification SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE identifier = ?`).run(`sign-in-otp-${stale}`);
  assert.equal((await attempt(stale, staleOtp)).status, 400);
  const other = `other-${Date.now()}@example.com`;
  const realOtp = await requestCode(other);
  const wrong = `${(Number(realOtp[0]) + 1) % 10}${realOtp.slice(1)}`;
  assert.equal((await attempt(other, wrong)).status, 400);
  assert.equal((await attempt(other, realOtp)).status, 200);
});

test("signing in over D1 REST still works after the fast path", async () => {
  const { getAuth, resetAuthForTests } = await auth();
  resetAuthForTests();
  const api = getAuth();
  const email = `schema-${Date.now()}@example.com`;
  const headers = { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "10.7.7.7" };
  const send = await api.handler(
    new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { ...headers, "x-turnstile-token": "XXXX.DUMMY.TOKEN.XXXX" },
      body: JSON.stringify({ email, type: "sign-in" }),
    }),
  );
  if (!send.ok) assert.fail(`sending the code failed: ${send.status} ${await send.text()}`);
  const row = JSON.parse(fs.readFileSync(path.join(mailDir, `${email}.json`), "utf8")) as { otp: string };
  assert.match(row.otp, /^\d{6}$/);
  const verify = await api.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp: row.otp }),
    }),
  );
  if (!verify.ok) assert.fail(`verifying the code failed: ${verify.status} ${await verify.text()}`);
  const found = sqlite.prepare(`SELECT email FROM "user" WHERE email = ?`).get(email) as { email: string } | undefined;
  assert.equal(found?.email, email);
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0];
  const session = await api.handler(new Request("http://localhost:3000/api/auth/get-session", { headers: { ...headers, cookie } }));
  assert.equal(session.status, 200);
});
