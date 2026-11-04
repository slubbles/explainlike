import { requireAppUser } from "../../../lib/appuser";
import { githubEnabled, googleEnabled } from "../../../lib/auth";
import { getD1Db } from "../../../lib/db";
import { ensureUsageTables, videosLeftToday } from "../../../lib/usage";
import VideoWorkspace from "../components/VideoWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "New video · Explanimate" };

/** The full editor: the prompt box (?prompt= pre-fills it), then progress and the result. The layout already gated the visit; the quota and the sign-in panel's public settings travel as props, so nothing fetches. */
export default async function NewPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt } = await searchParams;
  const user = await requireAppUser();
  const db = getD1Db();
  await ensureUsageTables(db);
  const quota = await videosLeftToday(user.id);
  return (
    <>
      <h1 className="app-h1">New video</h1>
      <VideoWorkspace
        prompt={typeof prompt === "string" ? prompt.slice(0, 2048) : undefined}
        initial={{
          quota,
          siteKey: process.env.EXPLANIMATE_TURNSTILE_SITE_KEY ?? "",
          google: googleEnabled(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
          github: githubEnabled(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET),
        }}
      />
    </>
  );
}
