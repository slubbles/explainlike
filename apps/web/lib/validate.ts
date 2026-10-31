import fs from "node:fs";
import path from "node:path";

/** What the web app will hand to the CLI: public URLs only (never the server's own network), local paths only when allowed. */
export function validInput(s: string): boolean {
  if (/^https?:\/\/(www\.)?(github\.com|x\.com|twitter\.com)\//i.test(s)) return true;
  if (/^https?:\/\/[^\s]+$/i.test(s)) {
    // never let the server fetch its own network. URL() already turns 2130706433 or 0x7f.1 into 127.0.0.1.
    // IPv6 literals are refused outright ([::1], [::ffff:7f00:1], fc00::...); a public site has a name.
    let h: string;
    try { h = new URL(s).hostname; } catch { return false; }
    return !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|\[|.*\.localhost$|.*\.local$|.*\.internal$)/i.test(h) && h.includes(".");
  }
  // local paths only when explicitly allowed (self-hosted use)
  return process.env.METUAL_ALLOW_LOCAL === "1" && path.isAbsolute(s) && fs.existsSync(s);
}
