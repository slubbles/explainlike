import { NextResponse } from "next/server";
import { JOBS_DIR, budgetNow } from "../../../lib/jobs";
import { checkHealth, type Health } from "../../../lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// probing ffmpeg and the disk on every poll is wasteful; a 15 s old answer is fine for a health check
let last: { at: number; h: Health } | undefined;

export function GET() {
  if (!last || Date.now() - last.at > 15_000) last = { at: Date.now(), h: checkHealth(JOBS_DIR, budgetNow().ok) };
  return NextResponse.json(last.h, { status: last.h.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
