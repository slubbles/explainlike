import { localOnly } from "../../../../lib/local";
import { budgetNow } from "../../../../lib/jobs";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../../lib/auth";
import { limitRequest } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";
import { checkOrigin } from "../../../../lib/security";

export const runtime = "nodejs";

/** A 30-second Deepgram token so the browser can open its own listening socket; the API key never leaves the server. */
export const POST = withErrors("voice-token.POST", async (req: Request) => {
  const crossSite = checkOrigin(req);
  if (crossSite) return crossSite;
  const no = localOnly(req);
  if (no) return no;
  const limited = limitRequest(req, "voice-token");
  if (limited) return limited;
  if (authEnabled() && !(await sessionUser(req))) return Response.json({ error: SIGNIN_ERROR }, { status: 401 });
  const key = process.env.DEEPGRAM_API_KEY;
  const b = budgetNow();
  if (!b.ok) return Response.json({ error: b.error }, { status: 429 });
  if (!key) return Response.json({ error: "DEEPGRAM_API_KEY is not set on the server" }, { status: 500 });
  const r = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 30 }),
  }).catch(() => null);
  if (!r?.ok) return Response.json({ error: `could not get a voice token (${r?.status ?? "network"})` }, { status: 502 });
  const j = await r.json();
  return Response.json({ token: j.access_token, expiresIn: j.expires_in }, { headers: { "cache-control": "no-store" } });
});
