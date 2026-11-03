/**
 * Generates the built-in "doodle" icon pack with Muse Image + SAM 3.1.
 * Run once: pnpm icons:generate   (about $0.01 per icon)
 */
import fs from "node:fs";
import path from "node:path";
import { CostLedger } from "@explanimate/models";
import { makeDoodleIcon, BUILTIN_PACK_DIR } from "@explanimate/render";

const ICONS: Record<string, { subject: string; aliases: string[]; sam?: string }> = {
  phone: { subject: "a smartphone with a play button on the screen", aliases: ["mobile", "app", "ios", "android"] },
  browser: { subject: "a web browser window with three dots in the top bar", aliases: ["web", "frontend", "website", "spa"] },
  laptop: { subject: "an open laptop", aliases: ["desktop", "computer", "dev"] },
  user: { subject: "a simple person bust, head and shoulders", aliases: ["person", "visitor", "customer"] },
  users: { subject: "a small crowd of three people busts", aliases: ["crowd", "traffic", "audience"], sam: "group of people" },
  cloud: { subject: "a puffy cloud", aliases: ["edge", "cdn", "worker", "serverless"] },
  globe: { subject: "a globe with latitude and longitude lines", aliases: ["internet", "dns", "world", "region"] },
  server: {
    subject: "a server rack with three stacked units and small lights",
    aliases: ["api", "backend", "service", "app-server"],
    sam: "server rack",
  },
  function: { subject: "a lambda symbol inside a circle", aliases: ["lambda", "serverless-function"], sam: "circle" },
  database: {
    subject: "a database cylinder made of three stacked discs",
    aliases: ["db", "sql", "postgres", "mysql", "sqlite"],
    sam: "cylinder",
  },
  bucket: { subject: "a storage bucket pail", aliases: ["object-storage", "s3", "r2", "blob", "files"], sam: "bucket" },
  cache: { subject: "a lightning bolt", aliases: ["redis", "kv", "memcached", "fast"], sam: "lightning bolt" },
  queue: {
    subject: "a horizontal row of four small square boxes with an arrow pointing right underneath them",
    aliases: ["kafka", "jobs", "stream", "pubsub", "worker-queue"],
    sam: "row of boxes",
  },
  lock: { subject: "a padlock", aliases: ["auth", "login", "security", "session"] },
  key: { subject: "an old fashioned key", aliases: ["token", "secret", "api-key"] },
  shield: { subject: "a shield", aliases: ["firewall", "rate-limit", "waf", "protection"] },
  mail: { subject: "an envelope", aliases: ["email", "smtp", "notification-email"] },
  bell: { subject: "a notification bell", aliases: ["notifications", "push", "alert"] },
  clock: { subject: "an alarm clock", aliases: ["cron", "schedule", "timer", "latency"] },
  chart: { subject: "a bar chart with an upward arrow", aliases: ["analytics", "metrics", "dashboard", "growth"], sam: "bar chart" },
  brain: { subject: "a brain", aliases: ["ai", "llm", "model", "ml", "inference"] },
  robot: { subject: "a friendly little robot", aliases: ["agent", "bot", "assistant"] },
  gpu: { subject: "a graphics card with two fans", aliases: ["graphics-card", "accelerator", "compute"], sam: "graphics card" },
  chip: { subject: "a computer chip with pins on all sides", aliases: ["cpu", "hardware", "processor"], sam: "chip" },
  gear: { subject: "a gear cog", aliases: ["config", "settings", "process", "pipeline"] },
  document: {
    subject: "a paper document with a folded corner and lines of text",
    aliases: ["file", "page", "article", "paper", "docs"],
    sam: "document",
  },
  search: { subject: "a magnifying glass", aliases: ["find", "index", "elasticsearch", "lookup"] },
  money: { subject: "a stack of coins", aliases: ["cost", "price", "billing", "payments", "stripe"], sam: "coins" },
  rocket: { subject: "a rocket", aliases: ["deploy", "launch", "ci", "release"] },
  video: {
    subject: "a movie clapperboard, open, with diagonal stripes on the clapper",
    aliases: ["media", "stream", "clip", "movie"],
    sam: "clapperboard",
  },
  chat: { subject: "two speech bubbles", aliases: ["message", "realtime", "websocket", "comments"], sam: "speech bubble" },
  folder: { subject: "a folder", aliases: ["repo", "directory", "project"] },
  network: {
    subject: "five small circles connected by lines like a network graph",
    aliases: ["graph", "cluster", "distributed", "nodes"],
    sam: "network diagram",
  },
  scale: { subject: "a balance scale", aliases: ["tradeoff", "balance", "compare"], sam: "balance scale" },
  warning: { subject: "a warning triangle with an exclamation mark", aliases: ["error", "risk", "problem", "bottleneck"], sam: "triangle" },
  check: { subject: "a big check mark inside a circle", aliases: ["done", "success", "fix", "ok"], sam: "check mark" },
  box: { subject: "a cardboard box", aliases: ["package", "container", "docker", "npm"] },
  memory: { subject: "a RAM memory stick", aliases: ["ram", "kv-cache", "context", "memory-stick"], sam: "memory stick" },
  book: { subject: "an open book", aliases: ["learn", "knowledge", "training-data", "dataset"] },
  bolt: { subject: "a speedometer gauge with the needle on fast", aliases: ["speed", "performance", "throughput"], sam: "speedometer" },
};

const only = process.argv.slice(2);
const dir = BUILTIN_PACK_DIR;
fs.mkdirSync(dir, { recursive: true });
const manifestPath = path.join(dir, "manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { id: "doodle", generatedWith: "muse-image-1.0 + sam-3.1", icons: {} };
const ledger = new CostLedger();
const names = Object.keys(ICONS).filter((n) => (only.length ? only.includes(n) : !fs.existsSync(path.join(dir, `${n}.png`))));
const log: string[] = [];
let i = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (i < names.length) {
      const n = names[i++];
      const spec = ICONS[n];
      try {
        const { png, sam } = await makeDoodleIcon({ ledger, name: n, subject: spec.subject, samPhrase: spec.sam ?? n });
        fs.writeFileSync(path.join(dir, `${n}.png`), png);
        manifest.icons[n] = { file: `${n}.png`, aliases: spec.aliases, prompt: spec.subject };
        log.push(`${n}: ok (sam ${sam})`);
      } catch (e) {
        log.push(`${n}: FAILED ${(e as Error).message.slice(0, 160)}`);
      }
    }
  }),
);
manifest.icons = Object.fromEntries(Object.entries(manifest.icons).sort());
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(log.sort().join("\n"));
console.log(`cost $${ledger.total.toFixed(3)}`, JSON.stringify(ledger.byModel()));
