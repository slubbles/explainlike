import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { museImage, samDetect, type CostLedger } from "@metual/models";

/**
 * Icon packs are a plugin point. A pack is a folder with manifest.json:
 *   { "id": "doodle", "icons": { "database": { "file": "database.png", "aliases": ["db", "sql"], "prompt": "..." } } }
 * Icons are white-on-transparent PNGs so any theme can tint or invert them.
 */
export interface IconEntry { file: string; aliases?: string[]; prompt?: string }
export interface IconPack { id: string; dir: string; icons: Record<string, IconEntry> }

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_PACK_DIR = path.resolve(here, "../packs/doodle");

export function loadIconPack(dir = BUILTIN_PACK_DIR): IconPack {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  return { id: m.id, dir, icons: m.icons };
}

/** Merge packs; later packs override earlier ones. */
export function mergePacks(packs: IconPack[]): IconPack {
  const out: IconPack = { id: packs.map((p) => p.id).join("+"), dir: "", icons: {} };
  for (const p of packs) for (const [k, v] of Object.entries(p.icons)) out.icons[k] = { ...v, file: path.resolve(p.dir, v.file) };
  return out;
}

export function resolveIcon(pack: IconPack, name: string): string | undefined {
  const n = name.toLowerCase().trim();
  if (pack.icons[n]) return n;
  for (const [k, v] of Object.entries(pack.icons)) if (v.aliases?.includes(n)) return k;
  return undefined;
}

export function iconCatalog(pack: IconPack): string {
  return Object.entries(pack.icons).map(([k, v]) => (v.aliases?.length ? `${k} (${v.aliases.slice(0, 3).join(", ")})` : k)).join(", ");
}

export const doodlePrompt = (subject: string) =>
  `Minimal hand drawn doodle of ${subject}. White monoline marker outline only, slightly wobbly strokes like a whiteboard sketch, pure solid black background, no fill, no shading, no text, no letters, single object centered with lots of empty space around it.`;

/**
 * Muse Image draws the doodle, SAM 3.1 finds the object so stray marks are
 * cropped away, then a luminance key turns white-on-black into a transparent PNG.
 */
export async function makeDoodleIcon(opts: { ledger: CostLedger; name: string; subject: string; samPhrase?: string }): Promise<{ png: Buffer; sam: "box" | "none" }> {
  const raw = await museImage({ ledger: opts.ledger, step: `icon:${opts.name}`, prompt: doodlePrompt(opts.subject) });
  const png = await sharp(raw).png().toBuffer();
  const meta = await sharp(png).metadata();
  const W = meta.width!, H = meta.height!;
  let crop = { left: 0, top: 0, width: W, height: H };
  let samUsed: "box" | "none" = "none";
  try {
    const boxes = await samDetect({ ledger: opts.ledger, step: `sam:${opts.name}`, image: png, mime: "image/png", phrase: opts.samPhrase ?? opts.name });
    const b = boxes[0];
    if (b && b.confidence > 0.3) {
      const sx = W / (b.w || W), sy = H / (b.h || H), pad = 24;
      const left = Math.max(0, Math.floor(b.x1 * sx) - pad), top = Math.max(0, Math.floor(b.y1 * sy) - pad);
      crop = { left, top, width: Math.min(W - left, Math.ceil((b.x2 - b.x1) * sx) + 2 * pad), height: Math.min(H - top, Math.ceil((b.y2 - b.y1) * sy) + 2 * pad) };
      samUsed = "box";
    }
  } catch { /* SAM optional: fall back to full frame */ }
  return { png: await keyToAlpha(png, crop), sam: samUsed };
}

/** white strokes on black -> white with alpha, trimmed, max 512px */
export async function keyToAlpha(png: Buffer, crop?: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  let img = sharp(png);
  if (crop) img = img.extract(crop);
  const { data, info } = await img.greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const a = Math.max(0, Math.min(255, ((data[i] - 30) * 255) / (190 - 30)));
    out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255; out[i * 4 + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** Cache for icons generated on demand (names not in the pack). */
export const ICON_CACHE = process.env.METUAL_ICON_CACHE ?? path.join(os.homedir(), ".cache", "metual", "icons");
