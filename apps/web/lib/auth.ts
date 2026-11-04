/**
 * Sign-in by one-time email code, behind EXPLANIMATE_AUTH_ENABLED=1 (only the exact value "1"
 * turns it on; anything else is today's behaviour: no sign-in, no Turnstile, no per-account limit).
 * Better Auth with its emailOTP plugin only: no passwords, no OAuth. Sessions last 7 days and are
 * refreshed daily; codes are 6 digits, valid 10 minutes, with 5 attempts. The database is D1 over
 * its REST API (see lib/db.ts), or a local SQLite file for tests; its tables are created on first use, once per process.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins";
import { APP_TABLE_COLUMNS, authTablesExist, createKysely, d1ConfigFromEnv, ensureTables, getD1Db, localD1Path, type D1Db } from "./db";
import { createLocalD1Db, createLocalKysely } from "./db-local";
import { sendOtpEmail } from "./email";
import { clientIp, rateLimit } from "./guard";
import { verifyTurnstile } from "./turnstile";

/** Only the exact value "1" turns auth on. */
export const authEnabled = (): boolean => process.env.EXPLANIMATE_AUTH_ENABLED === "1";

export const SIGNIN_ERROR = "Sign in to make a video.";

const SEND_PATH = "/email-otp/send-verification-otp";
const VERIFY_PATHS = new Set(["/sign-in/email-otp", "/email-otp/check-verification-otp", "/email-otp/verify-email"]);

function buildAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return betterAuth({
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    // no sweep of expired codes on every verify: the sweep is two extra sequential D1
    // round trips, and expiry is still enforced when a code is checked.
    verification: { disableCleanup: true },
    database: {
      db: localD1Path() ? createLocalKysely(localD1Path()) : createKysely(d1ConfigFromEnv()),
      type: "sqlite",
      transaction: false,
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Not supported." });
          const r = await sendOtpEmail(email, otp);
          if (!r.ok) throw new APIError("INTERNAL_SERVER_ERROR", { message: r.error });
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SEND_PATH && !(ctx.path && VERIFY_PATHS.has(ctx.path))) return;
        const req = ctx.request ?? new Request("http://localhost/", { headers: new Headers(ctx.headers as HeadersInit) });
        const ip = clientIp(req);
        if (ctx.path === SEND_PATH) {
          // sending a code costs an email: per-IP and per-address limits, then the Turnstile
          // check. The hook throws before the endpoint runs, so no email goes out without one.
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
          if (rateLimit(`otp-send:${ip}`, 5, 10 * 60_000))
            throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes requested. Try again in a few minutes." });
          if (email && rateLimit(`otp-email:${email}`, 5, 60 * 60_000))
            throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes for this address. Try again in an hour." });
          const token =
            req.headers.get("x-turnstile-token") ?? (typeof ctx.body?.turnstileToken === "string" ? ctx.body.turnstileToken : "");
          const v = await verifyTurnstile(token, ip);
          if (!v.ok) throw new APIError("BAD_REQUEST", { message: v.error });
        } else if (rateLimit(`otp-verify:${ip}`, 10, 10 * 60_000)) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many tries. Try again in a few minutes." });
        }
      }),
    },
  });
}

type Auth = ReturnType<typeof buildAuth>;
let auth: Auth | undefined;

/** The Better Auth instance (built once; throws when the auth settings are missing). */
export function getAuth(): Auth {
  if (!auth) auth = buildAuth();
  return auth;
}

interface ExpectedSchema {
  /** Every sign-in table and the columns it must have. */
  columns: Map<string, Set<string>>;
  /** Every named index as "table.name". */
  indexes: Set<string>;
}

let expected: Promise<ExpectedSchema | null> | undefined;

/**
 * What the sign-in tables must look like, asked from Better Auth itself: the same options run
 * against a throwaway local file, migrated and read back there, so learning it costs no D1
 * round trip. Our own tables join in from APP_TABLE_COLUMNS. Cached per process; null when the
 * shadow run fails, in which case the request path migrates the slow way, exactly as today.
 */
function expectedSchema(): Promise<ExpectedSchema | null> {
  expected ??= (async (): Promise<ExpectedSchema | null> => {
    try {
      const shadowFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-auth-schema-")), "schema.db");
      const shadow = createLocalKysely(shadowFile);
      try {
        const { runMigrations } = await getMigrations({ ...getAuth().options, database: { db: shadow, type: "sqlite" } });
        await runMigrations();
      } finally {
        await shadow.destroy();
      }
      const db = createLocalD1Db(shadowFile);
      const tables = await db
        .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`)
        .bind()
        .all<{ name: string }>();
      const columns = new Map<string, Set<string>>();
      for (const t of tables) {
        const cols = await db.prepare(`SELECT name FROM pragma_table_info(?)`).bind(t.name).all<{ name: string }>();
        columns.set(t.name, new Set(cols.map((c) => c.name)));
      }
      const idx = await db
        .prepare(`SELECT tbl_name AS tbl, name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`)
        .bind()
        .all<{ tbl: string; name: string }>();
      const indexes = new Set(idx.map((r) => `${r.tbl}.${r.name}`));
      for (const [table, cols] of Object.entries(APP_TABLE_COLUMNS)) columns.set(table, new Set(cols));
      return { columns, indexes };
    } catch {
      return null;
    }
  })();
  return expected;
}

/** How the live schema compares: current, columns missing, or only indexes missing. */
type SchemaState = "current" | "columns" | "indexes";

/**
 * Compares the live schema with one D1 query: every expected column and index present means
 * current. A fresh database, a dropped table, or an upgrade that adds a column answers
 * columns; columns all present but an index missing answers indexes. Anything unreadable
 * answers columns, so the caller runs the real migrations.
 */
async function schemaState(db: D1Db, exp: ExpectedSchema): Promise<SchemaState> {
  const parts: string[] = [];
  const params: string[] = [];
  for (const table of exp.columns.keys()) {
    parts.push(`SELECT 'c' AS kind, ? AS tbl, name AS val FROM pragma_table_info(?)`);
    params.push(table, table);
  }
  parts.push(`SELECT 'i' AS kind, tbl_name AS tbl, name AS val FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`);
  const rows = await db
    .prepare(parts.join(" UNION ALL "))
    .bind(...params)
    .all<{ kind: unknown; tbl: unknown; val: unknown }>();
  const cols = new Map<string, Set<string>>();
  const idx = new Set<string>();
  for (const r of rows) {
    if (typeof r.kind !== "string" || typeof r.tbl !== "string" || typeof r.val !== "string") continue;
    if (r.kind === "c") {
      const s = cols.get(r.tbl) ?? new Set<string>();
      s.add(r.val);
      cols.set(r.tbl, s);
    } else if (r.kind === "i") idx.add(`${r.tbl}.${r.val}`);
  }
  let columns = true;
  for (const [table, want] of exp.columns) {
    const have = cols.get(table);
    if (!have) {
      columns = false;
      break;
    }
    for (const c of want)
      if (!have.has(c)) {
        columns = false;
        break;
      }
    if (!columns) break;
  }
  const missingIdx = [...exp.indexes].filter((i) => !idx.has(i));
  if (columns && missingIdx.length === 0) return "current";
  if (columns) {
    console.error(`[auth] sign-in columns are current but these indexes are missing: ${missingIdx.join(", ")}`);
    return "indexes";
  }
  return "columns";
}

/** Better Auth's tables plus ours, created when missing (once per process; a failure retries). */
let migrated: Promise<void> | undefined;
export function ensureAuthSchema(): Promise<void> {
  migrated ??= (async () => {
    try {
      getAuth();
      const db = getD1Db();
      // one cheap query when the schema is already current; the full migration check only
      // runs for a fresh database or after an upgrade that changes the tables
      const exp = await expectedSchema().catch(() => null);
      if (exp && (await schemaState(db, exp).catch(() => "columns" as const)) === "current") return;
      const { runMigrations } = await getMigrations(getAuth().options);
      await runMigrations();
      await ensureTables(db);
    } catch (e) {
      // D1 refuses some introspection queries outright; once the sign-in tables exist,
      // sessions must work regardless, so a migration failure then only warns.
      try {
        if (await authTablesExist(getD1Db())) {
          console.error(`[auth] migrations skipped, sign-in tables already exist: ${(e as Error).message}`);
          return;
        }
      } catch {}
      migrated = undefined;
      throw e;
    }
  })();
  return migrated;
}

/** Forget the cached auth instance and migration state (tests only). */
export function resetAuthForTests(): void {
  auth = undefined;
  migrated = undefined;
  expected = undefined;
}

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in account, or null (flag off, signed out, or anything failing: fail closed). */
export async function sessionUser(req: Request): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  try {
    await ensureAuthSchema();
    const s = await getAuth().api.getSession({ headers: req.headers });
    return s?.user?.id && s.user.email ? { id: s.user.id, email: s.user.email } : null;
  } catch (e) {
    console.error(`[auth] session check failed: ${(e as Error).message}`);
    return null;
  }
}
