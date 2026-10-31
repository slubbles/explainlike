import type { Film, FText } from "./film.js";
import { textWidth } from "./measure.js";

/** Camera viewBox at time t, the same easing the stage uses. */
export function cameraAt(film: Film, t: number) {
  const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const K = film.camera;
  let cur = { x: K[0].x, y: K[0].y, w: K[0].w, h: K[0].h };
  for (let i = 1; i < K.length; i++) {
    const k = K[i];
    if (t < k.t) break;
    const p = k.move > 0 ? ease(Math.min(1, Math.max(0, (t - k.t) / k.move))) : 1;
    cur = { x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, w: cur.w + (k.w - cur.w) * p, h: cur.h + (k.h - cur.h) * p };
  }
  return cur;
}

/**
 * Texts that are cut off by the frame edge when they finish appearing
 * (after any camera move already under way has settled). A label the viewer
 * cannot read whole looks like a rendering bug.
 */
export function offFrameTexts(film: Film, margin = 8): { id: string; text: string; t: number }[] {
  const out: { id: string; text: string; t: number }[] = [];
  for (const e of film.elements) {
    if (e.k !== "text") continue;
    const tx = e as FText;
    let t = tx.t0 + tx.dur;
    for (const k of film.camera) if (k.t <= t && k.t + k.move > t) t = k.t + k.move;
    const cam = cameraAt(film, t + 0.01);
    const w = textWidth(tx.text, tx.size), a = tx.anchor ?? "start";
    const x0 = a === "middle" ? tx.x - w / 2 : a === "end" ? tx.x - w : tx.x;
    const sx = film.width / cam.w;
    const left = (x0 - cam.x) * sx, right = (x0 + w - cam.x) * sx;
    const top = (tx.y - tx.size * 0.95 - cam.y) * sx, bottom = (tx.y + tx.size * 0.3 - cam.y) * sx;
    if (left < margin || right > film.width - margin || top < margin || bottom > film.height - margin) out.push({ id: tx.id, text: tx.text, t });
  }
  return out;
}

/**
 * Scenes whose on-screen captions do not spell out the narration word for word,
 * or show a word before or after it is spoken. Captions that drift from the
 * voice read as a bug, so the pipeline refuses to ship them.
 */
export function captionMismatches(film: Film, scenes: { id: string; narration: string }[]): { scene: string; said: string; shown: string }[] {
  const out: { scene: string; said: string; shown: string }[] = [];
  for (const s of scenes) {
    const caps = film.captions.filter((c) => c.scene === s.id);
    const said = s.narration.replace(/\s+/g, " ").trim();
    const shown = caps.flatMap((c) => c.words.map((w) => w.w)).join(" ");
    const timed = caps.every((c) => c.words.every((w, i) => w.s >= c.t0 - 1e-6 && w.s < c.t1 + 1e-6 && (i === 0 || w.s >= c.words[i - 1].s - 1e-6)));
    if (shown !== said || !timed) out.push({ scene: s.id, said, shown: timed ? shown : `${shown} (words shown outside their caption)` });
  }
  return out;
}
