/**
 * The project was called Explain Like, and its settings were EXPLAINLIKE_*. Servers set up before the rename
 * (the live VPS container among them) still pass the old names, so copy each one to its EXPLANIMATE_* name
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

adoptLegacyEnv();
