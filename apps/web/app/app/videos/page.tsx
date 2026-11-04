import Link from "next/link";
import { requireAppUser } from "../../lib/appuser";
import { getD1Db } from "../../lib/db";
import { sourceKind } from "../../lib/form";
import { jobFile, listJobs } from "../../lib/jobs";
import { cap } from "../../lib/steps";
import { ensureUsageTables } from "../../lib/usage";
import { formatLabel, listVideosForUser, mss, when, type UserVideo } from "../../lib/videos";
import DeleteVideoButton from "../components/DeleteVideoButton";
import VideoThumb from "../components/VideoThumb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "My videos — Explanimate" };

const FORMATS = [
  { id: "", label: "All" },
  { id: "short", label: "Short" },
  { id: "deep", label: "Deep" },
  { id: "anatomy", label: "Anatomy" },
] as const;

/** A download link for a finished file, only when it is still on disk. */
function Download({ video, name, label, mono }: { video: UserVideo; name?: string; label: string; mono?: boolean }) {
  if (!name || !jobFile(video.id, name)) return null;
  return (
    <a className={`app-abtn${mono ? " mono" : ""}`} href={`/api/jobs/${video.id}/file/${name}?download`}>
      {label}
    </a>
  );
}

/** The account's videos as a table or a grid, searchable and filterable by format. */
export default async function VideosPage({ searchParams }: { searchParams: Promise<{ q?: string; format?: string; view?: string }> }) {
  const user = await requireAppUser();
  const { q, format, view } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 120) : "";
  const only = format === "short" || format === "deep" || format === "anatomy" ? format : "";
  const grid = view === "grid";
  const db = getD1Db();
  await ensureUsageTables(db);
  const all = await listVideosForUser(user.id, listJobs(), db);
  const needle = query.toLowerCase();
  const videos = all.filter(
    (v) => (!only || v.format === only) && (!needle || v.title.toLowerCase().includes(needle) || v.input.toLowerCase().includes(needle)),
  );
  const href = (over: { q?: string; format?: string; view?: string }) => {
    const p = new URLSearchParams();
    const nq = over.q ?? query;
    const nf = over.format ?? only;
    const nv = over.view ?? (grid ? "grid" : "list");
    if (nq) p.set("q", nq);
    if (nf) p.set("format", nf);
    if (nv === "grid") p.set("view", "grid");
    const s = p.toString();
    return `/app/videos${s ? `?${s}` : ""}`;
  };
  const filtered = query !== "" || only !== "";

  return (
    <>
      <div className="app-thead">
        <h1 className="app-h1">My videos</h1>
        <div className="app-tools">
          <div className="app-seg" role="group" aria-label="Filter by format">
            {FORMATS.map((f) => (
              <Link
                key={f.id}
                className={only === f.id ? "on" : ""}
                href={href({ format: f.id })}
                aria-current={only === f.id ? "true" : undefined}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="app-seg" role="group" aria-label="Layout">
            <Link href={href({ view: "grid" })} className={grid ? "on" : ""} aria-label="Grid" aria-current={grid ? "true" : undefined}>
              ▦
            </Link>
            <Link href={href({ view: "list" })} className={!grid ? "on" : ""} aria-label="List" aria-current={!grid ? "true" : undefined}>
              ☰
            </Link>
          </div>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="app-grid">
          <div className="app-c">
            <div className="app-empty">
              <p>You haven&apos;t made a video yet. Paste a repo, an article, an X post or just a topic.</p>
              <Link className="btn solid" href="/app/new">
                + New video
              </Link>
            </div>
          </div>
        </div>
      ) : videos.length === 0 ? (
        <div className="app-grid">
          <div className="app-c">
            <div className="app-empty">
              <p>
                No videos match <span className="app-query">“{query || formatLabel(only)}”</span>.
              </p>
              <Link className="btn" href="/app/videos">
                Clear the search
              </Link>
            </div>
          </div>
        </div>
      ) : grid ? (
        <>
          <div className="app-recent">
            {videos.map((v) => (
              <div className="app-vid" key={v.id}>
                <VideoThumb video={v} link={`/app/videos/${v.id}`} />
                <p className="app-vt">{v.title}</p>
                <p className="app-vm">{[mss(v.durationSec), formatLabel(v.format), when(v.createdAt)].filter(Boolean).join(" · ")}</p>
                <div className="app-vdel">
                  <DeleteVideoButton id={v.id} title={v.title} />
                </div>
              </div>
            ))}
          </div>
          <p className="app-foot">
            {videos.length} {videos.length === 1 ? "video" : "videos"} · Follow-ups on a box open from the video page.
          </p>
        </>
      ) : (
        <>
          <div className="app-tscroll">
            <table className="app-table">
              <thead>
                <tr>
                  <th scope="col">Video</th>
                  <th scope="col">Length</th>
                  <th scope="col">Format</th>
                  <th scope="col">Made</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="app-vcell">
                        <VideoThumb video={v} />
                        <div>
                          <div className="t">
                            <Link href={`/app/videos/${v.id}`}>{v.title}</Link>
                          </div>
                          <div className="k">{cap(sourceKind(v.input))}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{mss(v.durationSec) ?? "—"}</td>
                    <td>
                      <span className="app-fmt">{formatLabel(v.format)}</span>
                    </td>
                    <td className="made">{when(v.createdAt)}</td>
                    <td>
                      <div className="app-acts">
                        <Link className="app-abtn" href={`/app/videos/${v.id}`}>
                          Open
                        </Link>
                        <Download video={v} name={v.files.tldr} label=".tldr" mono />
                        <Download video={v} name={v.files.excalidraw} label=".excalidraw" mono />
                        <Link className="app-abtn" href={`/app/videos/${v.id}`}>
                          Follow-up
                        </Link>
                        <DeleteVideoButton id={v.id} title={v.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="app-foot">
            {filtered ? (
              <>
                {videos.length} of {all.length} shown ·{" "}
              </>
            ) : (
              <>
                {all.length} {all.length === 1 ? "video" : "videos"} ·{" "}
              </>
            )}
            Follow-ups on a box open from the video page.
          </p>
        </>
      )}
    </>
  );
}
