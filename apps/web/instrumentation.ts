// Runs once when the server starts, before any request: the repo-root .env is loaded
// (Next only reads apps/web/.env on its own; the CLI uses the same repo file), and old
// EXPLAINLIKE_* settings still work after the rename.
// Node.js only: the edge runtime (middleware) has no node:fs, and needs none of this.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const path = await import("node:path");
    const { loadDotenvFiles } = await import("@explanimate/core/env");
    const root = process.env.EXPLANIMATE_ROOT ?? path.resolve(process.cwd(), "../..");
    loadDotenvFiles([path.join(root, ".env"), path.join(root, ".env.local")]);
  }
}
