import { NextResponse } from "next/server";
import { startJob, validInput } from "../../../lib/jobs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const input = String(body.input ?? "").trim();
  if (!validInput(input)) return NextResponse.json({ error: "Paste a GitHub repo, X post or article URL." }, { status: 400 });
  const job = startJob(input, String(body.level ?? "new"), String(body.voice ?? "deepgram"));
  return NextResponse.json({ id: job.id });
}
