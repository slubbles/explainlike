import { NextResponse } from "next/server";
import { cancelJob, getJob } from "../../../../../lib/jobs";
import { limitRequest } from "../../../../../lib/guard";
import { releaseVideoSlot } from "../../../../../lib/usage";
import { viewerKey } from "../../../../../lib/owner";
import { NO_STORE, publicJob } from "../../../../../lib/view";
import { withErrors } from "../../../../../lib/route";
import { checkOrigin } from "../../../../../lib/security";

export const runtime = "nodejs";

/** Stop a waiting or running video. Only its owner (account, or the browser that started it) may. */
export const POST = withErrors("cancel.POST", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const limited = limitRequest(req, "cancel");
  if (limited) return limited;
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const viewer = await viewerKey(req);
  if (!viewer || job.owner !== viewer)
    return NextResponse.json({ error: "Only the person who started this video can cancel it." }, { status: 403, headers: NO_STORE });
  const waited = job.state === "queued";
  if (!cancelJob(id)) return NextResponse.json({ error: "This video has already finished." }, { status: 409, headers: NO_STORE });
  // a video stopped before it started cost nothing, so it does not use up one of today's videos
  if (waited && viewer.startsWith("u:")) await releaseVideoSlot(viewer.slice(2)).catch(() => {});
  return NextResponse.json(publicJob(job, viewer), { headers: NO_STORE });
});
