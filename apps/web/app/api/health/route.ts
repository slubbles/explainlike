import { NextResponse } from "next/server";
import { JOBS_DIR, budgetNow } from "../../../lib/jobs";
import { checkHealth } from "../../../lib/health";
import { limitRequest } from "../../../lib/guard";
import { withErrors } from "../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// probing ffmpeg and the disk on every poll is wasteful; a 15 s old answer is fine for a health check
let last: { at: number; ok: boolean } | undefined;

export const GET = withErrors("health.GET", async (req: Request) => {
  const limited = limitRequest(req, "health");
  if (limited) return limited;
  if (!last || Date.now() - last.at > 15_000) last = { at: Date.now(), ok: checkHealth(JOBS_DIR, budgetNow().ok).ok };
  // public load-balancer shape only; the checks, problems and error counts live behind /api/admin/health
  return NextResponse.json({ ok: last.ok }, { status: last.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
});
