import { localOnly } from "../../../../lib/local";

export const runtime = "nodejs";

/** A 30-second Deepgram token so the browser can open its own listening socket; the API key never leaves the server. */
export async function POST(req: Request) {
  const no = localOnly(req);
  if (no) return no;
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return Response.json({ error: "DEEPGRAM_API_KEY is not set on the server" }, { status: 500 });
  const r = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST", headers: { Authorization: `Token ${key}`, "content-type": "application/json" }, body: JSON.stringify({ ttl_seconds: 30 }),
  }).catch(() => null);
  if (!r?.ok) return Response.json({ error: `could not get a voice token (${r?.status ?? "network"})` }, { status: 502 });
  const j = await r.json();
  return Response.json({ token: j.access_token, expiresIn: j.expires_in }, { headers: { "cache-control": "no-store" } });
}
