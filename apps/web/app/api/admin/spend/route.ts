import { NextResponse } from "next/server";
import { requireAdmin, spendSummary } from "../../../../lib/admin";
import { limitRequest } from "../../../../lib/guard";
import { JOBS_DIR, listJobs } from "../../../../lib/jobs";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's spend under the daily cap, and lifetime spend under the service caps. Admins only (else 404). */
export const GET = withErrors("admin-spend.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-spend");
  if (limited) return limited;
  return NextResponse.json({ spend: spendSummary(listJobs(), JOBS_DIR) });
});
