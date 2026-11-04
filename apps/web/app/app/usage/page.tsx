import Link from "next/link";
import { requireAppUser } from "../../../lib/appuser";
import { getD1Db } from "../../../lib/db";
import { dailyLimitFor, ensureUsageTables, usageHistoryFor, videosLeftToday } from "../../../lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Usage · Explanimate" };

/** Today's quota against the daily limit, and the videos started per day. */
export default async function UsagePage() {
  const user = await requireAppUser();
  const db = getD1Db();
  await ensureUsageTables(db);
  const [videos, limit, history] = await Promise.all([videosLeftToday(user.id), dailyLimitFor(user.id), usageHistoryFor(user.id, 30)]);
  const segs = Math.min(Math.max(limit, 1), 12);
  const filled = Math.round((videos.left / Math.max(limit, 1)) * segs);

  return (
    <>
      <h1 className="app-h1">Usage</h1>

      <div className="app-grid c2e">
        <div className="app-c">
          <div className="app-chead">
            <span>Videos left today</span>
          </div>
          <div className="app-count">
            {videos.left}
            <small> / {limit}</small>
          </div>
          <div className="app-segs" aria-hidden="true">
            {Array.from({ length: segs }, (_, i) => (
              <i key={i} className={i < filled ? "f" : ""} />
            ))}
          </div>
          <p className="app-note">Resets at 00:00 UTC. Follow-up clips count too.</p>
        </div>
        <div className="app-c">
          <div className="app-chead">
            <span>Daily limit</span>
          </div>
          <div className="app-count">
            {limit}
            <small> / day</small>
          </div>
          <p className="app-note" style={{ marginTop: 18 }}>
            {videos.used} {videos.used === 1 ? "video" : "videos"} started today. The limit is per account; browsing the gallery is always
            free.
          </p>
        </div>
      </div>

      <div className="app-grid">
        <div className="app-c">
          <div className="app-chead">
            <span>History</span>
          </div>
          {history.length === 0 ? (
            <div className="app-empty">
              <p>No videos yet. Days you make videos in show up here.</p>
              <Link className="btn solid" href="/app/new">
                + New video
              </Link>
            </div>
          ) : (
            <div className="app-tscroll">
              <table className="app-table">
                <thead>
                  <tr>
                    <th scope="col">Day (UTC)</th>
                    <th scope="col">Videos started</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((d) => (
                    <tr key={d.day}>
                      <td className="made">{d.day}</td>
                      <td className="mono">{d.videos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
