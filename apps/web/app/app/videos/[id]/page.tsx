import Link from "next/link";
import { notFound } from "next/navigation";
import VideoWorkspace from "../../components/VideoWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Video — Explanimate" };

/** One video: progress while it draws, then the player, follow-ups and downloads. Anyone signed in with the link may watch, like the shared landing link; only the owner may delete. The layout already gated the visit. */
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{12}$/.test(id)) notFound();
  return (
    <>
      <Link className="app-back" href="/app/videos">
        ← My videos
      </Link>
      <VideoWorkspace jobId={id} />
    </>
  );
}
