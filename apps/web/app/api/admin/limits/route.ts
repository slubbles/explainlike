import { NextResponse } from "next/server";
import { parseLimitEdit, requireAdmin, setUserLimit } from "../../../../lib/admin";
import { limitRequest, readBody } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";
import { checkOrigin } from "../../../../lib/security";

export const runtime = "nodejs";


/** Signed-out and non-admin callers get 404, same as the other admin GETs (never 405). */
export const GET = withErrors("admin-limits.GET", async (req: Request) => {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ error: "Not found." }, { status: 404 });
});


/** Set one account's daily video limit: { email, limit } with limit a whole number, 0 to 1000. */
export const POST = withErrors("admin-limits.POST", async (req: Request) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const limited = limitRequest(req, "admin-limits");
  if (limited) return limited;
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const edit = parseLimitEdit(read.body);
  if (!edit.ok) return NextResponse.json({ error: edit.error }, { status: 400 });
  const saved = await setUserLimit(edit.email, edit.limit);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 404 });
  return NextResponse.json(saved);
});
