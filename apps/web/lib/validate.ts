import fs from "node:fs";
import path from "node:path";
import { looksLikeTopic } from "@explanimate/core/topic";
import { privateHostname } from "@explanimate/core/private";
import { TOPIC_MAX } from "./form";

/** What the web app will hand to the CLI: public URLs (never the server's own network), a topic in words, local paths only when allowed. */
export function validInput(s: string): boolean {
  if (/^https?:\/\/(www\.)?(github\.com|x\.com|twitter\.com)\//i.test(s)) return true;
  if (/^https?:\/\/[^\s]+$/i.test(s)) {
    // never let the server fetch its own network: localhost, private ranges and IPv6 literals
    // are refused (URL() already turns 2130706433 or 0x7f.1 into 127.0.0.1, and a public site has a name)
    let h: string;
    try {
      h = new URL(s).hostname;
    } catch {
      return false;
    }
    return !privateHostname(h);
  }
  // a topic in words ("how DNS works"): the engine reads reputable pages about it
  if (s.length <= TOPIC_MAX && !/^[/~.]/.test(s) && looksLikeTopic(s)) return true;
  // local paths only when explicitly allowed (self-hosted use)
  return process.env.EXPLANIMATE_ALLOW_LOCAL === "1" && path.isAbsolute(s) && fs.existsSync(s);
}
