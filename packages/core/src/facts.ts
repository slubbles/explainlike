import { z } from "zod";

/**
 * The facts manifest: every number the narration may state, each with its provenance. A wrong number
 * poisons trust in the whole explanation, so a number with no entry here is cut. Built from the repo:
 * code facts, commit and release dates, stars (adoption only), README figures, and line counts.
 */
export const FactKind = z.enum(["code", "commit", "release", "stars", "benchmark", "lines", "fact"]);
export type FactKind = z.infer<typeof FactKind>;

export const FactAnchor = z.object({
  value: z.string().min(1).max(160).describe("the figure exactly as it may be said ('about 600 lines', '12345 stars')"),
  source_url: z.string().min(1).max(500).describe("where it was read: a blob, commit, release or API URL"),
  retrieved_at: z.string().min(1).max(40).describe("ISO timestamp of when it was read"),
  commit: z.string().max(80).describe("full commit hash the value holds at, or empty when not from a repo"),
  kind: FactKind,
  note: z.string().max(200).optional().describe("method or claim context ('source files only, tests excluded')"),
});
export type FactAnchor = z.infer<typeof FactAnchor>;

export const FactsManifest = z.array(FactAnchor);
export type FactsManifest = z.infer<typeof FactsManifest>;

/** A digit number in running text, with its numeric value (k/m/b scales applied). */
export interface DigitNumber {
  raw: string;
  value: number;
}

// a standalone number, not a name like d1 or r2: the digit must not follow a letter or digit
const DIGITS = /(^|[^a-z0-9])(\d[\d,]*(?:\.\d+)?)\s*(%|x\b|k\b|m\b|b\b|ms\b|s\b)?/gi;
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

export function digitNumbers(text: string): DigitNumber[] {
  const out: DigitNumber[] = [];
  for (const m of text.matchAll(DIGITS)) {
    const scale = SCALE[(m[3] ?? "").toLowerCase()] ?? 1;
    const value = Number(m[2].replace(/,/g, "")) * scale;
    if (Number.isFinite(value)) out.push({ raw: m[0].trim(), value });
  }
  return out;
}

/** Every numeric value an anchor vouches for, read from its value text ("v2.1.0 (2026-03-01)" vouches for 2, 1, 0 and 2026). */
export function anchorNumbers(a: FactAnchor): number[] {
  return digitNumbers(a.value).map((d) => d.value);
}

/** The anchor vouching for a stated number, if any. */
export function manifestHas(manifest: FactsManifest, value: number): FactAnchor | undefined {
  return manifest.find((a) => anchorNumbers(a).some((n) => n === value));
}

/** File paths and `code symbols` named in narration: the non-number anchors of a repo explanation. */
export function codeFactsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`\n]{1,60})`/g)) out.add(m[1].trim().toLowerCase());
  for (const m of text.matchAll(/\b[\w.-]+\/(?:[\w.-]+\/)*[\w.-]+\b/g)) out.add(m[0].toLowerCase());
  for (const m of text.matchAll(/\b[\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|c|h|cc|cpp|java|kt|rb|php|cs|swift|md|json|ya?ml|toml)\b/g))
    out.add(m[0].toLowerCase());
  return [...out].filter(Boolean);
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|php|cs|swift|scala|ex|exs|c|h|cc|cpp|hpp|vue|svelte)$/i;
const NOT_SOURCE =
  /(test|spec|__tests__|e2e|cypress|fixture|example|docs?|vendor|dist|build|out|node_modules|generated|\.min\.|\.d\.ts|third_party)/i;

/** Non-empty lines across source files, the only line count the video may state. */
export function countSourceLines(files: string[], read: (p: string, max?: number) => string): { lines: number; files: number } {
  let lines = 0,
    n = 0;
  for (const f of files) {
    if (!CODE_EXT.test(f) || NOT_SOURCE.test(f)) continue;
    const t = read(f, 1_000_000);
    if (!t) continue;
    n++;
    lines += t.split("\n").filter((l) => l.trim()).length;
  }
  return { lines, files: n };
}

/** An honest round: "about 600 lines", never "exactly 612". */
export function roundLines(n: number): number {
  if (n < 50) return Math.round(n / 5) * 5;
  if (n < 200) return Math.round(n / 10) * 10;
  if (n < 1000) return Math.round(n / 50) * 50;
  return Math.round(n / 100) * 100;
}

// a figure that reads as a performance claim: a ratio or unit, or claim words next to it
const CLAIM_NEAR =
  /(faster|slower|speed-?up|latency|throughput|ops|requests?\/(s|sec)|benchmark|efficient|cheaper|lighter|heavier|smaller|bigger|\bx\b|%|\bms\b|\bs\b)/i;

function benchmarkNear(text: string, index: number): boolean {
  return CLAIM_NEAR.test(text.slice(Math.max(0, index - 25), index + 25));
}

export interface ManifestSources {
  repoUrl: string;
  commit?: string;
  commitDate?: string;
  readme?: string;
  digestText?: string;
  files?: string[];
  read?: (p: string, max?: number) => string;
  stars?: number;
  release?: { tag: string; date: string };
  retrievedAt?: string;
}

/**
 * The manifest for one repo at one commit: line count, commit and release dates, stars, README
 * figures (benchmark-looking ones marked as claims), and numbers from the digest's code excerpts.
 * Entries dedupe by value and kind, so the same figure stated twice is still one anchor.
 */
export function buildFactsManifest(o: ManifestSources): FactsManifest {
  const at = o.retrievedAt ?? new Date().toISOString();
  const commit = o.commit && /^[0-9a-f]{4,}$/i.test(o.commit) ? o.commit : "";
  const out: FactAnchor[] = [];
  const seen = new Set<string>();
  const add = (a: FactAnchor) => {
    const k = `${a.kind} ${a.value.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };
  const tree = commit ? `${o.repoUrl}/tree/${commit}` : o.repoUrl;
  if (o.files && o.read) {
    const { lines } = countSourceLines(o.files, o.read);
    if (lines > 0)
      add({
        value: `about ${roundLines(lines)} lines`,
        source_url: tree,
        retrieved_at: at,
        commit,
        kind: "lines",
        note: "non-empty lines in source files, excluding tests, docs, examples and generated files",
      });
  }
  if (o.commitDate)
    add({
      value: o.commitDate.slice(0, 10),
      source_url: commit ? `${o.repoUrl}/commit/${commit}` : tree,
      retrieved_at: at,
      commit,
      kind: "commit",
    });
  if (o.release)
    add({
      value: `${o.release.tag} (${o.release.date.slice(0, 10)})`,
      source_url: `${o.repoUrl}/releases/tag/${o.release.tag}`,
      retrieved_at: at,
      commit,
      kind: "release",
    });
  if (o.stars !== undefined && o.stars > 0)
    add({
      value: `${o.stars} stars`,
      source_url: `${o.repoUrl}/stargazers`,
      retrieved_at: at,
      commit,
      kind: "stars",
      note: "adoption only, never proof of quality",
    });
  const readmePath = o.files?.find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f)) ?? "README.md";
  const readmeUrl = commit ? `${o.repoUrl}/blob/${commit}/${readmePath}` : `${o.repoUrl}/${readmePath}`;
  for (const m of (o.readme ?? "").matchAll(DIGITS)) {
    const raw = m[0].trim();
    if (/^\d{1,2}$/.test(raw.replace(/,/g, "")) && Number(raw) <= 1) continue;
    const start = m.index ?? 0;
    const benchmark = benchmarkNear(o.readme ?? "", start);
    add({
      value: raw,
      source_url: readmeUrl,
      retrieved_at: at,
      commit,
      kind: benchmark ? "benchmark" : "fact",
      ...(benchmark ? { note: "the project claims this; say so" } : {}),
    });
  }
  for (const m of (o.digestText ?? "").matchAll(DIGITS)) {
    const raw = m[0].trim();
    if (/^\d{1,2}$/.test(raw.replace(/,/g, "")) && Number(raw) <= 1) continue;
    add({ value: raw, source_url: tree, retrieved_at: at, commit, kind: "code" });
  }
  return out;
}

/** The manifest entries the script prompt may quote: notable anchors, not every number in the code. */
export function promptFacts(manifest: FactsManifest, max = 40): FactsManifest {
  const rank = (a: FactAnchor) =>
    a.kind === "lines" ? 0 : a.kind === "stars" ? 1 : a.kind === "release" ? 2 : a.kind === "commit" ? 3 : a.kind === "benchmark" ? 4 : 5;
  return manifest
    .filter((a) => a.kind !== "code")
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, max);
}
