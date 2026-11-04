import { NextResponse } from "next/server";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../lib/auth";
import { getD1Db } from "../../../lib/db";
import { limitRequest } from "../../../lib/guard";
import { removeJob } from "../../../lib/jobs";
import { ensureUsageTables } from "../../../lib/usage";
import { NO_STORE } from "../../../lib/view";
import { deleteUserAccount } from "../../../lib/videos";
import { withErrors } from "../../../lib/route";
import { checkOrigin } from "../../../lib/security";

export const runtime = "nodejs";

/**
 * Delete the signed-in account and everything it made (lib/videos.ts). The session row goes
 * with it, so the settings page signs out on the way back to the landing page.
 */
export const DELETE = withErrors("me-account.DELETE", async (req: Request) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const limited = limitRequest(req, "me-account-delete");
  if (limited) return limited;
  if (!authEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: SIGNIN_ERROR }, { status: 401, headers: NO_STORE });
  const db = getD1Db();
  await ensureUsageTables(db);
  const r = await deleteUserAccount(user.id, db, removeJob);
  return NextResponse.json({ ok: true, videos: r.videos }, { headers: NO_STORE });
});
