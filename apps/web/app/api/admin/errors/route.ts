import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin";
import { listRecentErrors } from "../../../../lib/errors";
import { limitRequest } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The newest errors, newest first. Admins only (else 404). */
export const GET = withErrors("admin-errors.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-errors");
  if (limited) return limited;
  return NextResponse.json({ errors: await listRecentErrors() });
});
