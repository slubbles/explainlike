/**
 * Draws the social share image (public/og.png, 1200x630) from an inline SVG: black stage,
 * blue gradient accents and the product name, matching the landing page. No logos.
 * Run again after changing the copy: pnpm og:generate
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "og.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="80%">
      <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#1d4ed8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#4d8dff"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#000"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="80" y="268" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="104" font-weight="700" letter-spacing="-2" fill="#fafafa">Explanimate</text>
  <rect x="84" y="300" width="200" height="10" rx="5" fill="url(#bar)"/>
  <text x="80" y="392" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="34" fill="#a1a1aa">Whiteboard explainer videos from any link or topic</text>
  <text x="80" y="542" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="30" fill="#71717a">explanimate.co</text>
  <g fill="none" stroke="#e4e4e7" stroke-width="6" stroke-linecap="round">
    <rect x="864" y="140" width="256" height="186" rx="18"/>
    <path d="M944 326 L944 366 M1040 326 L1040 366 M912 366 L1072 366"/>
  </g>
  <path d="M975 192 L1035 233 L975 274 Z" fill="#4d8dff"/>
</svg>`;

const info = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${info.width}x${info.height}, ${info.size} bytes)`);
