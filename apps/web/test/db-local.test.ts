import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "kysely";
import { createLocalD1Db, createLocalKysely } from "../lib/db-local.ts";
import { d1Configured, ensureTables, getD1Db, localD1Path } from "../lib/db.ts";

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "el-dblocal-")), "test.db");

test("the local stand-in answers prepare/bind/first/all/run over SQLite", async () => {
  const db = createLocalD1Db(file());
  await db.prepare("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)").bind().run();
  await db.prepare("INSERT INTO t (id, n) VALUES (?, ?)").bind("a", true).run();
  assert.deepEqual(await db.prepare("SELECT id, n FROM t WHERE id = ?").bind("a").first(), { id: "a", n: 1 });
  assert.deepEqual(await db.prepare("SELECT n FROM t").bind().all(), [{ n: 1 }]);
  assert.equal(await db.prepare("SELECT n FROM t WHERE id = ?").bind("missing").first(), null);
  const r = await db.prepare("UPDATE t SET n = ? WHERE id = ?").bind(2, "a").run();
  assert.equal(r.changes, 1);
});

test("the atomic video-claim upsert works the same locally, including the limit miss", async () => {
  const db = createLocalD1Db(file());
  await ensureTables(db);
  const claim = (user: string, day: string, limit: number) =>
    db
      .prepare(
        "INSERT INTO usage (user_id, day, videos) VALUES (?, ?, 1) " +
          "ON CONFLICT (user_id, day) DO UPDATE SET videos = videos + 1 WHERE videos < ? RETURNING videos",
      )
      .bind(user, day, limit)
      .first<{ videos: number }>();
  assert.deepEqual(await claim("u1", "2026-05-01", 3), { videos: 1 });
  assert.deepEqual(await claim("u1", "2026-05-01", 3), { videos: 2 });
  assert.deepEqual(await claim("u1", "2026-05-01", 3), { videos: 3 });
  assert.equal(await claim("u1", "2026-05-01", 3), null);
});

test("the local Kysely dialect runs Better Auth-shaped queries with no-op transactions", async () => {
  const f = file();
  const db = createLocalKysely(f);
  await sql`CREATE TABLE "user" (id TEXT PRIMARY KEY, email TEXT)`.execute(db);
  await sql`INSERT INTO "user" (id, email) VALUES ('u1', 'a@x.co')`.execute(db);
  const rows = await sql`SELECT id, email FROM "user"`.execute(db);
  assert.deepEqual(rows.rows, [{ id: "u1", email: "a@x.co" }]);
  await db.transaction().execute(async (trx) => {
    await sql`SELECT 1`.execute(trx);
  });
  const tables = await db.introspection.getTables();
  assert.deepEqual(
    tables.map((t) => t.name),
    ["user"],
  );
  await db.destroy();
});

test("EXPLANIMATE_D1_LOCAL_PATH switches the app handle and the configured check", async () => {
  const saved = process.env.EXPLANIMATE_D1_LOCAL_PATH;
  const f = file();
  process.env.EXPLANIMATE_D1_LOCAL_PATH = f;
  try {
    assert.equal(localD1Path(), f);
    assert.equal(d1Configured(), true);
    await ensureTables(getD1Db());
    assert.ok(fs.existsSync(f));
  } finally {
    if (saved === undefined) delete process.env.EXPLANIMATE_D1_LOCAL_PATH;
    else process.env.EXPLANIMATE_D1_LOCAL_PATH = saved;
  }
});
