import { NextResponse } from "next/server";
import { admit, budgetNow, listJobs, startJob, validInput } from "../../../lib/jobs";
import { NO_STORE, listFor } from "../../../lib/view";
import { claimOwner, viewerKey } from "../../../lib/owner";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../lib/auth";
import { MAX_INPUT_CHARS, clientIp, field, limitRequest, readBody } from "../../../lib/guard";
import { claimVideoSlot, recordVideo } from "../../../lib/usage";
import { inputHint, normalizeInput } from "../../../lib/form";
import { withErrors } from "../../../lib/route";
import { checkOrigin } from "../../../lib/security";

export const runtime = "nodejs";

/** Only the viewer's own jobs, or the clips of a video whose id they hold (?parent=<id>); never anyone else's submissions. */
export const GET = withErrors("jobs.GET", async (req: Request) => {
  const limited = limitRequest(req, "jobs-list");
  if (limited) return limited;
  const parent = new URL(req.url).searchParams.get("parent");
  const viewer = parent ? undefined : await viewerKey(req);
  return NextResponse.json(listFor(listJobs(), viewer, parent), { headers: NO_STORE });
});

export const POST = withErrors("jobs.POST", async (req: Request) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const limited = limitRequest(req, "jobs");
  if (limited) return limited;
  let userId: string | undefined;
  if (authEnabled()) {
    const u = await sessionUser(req);
    if (!u) return NextResponse.json({ error: SIGNIN_ERROR }, { status: 401 });
    userId = u.id;
  }
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const input = typeof read.body.input === "string" ? normalizeInput(read.body.input) : "";
  if (input.length > MAX_INPUT_CHARS)
    return NextResponse.json({ error: "That link is too long. Paste just the repo, post or article URL." }, { status: 400 });
  const over = inputHint(input).over;
  if (over) return NextResponse.json({ error: over }, { status: 400 });
  if (!validInput(input))
    return NextResponse.json({ error: "Paste a GitHub repo, X post or article URL, or name a topic in a few words." }, { status: 400 });
  const format = field(read.body.format, 20);
  if (format !== undefined && format !== "short" && format !== "deep" && format !== "anatomy")
    return NextResponse.json({ error: "Format is short, deep or anatomy." }, { status: 400 });
  const no = admit(clientIp(req));
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  if (userId) {
    const claim = await claimVideoSlot(userId).catch(() => null);
    if (!claim) return NextResponse.json({ error: "Could not check your video limit. Try again in a moment." }, { status: 500 });
    if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });
  }
  const owner = await claimOwner(req, userId);
  const job = startJob(input, read.body.voice === "silent" ? "silent" : "deepgram", format ? { format } : undefined, undefined, owner.key);
  if (userId) await recordVideo(job.id, userId, input);
  const res = NextResponse.json({ id: job.id, warnings: budgetNow().warnings }, { headers: NO_STORE });
  if (owner.setCookie) res.headers.append("set-cookie", owner.setCookie);
  return res;
});
