import { NextResponse } from "next/server";
import { listAdminVideos, requireAdmin } from "../../../../lib/admin";
import { limitRequest } from "../../../../lib/guard";
import { listJobs } from "../../../../lib/jobs";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The newest videos with owner, status and cost. Admins only (else 404). */
export const GET = withErrors("admin-videos.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-videos");
  if (limited) return limited;
  return NextResponse.json({ videos: await listAdminVideos(listJobs()) });
});
