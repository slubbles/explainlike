import fs from "node:fs";
import path from "node:path";
import { listLevels, listThemes, type Level } from "@metual/core";
import { runMetual } from "./pipeline.js";

// load .env from the working directory without printing anything
for (const f of [".env", ".env.local"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const HELP = `metual <github-url | local-repo-dir | x.com post url | article url> [options]

  --level <five|new|interviewing|senior>   explain like I'm 5 / I'm new / I'm interviewing / a senior (default new)
  --theme <${listThemes().join("|")}>      (default caleb-dark)
  --out <dir>                              output folder (default ./metual-out/<name>-<level>)
  --name <owner/repo>                      display name (useful for local folders)
  --voice <deepgram|silent>                default: deepgram when DEEPGRAM_API_KEY is set
  --icons <dir>                            extra icon pack (repeatable)
  --fresh                                  ignore cached architecture/plan in the output folder
  --json                                   progress as JSON lines (for the web app)
  --workers <n>                            parallel render pages
`;

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) { process.stdout.write(HELP); process.exit(0); }
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const many = (k: string) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const flags = new Set(["--fresh", "--json", "--no-qa"]);
const input = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--") || flags.has(argv[i - 1])));
if (!input) { process.stderr.write(HELP); process.exit(1); }
const level = (opt("--level") ?? "new") as Level;
if (!listLevels().some((l) => l.id === level)) { process.stderr.write(`unknown level ${level}\n`); process.exit(1); }
const json = argv.includes("--json");

const started = Date.now();
runMetual({
  input: fs.existsSync(input) ? path.resolve(input) : input,
  level, theme: opt("--theme"), out: opt("--out") && path.resolve(opt("--out")!), name: opt("--name"), voice: opt("--voice"),
  iconPacks: many("--icons"), fresh: argv.includes("--fresh"), workers: opt("--workers") ? Number(opt("--workers")) : undefined, qa: !argv.includes("--no-qa"),
  progress: (e) => {
    if (json) process.stdout.write(JSON.stringify({ type: "progress", ...e }) + "\n");
    else process.stderr.write(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] ${e.stage.padEnd(12)} ${e.message}\n`);
  },
}).then((m) => {
  if (json) process.stdout.write(JSON.stringify({ type: "done", manifest: m }) + "\n");
  else process.stdout.write(`\nvideo      ${m.outputs.mp4}\nexcalidraw ${m.outputs.excalidraw}\nsheet      ${m.outputs.contactSheet}\nmeta spend $${m.cost.metaUsd.toFixed(3)}  voice $${m.cost.voiceUsd.toFixed(3)}  (${m.seconds}s)\n`);
}).catch((e) => {
  if (json) process.stdout.write(JSON.stringify({ type: "error", message: String(e?.message ?? e) }) + "\n");
  else process.stderr.write(`metual failed: ${e?.stack ?? e}\n`);
  process.exit(1);
});
