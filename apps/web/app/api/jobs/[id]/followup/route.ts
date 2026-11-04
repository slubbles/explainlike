import { NextResponse } from "next/server";
import { admit, startFollowUp } from "../../../../../lib/jobs";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../../../lib/auth";
import { clientIp, field, limitRequest, readBody } from "../../../../../lib/guard";
import { claimVideoSlot, recordVideo, releaseVideoSlot } from "../../../../../lib/usage";
import { claimOwner } from "../../../../../lib/owner";
import { withErrors } from "../../../../../lib/route";
import { checkOrigin } from "../../../../../lib/security";

export const runtime = "nodejs";

export const POST = withErrors("followup.POST", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{12}$/.test(id)) return NextResponse.json({ error: "the original video is not ready" }, { status: 400 });
  const limited = limitRequest(req, "followup");
  if (limited) return limited;
  let userId: string | undefined;
  if (authEnabled()) {
    const u = await sessionUser(req);
    if (!u) return NextResponse.json({ error: SIGNIN_ERROR }, { status: 401 });
    userId = u.id;
  }
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const no = admit(clientIp(req));
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const focus = field(read.body.focus, 60);
  const whatIf = field(read.body.whatIf, 8);
  // the same shape checks startFollowUp applies, so a bad request never claims a slot
  if (focus && !/^[a-z0-9-]{1,60}$/.test(focus)) return NextResponse.json({ error: "bad component id" }, { status: 400 });
  if (whatIf && whatIf !== "10x" && whatIf !== "100x") return NextResponse.json({ error: "what-if takes 10x or 100x" }, { status: 400 });
  if (userId) {
    const claim = await claimVideoSlot(userId).catch(() => null);
    if (!claim) return NextResponse.json({ error: "Could not check your video limit. Try again in a moment." }, { status: 500 });
    if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });
  }
  const owner = await claimOwner(req, userId);
  const r = startFollowUp(id, { focus, whatIf }, owner.key);
  if (typeof r === "string") {
    if (userId) await releaseVideoSlot(userId).catch(() => {});
    return NextResponse.json({ error: r }, { status: 400 });
  }
  if (userId) await recordVideo(r.id, userId, r.input);
  const res = NextResponse.json({ id: r.id });
  if (owner.setCookie) res.headers.append("set-cookie", owner.setCookie);
  return res;
});
