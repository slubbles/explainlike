import { localOnly } from "../../../../lib/local";

export const runtime = "nodejs";

const VOICE = process.env.EXPLAINLIKE_CHAT_VOICE ?? "aura-2-thalia-en";

/** One sentence of the assistant's reply as Deepgram Aura speech, streamed through as it is made. */
export async function GET(req: Request) {
  const no = localOnly(req);
  if (no) return no;
  const text = new URL(req.url).searchParams.get("text")?.trim().slice(0, 400);
  if (!text) return new Response("no text", { status: 400 });
  const r = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=mp3`, {
    method: "POST", headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ text }), signal: req.signal,
  }).catch(() => null);
  if (!r?.ok || !r.body) return new Response("no speech", { status: 502 });
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}
