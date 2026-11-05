/**
 * One account's videos for /app: the finished rows from D1 joined with the live jobs on
 * disk, so rows from before the result columns (and rows whose render just finished) read
 * the same. Callers pass a D1 handle with our tables already ensured (ensureUsageTables);
 * nothing here reaches the network or the disk except through that handle and the remove
 * callback the caller supplies. Deleting is ownership-checked: a video the account did not
 * start answers 404, never 403, so one account cannot probe another's ids.
 */
import type { D1Db } from "./db";

export interface VideoFiles {
  mp4?: string;
  tldr?: string;
  excalidraw?: string;
  contactSheet?: string;
}

/** The least a job must offer for the join (lib/jobs.ts Job is a superset). */
export interface VideoJobLike {
  id: string;
  kind?: string;
  title?: string;
  state?: string;
  ask?: { format?: string };
  durationSec?: number;
  costUsd?: number;
  usd?: { total?: number };
  owner?: string;
  outputs?: (VideoFiles & { poster?: string }) | undefined;
}

export interface UserVideo {
  id: string;
  input: string;
  createdAt: number;
  /** the render's title, or the input itself when the row predates titles and the job is gone */
  title: string;
  /** short, deep, anatomy or auto */
  format: string;
  durationSec?: number;
  /** the saved still frame, when the render wrote one */
  poster?: string;
  files: VideoFiles;
  /** the live job state, a terminal row status, or gone when neither knows it */
  status: string;
  kind?: string;
  cost: number;
}

interface VideoRow {
  id: string;
  input: string;
  createdAt: number;
  status: string;
  cost: number;
  title: string;
  format: string;
  durationSec: number;
  poster: string;
  files: string;
}

const filesOf = (raw: string): VideoFiles => {
  try {
    const v = JSON.parse(raw || "{}") as Record<string, unknown>;
    const name = (k: string) => (typeof v[k] === "string" && v[k] ? (v[k] as string) : undefined);
    const out: VideoFiles = {};
    const mp4 = name("mp4");
    const tldr = name("tldr");
    const excalidraw = name("excalidraw");
    const contactSheet = name("contactSheet");
    if (mp4) out.mp4 = mp4;
    if (tldr) out.tldr = tldr;
    if (excalidraw) out.excalidraw = excalidraw;
    if (contactSheet) out.contactSheet = contactSheet;
    return out;
  } catch {
    return {};
  }
};

/** A title for rows that predate titles: the live job's, else the input without its scheme. */
const titleOf = (row: VideoRow, job?: VideoJobLike): string =>
  row.title ||
  job?.title ||
  row.input
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/\/$/, "")
    .slice(0, 120) ||
  "Untitled video";

const TERMINAL = new Set(["done", "error", "cancelled"]);

/** Every video an account started, newest first, each row joined with its live job. */
export async function listVideosForUser(userId: string, jobs: VideoJobLike[], db: D1Db, limit = 100): Promise<UserVideo[]> {
  const rows = await db
    .prepare(
      "SELECT id, input, created_at AS createdAt, status, cost, title, format, duration_sec AS durationSec, poster, files" +
        " FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(userId, limit)
    .all<VideoRow>();
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return rows.map((r) => {
    const job = byId.get(r.id);
    const stored = filesOf(r.files);
    const live = job?.outputs ?? {};
    const files: VideoFiles = {};
    const mp4 = stored.mp4 ?? live.mp4;
    const tldr = stored.tldr ?? live.tldr;
    const excalidraw = stored.excalidraw ?? live.excalidraw;
    const contactSheet = stored.contactSheet ?? live.contactSheet;
    if (mp4) files.mp4 = mp4;
    if (tldr) files.tldr = tldr;
    if (excalidraw) files.excalidraw = excalidraw;
    if (contactSheet) files.contactSheet = contactSheet;
    const durationSec = Number(r.durationSec) > 0 ? Number(r.durationSec) : (job?.durationSec ?? 0);
    const poster = r.poster || live.poster || undefined;
    const cost = job?.costUsd ?? job?.usd?.total ?? Number(r.cost);
    return {
      id: r.id,
      input: String(r.input ?? ""),
      createdAt: Number(r.createdAt) || 0,
      title: titleOf(r, job),
      format: r.format || job?.ask?.format || "auto",
      ...(durationSec > 0 ? { durationSec } : {}),
      ...(poster ? { poster } : {}),
      files,
      status: job?.state ?? (TERMINAL.has(r.status) ? r.status : "gone"),
      ...(job?.kind ? { kind: job.kind } : {}),
      cost: Number.isFinite(cost) ? cost : 0,
    };
  });
}

/** Which account started a video, or null when no row says so. */
export async function videoOwnerId(id: string, db: D1Db): Promise<string | null> {
  const row = await db.prepare("SELECT user_id AS userId FROM videos WHERE id = ?").bind(id).first<{ userId: string }>();
  return row?.userId ?? null;
}

export interface VideoResult {
  title?: string;
  format?: string;
  durationSec?: number;
  poster?: string;
  files?: VideoFiles;
  status?: string;
  cost?: number;
}

/**
 * Note a render's finished result on its videos row. Only the fields given are touched, so the
 * done handler writes the result while later status updates only touch status and cost. Audit
 * only, like recordVideo: a failure is logged, never thrown, and nothing happens without a row.
 */
export async function updateVideoResult(jobId: string, fields: VideoResult, db: D1Db): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.title !== undefined) {
    sets.push("title = ?");
    params.push(fields.title.slice(0, 300));
  }
  if (fields.format !== undefined) {
    sets.push("format = ?");
    params.push(fields.format.slice(0, 20));
  }
  if (fields.durationSec !== undefined) {
    sets.push("duration_sec = ?");
    params.push(fields.durationSec);
  }
  if (fields.poster !== undefined) {
    sets.push("poster = ?");
    params.push(fields.poster.slice(0, 120));
  }
  if (fields.files !== undefined) {
    sets.push("files = ?");
    params.push(JSON.stringify(fields.files).slice(0, 2000));
  }
  if (fields.status !== undefined) {
    sets.push("status = ?");
    params.push(fields.status.slice(0, 20));
  }
  if (fields.cost !== undefined) {
    sets.push("cost = ?");
    params.push(fields.cost);
  }
  if (!sets.length) return;
  params.push(jobId);
  try {
    await db
      .prepare(`UPDATE videos SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();
  } catch (e) {
    console.error(`[videos] could not update video ${jobId}: ${(e as Error).message}`);
  }
}

export type VideoDelete = { ok: true } | { ok: false; status: 404 | 500; error: string };

/**
 * Delete one account's video: the job folder through remove (which cancels a live render
 * first), then its videos row. Allowed when the row names the account, or when no row exists
 * but the live job is theirs (a row the start handler failed to write must not pin the files
 * forever). Anything else answers 404.
 */
export async function deleteUserVideo(
  userId: string,
  id: string,
  jobs: VideoJobLike[],
  db: D1Db,
  remove: (id: string) => void,
): Promise<VideoDelete> {
  let owner: string | null;
  try {
    owner = await videoOwnerId(id, db);
  } catch (e) {
    console.error(`[videos] could not check ownership of ${id}: ${(e as Error).message}`);
    return { ok: false, status: 500, error: "Could not check who owns this video. Try again in a moment." };
  }
  const job = jobs.find((j) => j.id === id);
  if (owner !== userId && (owner !== null || job?.owner !== `u:${userId}`)) return { ok: false, status: 404, error: "Not found." };
  remove(id);
  await db
    .prepare("DELETE FROM videos WHERE id = ?")
    .bind(id)
    .run()
    .catch((e) => console.error(`[videos] could not delete video row ${id}: ${(e as Error).message}`));
  return { ok: true };
}

/**
 * Delete an account and everything it made: every job folder, its videos rows, its usage and
 * limit rows, then its sign-in rows (sessions and linked logins first, the user row last).
 * Each statement is best effort except the user row itself, which must go. Login-code rows
 * stay: they expire within 10 minutes and are useless without the account.
 */
export async function deleteUserAccount(userId: string, db: D1Db, remove: (id: string) => void): Promise<{ videos: number }> {
  const rows = await db.prepare("SELECT id FROM videos WHERE user_id = ?").bind(userId).all<{ id: string }>();
  for (const r of rows) {
    try {
      remove(r.id);
    } catch (e) {
      console.error(`[videos] could not remove job ${r.id}: ${(e as Error).message}`);
    }
  }
  const quiet = (sql: string) =>
    db
      .prepare(sql)
      .bind(userId)
      .run()
      .catch((e) => console.error(`[videos] ${sql}: ${(e as Error).message}`));
  await quiet("DELETE FROM videos WHERE user_id = ?");
  await quiet("DELETE FROM usage WHERE user_id = ?");
  await quiet("DELETE FROM user_limits WHERE user_id = ?");
  await quiet("DELETE FROM session WHERE userId = ?");
  await quiet("DELETE FROM account WHERE userId = ?");
  const user = await db.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();
  if (user.changes === 0) throw new Error(`no user row for ${userId}`);
  return { videos: rows.length };
}

/** short, deep, anatomy or auto in the words the dashboard shows. */
export function formatLabel(format?: string): string {
  return format === "short" ? "Short" : format === "deep" ? "Deep" : format === "anatomy" ? "Anatomy" : "Auto";
}

/** A duration in seconds as m:ss; nothing without a real number. */
export function mss(sec?: number): string | undefined {
  return typeof sec === "number" && sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : undefined;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A timestamp broken into calendar parts in one time zone, read from Intl. */
function zonedParts(t: number, timeZone?: string) {
  const found = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .formatToParts(new Date(t))
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour),
    minute: found.minute,
    dayPeriod: found.dayPeriod,
  };
}

/** When a video was made, in the viewer's time zone: "Today, 9:12 PM", "Yesterday", "Nov 2", or "Nov 2, 2025". */
export function when(ts: number, nowMs = Date.now(), timeZone?: string): string {
  const d = zonedParts(ts, timeZone);
  const n = zonedParts(nowMs, timeZone);
  const day = (p: { year: number; month: number; day: number }) => Date.UTC(p.year, p.month - 1, p.day);
  if (day(d) === day(n)) return `Today, ${d.hour}:${d.minute} ${d.dayPeriod}`;
  if (day(d) === day(n) - 86400_000) return "Yesterday";
  const md = `${MONTHS[d.month - 1]} ${d.day}`;
  return d.year === n.year ? md : `${md}, ${d.year}`;
}

/** How long ago a job started: "12s ago", "1m 40s ago", "3h 5m ago". */
export function ago(ts: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

/** What My videos lists: a failed run that made no video does not count, so it is not shown. */
export function shownVideos(videos: UserVideo[]): UserVideo[] {
  return videos.filter((v) => !((v.status === "error" || v.status === "failed") && !v.files.mp4));
}
