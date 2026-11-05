/**
 * Where to land after signing in: a path on this site, never someone else's. A leading "//"
 * or "/\" (browsers read a backslash as a slash), or any control character, falls back to /app.
 */
export function safeNext(v: unknown): string {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return "/app";
  if (v.includes("\\") || [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return "/app";
  return v;
}
