import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppUser } from "../../../lib/appuser";
import { googleEnabled } from "../../../lib/auth";
import { getD1Db } from "../../../lib/db";
import { ensureUsageTables, videosLeftToday } from "../../../lib/usage";
import VideoWorkspace from "../../components/VideoWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Video — Explanimate" };

/** One video: progress while it draws, then the player, follow-ups and downloads. Anyone signed in with the link may watch, like the shared landing link; only the owner may delete. The layout already gated the visit; the quota and the sign-in panel's public settings travel as props, so nothing fetches. */
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{12}$/.test(id)) notFound();
  const user = await requireAppUser();
  const db = getD1Db();
  await ensureUsageTables(db);
  const quota = await videosLeftToday(user.id);
  return (
    <>
      <Link className="app-back" href="/app/videos">
        ← My videos
      </Link>
      <VideoWorkspace
        jobId={id}
        initial={{
          quota,
          siteKey: process.env.EXPLANIMATE_TURNSTILE_SITE_KEY ?? "",
          google: googleEnabled(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
        }}
      />
    </>
  );
}
