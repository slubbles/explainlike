/**
 * Renders the sign-in email copy icon (public/email/copy.png, 28x28 = 14x14 @2x)
 * from the same drawing as the v2 design's button icon (Lucide "copy", white on
 * transparent for the blue button). Email clients block SVG, so the OTP email
 * embeds this PNG with an <img> tag instead. Run again after changing the icon:
 * pnpm email-copy:generate
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "email", "copy.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="9" width="13" height="13" rx="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const info = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${info.width}x${info.height}, ${info.size} bytes)`);
