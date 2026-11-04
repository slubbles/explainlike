import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Nav from "../../components/Nav";
import LimitForm from "./LimitForm";
import { listAdminUsers, listAdminVideos, requireAdmin, spendSummary, usagePerDay } from "../../lib/admin";
import { d1Configured } from "../../lib/db";
import { countErrorsSince, listRecentErrors } from "../../lib/errors";
import { checkHealth } from "../../lib/health";
import { JOBS_DIR, budgetNow, listJobs } from "../../lib/jobs";
import "./admin.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Explanimate" };

const when = (iso: string) => (iso.length > 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso);
const money = (n: number) => `$${n.toFixed(3)}`;

/** The admin portal. Gated on the server: anyone but a listed admin gets the 404 page. */
export default async function AdminPage() {
  const h = await headers();
  const init: Record<string, string> = {};
  h.forEach((v, k) => {
    init[k] = v;
  });
  const gate = await requireAdmin(new Request("http://localhost/admin", { headers: init }));
  if (!gate.ok) notFound();

  const jobs = listJobs();
  const [users, videos, days, errors, errors24h] = await Promise.all([
    listAdminUsers().catch(() => null),
    listAdminVideos(jobs).catch(() => null),
    usagePerDay().catch(() => null),
    listRecentErrors(20).catch(() => []),
    countErrorsSince(Date.now() - 24 * 3600_000).catch(() => 0),
  ]);
  const spend = spendSummary(jobs, JOBS_DIR);
  const health = checkHealth(JOBS_DIR, budgetNow().ok);
  const dbOff = !d1Configured();

  return (
    <>
      <Nav />
      <main className="page adm">
        <div className="wrap">
          <h1>Admin</h1>
          <p className="muted">Signed in as {gate.user.email}</p>
          {dbOff && (
            <p className="note" role="status">
              The sign-in database (D1) is not configured, so users, videos and usage per day are unavailable. Spend, errors and health
              below still work.
            </p>
          )}

          <section aria-label="Spend">
            <h2>Spend</h2>
            <div className="stats">
              <div>
                <span>Today (UTC)</span>
                <b>
                  {money(spend.today)} of {money(spend.dailyCap)}
                </b>
                {!spend.dailyOk && <em>paused until 00:00 UTC</em>}
              </div>
              <div>
                <span>Lifetime Meta (Muse)</span>
                <b>
                  {money(spend.lifetime.meta)} of {money(spend.caps.meta)}
                </b>
              </div>
              <div>
                <span>Lifetime Deepgram</span>
                <b>
                  {money(spend.lifetime.voice)} of {money(spend.caps.voice)}
                </b>
              </div>
            </div>
            {spend.warnings.map((w) => (
              <p className="note" role="status" key={w}>
                {w}
              </p>
            ))}
          </section>

          <section aria-label="Users">
            <h2>Users</h2>
            {!users ? (
              <p className="muted">Unavailable right now.</p>
            ) : users.length === 0 ? (
              <p className="muted">No accounts yet.</p>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Created</th>
                      <th scope="col">Today</th>
                      <th scope="col">Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td className="nowrap">{when(u.created)}</td>
                        <td>
                          {u.usedToday}/{u.limit}
                        </td>
                        <td>{u.limit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Per-user limit">
            <h2>Per-user limit</h2>
            <LimitForm />
          </section>

          <section aria-label="Videos">
            <h2>Videos</h2>
            {!videos ? (
              <p className="muted">Unavailable right now.</p>
            ) : videos.length === 0 ? (
              <p className="muted">No videos recorded yet.</p>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Job</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Status</th>
                      <th scope="col">Cost</th>
                      <th scope="col">Prompt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map((v) => (
                      <tr key={v.id}>
                        <td className="nowrap">
                          <a href={`/?job=${v.id}`}>{v.id}</a>
                          <span className="muted"> · {when(v.created)}</span>
                        </td>
                        <td>{v.owner}</td>
                        <td>{v.status}</td>
                        <td className="nowrap">{money(v.cost)}</td>
                        <td className="prompt">
                          {v.input} <span className="muted">({v.inputLen} chars)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Usage per day">
            <h2>Usage per day</h2>
            {!days ? (
              <p className="muted">Unavailable right now.</p>
            ) : days.length === 0 ? (
              <p className="muted">No usage yet.</p>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Day (UTC)</th>
                      <th scope="col">Videos</th>
                      <th scope="col">Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d.day}>
                        <td className="nowrap">{d.day}</td>
                        <td>{d.videos}</td>
                        <td>{d.users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Recent errors">
            <h2>Recent errors</h2>
            {errors.length === 0 ? (
              <p className="muted">None recorded in the last 14 days.</p>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">When (UTC)</th>
                      <th scope="col">Route</th>
                      <th scope="col">Error</th>
                      <th scope="col">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e, i) => (
                      <tr key={e.id ?? i}>
                        <td className="nowrap">{when(new Date(e.ts).toISOString())}</td>
                        <td>
                          {e.route} <span className="muted">({e.source})</span>
                        </td>
                        <td className="prompt">
                          {e.name ? `${e.name}: ` : ""}
                          {e.message}
                        </td>
                        <td className="nowrap">{e.requestId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Health">
            <h2>Health</h2>
            <div className="stats">
              <div>
                <span>Status</span>
                <b>{health.ok ? "healthy" : "unhealthy"}</b>
                {health.paused && <em>new videos paused</em>}
              </div>
              <div>
                <span>Errors in 24 h</span>
                <b>{errors24h}</b>
              </div>
              {(
                [
                  ["ffmpeg", health.checks.ffmpeg],
                  ["Chrome", health.checks.chrome],
                  ["model key", health.checks.modelKey],
                  ["voice key", health.checks.voiceKey],
                  ["jobs folder", health.checks.jobsDir],
                ] as const
              ).map(([name, ok]) => (
                <div key={name}>
                  <span>{name}</span>
                  <b>{ok ? "yes" : "no"}</b>
                </div>
              ))}
            </div>
            {health.problems.map((p) => (
              <p className="err" role="alert" key={p}>
                {p}
              </p>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
