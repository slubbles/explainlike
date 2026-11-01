import fs from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * A quiet original music bed, made from scratch for each video (no samples, no third-party audio):
 * a warm pad, a soft bass and a gentle pluck arpeggio over Cmaj9, Am9, Fmaj7#11, G6sus at 84 bpm.
 */
export function makeBed(duration: number, out: string) {
  const SR = 44100, beat = 60 / 84, bar = 4 * beat, n = Math.ceil(SR * duration);
  const L = new Float32Array(n), R = new Float32Array(n);
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  // a small fixed random sequence, so the same length always gives the same bed
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // each harmonic is a rotating phasor (one multiply-add per sample instead of a sine): the same tone, about 10x faster
  const add = (f: number, at: number, len: number, attack: number, release: number, harm: number[], g: number, pan: number, decay = 0) => {
    const i0 = Math.round(at * SR), m = Math.min(n - i0, Math.round(len * SR));
    const K = harm.length, re = new Float64Array(K).fill(1), im = new Float64Array(K), cr = new Float64Array(K), ci = new Float64Array(K);
    for (let k = 0; k < K; k++) { const w = (2 * Math.PI * f * (k + 1)) / SR; cr[k] = Math.cos(w); ci[k] = Math.sin(w); }
    const gl = g * (1 - pan), gr = g * (1 + pan), fall = decay ? Math.exp(-decay / SR) : 1;
    let ex = 1;
    for (let i = 0; i < m; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < K; k++) {
        s += harm[k] * im[k];
        const r = re[k] * cr[k] - im[k] * ci[k];
        im[k] = re[k] * ci[k] + im[k] * cr[k];
        re[k] = r;
      }
      const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, (len - t) / release)) * ex;
      ex *= fall;
      L[i0 + i] += s * env * gl;
      R[i0 + i] += s * env * gr;
    }
  };
  const prog = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 64], [41, 48, 52, 57, 59], [43, 50, 55, 57, 62]];
  for (let t = 0, ci = 0; t < duration; t += bar, ci++) {
    const ch = prog[ci % 4];
    ch.forEach((m, k) => {
      add(hz(m), t, bar + 1.2, 0.9, 1.2, [1, 0.2, 0.05], 0.05, (k - 2) * 0.15);
      add(hz(m) * 1.003, t, bar + 1.2, 0.9, 1.2, [1, 0.2, 0.05], 0.04, -(k - 2) * 0.15);
    });
    add(hz(ch[0] - 12), t, bar, 0.05, 0.8, [1, 0.5, 0.2], 0.1, 0);
    const arp = [...ch.slice(1), ch[2] + 12];
    for (let s = 0; s < 8; s++) {
      const f = hz(arp[(s * 3 + ci) % arp.length] + 12);
      add(f, t + (s * beat) / 2, 0.9, 0.005, 0.85, [1, 0.25, 0.08], 0.06, rnd() * 0.4, 4);
      add(f, t + (s * beat) / 2 + beat * 0.75, 0.9, 0.005, 0.85, [1, 0.25, 0.08], 0.025, rnd() * 0.4, 4);
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  writeWav(L, R, SR, out, 0.5 / peak);
}

export interface SfxCue { t: number; kind: "pop" | "whoosh" }

/** The sound cues a film asks for, in time order, at most one every 0.35 s so a burst of parts is one pop. */
export function sfxCues(film: { elements: { t0: number; cue?: "pop" | "whoosh" }[]; duration: number }): SfxCue[] {
  const all = film.elements.flatMap((e) => (e.cue && e.t0 >= 0 && e.t0 < film.duration ? [{ t: e.t0, kind: e.cue }] : [])).sort((a, b) => a.t - b.t);
  const out: SfxCue[] = [];
  for (const c of all) if (!out.length || c.t - out[out.length - 1].t >= 0.35) out.push(c);
  return out;
}

/** Peak level of each effect, far under the voice (which peaks near -1.5 dBFS): about -25 dBFS for a pop, -28 for a whoosh. */
export const SFX_PEAK = { pop: 0.056, whoosh: 0.04 };

/**
 * Soft sound effects, synthesised here from sine waves and seeded noise (no samples, no third-party audio):
 * a pop is a 70 ms sine blip falling from 880 to 520 Hz, like a marker tapping the board; a whoosh is
 * 0.4 s of noise through a band-pass sweeping up from 300 Hz to 2.4 kHz, faded in and out.
 * Written at fixed levels (see SFX_PEAK), stereo 44.1 kHz.
 */
export function makeSfx(duration: number, cues: SfxCue[], out: string) {
  const SR = 44100, n = Math.ceil(SR * duration);
  const L = new Float32Array(n), R = new Float32Array(n);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  cues.forEach((c, k) => {
    const i0 = Math.round(c.t * SR), pan = ((k % 5) - 2) * 0.08;
    if (c.kind === "pop") {
      const m = Math.round(0.07 * SR);
      let ph = 0;
      for (let i = 0; i < m && i0 + i < n; i++) {
        const t = i / SR, f = 520 + 360 * Math.exp(-t / 0.012);
        ph += (2 * Math.PI * f) / SR;
        const v = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.018) * SFX_PEAK.pop;
        L[i0 + i] += v * (1 - pan); R[i0 + i] += v * (1 + pan);
      }
    } else {
      const m = Math.round(0.4 * SR);
      // a state-variable band-pass whose centre slides up, so the noise rises like air past the dot
      let lo = 0, bp = 0, peak = 0;
      const buf = new Float32Array(m);
      for (let i = 0; i < m; i++) {
        const t = i / 0.4 / SR, fc = 300 * 8 ** t, F = 2 * Math.sin((Math.PI * fc) / SR), Q = 1.4;
        const hi = rnd() - lo - bp / Q;
        bp += F * hi; lo += F * bp;
        buf[i] = bp * Math.sin(Math.PI * t) ** 2;
        peak = Math.max(peak, Math.abs(buf[i]));
      }
      for (let i = 0; i < m && i0 + i < n; i++) {
        const v = (buf[i] / (peak || 1)) * SFX_PEAK.whoosh;
        L[i0 + i] += v * (1 - pan * (1 - (2 * i) / m)); R[i0 + i] += v * (1 + pan * (1 - (2 * i) / m));
      }
    }
  });
  writeWav(L, R, SR, out, 1);
}

function writeWav(L: Float32Array, R: Float32Array, SR: number, out: string, scale: number) {
  const n = L.length, pcm = Buffer.alloc(n * 4), q = new Int16Array(pcm.buffer, pcm.byteOffset, n * 2);
  for (let i = 0; i < n; i++) {
    q[i * 2] = Math.max(-32767, Math.min(32767, Math.round(L[i] * scale * 32767)));
    q[i * 2 + 1] = Math.max(-32767, Math.min(32767, Math.round(R[i] * scale * 32767)));
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(out, Buffer.concat([h, pcm]));
}

/** Loudness targets: the voice at -16 LUFS, the bed 22 dB under it, and lower still while someone speaks. */
export const VOICE_LUFS = -16, BED_UNDER_DB = 22;

/**
 * ffmpeg audio graph for the final mix into the label [aout]: input `voice` (or none) and input `music`
 * (or none), by index. The voice is levelled to VOICE_LUFS; the bed fades in and out, sits BED_UNDER_DB
 * under the voice and ducks further while it speaks, through a sidechain.
 */
export function mixGraph(voice: number | undefined, music: number | undefined, duration: number, sfx?: number): string {
  const AF = "aresample=48000,aformat=channel_layouts=stereo", d = duration.toFixed(3);
  // the effects are short and already quiet, so they go in at their written level, after the ducking
  if (sfx !== undefined && voice === undefined && music === undefined) return `[${sfx}:a]${AF},apad=whole_dur=${d},atrim=0:${d}[aout]`;
  if (sfx !== undefined) {
    const rest = mixGraph(voice, music, duration).replace(/\[aout\]$/, "[pre]").replace(/,alimiter=limit=0\.95\[pre\]$/, "[pre]");
    return `${rest};[${sfx}:a]${AF},apad=whole_dur=${d},atrim=0:${d}[fx];[pre][fx]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]`;
  }
  const v = voice === undefined ? "" : `[${voice}:a]${AF},apad=whole_dur=${d},atrim=0:${d},loudnorm=I=${VOICE_LUFS}:TP=-1.5:LRA=11,${AF}`;
  if (music === undefined) return `${v}[aout]`;
  const bed = `[${music}:a]${AF},atrim=0:${d},loudnorm=I=${VOICE_LUFS - BED_UNDER_DB}:TP=-9:LRA=7,${AF},afade=t=in:d=2,afade=t=out:st=${Math.max(0, duration - 2.5).toFixed(2)}:d=2.5`;
  if (voice === undefined) return `${bed},alimiter=limit=0.95[aout]`;
  return [
    `${v},asplit=2[voice][sc]`,
    `${bed}[mus]`,
    "[mus][sc]sidechaincompress=threshold=0.02:ratio=4:attack=20:release=400[duck]",
    "[voice][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]",
  ].join(";");
}

/** Integrated loudness (LUFS) of an audio or video file's audio, measured by ffmpeg's EBU R128 meter. */
export function loudness(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  if (!m) throw new Error(`no loudness reading for ${file}`);
  return Number(m[1]);
}
