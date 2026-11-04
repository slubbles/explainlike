/**
 * The sign-in database lives in Cloudflare D1, reached over its REST API: the app runs in Docker
 * on a normal server, not in a Worker, so there is no D1 binding to use. App code talks to a small
 * D1-shaped interface (`prepare(sql).bind(...).first()/all()/run()`); Better Auth gets a Kysely
 * instance whose driver runs every query through the same REST call. D1 REST has no interactive
 * transactions, so begin/commit/rollback are no-ops and Better Auth is told not to use them.
 *
 * Failures log Cloudflare's error codes, never the token.
 */
import {
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";

const D1_TIMEOUT_MS = 10_000;

export interface D1Config {
  accountId: string;
  databaseId: string;
  token: string;
  fetchImpl?: typeof fetch;
}

/** What one bound statement returns: the first row, all rows, or the write count. */
export interface D1Bound {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<T[]>;
  run(): Promise<{ changes: number; lastRowId: number }>;
}

export interface D1Statement {
  bind(...params: unknown[]): D1Bound;
}

export interface D1Db {
  prepare(sql: string): D1Statement;
}

/** The D1 REST client needs these three; anything missing is a deploy error, thrown when first used. */
export function d1ConfigFromEnv(fetchImpl: typeof fetch = fetch): D1Config {
  const accountId = process.env.EXPLANIMATE_CF_ACCOUNT_ID;
  const databaseId = process.env.EXPLANIMATE_D1_DATABASE_ID;
  const token = process.env.EXPLANIMATE_D1_TOKEN;
  if (!accountId || !databaseId || !token)
    throw new Error("EXPLANIMATE_CF_ACCOUNT_ID, EXPLANIMATE_D1_DATABASE_ID and EXPLANIMATE_D1_TOKEN must all be set");
  return { accountId, databaseId, token, fetchImpl };
}

export function createD1Db(config: D1Config): D1Db {
  const run = (sql: string, params: unknown[]) => d1Query(config, sql, params);
  return {
    prepare: (sql: string): D1Statement => ({
      bind: (...params: unknown[]): D1Bound => ({
        first: async <T>() => ((await run(sql, params)).rows[0] as T | undefined) ?? null,
        all: async <T>() => (await run(sql, params)).rows as T[],
        run: async () => {
          const r = await run(sql, params);
          return { changes: r.changes, lastRowId: r.lastRowId };
        },
      }),
    }),
  };
}

/** The app's D1 handle from the environment (stateless, so no caching or closing). */
export function getD1Db(fetchImpl: typeof fetch = fetch): D1Db {
  return createD1Db(d1ConfigFromEnv(fetchImpl));
}

/** True when the three D1 settings are present. The error store and admin lists need them. */
export function d1Configured(): boolean {
  return !!(process.env.EXPLANIMATE_CF_ACCOUNT_ID && process.env.EXPLANIMATE_D1_DATABASE_ID && process.env.EXPLANIMATE_D1_TOKEN);
}

type D1Value = string | number | null;

/** REST params are JSON: booleans become 0/1, missing values become null. */
function toD1Params(params: readonly unknown[]): D1Value[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "bigint") return Number(p);
    if (typeof p === "string" || typeof p === "number") return p;
    if (p instanceof Date) return p.toISOString();
    return String(p);
  });
}

interface D1Rows {
  rows: Record<string, unknown>[];
  changes: number;
  lastRowId: number;
}

async function d1Query(config: D1Config, sql: string, params: readonly unknown[]): Promise<D1Rows> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const body = JSON.stringify({ sql, params: toD1Params(params) });
  let res: Response | undefined;
  let networkError = "";
  // one retry on a 5xx or a network error; a 4xx is our mistake and is not retried
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(D1_TIMEOUT_MS),
      });
      networkError = "";
      if (res.status < 500 || res.status > 599) break;
      res = undefined;
    } catch (e) {
      networkError = e instanceof Error ? e.message : String(e);
      res = undefined;
    }
  }
  if (!res) throw new Error(`D1 did not answer${networkError ? `: ${networkError}` : ""}`);
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { code?: number; message?: string }[];
    result?: { results?: Record<string, unknown>[]; meta?: { changes?: number; last_row_id?: number } }[];
  };
  const first = data.result?.[0];
  if (!res.ok || data.success !== true || !first) {
    const codes = (data.errors ?? [])
      .map((e) => e.code)
      .filter(Boolean)
      .join(",");
    console.error(`[db] D1 refused the query (http ${res.status}${codes ? `, codes ${codes}` : ""})`);
    throw new Error(`D1 refused the query (http ${res.status}${codes ? `, codes ${codes}` : ""})`);
  }
  return {
    rows: first.results ?? [],
    changes: Number(first.meta?.changes) || 0,
    lastRowId: Number(first.meta?.last_row_id) || 0,
  };
}

/**
 * Our own tables: per-day video counts, per-user overrides, which account started which job,
 * and recent server/client errors. Fresh databases get the full videos shape (prompt length,
 * status, cost); older ones gain the new columns below, so both old and new rows read the same.
 */
export async function ensureTables(db: D1Db): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS usage (
    user_id TEXT NOT NULL, day TEXT NOT NULL, videos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day))`,
    )
    .bind()
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS user_limits (
    user_id TEXT PRIMARY KEY, daily_videos INTEGER NOT NULL)`,
    )
    .bind()
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, input TEXT NOT NULL, created_at INTEGER NOT NULL,
    input_len INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'started', cost REAL NOT NULL DEFAULT 0)`,
    )
    .bind()
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, route TEXT NOT NULL, source TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, stack TEXT NOT NULL DEFAULT '', request_id TEXT NOT NULL DEFAULT '')`,
    )
    .bind()
    .run();
  // videos rows from before the input_len/status/cost columns: add what is missing. Best effort
  // (a failure is logged, never thrown), because recording a video must never break creating one.
  try {
    const cols = await db.prepare("PRAGMA table_info(videos)").bind().all<{ name: string }>();
    const have = new Set(cols.map((c) => c.name));
    for (const [column, ddl] of [
      ["input_len", "ALTER TABLE videos ADD COLUMN input_len INTEGER NOT NULL DEFAULT 0"],
      ["status", "ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'started'"],
      ["cost", "ALTER TABLE videos ADD COLUMN cost REAL NOT NULL DEFAULT 0"],
    ] as const) {
      if (!have.has(column)) await db.prepare(ddl).bind().run();
    }
  } catch (e) {
    console.error(`[db] videos migration skipped: ${(e as Error).message}`);
  }
}

// ---- the Kysely dialect Better Auth runs on ----

class D1RestConnection implements DatabaseConnection {
  private config: D1Config;
  constructor(config: D1Config) {
    this.config = config;
  }
  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const r = await d1Query(this.config, compiled.sql, compiled.parameters);
    return {
      rows: (r.rows ?? []) as R[],
      numAffectedRows: BigInt(r.changes),
      insertId: r.lastRowId ? BigInt(r.lastRowId) : undefined,
    };
  }
  // D1 REST has no streaming; like Better Auth's own D1 driver, say so loudly.
  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("D1 does not support streaming queries.");
  }
}

class D1RestDriver implements Driver {
  private config: D1Config;
  constructor(config: D1Config) {
    this.config = config;
  }
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1RestConnection(this.config);
  }
  // D1 REST has no interactive transactions; Better Auth is configured not to use them.
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

class D1RestAdapter extends SqliteAdapter {
  override get supportsMultipleConnections(): boolean {
    return true;
  }
}

export class D1RestDialect implements Dialect {
  private config: D1Config;
  constructor(config: D1Config) {
    this.config = config;
  }
  createDriver(): Driver {
    return new D1RestDriver(this.config);
  }
  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
  createAdapter(): DialectAdapter {
    return new D1RestAdapter();
  }
  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

/** A Kysely instance over D1 REST (Better Auth takes this with `transaction: false`). */
export function createKysely(config: D1Config): Kysely<any> {
  return new Kysely({ dialect: new D1RestDialect(config) });
}
