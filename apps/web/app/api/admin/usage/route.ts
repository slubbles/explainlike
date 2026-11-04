import { NextResponse } from "next/server";
import { requireAdmin, usagePerDay } from "../../../../lib/admin";
import { limitRequest } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Videos started per UTC day, newest first. Admins only (else 404). */
export const GET = withErrors("admin-usage.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-usage");
  if (limited) return limited;
  return NextResponse.json({ days: await usagePerDay() });
});
