/**
 * Voice is pluggable. A VoiceProvider turns one scene's narration into audio
 * plus word timings (seconds from the scene start). The renderer uses the word
 * timings to fire draw-ons exactly when a word is spoken.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fetchRetry, providerLimiter, ServiceError, userCacheDir, type SceneAudio, type WordTiming } from "@explanimate/core";

export interface VoiceProvider {
  id: string;
  synthesize(sceneId: string, text: string, outDir: string): Promise<SceneAudio>;
}

const CACHE = process.env.EXPLANIMATE_TTS_CACHE ?? userCacheDir("tts");

/** Read a cache entry, tolerating a half-written or corrupt file left by a crashed run. */
function readCache<T>(wavCache: string, jsonCache: string): T | undefined {
  if (!fs.existsSync(wavCache) || !fs.existsSync(jsonCache)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(jsonCache, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Write a cache entry via temp files and renames, so parallel workers never leave half files. */
function writeCache(wavCache: string, wav: Buffer, jsonCache: string, json: string): void {
  const wtmp = `${wavCache}.${process.pid}.tmp`;
  const jtmp = `${jsonCache}.${process.pid}.tmp`;
  fs.writeFileSync(wtmp, wav);
  fs.writeFileSync(jtmp, json);
  fs.renameSync(wtmp, wavCache);
  fs.renameSync(jtmp, jsonCache);
}
const tokens = (s: string) => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const normW = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Words spread at a natural speaking pace, longer words taking longer. SilentVoice's whole timing
 * and Cartesia's fallback timing (stretched onto the real recording by fitWords) share this.
 */
export function estimateWords(text: string, wps = 2.6): { words: WordTiming[]; duration: number } {
  const ws = tokens(text);
  const words: WordTiming[] = [];
  let t = 0.25;
  for (const w of ws) {
    const d = Math.max(0.18, (0.6 + w.replace(/[^a-z0-9]/gi, "").length / 6) / wps / 0.95);
    words.push({ word: w, start: t, end: t + d * 0.9 });
    t += d + (/[.!?]$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.12 : 0);
  }
  return { words, duration: t + 0.3 };
}

/** Stretch estimated word timings onto a real recording's length, keeping their rhythm. */
export function fitWords(words: WordTiming[], duration: number): WordTiming[] {
  const raw = words.length ? words[words.length - 1]!.end : 0;
  if (!raw || !Number.isFinite(duration) || duration <= 0) return words;
  const k = duration / raw;
  return words.map((w) => ({ word: w.word, start: w.start * k, end: w.end * k }));
}

/** No audio: words are spread at a natural speaking pace so captions and sync still work. */
export class SilentVoice implements VoiceProvider {
  id = "silent";
  constructor(private wps = 2.6) {}
  async synthesize(sceneId: string, text: string): Promise<SceneAudio> {
    const { words, duration } = estimateWords(text, this.wps);
    return { sceneId, duration, words };
  }
}

/** Lowercase letter-names a voice tends to read as a word ("bpe" came out as "pp a a", "minbpe" as "Mintay"). */
// not "json" (said as a word), and nothing that ends common words ("platform", "outlaws", "drag")
const SPELLED = [
  "bpe",
  "llm",
  "gpt",
  "api",
  "cli",
  "sdk",
  "url",
  "http",
  "sql",
  "cpu",
  "gpu",
  "mcp",
  "ssh",
  "dns",
  "cdn",
  "jwt",
  "npm",
  "css",
  "html",
  "gcp",
  "csv",
  "pdf",
];
const SPELL_RE = new RegExp(`^(.*?)(${SPELLED.join("|")})(s?)(\\d*)$`, "i");
/**
 * How a script word is said: letter-name acronyms in capitals so they are read letter by letter, and a
 * code name built on one split off ("minbpe" -> "min BPE", "gpt4" -> "GPT 4"). One entry per script word.
 */
export function spokenWords(script: string): string[] {
  return tokens(script).map((w) => {
    const m = w.match(/^([^A-Za-z0-9]*)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/);
    if (!m) return w;
    const [, pre, core, post] = m;
    const k = core!.match(SPELL_RE);
    // only lowercase words: "Api" or "API" in the script is already how the writer wants it said
    if (!k || core !== core!.toLowerCase()) return w;
    const [, head, ac, plural, num] = k;
    // a short word that only ends in the letters ("rapi") is a word, not a code name
    if (head && head.length < 3) return w;
    return `${pre}${[head, ac!.toUpperCase() + (plural ? "s" : ""), num].filter(Boolean).join(" ")}${post}`;
  });
}

/**
 * Proper nouns Aura has said so a listener hears another word, with a spelling it says clearly. Captions
 * keep the script spelling; only the text sent to the voice changes. "silk reached Rome" came out as
 * "reached Gromo" in two takes of four. "parcel" needs the hyphen: plain and "parsel" are both heard as
 * another word, while "par-sel" is heard as "parcel".
 */
export const RESPELL: Record<string, string> = { rome: "Rohm", parcel: "par-sel", courier: "coorier", couriers: "cooriers" };

/**
 * The names in a script a listener would notice said wrong: capitalised words (not acronyms) after a
 * sentence's first word, plus any word with a known respelling. One entry per name, lowercased.
 */
export function namesIn(script: string): string[] {
  const out = new Set<string>();
  for (const sent of script.split(/(?<=[.!?])\s+/)) {
    tokens(sent).forEach((w, i) => {
      const core = w.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, "").replace(/'s$/, "");
      if (core.length < 3 || core === core.toUpperCase()) return;
      const n = core.toLowerCase();
      if (RESPELL[n] || (i > 0 && /^[A-Z]/.test(core))) out.add(n);
    });
  }
  return [...out];
}

/** The script's names the recogniser did not hear in a take: each is a word the voice likely said wrong. */
export function misheard(script: string, heard: string): string[] {
  const got = new Set(tokens(heard).map((w) => normW(w.replace(/'s$/i, ""))));
  return namesIn(script).filter((n) => !got.has(normW(n)));
}

/** The spoken form with risky names respelled ("reached Rome" -> "reached Rohm"); one entry per script word. */
export function hinted(sayAs: string[], names: string[]): string[] {
  return sayAs.map((w) => {
    const m = w.match(/^([^A-Za-z]*)([A-Za-z]+)(.*)$/);
    const r = m && names.includes(m[2]!.toLowerCase()) ? RESPELL[m[2]!.toLowerCase()] : undefined;
    return r ? `${m![1]}${r}${m![3]}` : w;
  });
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
      if (s === n || (n.length > 3 && (s.startsWith(n.slice(0, 4)) || (n.startsWith(s.slice(0, 4)) && s.length > 3)))) {
        out[i] = { word: ws[i], start: spoken[k].start, end: spoken[k].end };
        j = k + 1;
        break;
      }
    }
  }
  // interpolate gaps
  const total = spoken.length ? spoken[spoken.length - 1].end : ws.length / 2.6;
  for (let i = 0; i < ws.length; i++) {
    if (out[i]) continue;
    let a = i - 1;
    while (a >= 0 && !out[a]) a--;
    let b = i + 1;
    while (b < ws.length && !out[b]) b++;
    const t0 = a >= 0 ? out[a]!.end : 0,
      t1 = b < ws.length ? out[b]!.start : total;
    const span = (t1 - t0) / (b - a);
    out[i] = { word: ws[i], start: t0 + span * (i - a - 1), end: t0 + span * (i - a) };
  }
  // keep words in spoken order: each starts no earlier than the one before and ends after it starts
  for (let i = 0; i < ws.length; i++) {
    const w = out[i]!,
      prev = out[i - 1];
    if (prev && w.start < prev.start) w.start = prev.start;
    if (w.end < w.start) w.end = w.start;
  }
  return out as WordTiming[];
}

interface Take {
  words: { word: string; start: number; end: number }[];
  duration: number;
  transcript: string;
  checked?: boolean;
  misheard?: string[];
}

export interface DeepgramOptions {
  apiKey?: string;
  model?: string;
  sttModel?: string;
}

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
    this.model = o.model ?? process.env.EXPLANIMATE_VOICE ?? "aura-2-arcas-en";
  }
  get usd() {
    return (this.usage.ttsChars / 1000) * 0.03 + (this.usage.sttSeconds / 60) * 0.0043;
  }

  private req(url: string, body: BodyInit, type: string): Promise<Response> {
    // the Deepgram lane, shared by the scenes voicing side by side
    return providerLimiter.run("deepgram", () =>
      fetchRetry(url, () => ({ method: "POST", headers: { Authorization: `Token ${this.key}`, "Content-Type": type }, body }), {
        service: "Deepgram",
        keyVar: "DEEPGRAM_API_KEY",
        timeoutMs: 90_000,
        attempts: 4,
        baseMs: 1500,
      }),
    );
  }

  /** One Aura take of the text, and what Deepgram's recogniser hears in it (the word times captions use). */
  private async take(said: string): Promise<Take & { wav: Buffer }> {
    const tts = await this.req(
      `https://api.deepgram.com/v1/speak?model=${this.model}&encoding=linear16&sample_rate=24000&container=wav`,
      JSON.stringify({ text: said }),
      "application/json",
    );
    const wav = Buffer.from(await tts.arrayBuffer());
    this.usage.ttsChars += said.length;
    const stt = await this.req(
      `https://api.deepgram.com/v1/listen?model=${process.env.EXPLANIMATE_STT ?? "nova-3"}&punctuate=true`,
      new Uint8Array(wav),
      "audio/wav",
    );
    const j: any = await stt.json();
    const words = (j.results?.channels?.[0]?.alternatives?.[0]?.words ?? []).map((w: any) => ({
      word: w.punctuated_word ?? w.word,
      start: w.start,
      end: w.end,
    }));
    const duration = j.metadata?.duration ?? wavDuration(wav);
    this.usage.sttSeconds += duration;
    return { wav, words, duration, transcript: j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "" };
  }

  async synthesize(sceneId: string, text: string, outDir: string): Promise<SceneAudio> {
    fs.mkdirSync(CACHE, { recursive: true });
    const sayAs = spokenWords(text),
      said = sayAs.join(" ");
    const h = crypto
      .createHash("sha1")
      // the recogniser model and the respell table shape the stored timings, so they are part of the key
      .update([this.model, process.env.EXPLANIMATE_STT ?? "nova-3", JSON.stringify(RESPELL), said].join("\n"))
      .digest("hex")
      .slice(0, 16);
    const wavCache = path.join(CACHE, `${h}.wav`),
      jsonCache = path.join(CACHE, `${h}.json`);
    // a take older than the name check is listened to again from its stored transcript, which costs nothing
    let cached: Take | undefined = readCache<Take>(wavCache, jsonCache);
    // the take's bytes stay in hand, so the scene file and its length come from one read, not three
    let wav: Buffer | undefined;
    if (!cached || !cached.checked) {
      let take = cached ? { wav: fs.readFileSync(wavCache), ...cached } : await this.take(said);
      let miss = misheard(text, take.transcript);
      // a name the recogniser did not hear gets one more take, with the risky names respelled
      if (miss.length) {
        const again = await this.take(hinted(sayAs, miss).join(" "));
        const left = misheard(text, again.transcript);
        if (left.length < miss.length) {
          take = again;
          miss = left;
        }
      }
      cached = { words: take.words, duration: take.duration, transcript: take.transcript, checked: true, misheard: miss };
      wav = take.wav;
      writeCache(wavCache, take.wav, jsonCache, JSON.stringify(cached));
    }
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${sceneId}.wav`);
    wav ??= fs.readFileSync(wavCache);
    fs.writeFileSync(file, wav);
    return { sceneId, file, duration: wavDuration(wav), words: scriptTimes(text, sayAs, alignWords(said, cached.words)) };
  }
}

export const CARTESIA_VERSION = "2026-08-14";
export const CARTESIA_DEFAULT_MODEL = "sonic-3.6";
/** A stock English voice; any voice UUID from play.cartesia.ai/voices works via CARTESIA_VOICE_ID. */
export const CARTESIA_DEFAULT_VOICE = "78ab82d5-25be-4f7d-82b3-7ad64e5b85b2";
/** About $50 per 1M characters (October 2026 list: $37-65 per 1M by plan), so the spend guard sees roughly the right number. */
const CARTESIA_USD_PER_CHAR = 0.00005;

export interface CartesiaOptions {
  apiKey?: string;
  model?: string;
  voice?: string;
}

/**
 * Cartesia Sonic text-to-speech over POST https://api.cartesia.ai/tts/bytes: one call, one 24 kHz
 * wav, so the pipeline handles it like a Deepgram take. The bytes endpoint returns no word
 * timestamps, so timings are estimated at speaking pace and stretched onto the real recording (the
 * renderer only needs one timing per word, in order). There is no name retake: the speech-to-text
 * that would hear a misread word is Deepgram's, and Cartesia only speaks when Deepgram has failed.
 */
export class CartesiaVoice implements VoiceProvider {
  id = "cartesia";
  usage = { ttsChars: 0 };
  private key: string;
  model: string;
  voice: string;
  constructor(o: CartesiaOptions = {}) {
    const k = o.apiKey ?? process.env.CARTESIA_API_KEY;
    if (!k) throw new Error("CARTESIA_API_KEY is not set");
    this.key = k;
    this.model = o.model ?? process.env.CARTESIA_MODEL ?? CARTESIA_DEFAULT_MODEL;
    this.voice = o.voice ?? process.env.CARTESIA_VOICE_ID ?? CARTESIA_DEFAULT_VOICE;
  }
  get usd() {
    return this.usage.ttsChars * CARTESIA_USD_PER_CHAR;
  }

  async synthesize(sceneId: string, text: string, outDir: string): Promise<SceneAudio> {
    fs.mkdirSync(CACHE, { recursive: true });
    const sayAs = spokenWords(text),
      said = sayAs.join(" ");
    const h = crypto.createHash("sha1").update(`cartesia\n${this.model}\n${this.voice}\n${said}`).digest("hex").slice(0, 16);
    const wavCache = path.join(CACHE, `${h}.wav`),
      jsonCache = path.join(CACHE, `${h}.json`);
    let cached: { words: WordTiming[]; duration: number } | undefined = readCache<{ words: WordTiming[]; duration: number }>(
      wavCache,
      jsonCache,
    );
    if (!cached) {
      // the Cartesia lane, shared by the scenes voicing side by side
      const r = await providerLimiter.run("cartesia", () =>
        fetchRetry(
          "https://api.cartesia.ai/tts/bytes",
          () => ({
            method: "POST",
            headers: {
              // X-API-Key is Cartesia's long-standing auth header; the current API reference shows a
              // Bearer token instead, so both go along and the call works either way
              "X-API-Key": this.key,
              Authorization: `Bearer ${this.key}`,
              "Cartesia-Version": CARTESIA_VERSION,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model_id: this.model,
              transcript: said,
              voice: { id: this.voice },
              language: "en",
              output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 },
            }),
          }),
          { service: "Cartesia", keyVar: "CARTESIA_API_KEY", timeoutMs: 90_000, attempts: 4, baseMs: 1500 },
        ),
      );
      const wav = Buffer.from(await r.arrayBuffer());
      if (wav.length < 44) throw new ServiceError("Cartesia sent back an answer too short to be audio. Try again.", "Cartesia");
      this.usage.ttsChars += said.length;
      const duration = wavDuration(wav);
      cached = { words: scriptTimes(text, sayAs, fitWords(estimateWords(said).words, duration)), duration };
      writeCache(wavCache, wav, jsonCache, JSON.stringify(cached));
    }
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${sceneId}.wav`);
    fs.copyFileSync(wavCache, file);
    // the cached length is measured from these same bytes when the take is stored, so the file is not read back
    return { sceneId, file, duration: cached.duration, words: cached.words };
  }
}

/** Fold timings for the spoken form ("min BPE") back onto the script's words ("minbpe"). */
export function scriptTimes(script: string, sayAs: string[], said: WordTiming[]): WordTiming[] {
  const ws = tokens(script);
  let at = 0;
  return ws.map((w, i) => {
    const n = Math.max(1, tokens(sayAs[i] ?? w).length),
      part = said.slice(at, at + n);
    at += n;
    return { word: w, start: part[0]?.start ?? 0, end: part[part.length - 1]?.end ?? part[0]?.end ?? 0 };
  });
}

export function wavDuration(wav: Buffer): number {
  // walk RIFF chunks for fmt + data
  let off = 12,
    byteRate = 48000,
    dataLen = wav.length - 44;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4),
      len = wav.readUInt32LE(off + 4);
    if (id === "fmt " && off + 20 <= wav.length) byteRate = wav.readUInt32LE(off + 16);
    if (id === "data") {
      dataLen = Math.min(len, wav.length - off - 8);
      break;
    }
    off += 8 + len + (len % 2);
  }
  return byteRate > 0 ? dataLen / byteRate : 0;
}

/** What a voice spent, or 0 when it does not count (silent). */
export function voiceUsd(v: VoiceProvider): number {
  const u = (v as { usd?: unknown }).usd;
  return typeof u === "number" && Number.isFinite(u) ? u : 0;
}

/** Try the primary voice, and on any failure use the backup once. Each scene falls back on its own. */
export class FallbackVoice implements VoiceProvider {
  private fellBack = false;
  constructor(
    private primary: VoiceProvider,
    private backup: VoiceProvider,
  ) {}
  /** the primary's id, plus the backup's once a scene has fallen back, so the manifest says what spoke */
  get id(): string {
    return this.fellBack ? `${this.primary.id}+${this.backup.id}` : this.primary.id;
  }
  get usd(): number {
    return voiceUsd(this.primary) + voiceUsd(this.backup);
  }
  async synthesize(sceneId: string, text: string, outDir: string): Promise<SceneAudio> {
    try {
      return await this.primary.synthesize(sceneId, text, outDir);
    } catch (e) {
      this.fellBack = true;
      console.warn(
        `${this.primary.id} voice failed for scene ${sceneId} (${String((e as Error)?.message ?? e)
          .split("\n")[0]!
          .slice(0, 160)}); falling back to ${this.backup.id}`,
      );
      return this.backup.synthesize(sceneId, text, outDir);
    }
  }
}

export function pickVoice(name?: string): VoiceProvider {
  if (name === "silent") return new SilentVoice();
  if (name === "cartesia") return new CartesiaVoice();
  if (name === "deepgram" || (!name && process.env.DEEPGRAM_API_KEY)) {
    const d = new DeepgramVoice();
    return process.env.CARTESIA_API_KEY ? new FallbackVoice(d, new CartesiaVoice()) : d;
  }
  return new SilentVoice();
}

/** crude similarity used to QA the voiceover against the script */
export function wordOverlap(a: string, b: string): number {
  const A = tokens(a).map(normW).filter(Boolean),
    B = new Map<string, number>();
  for (const w of tokens(b).map(normW).filter(Boolean)) B.set(w, (B.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of A) {
    const c = B.get(w) ?? 0;
    if (c > 0) {
      hit++;
      B.set(w, c - 1);
    }
  }
  return A.length ? hit / A.length : 1;
}
