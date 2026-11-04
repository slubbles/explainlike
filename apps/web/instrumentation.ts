// Runs once when the server starts, before any request: old EXPLAINLIKE_* settings still work after the rename.
// Node.js only: the edge runtime (middleware) has no node:fs, and needs none of this.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { adoptLegacyEnv } = await import("@explanimate/core/env");
    adoptLegacyEnv();
  }
}
