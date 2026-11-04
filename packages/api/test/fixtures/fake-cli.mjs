// Stands in for the explanimate CLI: prints the same JSON lines, writes the files, costs nothing.
import fs from "node:fs";
import path from "node:path";
const argv = process.argv.slice(2);
const input = argv[0],
  out = argv[argv.indexOf("--out") + 1];
const say = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const usd = { meta: 0.01, voice: 0.02, total: 0.03 };
say({ type: "progress", stage: "plan", message: "writing the scene plan", pct: 30, usd });
await new Promise((r) => setTimeout(r, Number(process.env.FAKE_DELAY_MS ?? 50)));
if (input.includes("fail")) {
  say({ type: "error", message: "could not read the repository" });
  process.exit(1);
}
if (input.includes("crash")) {
  process.stderr.write("explanimate failed: could not read the repository\n    at foo (/abs/server/path/x.mjs:1:2)\n");
  process.exit(1);
}
process.stdout.write("a stray line that is not JSON\n");
say({ type: "progress", stage: "render", message: "drawing frames 10/10", pct: 90, usd });
const files = Object.fromEntries(["mp4", "tldr", "excalidraw"].map((k) => [k, path.join(out, `demo.${k}`)]));
for (const f of Object.values(files)) fs.writeFileSync(f, "x");
fs.writeFileSync(
  path.join(out, "args.json"),
  JSON.stringify({ argv, cwd: process.cwd(), allowPrivate: process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS ?? "unset" }),
);
say({
  type: "done",
  manifest: {
    title: "Demo",
    durationSec: 61.5,
    brief: { approach: "analogy" },
    outputs: { ...files, contactSheet: path.join(out, "demo.contact.jpg") },
    cost: { metaUsd: 0.01, voiceUsd: 0.02 },
  },
});
