/**
 * The admin portal's gate and data. /admin and every /api/admin/* route answer 404 unless
 * sign-in is on AND the signed-in address is listed in EXPLANIMATE_ADMIN_EMAILS (or its short
 * alias ADMIN_EMAILS; a comma list, matched case-insensitively). Never 403: to anyone else the portal does not exist.
 * All D1 reads use bound parameters; nothing from the request is built into SQL.
 */
import { authEnabled, sessionUser, type SessionUser } from "./auth";
import { getD1Db, type D1Db } from "./db";
import { budget, caps, dailyBudget, dailyCap, dailyReserve, spent, spentToday } from "./guard";
import { jobTiming } from "./metrics";
import { defaultDailyVideos, ensureUsageTables, utcDay } from "./usage";

/** The admin addresses from the environment, lowercased. Empty when unset, which denies everyone. */
export function adminEmails(): string[] {
  return (process.env.EXPLANIMATE_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether an address is listed as an admin (case-insensitive). */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.trim().toLowerCase());
}

export type AdminGate = { ok: true; user: SessionUser } | { ok: false; response: Response };

/**
 * The gate every admin route and the /admin page check on the server. The session lookup is
 * injectable so tests can stand in for a signed-in user.
 */
export async function requireAdmin(req: Request, session: (req: Request) => Promise<SessionUser | null> = sessionUser): Promise<AdminGate> {
  const missing = () => Response.json({ error: "Not found." }, { status: 404 });
  if (!authEnabled()) return { ok: false, response: missing() };
  const user = await session(req).catch(() => null);
  if (!user || !isAdminEmail(user.email)) return { ok: false, response: missing() };
  return { ok: true, user };
}

/** A timestamp from Better Auth (ISO text or millis) as an ISO string, or "?" when unreadable. */
function asIso(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === "string" && v.trim()) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v.slice(0, 32) : new Date(t).toISOString();
  }
  return "?";
}

export interface AdminUser {
  id: string;
  email: string;
  created: string;
  usedToday: number;
  limit: number;
}

/** Every account, newest first: address, when it signed up, today's usage and its daily limit. */
export async function listAdminUsers(nowMs = Date.now(), db: D1Db = getD1Db()): Promise<AdminUser[]> {
  await ensureUsageTables(db);
  const [users, limits, used] = await Promise.all([
    db
      .prepare("SELECT id, email, createdAt FROM user ORDER BY rowid DESC LIMIT 200")
      .bind()
      .all<{ id: string; email: string; createdAt: unknown }>(),
    db.prepare("SELECT user_id AS userId, daily_videos AS daily FROM user_limits").bind().all<{ userId: string; daily: number }>(),
    db.prepare("SELECT user_id AS userId, videos FROM usage WHERE day = ?").bind(utcDay(nowMs)).all<{ userId: string; videos: number }>(),
  ]);
  const limitById = new Map(limits.map((r) => [r.userId, Number(r.daily)]));
  const usedById = new Map(used.map((r) => [r.userId, Number(r.videos) || 0]));
  const dflt = defaultDailyVideos();
  return users.map((u) => {
    const n = limitById.get(u.id);
    return {
      id: u.id,
      email: u.email,
      created: asIso(u.createdAt),
      usedToday: usedById.get(u.id) ?? 0,
      limit: n !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt,
    };
  });
}

export interface AdminVideo {
  id: string;
  input: string;
  inputLen: number;
  owner: string;
  created: string;
  status: string;
  cost: number;
  /** how long the job waited for a render slot, in ms (null when unknown or still waiting) */
  waitMs: number | null;
  /** how long the render ran once it had a slot, in ms (null when unknown or unfinished) */
  renderMs: number | null;
}

export interface JobLike {
  id: string;
  state: string;
  costUsd?: number;
  usd?: { total?: number };
  started?: number;
  began?: number;
  finished?: number;
}

/** The newest videos: owner from D1, live status and cost from the jobs on disk. */
export async function listAdminVideos(jobs: JobLike[], db: D1Db = getD1Db(), limit = 50): Promise<AdminVideo[]> {
  await ensureUsageTables(db);
  const rows = await db
    .prepare(
      "SELECT v.id AS id, v.user_id AS userId, v.input AS input, v.input_len AS inputLen, v.created_at AS createdAt," +
        " u.email AS email FROM videos v LEFT JOIN user u ON u.id = v.user_id ORDER BY v.created_at DESC LIMIT ?",
    )
    .bind(limit)
    .all<{ id: string; userId: string; input: string; inputLen: number; createdAt: number; email: string | null }>();
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return rows.map((r) => {
    const full = String(r.input ?? "");
    const j = byId.get(r.id);
    const t =
      j?.started === undefined
        ? undefined
        : jobTiming({ id: j.id, state: j.state, started: j.started, began: j.began, finished: j.finished });
    return {
      id: r.id,
      input: full.slice(0, 120),
      inputLen: Number(r.inputLen) || full.length,
      owner: r.email ?? r.userId,
      created: asIso(Number(r.createdAt)),
      status: j?.state ?? "gone",
      cost: j?.costUsd ?? j?.usd?.total ?? 0,
      waitMs: t?.waitMs ?? null,
      renderMs: t?.renderMs ?? null,
    };
  });
}

export interface UsageDay {
  day: string;
  videos: number;
  users: number;
}

/** Videos started per UTC day, newest first. */
export async function usagePerDay(db: D1Db = getD1Db(), days = 30): Promise<UsageDay[]> {
  await ensureUsageTables(db);
  const rows = await db
    .prepare("SELECT day, SUM(videos) AS videos, COUNT(*) AS users FROM usage GROUP BY day ORDER BY day DESC LIMIT ?")
    .bind(days)
    .all<{ day: string; videos: number; users: number }>();
  return rows.map((r) => ({ day: r.day, videos: Number(r.videos) || 0, users: Number(r.users) || 0 }));
}

export interface SpendSummary {
  today: number;
  dailyCap: number;
  dailyOk: boolean;
  lifetime: { meta: number; voice: number };
  caps: { meta: number; voice: number };
  warnings: string[];
}

/** Today's spend under the daily cap, and lifetime spend under the service caps (guard.ts). */
export function spendSummary(
  all: { started?: number; usd?: { meta?: number; voice?: number } }[],
  dir: string,
  nowMs = Date.now(),
): SpendSummary {
  const lifetime = spent(dir, all);
  const b = budget(lifetime);
  const today = spentToday(dir, all, nowMs);
  const cap = dailyCap();
  return {
    today,
    dailyCap: cap,
    dailyOk: dailyBudget(today, cap, dailyReserve()).ok,
    lifetime,
    caps: caps(),
    warnings: b.warnings,
  };
}

export const MAX_ADMIN_LIMIT = 1000;

export type LimitEdit = { ok: true; email: string; limit: number } | { ok: false; error: string };

/** A limit edit from the admin form: an account email and a whole number, 0 to 1000. */
export function parseLimitEdit(body: Record<string, unknown>): LimitEdit {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Enter the account's email address." };
  const limit = typeof body.limit === "number" ? body.limit : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_ADMIN_LIMIT)
    return { ok: false, error: `The limit is a whole number of videos per day, 0 to ${MAX_ADMIN_LIMIT} (0 is the default).` };
  return { ok: true, email, limit };
}

/** Set one account's daily override by email. The account signs in once first. */
export async function setUserLimit(
  email: string,
  n: number,
  db: D1Db = getD1Db(),
): Promise<{ ok: true; userId: string; limit: number } | { ok: false; error: string }> {
  await ensureUsageTables(db);
  const user =
    (await db.prepare("SELECT id FROM user WHERE email = ?").bind(email).first<{ id: string }>()) ??
    (email.toLowerCase() === email
      ? null
      : await db.prepare("SELECT id FROM user WHERE email = ?").bind(email.toLowerCase()).first<{ id: string }>());
  if (!user) return { ok: false, error: `No account for ${email} yet. They sign in once first, then try again.` };
  await db
    .prepare("INSERT INTO user_limits (user_id, daily_videos) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET daily_videos = ?")
    .bind(user.id, n, n)
    .run();
  return { ok: true, userId: user.id, limit: n };
}
