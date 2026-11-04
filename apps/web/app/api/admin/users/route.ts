import { NextResponse } from "next/server";
import { listAdminUsers, requireAdmin } from "../../../../lib/admin";
import { limitRequest } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every account: address, signup date, today's usage and daily limit. Admins only (else 404). */
export const GET = withErrors("admin-users.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-users");
  if (limited) return limited;
  return NextResponse.json({ users: await listAdminUsers() });
});
