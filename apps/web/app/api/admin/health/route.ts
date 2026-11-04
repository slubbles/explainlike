import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin";
import { countErrorsSince } from "../../../../lib/errors";
import { limitRequest } from "../../../../lib/guard";
import { checkHealth } from "../../../../lib/health";
import { JOBS_DIR, budgetNow } from "../../../../lib/jobs";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The same data as /api/health, plus the 24 h error count. Admins only (else 404). */
export const GET = withErrors("admin-health.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-health");
  if (limited) return limited;
  const errors24h = await countErrorsSince(Date.now() - 24 * 3600_000);
  return NextResponse.json({ ...checkHealth(JOBS_DIR, budgetNow().ok), errors24h });
});
