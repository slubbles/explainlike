import { chatUsd, llmProvider } from "@explanimate/core/llm";
import { localOnly } from "../../../../lib/local";
import { admit, budgetNow, noteSpend, startJob, validInput } from "../../../../lib/jobs";
import { SIGNIN_ERROR, authEnabled, sessionUser } from "../../../../lib/auth";
import { limitRequest, readBody } from "../../../../lib/guard";
import { claimVideoSlot, recordVideo } from "../../../../lib/usage";
import { checkRepo } from "../../../../lib/reach";
import { START_TOOL, readStart, takeSentences, voiceSystem, type Turn } from "../../../../lib/voice";

export const runtime = "nodejs";

type Msg = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

/**
 * One turn of the voice chat: the conversation so far goes to Muse Spark (on this server, with the key),
 * and its reply streams back as server-sent events, one whole sentence at a time so the browser can voice it.
 * When Muse Spark calls start_video, the normal job starts here and its id goes back with the confirm line.
 */
export async function POST(req: Request) {
  const no = localOnly(req);
  if (no) return no;
  let userId: string | undefined;
  if (authEnabled()) {
    const u = await sessionUser(req);
    if (!u) return Response.json({ error: SIGNIN_ERROR }, { status: 401 });
    userId = u.id;
  }
  const limited = limitRequest(req, "voice-turn");
  if (limited) return limited;
  const b = budgetNow();
  if (!b.ok) return Response.json({ error: b.error }, { status: 429 });
  // 30 turns of up to 2,000 characters each, plus room for the JSON around them
  const read = await readBody(req, 96 * 1024);
  if ("error" in read) return read.error;
  const body = read.body as { turns?: unknown; typed?: unknown; voice?: unknown };
  const turns: Turn[] = (Array.isArray(body.turns) ? body.turns : [])
    .filter((t: Turn) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-30)
    .map((t: Turn) => ({ role: t.role, content: t.content.slice(0, 2000) }));
  const typed = typeof body.typed === "string" && validInput(body.typed.trim()) ? body.typed.trim() : undefined;
  const voice = body.voice === "silent" ? "silent" : "deepgram";
  const messages: Msg[] = [{ role: "system", content: voiceSystem(typed) }, ...turns];

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => {
        try {
          ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* the browser hung up (barge-in) */
        }
      };
      let usd = 0;
      try {
        // at most two rounds: a reply, or a tool call and (only if it failed) a reply to the error
        for (let round = 0; round < 2; round++) {
          const r = await spark(messages, req.signal);
          usd += r.usd;
          // a round that ends in start_video speaks only its confirm line, once the job really starts
          if (!r.call) {
            for (const s of r.sentences) send("say", { text: s });
            break;
          }
          const call = r.call;
          if (round === 1) {
            send("say", { text: "I couldn't start that one. Could you type the link in the box under the chat?" });
            break;
          }
          let args: unknown = {};
          try {
            args = JSON.parse(call.args || "{}");
          } catch {
            /* handled as no link */
          }
          const read = readStart(args, validInput);
          let result: string;
          if (read.ok) {
            const missing = await checkRepo(read.req.input);
            const busy = missing ? undefined : admit("voice");
            if (missing) result = `error: ${missing}`;
            else if (busy) result = `error: ${busy}`;
            else {
              let blocked: string | undefined;
              if (userId) {
                const claim = await claimVideoSlot(userId).catch(() => null);
                if (!claim) blocked = "could not check your video limit, try again in a moment";
                else if (!claim.ok) blocked = claim.error;
              }
              if (blocked) {
                result = `error: ${blocked}`;
              } else {
                const job = startJob(
                  read.req.input,
                  voice,
                  { goal: read.req.goal, audience: read.req.audience, depth: read.req.depth, also: read.req.also },
                  "voice",
                );
                if (userId) await recordVideo(job.id, userId, read.req.input);
                send("say", { text: read.confirm });
                send("job", { id: job.id, ...read.req });
                break;
              }
            }
          } else result = `error: ${read.error}`;
          messages.push({
            role: "assistant",
            content: r.text || null,
            tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: call.args } }],
          });
          messages.push({ role: "tool", tool_call_id: call.id, content: result });
        }
      } catch (e) {
        if (!req.signal.aborted)
          send("error", {
            message: e instanceof Error ? e.message.replace(/Bearer\s+\S+/g, "Bearer …").slice(0, 200) : "the assistant stopped",
          });
      }
      noteSpend({ meta: usd }, "voice turn");
      if (!req.signal.aborted) send("done", { usd });
      try {
        ctl.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}

/** Muse Spark, streamed: the reply split into sentences to voice one by one, or a start_video call collected whole. */
async function spark(messages: Msg[], signal: AbortSignal) {
  const llm = llmProvider();
  const r = await fetch(`${llm.base}/chat/completions`, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${process.env[llm.keyVar]}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: llm.model,
      messages,
      tools: [START_TOOL],
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "minimal",
      max_tokens: 1500,
    }),
  });
  if (!r.ok || !r.body) throw new Error(`Muse Spark (${llm.service}) HTTP ${r.status}`);
  let text = "",
    pending = "",
    sse = "",
    usd = 0;
  const sentences: string[] = [];
  let call: { id: string; name: string; args: string } | undefined;
  const flush = (all: boolean) => {
    const { done, rest } = takeSentences(pending);
    const out = all && rest.trim() ? [...done, rest.trim()] : done;
    pending = all ? "" : rest;
    sentences.push(...out);
  };
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    sse += dec.decode(value, { stream: true });
    let i: number;
    while ((i = sse.indexOf("\n")) >= 0) {
      const line = sse.slice(0, i).trim();
      sse = sse.slice(i + 1);
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      let c: any;
      try {
        c = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (c.usage) usd = chatUsd(c.usage);
      const d = c.choices?.[0]?.delta;
      if (d?.content) {
        text += d.content;
        pending += d.content;
        flush(false);
      }
      for (const t of d?.tool_calls ?? []) {
        call ??= { id: t.id ?? "call", name: "", args: "" };
        if (t.id) call.id = t.id;
        if (t.function?.name) call.name = t.function.name;
        if (t.function?.arguments) call.args += t.function.arguments;
      }
    }
  }
  flush(true);
  return { text, sentences, usd, call: call?.name === "start_video" ? call : undefined };
}
