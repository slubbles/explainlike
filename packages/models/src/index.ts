/**
 * Thin client for the Meta Model API (https://api.meta.ai/v1).
 * Models used by Explain Like:
 *  - muse-spark-1.3        planning, architecture extraction, review passes (structured JSON)
 *  - muse-image-1.0        doodle icons for the whiteboard
 *  - sam-3.1               finds the drawn object so icons are cropped cleanly
 *  - muse-voice-transcribe-1.0  checks the voiceover says what the script says
 */
import { z } from "zod";
import { strictJsonSchema, fetchRetry, ServiceError, type CostEntry } from "@explainlike/core";

const BASE = process.env.META_API_BASE ?? "https://api.meta.ai/v1";
export const SPARK = process.env.EXPLAINLIKE_SPARK_MODEL ?? "muse-spark-1.3-contributor";
export const IMAGE = "muse-image-1.0";
export const SAM = "sam-3.1";
export const TRANSCRIBE = "muse-voice-transcribe-1.0";

// USD per token / call. Spark: $1.25 / 1M input, $4.25 / 1M output.
const PRICE = { sparkIn: 1.25e-6, sparkOut: 4.25e-6, image: 0.01, sam: 0.0025, transcribePerMin: 0.006 };

export class CostLedger {
  entries: CostEntry[] = [];
  private t0 = Date.now();
  /** each entry also records when its call started, in seconds from the ledger's start, so overlapping calls show up in the profile */
  add(e: CostEntry) { this.entries.push({ ...e, detail: { ...e.detail, startedAt: Number(((Date.now() - this.t0) / 1000 - e.seconds).toFixed(1)) } }); }
  get total() { return this.entries.reduce((a, e) => a + e.usd, 0); }
  byModel() {
    const m: Record<string, { calls: number; usd: number; seconds: number }> = {};
    for (const e of this.entries) {
      const r = (m[e.model] ??= { calls: 0, usd: 0, seconds: 0 });
      r.calls++; r.usd += e.usd; r.seconds += e.seconds;
    }
    return m;
  }
}

function key() {
  const k = process.env.MODEL_API_KEY;
  if (!k) throw new Error("MODEL_API_KEY is not set. Get one at https://dev.meta.ai and put it in .env");
  return k;
}

const MUSE = { service: "Meta Muse", keyVar: "MODEL_API_KEY", baseMs: 1500 };

async function post(path: string, body: unknown, timeoutMs = 300_000, retryTimeouts = true): Promise<any> {
  const json = JSON.stringify(body), k = key();
  const r = await fetchRetry(BASE + path, () => ({ method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: json }), { ...MUSE, timeoutMs, attempts: 4, retryTimeouts });
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new ServiceError("Meta Muse sent back an answer that was not JSON. Try again.", "Meta Muse", r.status, text.slice(0, 200)); }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | unknown[] };

const LOWER = { high: "medium", medium: "low", low: "minimal", minimal: "minimal" } as const;

/**
 * Muse Spark with strict structured output validated by zod. When the reasoning eats the whole token budget,
 * the answer comes back empty or cut off; that try is retried once with one step less effort and 1.5x the room.
 * With `timeoutMs`, a try that has not answered by then is dropped and retried once the same way, so a slow
 * call costs at most two time limits instead of hanging through four five-minute retries.
 * `wire` is the schema sent to the API when it carries limits (max items, max length) the parse should not enforce.
 */
export async function sparkJson<T extends z.ZodType>(opts: {
  ledger: CostLedger; step: string; schema: T; name: string; messages: ChatMessage[];
  effort?: "minimal" | "low" | "medium" | "high"; maxTokens?: number; timeoutMs?: number; wire?: z.ZodType;
}): Promise<z.infer<T>> {
  let effort = opts.effort ?? "low", maxTokens = opts.maxTokens ?? 12000;
  for (let attempt = 0; ; attempt++) {
    const t = Date.now();
    const body = {
      model: SPARK,
      messages: opts.messages,
      reasoning_effort: effort,
      max_tokens: maxTokens,
      response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: strictJsonSchema(opts.wire ?? opts.schema) } },
    };
    let out;
    try {
      out = opts.timeoutMs ? await post("/chat/completions", body, opts.timeoutMs, false) : await post("/chat/completions", body);
    } catch (e) {
      if (!(e instanceof ServiceError && e.timedOut) || attempt >= 1) throw e;
      // what a dropped try cost is not reported back, so it is logged at zero with the time it took
      opts.ledger.add({ step: opts.step, model: SPARK, seconds: (Date.now() - t) / 1000, usd: 0, detail: { effort, timedOut: true } });
      effort = LOWER[effort];
      continue;
    }
    const u = out.usage ?? {};
    const usd = (u.prompt_tokens ?? 0) * PRICE.sparkIn + (u.completion_tokens ?? 0) * PRICE.sparkOut;
    opts.ledger.add({ step: opts.step, model: SPARK, seconds: (Date.now() - t) / 1000, usd, detail: { prompt: u.prompt_tokens, completion: u.completion_tokens, reasoning: u.completion_tokens_details?.reasoning_tokens, effort, ...(attempt ? { retry: attempt } : {}) } });
    const content = out.choices?.[0]?.message?.content;
    const cutOff = out.choices?.[0]?.finish_reason === "length";
    if (content && !cutOff) return opts.schema.parse(JSON.parse(content));
    const why = cutOff ? `ran out of room (${maxTokens} tokens)` : "returned no content";
    if (attempt >= 1) throw new Error(`Muse Spark ${why} on ${opts.step}, twice`);
    effort = LOWER[effort];
    maxTokens = Math.min(32000, Math.round(maxTokens * 1.5));
  }
}

/** Muse Image: returns image bytes. */
export async function museImage(opts: { ledger: CostLedger; step: string; prompt: string; size?: string }): Promise<Buffer> {
  const t = Date.now();
  const out = await post("/images/generations", { model: IMAGE, n: 1, prompt: opts.prompt, size: opts.size ?? "1024x1024" });
  opts.ledger.add({ step: opts.step, model: IMAGE, seconds: (Date.now() - t) / 1000, usd: PRICE.image });
  return Buffer.from(out.data[0].b64_json, "base64");
}

export interface SamBox { x1: number; y1: number; x2: number; y2: number; w: number; h: number; confidence: number }

/** SAM 3.1: open-vocabulary detection. Returns boxes in source-image pixels, best first. */
export async function samDetect(opts: { ledger: CostLedger; step: string; image: Buffer; mime: string; phrase: string }): Promise<SamBox[]> {
  const t = Date.now();
  const url = `data:${opts.mime};base64,${opts.image.toString("base64")}`;
  const out = await post("/responses", {
    model: SAM,
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: opts.phrase }, { type: "input_image", image_url: url }] }],
    metadata: { include_confidence: "true" },
  });
  opts.ledger.add({ step: opts.step, model: SAM, seconds: (Date.now() - t) / 1000, usd: PRICE.sam });
  const text: string = (out.output ?? []).flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
  const boxes: SamBox[] = [];
  for (const m of text.matchAll(/<\|box;([^|]*)\|>/g)) {
    const kv = Object.fromEntries(m[1].split(";").map((p) => p.split("=")).map(([k, v]) => [k, Number(v)]));
    boxes.push({ x1: kv.x1, y1: kv.y1, x2: kv.x2, y2: kv.y2, w: kv.w, h: kv.h, confidence: kv.c ?? 0 });
  }
  return boxes.sort((a, b) => b.confidence - a.confidence);
}

/** Muse Voice Transcribe on a mono 16/24 kHz WAV. Turn-level only. */
export async function museTranscribe(opts: { ledger: CostLedger; step: string; wav: Buffer; keywords?: string[]; durationSec?: number }): Promise<{ transcript: string; turns: { startMs: number; endMs: number; transcript: string }[] }> {
  const t = Date.now();
  const fd = new FormData();
  const req: Record<string, unknown> = { model: TRANSCRIBE, audioEncoding: "WAV", mode: "ENDPOINTING" };
  if (opts.keywords?.length) req.keywords = opts.keywords.slice(0, 50);
  fd.append("request", new Blob([JSON.stringify(req)], { type: "application/json" }));
  fd.append("audio", new Blob([new Uint8Array(opts.wav)], { type: "audio/wav" }), "narration.wav");
  const k = key();
  const r = await fetchRetry(`${BASE}/asr/transcribe`, () => ({ method: "POST", headers: { Authorization: `Bearer ${k}` }, body: fd }), { ...MUSE, timeoutMs: 180_000, attempts: 3 });
  const out = JSON.parse(await r.text());
  const mins = (out.audioDurationMs ?? (opts.durationSec ?? 0) * 1000) / 60000;
  opts.ledger.add({ step: opts.step, model: TRANSCRIBE, seconds: (Date.now() - t) / 1000, usd: mins * PRICE.transcribePerMin });
  return { transcript: out.transcript ?? "", turns: out.turns ?? [] };
}

const FrameReview = z.object({
  frames: z.array(z.object({
    t: z.number(),
    problems: z.array(z.object({ kind: z.enum(["cropped", "overlap", "covered", "unreadable", "blank", "other"]), where: z.string() })),
  })),
});
export type FrameReviewResult = z.infer<typeof FrameReview>;

/**
 * Muse Spark looks at a few rendered frames and lists layout problems a viewer would notice.
 * Off by default (it costs money); the bounding-box check runs first and is free.
 */
export async function reviewFrames(opts: { ledger: CostLedger; frames: { t: number; jpeg: Buffer }[] }): Promise<FrameReviewResult> {
  const content: unknown[] = [{
    type: "text",
    text: "These are frames from an explainer video drawn on a whiteboard. For each frame, list only problems a viewer would notice: "
      + "text or drawings cut off by the frame edge, labels overlapping lines or other text, the caption bar covering something important, "
      + "text too small to read, or an empty frame. Use an empty list when a frame is fine. Each frame is preceded by its time in seconds.",
  }];
  for (const f of opts.frames) {
    content.push({ type: "text", text: `t=${f.t.toFixed(2)}` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${f.jpeg.toString("base64")}` } });
  }
  return sparkJson({ ledger: opts.ledger, step: "frame-review", name: "frame_review", schema: FrameReview, messages: [{ role: "user", content }], effort: "low", maxTokens: 4000 });
}
