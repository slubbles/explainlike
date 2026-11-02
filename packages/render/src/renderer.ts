/**
 * Picks how a film becomes an mp4: the Skia renderer (default) or the original headless Chrome one,
 * set with EXPLANIMATE_RENDERER=skia|chrome. Skia falls back to Chrome if it cannot load or fails, so a
 * render never dies on the faster path. The video encoder is NVIDIA's NVENC when it really works on this
 * machine, else libx264 at the same quality (EXPLANIMATE_ENCODER=nvenc|x264 forces one).
 */
import { spawnSync } from "node:child_process";
import type { Film } from "./film.js";
import type { SfxCue } from "./music.js";
import { captureFrames, mp4Encoder, NVENC_ARGS, X264_ARGS, type CaptionSpot } from "./capture.js";

export type RendererId = "skia" | "chrome";
export const DEFAULT_RENDERER: RendererId = "skia";

/** The renderer asked for in the environment; anything unrecognised means the default. */
export function rendererChoice(env: Record<string, string | undefined> = process.env): RendererId {
  const v = env.EXPLANIMATE_RENDERER?.trim().toLowerCase();
  return v === "chrome" || v === "skia" ? v : DEFAULT_RENDERER;
}

/** Why Skia cannot run here (its native module will not load), or undefined when it can. */
export async function skiaUnavailable(load: () => Promise<unknown> = () => import("@napi-rs/canvas")): Promise<string | undefined> {
  try { await load(); return undefined; } catch (e) { return `skia unavailable (${(e as Error).message.split("\n")[0]})`; }
}

let nvencWorks: boolean | undefined;
/**
 * The H.264 settings to use. ffmpeg lists h264_nvenc even on machines without an NVIDIA GPU, so a tiny
 * test encode with the real settings decides, once per process.
 */
export function videoCodec(env: Record<string, string | undefined> = process.env, probe = nvencProbe): { name: "h264_nvenc" | "libx264"; args: string[] } {
  const want = env.EXPLANIMATE_ENCODER?.trim().toLowerCase();
  if (want === "x264") return { name: "libx264", args: X264_ARGS };
  if (want === "nvenc" || (probe === nvencProbe ? (nvencWorks ??= probe()) : probe())) return { name: "h264_nvenc", args: NVENC_ARGS };
  return { name: "libx264", args: X264_ARGS };
}

function nvencProbe() {
  const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:r=24:d=0.2", ...NVENC_ARGS, "-pix_fmt", "yuv420p", "-f", "null", "-"], { timeout: 15_000 });
  return r.status === 0;
}

export interface RenderedFilm {
  renderer: RendererId;
  codec: string;
  /** set when Skia was asked for but Chrome did the render, with the reason */
  fellBack?: string;
  cap: { html: string; total: number; captions: CaptionSpot[] };
  /** resolves when the mp4 is finished; frames are encoded while they are drawn */
  encoded: Promise<void>;
}

/**
 * Draw every frame of `film` and encode it to `mp4` with the narration, music and sound effects. Frames the
 * frame check reads are left in `frameDir` as JPEGs whichever renderer runs.
 */
export async function renderFilm(film: Film, frameDir: string, mp4: string, o: {
  renderer?: RendererId; workers?: number; audio?: string; music?: boolean; cues?: SfxCue[];
  onProgress?: (done: number, total: number) => void;
}): Promise<RenderedFilm> {
  const codec = videoCodec();
  const want = o.renderer ?? rendererChoice();
  let fellBack: string | undefined;
  const enc = (raw: boolean) => mp4Encoder(film.fps, mp4, { duration: film.duration, workDir: frameDir, audio: o.audio, music: o.music, cues: o.cues, video: codec.args, raw: raw ? { width: film.width, height: film.height } : undefined });
  if (want === "skia") {
    fellBack = await skiaUnavailable();
    if (!fellBack) {
      const encoder = enc(true);
      try {
        const { captureFramesSkia } = await import("./skia.js");
        const cap = await captureFramesSkia(film, frameDir, { workers: o.workers, hardwareEncoder: codec.name === "h264_nvenc", onFrame: encoder.frame, onProgress: o.onProgress });
        return { renderer: "skia", codec: codec.name, cap, encoded: encoder.done() };
      } catch (e) {
        encoder.abort();
        fellBack = `skia failed (${(e as Error).message.split("\n")[0]})`;
      }
    }
  }
  const encoder = enc(false);
  try {
    const cap = await captureFrames(film, frameDir, { workers: o.workers, onFrame: encoder.frame, onProgress: o.onProgress });
    return { renderer: "chrome", codec: codec.name, fellBack, cap, encoded: encoder.done() };
  } catch (e) {
    encoder.abort();
    throw e;
  }
}
