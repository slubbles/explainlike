import { NextResponse } from "next/server";
import { budgetNow, explain } from "../../../../../lib/jobs";
import { field, limitRequest, readBody } from "../../../../../lib/guard";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (process.env.EXPLAINLIKE_DEMO_ONLY === "1") return NextResponse.json({ error: "explanations are off in demo mode" }, { status: 429 });
  const limited = limitRequest(req, "explain");
  if (limited) return limited;
  const b = budgetNow();
  if (!b.ok) return NextResponse.json({ error: b.error }, { status: 429 });
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const r = (await explain(id, field(read.body.component, 60) ?? "")) as { type?: string; message?: string };
  if (r.type !== "explain") return NextResponse.json({ error: r.message ?? "failed" }, { status: 400 });
  return NextResponse.json(r);
}
