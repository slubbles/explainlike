import { NextResponse } from "next/server";
import { authEnabled, githubEnabled, googleEnabled, sessionUser } from "../../../lib/auth";
import { defaultDailyVideos, videosLeftToday } from "../../../lib/usage";
import { limitRequest } from "../../../lib/guard";
import { withErrors } from "../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the client needs to know: whether sign-in is on, the (public) Turnstile site key,
 * whether Google and GitHub sign-in are offered, who is signed in, and their videos left today.
 * Never any secrets.
 */
export const GET = withErrors("auth-config.GET", async (req: Request) => {
  const limited = limitRequest(req, "auth-config");
  if (limited) return limited;
  if (!authEnabled()) return NextResponse.json({ enabled: false, google: false, github: false });
  const siteKey = process.env.EXPLANIMATE_TURNSTILE_SITE_KEY ?? "";
  const google = googleEnabled(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  const github = githubEnabled(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET);
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ enabled: true, turnstileSiteKey: siteKey, user: null, videos: null, google, github });
  const videos = await videosLeftToday(user.id, Date.now(), undefined, user.email).catch(() => null);
  return NextResponse.json({
    enabled: true,
    turnstileSiteKey: siteKey,
    user: { email: user.email },
    videos: videos ?? { used: 0, limit: defaultDailyVideos(), left: defaultDailyVideos() },
    google,
    github,
  });
});
