import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeepgramVoice, wavDuration } from "../src/index.ts";

/** A minimal valid 24 kHz mono 16-bit wav of `samples` frames. */
function wav(samples = 2400, byteRate = 48000): Buffer {
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test("wavDuration survives a truncated fmt chunk and a zero byte rate", () => {
  const short = Buffer.concat([Buffer.from("RIFFxxxxWAVEfmt "), Buffer.alloc(4)]);
  short.writeUInt32LE(500, 16);
  assert.doesNotThrow(() => wavDuration(short));
  assert.ok(Number.isFinite(wavDuration(short)));
  assert.equal(wavDuration(wav(2400, 0)), 0);
  assert.equal(wavDuration(wav(2400)), 4800 / 48000);
});

test("synthesize tolerates a corrupt cache entry and leaves no half files", async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-tts-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-tts-out-"));
  process.env.EXPLANIMATE_TTS_CACHE = cache;
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: string) => {
    seen.push(String(u));
    if (String(u).includes("/speak")) return new Response(wav(), { status: 200 });
    return Response.json({
      metadata: { duration: 1 },
      results: { channels: [{ alternatives: [{ transcript: "hello there", words: [] }] }] },
    });
  }) as typeof fetch;
  try {
    // reload the module so CACHE picks up the temp dir
    const { DeepgramVoice: V } = await import(`../src/index.ts?cache=${cache}`);
    const v = new V({ apiKey: "test" });
    const first = await v.synthesize("s1", "hello there", out);
    assert.equal(first.sceneId, "s1");
    assert.ok(fs.existsSync(path.join(out, "s1.wav")));
    assert.deepEqual(
      fs.readdirSync(cache).filter((f) => f.endsWith(".tmp")),
      [],
      "no temp files left behind",
    );
    const json = fs.readdirSync(cache).find((f) => f.endsWith(".json"))!;
    // a crashed run's half-written entry is remade, not fatal
    fs.writeFileSync(path.join(cache, json), "{broken");
    const calls = seen.length;
    const second = await v.synthesize("s1", "hello there", out);
    assert.equal(second.sceneId, "s1");
    assert.ok(seen.length > calls, "a corrupt entry is synthesised again");
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(cache, json), "utf8")));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.EXPLANIMATE_TTS_CACHE;
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("the cache key includes the recogniser model", async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-tts-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-tts-out-"));
  process.env.EXPLANIMATE_TTS_CACHE = cache;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: string) => {
    if (String(u).includes("/speak")) return new Response(wav(), { status: 200 });
    return Response.json({
      metadata: { duration: 1 },
      results: { channels: [{ alternatives: [{ transcript: "hello there", words: [] }] }] },
    });
  }) as typeof fetch;
  try {
    const { DeepgramVoice: V } = await import(`../src/index.ts?cache=${cache}`);
    const v = new V({ apiKey: "test" });
    process.env.EXPLANIMATE_STT = "nova-2";
    await v.synthesize("s1", "hello there", out);
    process.env.EXPLANIMATE_STT = "nova-3";
    await v.synthesize("s1", "hello there", out);
    assert.equal(fs.readdirSync(cache).filter((f) => f.endsWith(".json")).length, 2, "a different STT model does not reuse stored timings");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.EXPLANIMATE_TTS_CACHE;
    delete process.env.EXPLANIMATE_STT;
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// keep the direct import used (type surface), the cache-dir tests reload with a query above
assert.equal(new DeepgramVoice({ apiKey: "test" }).id, "deepgram");
