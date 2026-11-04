import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the TTS cache folder is read when the voice module loads, so it is pinned before importing it
process.env.EXPLANIMATE_TTS_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "cartesia-test-"));
const voice = await import("../src/index.ts");

/** a silent 24 kHz mono 16-bit wav, the shape Cartesia is asked for */
function makeWav(seconds: number, rate = 24000): Buffer {
  const data = Buffer.alloc(Math.floor(seconds * rate) * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// Deepgram answers with one status (401 fails at once, without retries); Cartesia answers a wav
function fakeNet(o: { deepgramStatus?: number; wavSeconds?: number } = {}) {
  const seen: { url: string; headers: Record<string, string>; body?: any }[] = [];
  const saved = globalThis.fetch;
  const wav = makeWav(o.wavSeconds ?? 3);
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ url, headers: { ...((init?.headers ?? {}) as Record<string, string>) }, body });
    if (url.includes("api.deepgram.com")) return new Response("no", { status: o.deepgramStatus ?? 401 });
    if (url.includes("api.cartesia.ai")) return new Response(wav, { status: 200, headers: { "Content-Type": "audio/wav" } });
    throw new Error(`unexpected url ${url}`);
  }) as typeof fetch;
  return { seen, restore: () => (globalThis.fetch = saved) };
}

function withEnv(vars: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return {
    restore: () => {
      for (const [k, v] of Object.entries(saved))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    },
  };
}

function captureWarn() {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  };
  return { lines, restore: () => (console.warn = orig) };
}

const outDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "cartesia-out-"));
const KEYS = { DEEPGRAM_API_KEY: "test-dg-key", CARTESIA_API_KEY: "test-cart-key" };

test("when Deepgram fails, the scene falls back to Cartesia with a timing for every word", async () => {
  const env = withEnv({ ...KEYS, CARTESIA_VOICE_ID: undefined, CARTESIA_MODEL: undefined });
  const net = fakeNet();
  const warn = captureWarn();
  try {
    const v = voice.pickVoice();
    assert.equal(v.id, "deepgram");
    const a = await v.synthesize("s1", "The queue drains when traffic calms down.", outDir());
    assert.equal(a.sceneId, "s1");
    assert.ok(a.file && fs.existsSync(a.file));
    assert.deepEqual(
      a.words.map((w) => w.word),
      ["The", "queue", "drains", "when", "traffic", "calms", "down."],
    );
    assert.ok(Math.abs(a.duration - 3) < 0.01);
    assert.deepEqual(
      net.seen.map((s) => new URL(s.url).host),
      ["api.deepgram.com", "api.cartesia.ai"],
    );
    assert.equal(v.id, "deepgram+cartesia", "the id says what spoke, for the manifest");
    assert.ok(voice.voiceUsd(v) > 0, "the fallback's spend counts toward the voice cap");
    assert.equal(warn.lines.length, 1);
    assert.match(warn.lines[0]!, /falling back to cartesia/);
    assert.doesNotMatch(warn.lines.join("\n"), /test-(dg|cart)-key/, "no key in the log line");
  } finally {
    env.restore();
    net.restore();
    warn.restore();
  }
});

test("without a Cartesia key the Deepgram error surfaces as before", async () => {
  const env = withEnv({ DEEPGRAM_API_KEY: "test-dg-key", CARTESIA_API_KEY: undefined });
  const net = fakeNet();
  try {
    const v = voice.pickVoice();
    assert.ok(v instanceof voice.DeepgramVoice);
    await assert.rejects(v.synthesize("s2", "Another scene that fails.", outDir()), /Deepgram rejected the API key/);
    assert.ok(net.seen.every((s) => !s.url.includes("cartesia")));
  } finally {
    env.restore();
    net.restore();
  }
});

test("the Cartesia request uses the bytes endpoint with the version header and a wav body", async () => {
  const env = withEnv({ ...KEYS, CARTESIA_VOICE_ID: undefined, CARTESIA_MODEL: undefined });
  const net = fakeNet();
  try {
    await voice.pickVoice().synthesize("s3", "The api answers.", outDir());
    const c = net.seen.find((s) => s.url.includes("cartesia"))!;
    assert.equal(c.url, "https://api.cartesia.ai/tts/bytes");
    assert.equal(c.headers["X-API-Key"], "test-cart-key");
    assert.equal(c.headers["Authorization"], "Bearer test-cart-key");
    assert.equal(c.headers["Cartesia-Version"], voice.CARTESIA_VERSION);
    assert.equal(c.headers["Content-Type"], "application/json");
    assert.equal(c.body.model_id, "sonic-3.6");
    assert.deepEqual(c.body.voice, { id: voice.CARTESIA_DEFAULT_VOICE });
    assert.equal(c.body.transcript, "The API answers.", "acronyms are spelled out as for Deepgram");
    assert.equal(c.body.language, "en");
    assert.deepEqual(c.body.output_format, { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 });
  } finally {
    env.restore();
    net.restore();
  }
});

test("Cartesia timings cover every script word and fit the recording", async () => {
  const env = withEnv({ CARTESIA_API_KEY: "k", CARTESIA_VOICE_ID: undefined, CARTESIA_MODEL: undefined });
  const net = fakeNet({ wavSeconds: 4 });
  try {
    const a = await new voice.CartesiaVoice().synthesize("s4", "One two three four five six.", outDir());
    assert.equal(a.words.length, 6);
    for (let i = 0; i < a.words.length; i++) {
      assert.ok(a.words[i]!.end > a.words[i]!.start);
      if (i) assert.ok(a.words[i]!.start >= a.words[i - 1]!.start, "words stay in spoken order");
    }
    assert.ok(Math.abs(a.words[5]!.end - 4) < 0.001, "the last word ends where the recording ends");
  } finally {
    env.restore();
    net.restore();
  }
});

test("CARTESIA_VOICE_ID and CARTESIA_MODEL override the voice and the model", async () => {
  const env = withEnv({ CARTESIA_API_KEY: "k", CARTESIA_VOICE_ID: "voice-1", CARTESIA_MODEL: "sonic-9" });
  const net = fakeNet();
  try {
    const v = new voice.CartesiaVoice();
    assert.deepEqual([v.model, v.voice], ["sonic-9", "voice-1"]);
    await v.synthesize("s5", "Override check.", outDir());
    const c = net.seen.find((s) => s.url.includes("cartesia"))!;
    assert.equal(c.body.model_id, "sonic-9");
    assert.deepEqual(c.body.voice, { id: "voice-1" });
  } finally {
    env.restore();
    net.restore();
  }
});

test("cartesia can be picked directly, needs its key, and silence stays the default without keys", async () => {
  const env = withEnv({ DEEPGRAM_API_KEY: undefined, CARTESIA_API_KEY: "k", CARTESIA_VOICE_ID: undefined, CARTESIA_MODEL: undefined });
  const net = fakeNet();
  try {
    assert.equal(voice.pickVoice("cartesia").id, "cartesia");
    const a = await voice.pickVoice("cartesia").synthesize("s6", "Straight to Cartesia.", outDir());
    assert.equal(a.words.length, 3);
    assert.ok(net.seen.every((s) => !s.url.includes("deepgram")));
    assert.equal(voice.pickVoice().id, "silent");
  } finally {
    env.restore();
    net.restore();
  }
  const bare = withEnv({ CARTESIA_API_KEY: undefined });
  try {
    assert.throws(() => new voice.CartesiaVoice(), /CARTESIA_API_KEY is not set/);
  } finally {
    bare.restore();
  }
});

test("estimated timings still spread words at speaking pace, and fitWords stretches them onto a recording", async () => {
  const { words, duration } = voice.estimateWords("Hello world.");
  assert.equal(words.length, 2);
  assert.ok(duration > words[1]!.end);
  const fitted = voice.fitWords(words, 10);
  assert.ok(Math.abs(fitted[1]!.end - 10) < 1e-9);
  assert.deepEqual(voice.fitWords([], 5), []);
  const silent = await new voice.SilentVoice().synthesize("s", "Hello world.");
  assert.equal(silent.duration, duration, "the refactor did not change silent timings");
  assert.deepEqual(silent.words, words);
});
