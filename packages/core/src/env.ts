import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The project was called Explain Like, and its settings were EXPLAINLIKE_*. Servers set up before the rename
 * still pass the old names, so copy each one to its EXPLANIMATE_* name
 * unless the new name is already set. It runs when @explanimate/core loads, which is before any package that imports it reads a setting; call it
 * again after loading a .env file.
 */
export function adoptLegacyEnv(env: Record<string, string | undefined> = process.env): void {
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith("EXPLAINLIKE_") || v === undefined) continue;
    const name = "EXPLANIMATE_" + k.slice("EXPLAINLIKE_".length);
    if (env[name] === undefined) env[name] = v;
  }
}

/**
 * Default folders were explainlike-* before the rename. Prefer the new folder, but silently keep
 * using an existing old one when the new one does not exist yet, so caches and outputs survive.
 */
export function withLegacyDir(current: string, legacy: string): string {
  if (fs.existsSync(current)) return current;
  if (fs.existsSync(legacy)) return legacy;
  return current;
}

/** ~/.cache/explanimate/<sub>, or the pre-rename ~/.cache/explainlike/<sub> when that is the one that exists. */
export function userCacheDir(sub: string, home: string = os.homedir()): string {
  return withLegacyDir(path.join(home, ".cache", "explanimate", sub), path.join(home, ".cache", "explainlike", sub));
}

/**
 * Copy the KEY=VALUE lines of .env text into env without printing anything: only
 * uppercase names, only when unset or empty, with one layer of surrounding quotes
 * stripped. Comments, blank lines and anything else are ignored.
 */
export function applyDotenvText(text: string, env: Record<string, string | undefined> = process.env): void {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/**
 * Load .env files in order (later files only fill what is still unset or empty),
 * then adopt any pre-rename names. Missing files are skipped. `io` is stubbed in tests.
 */
export function loadDotenvFiles(
  files: string[],
  env: Record<string, string | undefined> = process.env,
  io: { exists: (f: string) => boolean; read: (f: string) => string } = {
    exists: (f) => fs.existsSync(f),
    read: (f) => fs.readFileSync(f, "utf8"),
  },
): void {
  for (const f of files) {
    if (!io.exists(f)) continue;
    applyDotenvText(io.read(f), env);
  }
  adoptLegacyEnv(env);
}

adoptLegacyEnv();
