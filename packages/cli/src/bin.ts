import fs from "node:fs";
import path from "node:path";
import { runExplanimate } from "./pipeline.js";
import { builtinPackIds } from "@explanimate/render";
import { adoptLegacyEnv } from "@explanimate/core";

// load .env from the working directory without printing anything
for (const f of [".env", ".env.local"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
// a .env written before the rename may still use EXPLAINLIKE_* names
adoptLegacyEnv();

const HELP = `explanimate <github-url | local-repo-dir | x.com post url | article url | "a topic in words"> [options]

  A topic with no link ("how DNS works") is read from Wikipedia and the reputable pages it cites,
  and the video names its sources (listed in sources.md and the manifest).

  Muse Spark reads the source first and decides the approach (analogy, story, step by step...),
  the depth, the tempo and the look. There are no levels or themes to pick.

  --out <dir>                              output folder (default ./explainlike-out/<name>)
  --name <owner/repo>                      display name (useful for local folders)
  --voice <deepgram|silent>                default: deepgram when DEEPGRAM_API_KEY is set
  --pack <id|dir>                          icon/component pack: built-in ${builtinPackIds().join(", ")} or a folder (repeatable;
                                           default: all built-in packs, used only where they detect something)
  --no-packs                               only the base doodle icons
  --fresh                                  ignore cached architecture/plan in the output folder
  --json                                   progress as JSON lines (for the web app)
  --workers <n>                            processes or threads drawing frames (default: Chrome cores - 1, at most 6;
                                           Skia 2-4, or cores - 1 with an NVIDIA encoder)
                                           EXPLANIMATE_RENDERER=skia|chrome picks the renderer (default skia),
                                           EXPLANIMATE_ENCODER=nvenc|x264 forces the H.264 encoder
  --no-qa                                  skip the Muse Transcribe voiceover check
  --no-music                               no music bed (by default a quiet original bed sits 22 dB under the voice)
  --no-sfx                                 no sound effects (by default soft, locally made pops and whooshes mark what is drawn)
  --vision-review                          also show 8 rendered frames to Muse Spark for a look-over (costs a little; off by default)

what the viewer wants (the web app's voice chat fills these in):
  --goal <text>                            what they want to understand
  --audience <text>                        who it is for
  --depth <overview|working|deep>          how deep to go
  --also <text>                            anything else to cover

follow-ups on an earlier repo run (same input, new --out):
  --from <earlier out dir>                 reuse that run's diagram
  --focus <component id>                   15-20 s deep dive on one box
  --what-if <10x|100x>                     what breaks if traffic grows (every number labelled as an assumption)

explanimate explain --from <earlier out dir> --component <id> [--json]
                                           text explanation of one box, grounded in its evidence files
`;

const argv = process.argv.slice(2);
// the person at this terminal chose the link, so the CLI may read intranet pages; the private-address guard
// is for links strangers type into the web app. Set EXPLANIMATE_ALLOW_PRIVATE_URLS=0 to keep it on here too.
process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS ??= "1";
if (!argv.length || argv.includes("--help") || argv.includes("-h")) { process.stdout.write(HELP); process.exit(0); }
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const many = (k: string) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const flags = new Set(["--fresh", "--json", "--no-qa", "--no-packs", "--no-music", "--no-sfx", "--vision-review"]);
if (argv[0] === "explain") await explain();
const input = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--") || flags.has(argv[i - 1])));
if (!input) { process.stderr.write(HELP); process.exit(1); }
const json = argv.includes("--json");

const started = Date.now();
const whatIf = opt("--what-if");
if (argv.includes("--export")) process.stderr.write("--export is no longer needed: every run writes both a .tldr and an .excalidraw board\n");
if (whatIf && whatIf !== "10x" && whatIf !== "100x") { process.stderr.write("--what-if takes 10x or 100x\n"); process.exit(1); }
const depth = opt("--depth");
if (depth && !["overview", "working", "deep"].includes(depth)) { process.stderr.write("--depth takes overview, working or deep\n"); process.exit(1); }
const ask = { goal: opt("--goal"), audience: opt("--audience"), depth: depth as "overview" | "working" | "deep" | undefined, also: opt("--also") };
runExplanimate({
  from: opt("--from") && path.resolve(opt("--from")!), focus: opt("--focus"), whatIf: whatIf as "10x" | "100x" | undefined,
  input: fs.existsSync(input) ? path.resolve(input) : input,
  out: opt("--out") && path.resolve(opt("--out")!), name: opt("--name"), voice: opt("--voice"),
  ask: Object.values(ask).some(Boolean) ? ask : undefined,
  packs: argv.includes("--no-packs") ? [] : [...many("--pack"), ...many("--icons")].length ? [...many("--pack"), ...many("--icons")].map((d) => (fs.existsSync(d) ? path.resolve(d) : d)) : undefined, fresh: argv.includes("--fresh"), workers: opt("--workers") ? Number(opt("--workers")) : undefined, qa: !argv.includes("--no-qa"), music: !argv.includes("--no-music"), sfx: !argv.includes("--no-sfx"), visionReview: argv.includes("--vision-review"),
  progress: (e) => {
    if (json) process.stdout.write(JSON.stringify({ type: "progress", ...e }) + "\n");
    else process.stderr.write(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] $${(e.usd?.total ?? 0).toFixed(3).padStart(6)}  ${e.stage.padEnd(12)} ${e.message}\n`);
  },
}).then((m) => {
  if (json) process.stdout.write(JSON.stringify({ type: "done", manifest: m }) + "\n");
  else process.stdout.write(`\nvideo      ${m.outputs.mp4}\ntldraw     ${m.outputs.tldr}\nexcalidraw ${m.outputs.excalidraw}\nsheet      ${m.outputs.contactSheet}\nmeta spend $${m.cost.metaUsd.toFixed(3)}  voice $${m.cost.voiceUsd.toFixed(3)}  (${m.seconds}s)\n`);
}).catch((e) => {
  // a service failure already reads as a sentence a person can act on; the raw detail is for logs only
  const plain = e?.name === "ServiceError";
  if (json) process.stdout.write(JSON.stringify({ type: "error", message: String(e?.message ?? e), service: plain ? e.service : undefined }) + "\n");
  else process.stderr.write(plain ? `explanimate failed: ${e.message}\n  (${e.detail ?? "no detail"})\n` : `explanimate failed: ${e?.stack ?? e}\n`);
  process.exit(1);
});

async function explain() {
  const { CostLedger } = await import("@explanimate/models");
  const { explainComponent, evidencePack } = await import("@explanimate/planner");
  const { digestRepo } = await import("@explanimate/ingest");
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
    const r = await explainComponent({ ledger, arch, id, evidence, audience: m.brief?.audience ?? "a developer new to this codebase", question: opt("--question") });
    out({ type: "explain", component: { id: c.id, name: c.name, keyword: c.keyword, evidence: c.evidence }, ...r, usd: Number(ledger.total.toFixed(4)) });
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", message: String((e as Error)?.message ?? e) }) + "\n");
    process.exit(1);
  }
}
