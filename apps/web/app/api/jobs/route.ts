import { NextResponse } from "next/server";
import { admit, budgetNow, listJobs, startJob, validInput } from "../../../lib/jobs";
import { asSeen } from "../../../lib/steps";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../lib/auth";
import { MAX_INPUT_CHARS, clientIp, limitRequest, readBody } from "../../../lib/guard";
import { claimVideoSlot, recordVideo } from "../../../lib/usage";
import { withErrors } from "../../../lib/route";
import { checkOrigin } from "../../../lib/security";

export const runtime = "nodejs";

export const GET = withErrors("jobs.GET", async () => {
  return NextResponse.json(
    listJobs()
      .slice(0, 40)
      .map(asSeen)
      .map(({ id, kind, input, approach, voice, state, title, parent, focus, whatIf, costUsd, started, durationSec, outputs }) => ({
        id,
        kind,
        input,
        approach,
        voice,
        state,
        title,
        parent,
        focus,
        whatIf,
        costUsd,
        started,
        durationSec,
        mp4: outputs?.mp4,
      })),
  );
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
  const input = typeof read.body.input === "string" ? read.body.input.trim() : "";
  if (input.length > MAX_INPUT_CHARS)
    return NextResponse.json({ error: "That link is too long. Paste just the repo, post or article URL." }, { status: 400 });
  if (!validInput(input))
    return NextResponse.json({ error: "Paste a GitHub repo, X post or article URL, or name a topic in a few words." }, { status: 400 });
  const no = admit(clientIp(req));
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  if (userId) {
    const claim = await claimVideoSlot(userId).catch(() => null);
    if (!claim) return NextResponse.json({ error: "Could not check your video limit. Try again in a moment." }, { status: 500 });
    if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });
  }
  const job = startJob(input, read.body.voice === "silent" ? "silent" : "deepgram");
  if (userId) await recordVideo(job.id, userId, input);
  return NextResponse.json({ id: job.id, warnings: budgetNow().warnings });
});
