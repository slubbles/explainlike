// Runs once when the server starts, before any request: old EXPLAINLIKE_* settings still work after the rename.
export async function register() {
  const { adoptLegacyEnv } = await import("@explanimate/core/env");
  adoptLegacyEnv();
}
