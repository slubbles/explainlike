import { NextResponse } from "next/server";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../../lib/auth";
import { getD1Db } from "../../../../lib/db";
import { limitRequest } from "../../../../lib/guard";
import { jobFile, listJobs } from "../../../../lib/jobs";
import { ensureUsageTables } from "../../../../lib/usage";
import { NO_STORE } from "../../../../lib/view";
import { listVideosForUser, type UserVideo } from "../../../../lib/videos";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";

const url = (id: string, name?: string) => (name && jobFile(id, name) ? `/api/jobs/${id}/file/${name}` : undefined);

/** File names become URLs, but only for files still on disk. */
function withUrls(v: UserVideo) {
  const urls: { poster?: string; mp4?: string; tldr?: string; excalidraw?: string; contactSheet?: string } = {};
  const poster = url(v.id, v.poster);
  const mp4 = url(v.id, v.files.mp4);
  const tldr = url(v.id, v.files.tldr);
  const excalidraw = url(v.id, v.files.excalidraw);
  const contactSheet = url(v.id, v.files.contactSheet);
  if (poster) urls.poster = poster;
  if (mp4) urls.mp4 = mp4;
  if (tldr) urls.tldr = tldr;
  if (excalidraw) urls.excalidraw = excalidraw;
  if (contactSheet) urls.contactSheet = contactSheet;
  return { ...v, urls };
}

/**
 * The signed-in account's videos, newest first: each row joined with its live job (lib/videos.ts).
 * 404 with auth off (there are no accounts then), 401 when signed out.
 */
export const GET = withErrors("me-videos.GET", async (req: Request) => {
  const limited = limitRequest(req, "me-videos");
  if (limited) return limited;
  if (!authEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: SIGNIN_ERROR }, { status: 401, headers: NO_STORE });
  const db = getD1Db();
  await ensureUsageTables(db);
  return NextResponse.json({ videos: (await listVideosForUser(user.id, listJobs(), db)).map(withUrls) }, { headers: NO_STORE });
});
