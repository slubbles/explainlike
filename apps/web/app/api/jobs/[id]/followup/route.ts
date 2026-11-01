import { NextResponse } from "next/server";
import { admit, startFollowUp } from "../../../../../lib/jobs";
import { clientIp, field, limitRequest, readBody } from "../../../../../lib/guard";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limited = limitRequest(req, "followup");
  if (limited) return limited;
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const no = admit(clientIp(req));
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const r = startFollowUp(id, { focus: field(read.body.focus, 60), whatIf: field(read.body.whatIf, 8) });
  if (typeof r === "string") return NextResponse.json({ error: r }, { status: 400 });
  return NextResponse.json({ id: r.id });
}
