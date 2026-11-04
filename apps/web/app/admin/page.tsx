import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Nav from "../../components/Nav";
import { metadata as notFoundMetadata } from "../not-found";
import LimitForm from "./LimitForm";
import Live from "./Live";
import { getAdminLive, listAdminUsers, listAdminVideos, requireAdmin } from "../../lib/admin";
import { countErrorsSince, listRecentErrors } from "../../lib/errors";
import { checkHealth } from "../../lib/health";
import { JOBS_DIR, budgetNow, listJobs, queueOrder } from "../../lib/jobs";
import { formatMs, jobMetrics, jobTiming, systemMetrics } from "../../lib/metrics";
import "./admin.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The tab title names the page only for a listed admin; everyone else gets the 404 page's title. */
export async function generateMetadata(): Promise<Metadata> {
  const gate = await requireAdmin(await gateRequest());
  return gate.ok ? { title: "Admin · Explanimate", robots: { index: false, follow: false } } : notFoundMetadata;
}

/** The incoming request's headers (the session cookie) as a Request the gate can read. */
async function gateRequest(): Promise<Request> {
  const h = await headers();
  const init: Record<string, string> = {};
  h.forEach((v, k) => {
    init[k] = v;
  });
  return new Request("http://localhost/admin", { headers: init });
}

const when = (iso: string) => (iso.length > 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso);
const money = (n: number) => `$${n.toFixed(3)}`;

/**
 * The admin portal. Gated on the server: anyone but a listed admin gets the 404 page.
 * The live half refreshes every 5 s; the tables below are the full record at load time.
 */
export default async function AdminPage() {
  const gate = await requireAdmin(await gateRequest());
  if (!gate.ok) notFound();

  const jobs = listJobs();
  const [live, users, videos, errors, errors24h] = await Promise.all([
    getAdminLive({ jobs, queue: queueOrder(), jobsDir: JOBS_DIR }),
    listAdminUsers().catch(() => null),
    listAdminVideos(jobs).catch(() => null),
    listRecentErrors(20).catch(() => []),
    countErrorsSince(Date.now() - 24 * 3600_000).catch(() => 0),
  ]);
  const sys = systemMetrics();
  const health = checkHealth(JOBS_DIR, budgetNow().ok);
  const now = Date.now();
  const m24 = jobMetrics(jobs, now - 24 * 3600_000);
  const mAll = jobMetrics(jobs);
  const pct = (r: number | null) => (r === null ? "n/a" : `${Math.round(r * 100)}%`);
  const recentJobs = jobs.slice(0, 50).map(jobTiming);

  return (
    <>
      <Nav />
      <main className="page adm">
        <div className="wrap">
          <h1>Admin</h1>
          <p className="muted">Signed in as {gate.user.email}</p>
          {live.dbOff && (
            <p className="note" role="status">
              The sign-in database (D1) is not answering, so accounts and usage are unavailable. Spend, jobs, errors and health below still
              work.
            </p>
          )}

          <Live initial={live} />

          <section aria-label="Jobs">
            <h2>Jobs</h2>
            <div className="stats">
              <div>
                <span>Running / waiting now</span>
                <b>
                  {mAll.running} / {mAll.queued}
                </b>
              </div>
              <div>
                <span>Last 24 h</span>
                <b>
                  {m24.done} done · {m24.failed} failed{m24.cancelled ? ` · ${m24.cancelled} cancelled` : ""}
                </b>
                <em className="plain">success {pct(m24.successRate)}</em>
              </div>
              <div>
                <span>Render time (median · p90)</span>
                <b>
                  {formatMs(mAll.medianRenderMs)} · {formatMs(mAll.p90RenderMs)}
                </b>
              </div>
              <div>
                <span>Wait for a slot (median)</span>
                <b>{formatMs(mAll.medianWaitMs)}</b>
              </div>
              <div>
                <span>Request to video (median)</span>
                <b>{formatMs(mAll.medianTotalMs)}</b>
              </div>
              <div>
                <span>Cost per video (avg)</span>
                <b>{mAll.avgCostDone === null ? "n/a" : money(mAll.avgCostDone)}</b>
              </div>
            </div>
            <p className="muted small">
              All {mAll.total} jobs on this server: {mAll.done} done, {mAll.failed} failed, {mAll.cancelled} cancelled, success{" "}
              {pct(mAll.successRate)}.
            </p>
            {recentJobs.length === 0 ? (
              <p className="muted">No jobs yet.</p>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Job</th>
                      <th scope="col">Status</th>
                      <th scope="col">Waited</th>
                      <th scope="col">Render wait</th>
                      <th scope="col">Render</th>
                      <th scope="col">Total</th>
                      <th scope="col">Video</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((t) => (
                      <tr key={t.id}>
                        <td className="nowrap">
                          <a href={`/?job=${t.id}`}>{t.id}</a>
                          <div className="muted sub">
                            {t.kind} · {when(new Date(t.started).toISOString())}
                          </div>
                        </td>
                        <td>
                          <span className={`pill ${t.state}`}>{t.state}</span>
                          {t.error && <div className="muted small prompt">{t.error}</div>}
                        </td>
                        <td className="nowrap">{formatMs(t.waitMs)}</td>
                        <td className="nowrap">{formatMs(t.renderWaitMs)}</td>
                        <td className="nowrap">{formatMs(t.renderMs)}</td>
                        <td className="nowrap">{formatMs(t.totalMs)}</td>
                        <td className="nowrap">{t.videoSec === null ? "n/a" : `${Math.round(t.videoSec)}s`}</td>
                        <td className="nowrap">{money(t.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Users" id="users">
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
                      <th scope="col">Wait</th>
                      <th scope="col">Total</th>
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
                        <td className="nowrap">{formatMs(v.waitMs)}</td>
                        <td className="nowrap">{formatMs(v.totalMs)}</td>
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
                        <td className="nowrap">{e.requestId || "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="System">
            <h2>System</h2>
            <div className="stats">
              <div>
                <span>Load (1 / 5 / 15 min)</span>
                <b>
                  {sys.loadavg.map((n) => n.toFixed(2)).join(" / ")} on {sys.cpus} cores
                </b>
              </div>
              <div>
                <span>Server memory free</span>
                <b>
                  {(sys.freemem / 1024 ** 3).toFixed(1)} GB of {(sys.totalmem / 1024 ** 3).toFixed(1)} GB
                </b>
              </div>
              <div>
                <span>App memory (RSS)</span>
                <b>{(sys.process.rss / 1024 ** 2).toFixed(0)} MB</b>
              </div>
              <div>
                <span>App heap</span>
                <b>
                  {(sys.process.heapUsed / 1024 ** 2).toFixed(0)} MB of {(sys.process.heapTotal / 1024 ** 2).toFixed(0)} MB
                </b>
              </div>
            </div>
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
