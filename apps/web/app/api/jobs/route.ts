import { NextResponse } from "next/server";
import { admit, listJobs, startJob, validInput } from "../../../lib/jobs";

export const runtime = "nodejs";

const client = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export async function GET() {
  return NextResponse.json(listJobs().slice(0, 20).map(({ id, kind, input, level, state, title, parent, focus, whatIf, costUsd, started }) => ({ id, kind, input, level, state, title, parent, focus, whatIf, costUsd, started })));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const input = String(body.input ?? "").trim();
  if (!validInput(input)) return NextResponse.json({ error: "Paste a GitHub repo, X post or article URL." }, { status: 400 });
  const no = admit(client(req));
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const job = startJob(input, String(body.level ?? "new"), String(body.voice ?? "deepgram"));
  return NextResponse.json({ id: job.id });
}
