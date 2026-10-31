/**
 * Voice is pluggable. A VoiceProvider turns one scene's narration into audio
 * plus word timings (seconds from the scene start). The renderer uses the word
 * timings to fire draw-ons exactly when a word is spoken.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { SceneAudio, WordTiming } from "@metual/core";

export interface VoiceProvider {
  id: string;
  synthesize(sceneId: string, text: string, outDir: string): Promise<SceneAudio>;
}

const CACHE = process.env.METUAL_TTS_CACHE ?? path.join(os.homedir(), ".cache", "metual", "tts");
const tokens = (s: string) => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const normW = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** No audio: words are spread at a natural speaking pace so captions and sync still work. */
export class SilentVoice implements VoiceProvider {
  id = "silent";
  constructor(private wps = 2.6) {}
  async synthesize(sceneId: string, text: string): Promise<SceneAudio> {
    const ws = tokens(text);
    const words: WordTiming[] = [];
    let t = 0.25;
    for (const w of ws) {
      const d = Math.max(0.18, (0.6 + w.replace(/[^a-z0-9]/gi, "").length / 6) / this.wps / 0.95);
      words.push({ word: w, start: t, end: t + d * 0.9 });
      t += d + (/[.!?]$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.12 : 0);
    }
    return { sceneId, duration: t + 0.3, words };
  }
}

/** Map spoken (STT) word times onto the script's words so captions show the script spelling. */
export function alignWords(script: string, spoken: { word: string; start: number; end: number }[]): WordTiming[] {
  const ws = tokens(script);
  const out: (WordTiming | null)[] = ws.map(() => null);
  let j = 0;
  for (let i = 0; i < ws.length; i++) {
    const n = normW(ws[i]);
    if (!n) continue;
    for (let k = j; k < Math.min(spoken.length, j + 5); k++) {
      const s = normW(spoken[k].word);
      if (s === n || (n.length > 3 && (s.startsWith(n.slice(0, 4)) || n.startsWith(s.slice(0, 4)) && s.length > 3))) { out[i] = { word: ws[i], start: spoken[k].start, end: spoken[k].end }; j = k + 1; break; }
    }
  }
  // interpolate gaps
  const total = spoken.length ? spoken[spoken.length - 1].end : ws.length / 2.6;
  for (let i = 0; i < ws.length; i++) {
    if (out[i]) continue;
    let a = i - 1; while (a >= 0 && !out[a]) a--;
    let b = i + 1; while (b < ws.length && !out[b]) b++;
    const t0 = a >= 0 ? out[a]!.end : 0, t1 = b < ws.length ? out[b]!.start : total;
    const span = (t1 - t0) / (b - a);
    out[i] = { word: ws[i], start: t0 + span * (i - a - 1) + 0.01, end: t0 + span * (i - a) };
  }
  return out as WordTiming[];
}

export interface DeepgramOptions { apiKey?: string; model?: string; sttModel?: string }

/** Deepgram Aura text-to-speech, then Deepgram speech-to-text for word timestamps. */
export class DeepgramVoice implements VoiceProvider {
  id = "deepgram";
  usage = { ttsChars: 0, sttSeconds: 0 };
  private key: string;
  model: string;
  constructor(o: DeepgramOptions = {}) {
    const k = o.apiKey ?? process.env.DEEPGRAM_API_KEY;
    if (!k) throw new Error("DEEPGRAM_API_KEY is not set");
    this.key = k;
    this.model = o.model ?? process.env.METUAL_VOICE ?? "aura-2-arcas-en";
  }
  get usd() { return (this.usage.ttsChars / 1000) * 0.03 + (this.usage.sttSeconds / 60) * 0.0043; }

  private async req(url: string, body: BodyInit, type: string, attempt = 0): Promise<Response> {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Token ${this.key}`, "Content-Type": type }, body });
    if (!r.ok) {
      if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise((s) => setTimeout(s, 1500 * 2 ** attempt)); return this.req(url, body, type, attempt + 1); }
      throw new Error(`Deepgram ${new URL(url).pathname} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    }
    return r;
  }

  async synthesize(sceneId: string, text: string, outDir: string): Promise<SceneAudio> {
    fs.mkdirSync(CACHE, { recursive: true });
    const h = crypto.createHash("sha1").update(this.model + "\n" + text).digest("hex").slice(0, 16);
    const wavCache = path.join(CACHE, `${h}.wav`), jsonCache = path.join(CACHE, `${h}.json`);
    if (!fs.existsSync(wavCache) || !fs.existsSync(jsonCache)) {
      const tts = await this.req(`https://api.deepgram.com/v1/speak?model=${this.model}&encoding=linear16&sample_rate=24000&container=wav`, JSON.stringify({ text }), "application/json");
      const wav = Buffer.from(await tts.arrayBuffer());
      this.usage.ttsChars += text.length;
      const stt = await this.req(`https://api.deepgram.com/v1/listen?model=${process.env.METUAL_STT ?? "nova-3"}&punctuate=true`, new Uint8Array(wav), "audio/wav");
      const j: any = await stt.json();
      const words = (j.results?.channels?.[0]?.alternatives?.[0]?.words ?? []).map((w: any) => ({ word: w.punctuated_word ?? w.word, start: w.start, end: w.end }));
      const duration = j.metadata?.duration ?? wavDuration(wav);
      this.usage.sttSeconds += duration;
      fs.writeFileSync(wavCache, wav);
      fs.writeFileSync(jsonCache, JSON.stringify({ words, duration, transcript: j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "" }));
    }
    const cached = JSON.parse(fs.readFileSync(jsonCache, "utf8"));
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${sceneId}.wav`);
    fs.copyFileSync(wavCache, file);
    return { sceneId, file, duration: wavDuration(fs.readFileSync(file)), words: alignWords(text, cached.words) };
  }
}

export function wavDuration(wav: Buffer): number {
  // walk RIFF chunks for fmt + data
  let off = 12, byteRate = 48000, dataLen = wav.length - 44;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4), len = wav.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = wav.readUInt32LE(off + 16);
    if (id === "data") { dataLen = Math.min(len, wav.length - off - 8); break; }
    off += 8 + len + (len % 2);
  }
  return dataLen / byteRate;
}

export function pickVoice(name?: string): VoiceProvider {
  if (name === "silent") return new SilentVoice();
  if (name === "deepgram" || (!name && process.env.DEEPGRAM_API_KEY)) return new DeepgramVoice();
  return new SilentVoice();
}

/** crude similarity used to QA the voiceover against the script */
export function wordOverlap(a: string, b: string): number {
  const A = tokens(a).map(normW).filter(Boolean), B = new Map<string, number>();
  for (const w of tokens(b).map(normW).filter(Boolean)) B.set(w, (B.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of A) { const c = B.get(w) ?? 0; if (c > 0) { hit++; B.set(w, c - 1); } }
  return A.length ? hit / A.length : 1;
}
