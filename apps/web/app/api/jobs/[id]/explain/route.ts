import { NextResponse } from "next/server";
import { budgetNow, explain } from "../../../../../lib/jobs";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../../../lib/auth";
import { field, limitRequest, readBody } from "../../../../../lib/guard";
import { withErrors } from "../../../../../lib/route";
import { checkOrigin } from "../../../../../lib/security";

export const runtime = "nodejs";

export const POST = withErrors("explain.POST", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const { id } = await ctx.params;
  if (process.env.EXPLANIMATE_DEMO_ONLY === "1") return NextResponse.json({ error: "explanations are off in demo mode" }, { status: 429 });
  const limited = limitRequest(req, "explain");
  if (limited) return limited;
  if (authEnabled() && !(await sessionUser(req))) return NextResponse.json({ error: SIGNIN_ERROR }, { status: 401 });
  const b = budgetNow();
  if (!b.ok) return NextResponse.json({ error: b.error }, { status: 429 });
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const r = (await explain(id, field(read.body.component, 60) ?? "")) as { type?: string; message?: string };
  if (r.type !== "explain") return NextResponse.json({ error: r.message ?? "failed" }, { status: 400 });
  return NextResponse.json(r);
});
