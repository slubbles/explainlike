import { NextResponse } from "next/server";
import { admit, budgetNow, listJobs, startJob, validInput } from "../../../lib/jobs";
import { asSeen } from "../../../lib/steps";
import { MAX_INPUT_CHARS, clientIp, limitRequest, readBody } from "../../../lib/guard";

export const runtime = "nodejs";

export async function GET() {
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
}

export async function POST(req: Request) {
  const limited = limitRequest(req, "jobs");
  if (limited) return limited;
  const read = await readBody(req);
  if ("error" in read) return read.error;
  const input = typeof read.body.input === "string" ? read.body.input.trim() : "";
  if (input.length > MAX_INPUT_CHARS)
    return NextResponse.json({ error: "That link is too long. Paste just the repo, post or article URL." }, { status: 400 });
  if (!validInput(input))
    return NextResponse.json({ error: "Paste a GitHub repo, X post or article URL, or name a topic in a few words." }, { status: 400 });
  const no = admit(clientIp(req));
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const job = startJob(input, read.body.voice === "silent" ? "silent" : "deepgram");
  return NextResponse.json({ id: job.id, warnings: budgetNow().warnings });
}
