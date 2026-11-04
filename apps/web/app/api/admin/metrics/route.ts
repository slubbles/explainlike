import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin";
import { limitRequest } from "../../../../lib/guard";
import { systemMetrics } from "../../../../lib/metrics";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server CPU and memory (load average, process memory, free memory) for tuning. Admins only (else 404). */
export const GET = withErrors("admin-metrics.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-metrics");
  if (limited) return limited;
  return NextResponse.json(systemMetrics());
});
