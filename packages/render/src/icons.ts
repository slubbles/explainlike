import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { museImage, samDetect, type CostLedger } from "@explanimate/models";
import { userCacheDir } from "@explanimate/core";

/**
 * Icon packs are a plugin point. A pack is a folder with manifest.json:
 *   { "id": "doodle", "icons": { "database": { "file": "database.png", "aliases": ["db", "sql"], "prompt": "..." } } }
 * Icons are white-on-transparent PNGs so any theme can tint or invert them.
 */
export interface IconEntry { file: string; aliases?: string[]; prompt?: string }
export interface IconPack { id: string; dir: string; icons: Record<string, IconEntry>; components: PackComponent[] }

/**
 * A component pack adds building blocks a repo can be made of (a D1 database,
 * an S3-style bucket...). Each one says how to spot it in a repo (file names,
 * or a regex inside matching files) and how to draw it (kind, keyword, icon).
 * Detected blocks are handed to the architecture pass as hints with their
 * evidence files; the model still has to cite real files for every box.
 */
export interface PackComponent {
  id: string;
  name: string;
  kind: string;
  layer: string;
  keyword: string;
  icon: string;
  hint?: string;
  detect: { files?: string[]; contains?: { file: string; pattern: string }[] };
}
export interface DetectedComponent { pack: string; component: PackComponent; evidence: string[] }

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_PACK_DIR = path.resolve(here, "../packs/doodle");

export const PACKS_DIR = path.resolve(here, "../packs");

/** Built-in packs other than the base doodle icons (cloudflare, cloud-generic). */
export function builtinPackIds(): string[] {
  return fs.readdirSync(PACKS_DIR).filter((d) => d !== "doodle" && fs.existsSync(path.join(PACKS_DIR, d, "manifest.json"))).sort();
}

/** Load a pack from a folder, or a built-in pack by id. */
export function loadIconPack(dirOrId = BUILTIN_PACK_DIR): IconPack {
  const dir = !dirOrId.includes("/") && fs.existsSync(path.join(PACKS_DIR, dirOrId, "manifest.json")) ? path.join(PACKS_DIR, dirOrId) : dirOrId;
  const file = path.join(dir, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`no pack at ${dirOrId} (expected ${file}; built-in packs: ${builtinPackIds().join(", ")})`);
  return parsePack(JSON.parse(fs.readFileSync(file, "utf8")), dir);
}

/** Validate a pack manifest. Throws with every problem listed, so pack authors see them all at once. */
export function parsePack(m: any, dir: string): IconPack {
  const errs: string[] = [];
  if (typeof m?.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(m.id)) errs.push("id must be lowercase kebab-case");
  const icons: Record<string, IconEntry> = m?.icons ?? {};
  for (const [k, v] of Object.entries(icons)) {
    if (typeof v?.file !== "string") errs.push(`icons.${k}.file missing`);
    else if (dir && !fs.existsSync(path.resolve(dir, v.file))) errs.push(`icons.${k}.file ${v.file} not found`);
  }
  const components: PackComponent[] = m?.components ?? [];
  const seen = new Set<string>();
  for (const c of components) {
    const at = `components.${c?.id ?? "?"}`;
    for (const f of ["id", "name", "kind", "layer", "keyword", "icon"] as const) if (typeof c?.[f] !== "string" || !c[f]) errs.push(`${at}.${f} missing`);
    if (seen.has(c?.id)) errs.push(`${at} duplicate id`);
    seen.add(c?.id);
    if (c?.keyword && (c.keyword !== c.keyword.toLowerCase() || c.keyword.split(/\s+/).length > 3)) errs.push(`${at}.keyword must be 1 to 3 lowercase words`);
    const rules = [...(c?.detect?.files ?? []), ...(c?.detect?.contains ?? []).flatMap((x) => [x.file, x.pattern])];
    if (!rules.length) errs.push(`${at}.detect needs files or contains rules`);
    for (const r of rules) { try { new RegExp(r, "m"); } catch { errs.push(`${at}: bad regex ${r}`); } }
  }
  if (errs.length) throw new Error(`invalid pack ${m?.id ?? dir}:\n  ${errs.join("\n  ")}`);
  return { id: m.id, dir, icons, components };
}

/** Merge packs; later packs override earlier ones (icons by name, components by id). */
export function mergePacks(packs: IconPack[]): IconPack {
  const out: IconPack = { id: packs.map((p) => p.id).join("+"), dir: "", icons: {}, components: [] };
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.icons)) out.icons[k] = { ...v, file: path.resolve(p.dir, v.file) };
    for (const c of p.components) out.components = [...out.components.filter((x) => x.id !== c.id), c];
  }
  return out;
}

/** Which pack components does this repo use? Only reads files whose path matches a rule, at most `maxReads` per rule. */
/** Tests, fixtures and examples mention building blocks without using them. */
const NOT_EVIDENCE = /(^|\/)(tests?|__tests__|fixtures?|examples?|e2e)\/|\.(test|spec)\.[a-z]+$/i;

export function detectComponents(packs: IconPack[], allFiles: string[], read: (p: string) => string, maxReads = 200): DetectedComponent[] {
  const files = allFiles.filter((f) => !NOT_EVIDENCE.test(f));
  const found: DetectedComponent[] = [];
  for (const p of packs) for (const c of p.components) {
    const ev = new Set<string>();
    for (const r of c.detect.files ?? []) { const re = new RegExp(r); for (const f of files) if (re.test(f) && ev.size < 3) ev.add(f); }
    for (const rule of c.detect.contains ?? []) {
      const fre = new RegExp(rule.file), pre = new RegExp(rule.pattern, "m");
      let reads = 0;
      for (const f of files) {
        if (ev.size >= 3 || reads >= maxReads) break;
        if (!fre.test(f)) continue;
        reads++;
        if (pre.test(read(f))) ev.add(f);
      }
    }
    if (ev.size) found.push({ pack: p.id, component: c, evidence: [...ev] });
  }
  return found;
}

/** The hint block the architecture pass gets. */
export function packHints(found: DetectedComponent[]): string {
  if (!found.length) return "";
  return [
    "Building blocks that component packs detected in this repo (a hint, not a requirement: include one only if it matters to the story, cite real files, and prefer these names, kinds, keywords and icons when you do):",
    ...found.map((d) => `- ${d.component.name}: kind ${d.component.kind}, layer ${d.component.layer}, keyword "${d.component.keyword}", icon ${d.component.icon}; seen in ${d.evidence.join(", ")}${d.component.hint ? ` (${d.component.hint})` : ""}`),
  ].join("\n");
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
export const ICON_CACHE = process.env.EXPLANIMATE_ICON_CACHE ?? userCacheDir("icons");
