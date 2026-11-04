import fs from "node:fs";
import path from "node:path";
import { JOBS_DIR } from "./jobs";

/** A WebVTT timestamp: hours, minutes, seconds, millis. */
const stamp = (s: number): string => {
  const t = Math.max(0, s);
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(Math.floor(t / 3600), 2)}:${p(Math.floor((t % 3600) / 60), 2)}:${p(Math.floor(t % 60), 2)}.${p(Math.floor((t % 1) * 1000), 3)}`;
};

interface FilmCaption {
  t0: unknown;
  t1: unknown;
  words?: { w?: unknown }[];
}

/** The job's captions as WebVTT, or undefined when the film has none yet (still rendering) or the id is bad. */
export function captionsVtt(id: string, dir: string = JOBS_DIR): string | undefined {
  if (!/^[a-f0-9]{12}$/.test(id)) return undefined;
  let captions: unknown;
  try {
    captions = (JSON.parse(fs.readFileSync(path.join(dir, id, "film.json"), "utf8")) as { captions?: unknown }).captions;
  } catch {
    return undefined;
  }
  if (!Array.isArray(captions)) return undefined;
  const cues: string[] = [];
  for (const c of captions as FilmCaption[]) {
    const t0 = Number(c?.t0);
    const t1 = Number(c?.t1);
    const text = Array.isArray(c?.words)
      ? c.words
          .map((w) => (typeof w?.w === "string" ? w.w : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || !text) continue;
    cues.push(`${stamp(t0)} --> ${stamp(t1)}\n${text.replace(/-->/g, "—")}`);
  }
  return cues.length ? `WEBVTT\n\n${cues.join("\n\n")}\n` : undefined;
}
