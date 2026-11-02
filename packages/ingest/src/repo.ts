import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import type { SourceDoc } from "@explanimate/core";
import { isSecretPath, redact } from "./secrets.js";

export const REPO_CACHE = process.env.EXPLANIMATE_REPO_CACHE ?? path.join(os.homedir(), ".cache", "explainlike", "repos");

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|\.next|\.turbo|\.git|coverage|__pycache__|\.venv|venv|target|\.cache|public\/static|third_party)\//;
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|mp4|mov|mp3|wav|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|wasm|so|dylib|exe|bin|lock|snap|map|min\.js|min\.css|db|sqlite)$/i;
const LOCKFILE = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock|bun\.lockb?)$/;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|php|cs|swift|scala|ex|exs|vue|svelte|sql|prisma)$/i;

export function parseGithubUrl(u: string): { owner: string; repo: string; ref?: string } | null {
  const m = u.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?(?:[/?#].*)?$/i);
  return m ? { owner: m[1], repo: m[2], ref: m[3] } : null;
}

/** Shallow clone (or reuse) a GitHub repo, or accept a local directory. */
export function checkout(urlOrPath: string): { dir: string; url: string; commit: string; name: string } {
  if (fs.existsSync(urlOrPath) && fs.statSync(urlOrPath).isDirectory()) {
    const dir = path.resolve(urlOrPath);
    let commit = "local";
    try { commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
    return { dir, url: dir, commit, name: path.basename(dir) };
  }
  const g = parseGithubUrl(urlOrPath);
  if (!g) throw new Error(`That is not a GitHub repository link or a folder: ${urlOrPath}. Use a link like https://github.com/owner/repo.`);
  const dir = path.join(REPO_CACHE, `${g.owner}__${g.repo}`);
  const url = `https://github.com/${g.owner}/${g.repo}`;
  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(REPO_CACHE, { recursive: true });
    const args = ["clone", "--depth", "1", "--filter=blob:limit=2m"];
    if (g.ref) args.push("--branch", g.ref);
    // clone beside the cache and move it in, so a killed or failed clone never leaves a half repo to reuse
    const tmp = `${dir}.tmp-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    try {
      execFileSync("git", [...args, url + ".git", tmp], { stdio: "pipe", timeout: CLONE_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" } });
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(cloneError(e as Error & { stderr?: Buffer; signal?: string }, `${g.owner}/${g.repo}`, g.ref));
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  }
  const commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { dir, url, commit, name: `${g.owner}/${g.repo}` };
}

const CLONE_TIMEOUT_MS = Number(process.env.EXPLANIMATE_CLONE_TIMEOUT_S ?? 180) * 1000;

/** A failed clone as a sentence a person can act on: missing or private, unknown branch, too big, or offline. */
export function cloneError(e: { stderr?: Buffer | string; signal?: string | null; message?: string }, name: string, ref?: string): string {
  const err = String(e.stderr ?? e.message ?? "");
  if (e.signal === "SIGTERM" || /ETIMEDOUT/.test(err)) return `github.com/${name} took more than ${CLONE_TIMEOUT_MS / 1000} s to download. It is probably too big; try a smaller repository.`;
  if (/Remote branch .* not found|couldn't find remote ref/i.test(err)) return `github.com/${name} has no branch called "${ref}". Check the link.`;
  if (/Repository not found|could not read Username|Authentication failed|terminal prompts disabled|403/i.test(err)) return `github.com/${name} was not found. It may be private or misspelled; only public repositories work.`;
  if (/Could not resolve host|unable to access|Connection (timed out|refused)/i.test(err)) return `Could not reach GitHub to download ${name}. Check the internet connection and try again.`;
  return `Could not download github.com/${name}: ${err.trim().split("\n").pop()?.slice(0, 200) ?? "git clone failed"}`;
}

function listFiles(dir: string): string[] {
  let files: string[];
  try {
    files = execFileSync("git", ["-C", dir, "ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean);
  } catch {
    files = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(path.join(dir, d), { withFileTypes: true })) {
        const rel = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!SKIP_DIR.test(rel + "/")) walk(rel); } else files.push(rel);
      }
    };
    walk("");
  }
  return files.filter((f) => !SKIP_DIR.test(f));
}

export interface RepoDigest { text: string; files: string[]; skippedSecret: string[]; read: (p: string, max?: number) => string }

/** A language-agnostic digest an LLM can reason about, ~40k chars, secrets stripped. */
export function digestRepo(dir: string, budget = 42000): RepoDigest {
  const all = listFiles(dir);
  const skippedSecret = all.filter(isSecretPath);
  const files = all.filter((f) => !isSecretPath(f));
  const textFiles = files.filter((f) => !BINARY.test(f) && !LOCKFILE.test(f));
  const cache = new Map<string, string>();
  const read = (p: string, max = 200_000): string => {
    if (isSecretPath(p) || !files.includes(p)) return "";
    if (!cache.has(p)) {
      try {
        const st = fs.statSync(path.join(dir, p));
        cache.set(p, st.size > 400_000 ? "" : redact(fs.readFileSync(path.join(dir, p), "utf8")));
      } catch { cache.set(p, ""); }
    }
    return cache.get(p)!.slice(0, max);
  };
  const sec: string[] = [];
  const pri: number[] = [];
  let curPri = 5;
  const add = (title: string, body: string, p = curPri) => { if (body.trim()) { sec.push(`## ${title}\n${body.trim()}`); pri.push(p); } };

  // priority: lower number = more important; low-priority sections are dropped first
  curPri = 0;
  // 1. shape of the repo
  const ext: Record<string, number> = {};
  for (const f of textFiles) { const e = path.extname(f).slice(1) || path.basename(f); ext[e] = (ext[e] ?? 0) + 1; }
  add("repo stats", `${files.length} files tracked. By extension: ${Object.entries(ext).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}:${v}`).join(" ")}`);

  curPri = 7;
  // 2. directory tree (dirs with counts, depth <= 3)
  const dirs = new Map<string, number>();
  for (const f of files) { const parts = f.split("/"); for (let d = 1; d <= Math.min(3, parts.length - 1); d++) { const k = parts.slice(0, d).join("/"); dirs.set(k, (dirs.get(k) ?? 0) + 1); } }
  const top = files.filter((f) => !f.includes("/"));
  add("top-level files", top.join("  "), 1);
  add("directories (file counts)", [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0])).filter(([k]) => k.split("/").length <= 2 || dirs.size < 120).slice(0, 140).map(([k, v]) => `${"  ".repeat(k.split("/").length - 1)}${k.split("/").pop()}/ (${v})`).join("\n"));

  curPri = 1;
  // 3. manifests and infra config
  const manifestRe = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|deno\.jsonc?)$/;
  const infraRe = /(^|\/)(docker-compose[^/]*\.ya?ml|compose\.ya?ml|Dockerfile[^/]*|wrangler\.(toml|jsonc?)|vercel\.json|netlify\.toml|fly\.toml|render\.yaml|railway\.json|serverless\.ya?ml|Procfile|app\.yaml|next\.config\.[mc]?[jt]s|vite\.config\.[jt]s|nuxt\.config\.[jt]s|astro\.config\.[mj]s|schema\.prisma|drizzle\.config\.[jt]s|supabase\/config\.toml|firebase\.json|\.github\/workflows\/[^/]+\.ya?ml|Chart\.yaml|values\.yaml|nginx\.conf|Caddyfile|middleware\.[jt]s)$/;
  const manifests = textFiles.filter((f) => manifestRe.test(f) && f.split("/").length <= 4).slice(0, 14);
  for (const m of manifests) {
    const raw = read(m);
    if (m.endsWith("package.json")) {
      try {
        const j = JSON.parse(raw);
        add(`${m}`, [`name: ${j.name ?? ""}`, j.workspaces ? `workspaces: ${JSON.stringify(j.workspaces)}` : "", `scripts: ${JSON.stringify(j.scripts ?? {}).slice(0, 1200)}`, `dependencies: ${Object.keys(j.dependencies ?? {}).join(", ")}`, `devDependencies: ${Object.keys(j.devDependencies ?? {}).join(", ").slice(0, 600)}`].filter(Boolean).join("\n"));
      } catch { add(m, raw.slice(0, 1500)); }
    } else add(m, raw.slice(0, 1500));
  }
  curPri = 4;
  const infraAll = textFiles.filter((f) => infraRe.test(f));
  const infra = [...infraAll.filter((f) => !f.includes(".github/")).slice(0, 10), ...infraAll.filter((f) => f.includes(".github/")).slice(0, 3)];
  for (const f of infra) {
    const cap = f.includes(".github/") ? 700 : /schema\.prisma|docker-compose|wrangler/.test(f) ? 2600 : 1500;
    let raw = read(f, cap);
    raw = raw.replace(/("?(?:id|database_id|preview_id|account_id|namespace_id|zone_id|project_id)"?\s*[:=]\s*)"[^"]*"/g, '$1"<redacted>"');
    add(`${f} (first ${cap} chars)`, raw);
  }

  curPri = 1;
  // 4. README
  const readme = top.find((f) => /^readme/i.test(f));
  if (readme) add(`${readme} (first 1800 chars)`, read(readme, 1800).replace(/!\[[^\]]*\]\([^)]*\)/g, ""));

  curPri = 5;
  // 5. routes / entry points / schema
  const routeRe = /(\/api\/|(^|\/)routes?\/|(^|\/)controllers?\/|(^|\/)handlers?\/|route\.[jt]sx?$|urls\.py$|views\.py$|router\.[jt]s$|(^|\/)pages\/api\/|server\.[jt]s$|app\.[jt]s$|main\.(go|py|rs|ts|js)$|index\.(ts|js)$|worker\.[jt]s$)/;
  const routes = textFiles.filter((f) => CODE.test(f) && routeRe.test(f) && !/test|spec|__mocks__|stories/.test(f));
  add(`route / entry files (${routes.length})`, routes.slice(0, 70).join("\n"));
  const tables: string[] = [];
  for (const f of textFiles.filter((f) => /\.(sql|prisma)$/.test(f) || /schema\.[jt]s$/.test(f)).slice(0, 80)) {
    const t = read(f);
    for (const m of t.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+[`"]?([\w.]+)/gi)) tables.push(`${f}: table ${m[1]}`);
    for (const m of t.matchAll(/^model\s+(\w+)/gm)) tables.push(`${f}: model ${m[1]}`);
    for (const m of t.matchAll(/(?:pgTable|sqliteTable|mysqlTable)\(\s*["'](\w+)/g)) tables.push(`${f}: table ${m[1]}`);
  }
  add("data model (tables / models)", [...new Set(tables)].slice(0, 40).join("\n"), 3);

  // 6. imports -> which files use which library; env var names; external hosts
  const codeFiles = textFiles.filter((f) => CODE.test(f) && !/(^|\/)(test|tests|__tests__|e2e|cypress|fixtures|examples?|docs?)\//.test(f) && !/\.(test|spec|stories)\./.test(f));
  const imports = new Map<string, Set<string>>();
  const envs = new Map<string, Set<string>>();
  const hosts = new Map<string, Set<string>>();
  for (const f of codeFiles.slice(0, 4000)) {
    const t = read(f, 60_000);
    const pkgs = new Set<string>();
    for (const m of t.matchAll(/(?:from\s+["']|require\(\s*["']|import\(\s*["']|import\s+["'])([^"'./][^"']*)["']/g)) pkgs.add(m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0]);
    for (const m of t.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) if (f.endsWith(".py")) pkgs.add((m[1] ?? m[2]).split(".")[0]);
    for (const m of t.matchAll(/^\s*"([\w.-]+\/[\w./-]+)"\s*$/gm)) if (f.endsWith(".go")) pkgs.add(m[1]);
    for (const p of pkgs) { if (/^(@\/|~\/|#|node:|react$|react-dom|path|fs|os|url|util|crypto|http|https|stream|events|child_process|typing|os|sys|re|json|time|datetime)/.test(p)) continue; (imports.get(p) ?? imports.set(p, new Set()).get(p)!).add(f); }
    for (const m of t.matchAll(/(?:process\.env\.|import\.meta\.env\.|env\.|os\.environ(?:\.get)?\(?\[?["']|os\.getenv\(["']|Deno\.env\.get\(["'])([A-Z][A-Z0-9_]{2,})/g)) (envs.get(m[1]) ?? envs.set(m[1], new Set()).get(m[1])!).add(f);
    for (const m of t.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) { const h = m[1].toLowerCase(); if (/localhost|example\.|schema\.org|w3\.org|github\.com\/[^/]+$/.test(h)) continue; (hosts.get(h) ?? hosts.set(h, new Set()).get(h)!).add(f); }
  }
  curPri = 2;
  const short = (s: Set<string>) => [...s].sort((a, b) => a.length - b.length).slice(0, 4).join(", ");
  add("libraries -> files that import them (top 45)", [...imports.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 45).map(([k, v]) => `${k}: ${v.size} files, e.g. ${short(v)}`).join("\n"));
  const envExample = files.find((f) => /\.env\.(example|sample|template)$/.test(f));
  if (envExample) for (const m of read(envExample).matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)) (envs.get(m[1]) ?? envs.set(m[1], new Set()).get(m[1])!).add(envExample);
  add("environment variable NAMES (values never read) -> files", [...envs.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 50).map(([k, v]) => `${k}: ${short(v)}`).join("\n"));
  add("external hosts referenced in code", [...hosts.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 30).map(([k, v]) => `${k}: ${v.size} files, e.g. ${short(v)}`).join("\n"));

  // 7. key source excerpts, ranked by how "architectural" a file looks
  const infraLib = /(prisma|drizzle|pg|postgres|mysql|mongo|redis|ioredis|kafka|bull|bullmq|amqp|sqs|s3|@aws-sdk|stripe|openai|anthropic|clickhouse|elastic|meilisearch|supabase|firebase|socket\.io|ws|jose|next-auth|@auth|passport|nodemailer|resend|celery|sqlalchemy|django|fastapi|flask|express|fastify|hono|koa|trpc|graphql|apollo|cloudflare|durable|kv|queue|cron)/i;
  const score = (f: string) => {
    const t = read(f, 20_000);
    let s = 0;
    if (routes.includes(f)) s += routes.length > 40 ? 0.5 : 2;
    if (/(^|\/)(lib|server|services?|db|database|queue|workers?|jobs|api|core|config)\//.test(f)) s += 2;
    if (/(db|database|client|redis|cache|queue|auth|storage|config|server|worker|index|main|app|middleware)\.[a-z]+$/i.test(f)) s += 2;
    const libs = new Set((t.match(new RegExp(infraLib.source, "gi")) ?? []).map((x) => x.toLowerCase()));
    s += Math.min(5, libs.size * 1.5);
    if (new RegExp(`(^|/)(${infraLib.source.slice(1, -1)})\\.[a-z]+$`, "i").test(f)) s += 3;
    s -= f.split("/").length * 0.3;
    return s;
  };
  const ranked = codeFiles.slice(0, 1500).map((f) => ({ f, s: score(f) })).sort((a, b) => b.s - a.s);
  // keep at least 35% of the budget for real code
  while (sec.join("\n\n").length > budget * 0.65 && sec.length > 1) {
    const worst = pri.indexOf(Math.max(...pri));
    const over = sec.join("\n\n").length - budget * 0.65;
    if (sec[worst].length - over > 600) { sec[worst] = sec[worst].slice(0, sec[worst].length - over) + "\n[...truncated]"; pri[worst] = -1; }
    else { sec.splice(worst, 1); pri.splice(worst, 1); }
  }
  let used = sec.join("\n\n").length;
  const excerpts: string[] = [];
  const perDir = new Map<string, number>();
  for (const { f } of ranked) {
    if (used > budget) break;
    const d = path.dirname(f);
    if ((perDir.get(d) ?? 0) >= 4) continue;
    perDir.set(d, (perDir.get(d) ?? 0) + 1);
    const t = read(f, 1400).replace(/\n{3,}/g, "\n\n");
    if (!t.trim()) continue;
    const block = `### ${f}\n${t}`;
    excerpts.push(block); used += block.length;
  }
  add("key source excerpts (first ~1400 chars each, redacted)", excerpts.join("\n\n"));
  if (skippedSecret.length) add("files skipped as possible secrets (never opened)", `${skippedSecret.length} files`);
  return { text: sec.join("\n\n"), files, skippedSecret, read };
}

export async function ingestRepo(urlOrPath: string): Promise<SourceDoc & { digest: RepoDigest }> {
  const co = checkout(urlOrPath);
  const digest = digestRepo(co.dir);
  return { kind: "repo", url: co.url, title: co.name, text: digest.text, repoDir: co.dir, commit: co.commit, files: digest.files, digest, meta: { skippedSecretFiles: digest.skippedSecret.length } };
}
