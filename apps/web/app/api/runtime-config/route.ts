import { NextResponse } from "next/server";
import { gaMeasurementId } from "../../../lib/security";
import { limitRequest } from "../../../lib/guard";
import { withErrors } from "../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public settings the browser needs at runtime (the same pattern as the Turnstile site key):
 * the GA4 measurement id, or null when the deploy sets none. Never any secrets.
 */
export const GET = withErrors("runtime-config.GET", async (req: Request) => {
  const limited = limitRequest(req, "runtime-config");
  if (limited) return limited;
  return NextResponse.json({ gaMeasurementId: gaMeasurementId() ?? null });
});
