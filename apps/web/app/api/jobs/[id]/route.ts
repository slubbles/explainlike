import { NextResponse } from "next/server";
import { getJob, touch } from "../../../../lib/jobs";
import { asSeen } from "../../../../lib/steps";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";

export const GET = withErrors("job.GET", async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  // the page polls every second: that keeps a waiting job's place, and a job nobody polls is dropped before it starts
  touch(id);
  return NextResponse.json(asSeen(job));
});
