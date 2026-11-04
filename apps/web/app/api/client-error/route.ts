import { NextResponse } from "next/server";
import { limitRequest, readBody } from "../../../lib/guard";
import { buildErrorRow, recordError } from "../../../lib/errors";
import { withErrors } from "../../../lib/route";
import { checkOrigin } from "../../../lib/security";

export const runtime = "nodejs";

/**
 * The browser's error boundaries report here: a short message, React's digest and the page path.
 * Rate limited per IP and capped at 4 KB. No session is needed, so signed-out pages report too;
 * nothing sent here is ever reflected back.
 */
export const POST = withErrors("client-error.POST", async (req: Request) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const limited = limitRequest(req, "client-error");
  if (limited) return limited;
  const read = await readBody(req, 4 * 1024);
  if ("error" in read) return read.error;
  const message = typeof read.body.message === "string" ? read.body.message.trim().slice(0, 500) : "";
  const digest = typeof read.body.digest === "string" ? read.body.digest.trim().slice(0, 100) : "";
  const path = typeof read.body.path === "string" && read.body.path.startsWith("/") ? read.body.path.trim().slice(0, 200) : "";
  if (!message) return NextResponse.json({ error: "A message is required." }, { status: 400 });
  const err = new Error(digest ? `${message} (digest ${digest})` : message);
  err.name = "ClientError";
  await recordError(buildErrorRow(path || "client", "client", err));
  return NextResponse.json({ ok: true });
});
