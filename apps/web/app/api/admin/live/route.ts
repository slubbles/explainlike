import { NextResponse } from "next/server";
import { getAdminLive, requireAdmin } from "../../../../lib/admin";
import { JOBS_DIR, listJobs, queueOrder } from "../../../../lib/jobs";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the dashboard refreshes: the queue and active jobs, recent signups, videos per day,
 * failures, spend, fallback usage and timings. Admins only (else 404). No per-IP rate limit: the
 * dashboard polls this every few seconds, and it starts no work (the gate runs first, as always).
 */
export const GET = withErrors("admin-live.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json(await getAdminLive({ jobs: listJobs(), queue: queueOrder(), jobsDir: JOBS_DIR }));
});
