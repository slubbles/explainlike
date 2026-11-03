import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = path.resolve(here, "../assets/fonts");
export const HAND_FONTS = {
  excalifont: { ttf: "Excalifont-Regular.ttf", woff2: "Excalifont-Regular.woff2" },
  shantell: { ttf: "ShantellSans-Informal.ttf", woff2: "ShantellSans-Informal.woff2" },
} as const;
export type HandFont = keyof typeof HAND_FONTS;
const loaded = new Map<HandFont, opentype.Font>();
let current: HandFont = "excalifont";

/** Pick the handwriting font every later measurement uses (set once per video). */
export function useHandFont(f: HandFont) {
  current = f;
}

/** Width of text set in the current handwriting font at a given size, measured from the real font. */
export function textWidth(text: string, size: number): number {
  let font = loaded.get(current);
  if (!font) {
    const buf = fs.readFileSync(path.join(FONT_DIR, HAND_FONTS[current].ttf));
    font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    loaded.set(current, font);
  }
  return font.getAdvanceWidth(text, size);
}

export function fontDataUrl(file: string, mime: string) {
  return `data:${mime};base64,${fs.readFileSync(path.join(FONT_DIR, file)).toString("base64")}`;
}
