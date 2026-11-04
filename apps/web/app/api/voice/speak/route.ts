import { localOnly } from "../../../../lib/local";
import { budgetNow, noteSpend } from "../../../../lib/jobs";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../../lib/auth";
import { limitRequest } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";

const VOICE = process.env.EXPLANIMATE_CHAT_VOICE ?? "aura-2-thalia-en";

/** One sentence of the assistant's reply as Deepgram Aura speech, streamed through as it is made. */
export const GET = withErrors("voice-speak.GET", async (req: Request) => {
  const no = localOnly(req);
  if (no) return no;
  const limited = limitRequest(req, "voice-speak");
  if (limited) return limited;
  if (authEnabled() && !(await sessionUser(req))) return new Response(JSON.stringify({ error: SIGNIN_ERROR }), { status: 401 });
  const text = new URL(req.url).searchParams.get("text")?.trim().slice(0, 400);
  if (!text) return new Response("no text", { status: 400 });
  if (!budgetNow().ok) return new Response("voice budget used up", { status: 429 });
  const r = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=mp3`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: req.signal,
  }).catch(() => null);
  if (!r?.ok || !r.body) return new Response("no speech", { status: 502 });
  // Aura-2 bills per character ($0.030 per 1,000)
  noteSpend({ voice: text.length * 0.00003 }, "voice speak");
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
});
