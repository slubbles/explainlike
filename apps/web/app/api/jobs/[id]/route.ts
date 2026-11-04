import { NextResponse } from "next/server";
import { getJob, touch } from "../../../../lib/jobs";
import { NO_STORE, publicJob } from "../../../../lib/view";
import { viewerKey } from "../../../../lib/owner";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";

export const GET = withErrors("job.GET", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  // the page polls every second: that keeps a waiting job's place, and a job nobody polls is dropped before it starts
  touch(id);
  return NextResponse.json(publicJob(job, await viewerKey(req)), { headers: NO_STORE });
});
