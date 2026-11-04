/**
 * Renders the sign-in email logo (public/email/logo.png, 96x96 = 48x48 @2x) from the
 * same drawing as components/Logo.tsx ("Node path"). Email clients block SVG, so the
 * OTP email embeds this PNG with an <img> tag instead. Run again after changing the
 * logo: pnpm email-logo:generate
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "email", "logo.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="explanimate-logo-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0064e0"/>
      <stop offset="1" stop-color="#0082fb"/>
    </linearGradient>
  </defs>
  <rect x=".75" y=".75" width="30.5" height="30.5" rx="8" fill="#141414" stroke="#2a2a2a" stroke-width="1.5"/>
  <rect x="6" y="7" width="8" height="7" rx="2" fill="none" stroke="#ededed" stroke-width="2"/>
  <rect x="18" y="18" width="8" height="7" rx="2" fill="url(#explanimate-logo-g)"/>
  <path d="M10 14 V21.5 H18" fill="none" stroke="#ededed" stroke-width="2" stroke-linecap="round"/>
</svg>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const info = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${info.width}x${info.height}, ${info.size} bytes)`);
