import Link from "next/link";
import { Check } from "../../../components/Icons";
import { requireAppUser } from "../../lib/appuser";
import { getD1Db } from "../../lib/db";
import { shortLink, sourceKind } from "../../lib/form";
import { listJobs } from "../../lib/jobs";
import { MCP_SNIPPETS } from "../../lib/mcp";
import { cap, stepsFor, stepStates } from "../../lib/steps";
import { ensureUsageTables, videosLeftToday } from "../../lib/usage";
import { ago, formatLabel, listVideosForUser, mss, when } from "../../lib/videos";
import VideoThumb from "./components/VideoThumb";
import VideoWorkspace from "./components/VideoWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — Explanimate" };

const CONNECT = MCP_SNIPPETS.find((s) => s.id === "claude-code");
const TOOLS = ["claude-code", "cursor", "codex", "muse-code"]
  .map((id) => MCP_SNIPPETS.find((s) => s.id === id))
  .filter((s) => s !== undefined);

/** The dashboard home: create, today's quota, the running job, the coding-tool hook and recent videos. */
export default async function OverviewPage() {
  const user = await requireAppUser();
  const db = getD1Db();
  await ensureUsageTables(db);
  const jobs = listJobs();
  const [quota, videos] = await Promise.all([videosLeftToday(user.id), listVideosForUser(user.id, jobs, db)]);
  const active = jobs
    .filter((j) => j.owner === `u:${user.id}` && (j.state === "queued" || j.state === "running"))
    .sort((a, b) => b.started - a.started)[0];
  const steps = active ? stepsFor(active) : [];
  const states = active ? stepStates(steps, active.stage, active.state) : [];
  const segs = Math.min(Math.max(quota.limit, 1), 12);
  const filled = Math.round((quota.left / Math.max(quota.limit, 1)) * segs);

  return (
    <>
      <h1 className="app-h1">Overview</h1>

      <div className="app-grid c2">
        <div className="app-c">
          <div className="app-chead">
            <span>New video</span>
            <Link href="/app/new">Open full editor →</Link>
          </div>
          <VideoWorkspace />
          <p className="app-hint">Short is a quick overview. Deep goes further. Anatomy breaks one part down.</p>
        </div>
        <div className="app-c">
          <div className="app-chead">
            <span>Videos left today</span>
            <Link href="/app/usage">Usage →</Link>
          </div>
          <div className="app-count">
            {quota.left}
            <small> / {quota.limit}</small>
          </div>
          <div className="app-segs" aria-hidden="true">
            {Array.from({ length: segs }, (_, i) => (
              <i key={i} className={i < filled ? "f" : ""} />
            ))}
          </div>
          <p className="app-note">Resets at 00:00 UTC. Browsing the gallery is always free.</p>
        </div>
      </div>

      <div className="app-grid c2e">
        <div className="app-c">
          <div className="app-chead">
            <span>In progress</span>
            {active && <Link href={`/app/videos/${active.id}`}>View job →</Link>}
          </div>
          {active ? (
            <>
              <div className="app-jobline">
                <span className="mono">{shortLink(active.input)}</span>
                <span className="app-fmt">
                  {formatLabel(active.ask?.format)} · {active.voice === "silent" ? "Voice off" : "Voice on"}
                </span>
                <span className="ago">started {ago(active.started)}</span>
              </div>
              <ol className="steps" aria-label="Steps">
                {steps.map((s, i) => (
                  <li key={s.stage} className={states[i]}>
                    <span className="d" aria-hidden="true">
                      {states[i] === "ok" && <Check />}
                    </span>
                    {cap(states[i] === "now" && active.message && active.message !== "starting" ? active.message : s.label)}
                  </li>
                ))}
              </ol>
              <div
                className="track"
                role="progressbar"
                aria-label="Video progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(active.pct)}
              >
                <i style={{ width: `${Math.max(2, active.pct)}%` }} />
              </div>
            </>
          ) : (
            <div className="app-empty">
              <p>Nothing drawing right now. Start a video and watch it read, plan, voice, draw and check.</p>
              <Link className="btn solid" href="/app/new">
                + New video
              </Link>
            </div>
          )}
        </div>
        <div className="app-c">
          <div className="app-chead">
            <span>Connect your coding tool</span>
            <Link href="/app/connect">Setup guide →</Link>
          </div>
          <p className="app-note" style={{ marginBottom: 14 }}>
            Type /explanimate in your editor and get the video plus both boards back in the chat.
          </p>
          {CONNECT && <pre className="app-code">{CONNECT.body}</pre>}
          <div className="app-pills">
            {TOOLS.map((t) => (
              <Link key={t.id} href={`/app/connect#${t.id}`}>
                {t.tool}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="app-grid">
        <div className="app-c">
          <div className="app-chead">
            <span>Recent videos</span>
            {videos.length > 0 && <Link href="/app/videos">View all →</Link>}
          </div>
          {videos.length === 0 ? (
            <div className="app-empty">
              <p>You haven&apos;t made a video yet. Paste a repo, an article, an X post or just a topic.</p>
              <Link className="btn solid" href="/app/new">
                + New video
              </Link>
            </div>
          ) : (
            <div className="app-recent">
              {videos.slice(0, 4).map((v) => (
                <div className="app-vid" key={v.id}>
                  <VideoThumb video={v} link={`/app/videos/${v.id}`} />
                  <p className="app-vt">{v.title}</p>
                  <p className="app-vm">
                    {[mss(v.durationSec), formatLabel(v.format), when(v.createdAt)].filter(Boolean).join(" · ")}
                    {" · "}
                    {cap(sourceKind(v.input))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
