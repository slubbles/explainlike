import fs from "node:fs";
import path from "node:path";
import { listLevels, listThemes, loadLevelFile, type Level } from "@metual/core";
import { runMetual } from "./pipeline.js";
import { builtinPackIds } from "@metual/render";

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
  --pack <id|dir>                          icon/component pack: built-in ${builtinPackIds().join(", ")} or a folder (repeatable;
                                           default: all built-in packs, used only where they detect something)
  --no-packs                               only the base doodle icons
  --fresh                                  ignore cached architecture/plan in the output folder
  --json                                   progress as JSON lines (for the web app)
  --workers <n>                            parallel render pages
  --level-file <file.json>                 add your own level (see docs/plugins.md) and use it
  --no-qa                                  skip the Muse Transcribe voiceover check

follow-ups on an earlier repo run (same input, new --out):
  --from <earlier out dir>                 reuse that run's diagram
  --focus <component id>                   15-20 s deep dive on one box
  --what-if <10x|100x>                     what breaks if traffic grows (every number labelled as an assumption)

metual explain --from <earlier out dir> --component <id> [--json]
                                           text explanation of one box, grounded in its evidence files
`;

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) { process.stdout.write(HELP); process.exit(0); }
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const many = (k: string) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const flags = new Set(["--fresh", "--json", "--no-qa", "--no-packs"]);
if (argv[0] === "explain") await explain();
const input = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--") || flags.has(argv[i - 1])));
if (!input) { process.stderr.write(HELP); process.exit(1); }
const levelFile = opt("--level-file");
const level = (levelFile ? loadLevelFile(path.resolve(levelFile)).id : opt("--level") ?? "new") as Level;
if (!listLevels().some((l) => l.id === level)) { process.stderr.write(`unknown level ${level}\n`); process.exit(1); }
const json = argv.includes("--json");

const started = Date.now();
const whatIf = opt("--what-if");
if (whatIf && whatIf !== "10x" && whatIf !== "100x") { process.stderr.write("--what-if takes 10x or 100x\n"); process.exit(1); }
runMetual({
  from: opt("--from") && path.resolve(opt("--from")!), focus: opt("--focus"), whatIf: whatIf as "10x" | "100x" | undefined,
  input: fs.existsSync(input) ? path.resolve(input) : input,
  level, theme: opt("--theme"), out: opt("--out") && path.resolve(opt("--out")!), name: opt("--name"), voice: opt("--voice"),
  packs: argv.includes("--no-packs") ? [] : [...many("--pack"), ...many("--icons")].length ? [...many("--pack"), ...many("--icons")].map((d) => (fs.existsSync(d) ? path.resolve(d) : d)) : undefined, fresh: argv.includes("--fresh"), workers: opt("--workers") ? Number(opt("--workers")) : undefined, qa: !argv.includes("--no-qa"),
  progress: (e) => {
    if (json) process.stdout.write(JSON.stringify({ type: "progress", ...e }) + "\n");
    else process.stderr.write(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] $${(e.usd?.total ?? 0).toFixed(3).padStart(6)}  ${e.stage.padEnd(12)} ${e.message}\n`);
  },
}).then((m) => {
  if (json) process.stdout.write(JSON.stringify({ type: "done", manifest: m }) + "\n");
  else process.stdout.write(`\nvideo      ${m.outputs.mp4}\nexcalidraw ${m.outputs.excalidraw}\nsheet      ${m.outputs.contactSheet}\nmeta spend $${m.cost.metaUsd.toFixed(3)}  voice $${m.cost.voiceUsd.toFixed(3)}  (${m.seconds}s)\n`);
}).catch((e) => {
  if (json) process.stdout.write(JSON.stringify({ type: "error", message: String(e?.message ?? e) }) + "\n");
  else process.stderr.write(`metual failed: ${e?.stack ?? e}\n`);
  process.exit(1);
});

async function explain() {
  const { CostLedger } = await import("@metual/models");
  const { explainComponent, evidencePack } = await import("@metual/planner");
  const { digestRepo } = await import("@metual/ingest");
  const from = opt("--from"), id = opt("--component");
  const out = (o: unknown) => { process.stdout.write(JSON.stringify(o) + "\n"); process.exit(0); };
  try {
    if (!from || !id) throw new Error("explain needs --from <dir> and --component <id>");
    const m = JSON.parse(fs.readFileSync(path.join(from, "manifest.json"), "utf8"));
    const arch = JSON.parse(fs.readFileSync(path.join(from, "architecture.json"), "utf8"));
    const c = arch.components.find((x: { id: string }) => x.id === id);
    if (!c) throw new Error(`no component ${id}`);
    const repoDir = [m.repoDir, m.input].find((d) => typeof d === "string" && fs.existsSync(d) && fs.statSync(d).isDirectory());
    const read = repoDir ? digestRepo(repoDir).read : () => "";
    const evidence = evidencePack({ ...arch, components: [c], connections: [], scale: [] }, read, 12000);
    const ledger = new CostLedger();
    const r = await explainComponent({ ledger, arch, id, evidence, level: m.level, question: opt("--question") });
    out({ type: "explain", component: { id: c.id, name: c.name, keyword: c.keyword, evidence: c.evidence }, ...r, usd: Number(ledger.total.toFixed(4)) });
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", message: String((e as Error)?.message ?? e) }) + "\n");
    process.exit(1);
  }
}
