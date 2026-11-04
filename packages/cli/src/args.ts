/** Argument checks for the CLI, kept pure so every refusal is covered by a test. */
import { normalizeRepoSubpath } from "@explanimate/core";

export function parsePath(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return normalizeRepoSubpath(raw);
}

export function isExplainRequest(argv: string[]): boolean {
  return argv[0] === "explain" && (argv.includes("--from") || argv.includes("--component"));
}

export function parseWorkers(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--workers takes a positive whole number (got "${raw}")`);
  return n;
}

export function parseVoice(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "deepgram" && raw !== "cartesia" && raw !== "silent")
    throw new Error(`--voice takes deepgram, cartesia or silent (got "${raw}")`);
  return raw;
}

export function parseLook(raw: string | undefined): "dark" | "default" | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "dark" && raw !== "default") throw new Error(`--look takes dark or default (got "${raw}")`);
  return raw;
}

export function checkPackValues(packs: (string | undefined)[]): string[] {
  if (packs.some((p) => p === undefined)) throw new Error("--pack needs a value: an icon pack id or folder");
  return packs as string[];
}

export function checkFollowUpArgs(focus: string | undefined, whatIf: string | undefined, from: string | undefined): void {
  if ((focus || whatIf) && !from) throw new Error("--focus and --what-if need --from: the output folder of an earlier repo run");
  if (focus && whatIf) throw new Error("pick one of --focus or --what-if");
}
