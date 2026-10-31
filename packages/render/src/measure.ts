import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = path.resolve(here, "../assets/fonts");
let hand: opentype.Font | undefined;

/** Width of text set in Excalifont at a given size, measured from the real font. */
export function textWidth(text: string, size: number): number {
  if (!hand) {
    const buf = fs.readFileSync(path.join(FONT_DIR, "Excalifont-Regular.ttf"));
    hand = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return hand.getAdvanceWidth(text, size);
}

export function fontDataUrl(file: string, mime: string) {
  return `data:${mime};base64,${fs.readFileSync(path.join(FONT_DIR, file)).toString("base64")}`;
}
