import { NextResponse } from "next/server";
import { JOBS_DIR, budgetNow } from "../../../lib/jobs";
import { checkHealth, type Health } from "../../../lib/health";
import { countErrorsSince } from "../../../lib/errors";
import { withErrors } from "../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// probing ffmpeg and the disk on every poll is wasteful; a 15 s old answer is fine for a health check
let last: { at: number; h: Health } | undefined;

export const GET = withErrors("health.GET", async () => {
  if (!last || Date.now() - last.at > 15_000) last = { at: Date.now(), h: checkHealth(JOBS_DIR, budgetNow().ok) };
  // a public count only; the errors themselves stay in the admin portal
  const errors24h = await countErrorsSince(Date.now() - 24 * 3600_000);
  return NextResponse.json({ ...last.h, errors24h }, { status: last.h.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
});
