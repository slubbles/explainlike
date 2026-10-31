import { NextResponse } from "next/server";
import { admit, startFollowUp } from "../../../../../lib/jobs";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const no = admit(req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local");
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const r = startFollowUp(id, { focus: body.focus ? String(body.focus) : undefined, whatIf: body.whatIf ? String(body.whatIf) : undefined });
  if (typeof r === "string") return NextResponse.json({ error: r }, { status: 400 });
  return NextResponse.json({ id: r.id });
}
