/**
 * Thin client for the Meta Model API (https://api.meta.ai/v1).
 * Models used by Explain Like:
 *  - muse-spark-1.3        planning, architecture extraction, review passes (structured JSON)
 *  - muse-image-1.0        doodle icons for the whiteboard
 *  - sam-3.1               finds the drawn object so icons are cropped cleanly
 *  - muse-voice-transcribe-1.0  checks the voiceover says what the script says
 */
import { z } from "zod";
import { strictJsonSchema, type CostEntry } from "@explainlike/core";

const BASE = process.env.META_API_BASE ?? "https://api.meta.ai/v1";
export const SPARK = process.env.EXPLAINLIKE_SPARK_MODEL ?? "muse-spark-1.3";
export const IMAGE = "muse-image-1.0";
export const SAM = "sam-3.1";
export const TRANSCRIBE = "muse-voice-transcribe-1.0";

// USD per token / call. Spark: $1.25 / 1M input, $4.25 / 1M output.
const PRICE = { sparkIn: 1.25e-6, sparkOut: 4.25e-6, image: 0.01, sam: 0.0025, transcribePerMin: 0.006 };

export class CostLedger {
  entries: CostEntry[] = [];
  add(e: CostEntry) { this.entries.push(e); }
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

async function post(path: string, body: unknown, timeoutMs = 300_000, attempt = 0): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await r.text();
    if (!r.ok) {
      if ((r.status === 429 || r.status >= 500) && attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt));
        return post(path, body, timeoutMs, attempt + 1);
      }
      throw new Error(`Meta API ${path} HTTP ${r.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | unknown[] };

/** Muse Spark with strict structured output validated by zod. */
export async function sparkJson<T extends z.ZodType>(opts: {
  ledger: CostLedger; step: string; schema: T; name: string; messages: ChatMessage[];
  effort?: "low" | "medium" | "high"; maxTokens?: number;
}): Promise<z.infer<T>> {
  const t = Date.now();
  const body = {
    model: SPARK,
    messages: opts.messages,
    reasoning_effort: opts.effort ?? "low",
    max_tokens: opts.maxTokens ?? 12000,
    response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: strictJsonSchema(opts.schema) } },
  };
  const out = await post("/chat/completions", body);
  const u = out.usage ?? {};
  const usd = (u.prompt_tokens ?? 0) * PRICE.sparkIn + (u.completion_tokens ?? 0) * PRICE.sparkOut;
  opts.ledger.add({ step: opts.step, model: SPARK, seconds: (Date.now() - t) / 1000, usd, detail: { prompt: u.prompt_tokens, completion: u.completion_tokens } });
  const content = out.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Muse Spark returned no content for ${opts.step}`);
  return opts.schema.parse(JSON.parse(content));
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
  const r = await fetch(`${BASE}/asr/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: fd });
  const text = await r.text();
  if (!r.ok) throw new Error(`Meta transcribe HTTP ${r.status}: ${text.slice(0, 300)}`);
  const out = JSON.parse(text);
  const mins = (out.audioDurationMs ?? (opts.durationSec ?? 0) * 1000) / 60000;
  opts.ledger.add({ step: opts.step, model: TRANSCRIBE, seconds: (Date.now() - t) / 1000, usd: mins * PRICE.transcribePerMin });
  return { transcript: out.transcript ?? "", turns: out.turns ?? [] };
}
