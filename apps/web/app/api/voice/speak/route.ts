import { localOnly } from "../../../../lib/local";
import { budgetNow, noteSpend } from "../../../../lib/jobs";

export const runtime = "nodejs";

const VOICE = process.env.EXPLAINLIKE_CHAT_VOICE ?? "aura-2-thalia-en";

/** One sentence of the assistant's reply as Deepgram Aura speech, streamed through as it is made. */
export async function GET(req: Request) {
  const no = localOnly(req);
  if (no) return no;
  const text = new URL(req.url).searchParams.get("text")?.trim().slice(0, 400);
  if (!text) return new Response("no text", { status: 400 });
  if (!budgetNow().ok) return new Response("voice budget used up", { status: 429 });
  const r = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=mp3`, {
    method: "POST", headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ text }), signal: req.signal,
  }).catch(() => null);
  if (!r?.ok || !r.body) return new Response("no speech", { status: 502 });
  // Aura-2 bills per character ($0.030 per 1,000)
  noteSpend({ voice: text.length * 0.00003 }, "voice speak");
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}
