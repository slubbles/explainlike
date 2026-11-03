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

adoptLegacyEnv();
