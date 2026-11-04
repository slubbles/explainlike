// Stands in for the real CLI during the browser tests: walks the pipeline stages, then copies a tiny
// sample video into the job folder and reports it the way a finished render would. No model or voice
// calls, so the E2E suite needs no keys and costs nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1];
const input = args[0] ?? "";
const step = Number(process.env.FAKE_STEP_MS ?? 250);
const say = (o) => console.log(JSON.stringify(o));

if (/fail-on-purpose/.test(input)) {
  say({ type: "progress", stage: "ingest", message: "reading", pct: 5 });
  setTimeout(() => {
    say({ type: "error", message: "The stand-in pipeline failed on purpose." });
    process.exit(1);
  }, step);
} else {
  const stages = ["ingest", "plan", "voice", "compose", "render", "encode"];
  stages.forEach((stage, i) =>
    setTimeout(() => say({ type: "progress", stage, message: stage, pct: Math.round(((i + 1) / (stages.length + 1)) * 100) }), i * step),
  );
  setTimeout(() => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    fs.mkdirSync(out, { recursive: true });
    const mp4 = path.join(out, "explainer.mp4");
    fs.copyFileSync(path.join(here, "fixtures/gallery/sample.mp4"), mp4);
    say({
      type: "done",
      manifest: {
        title: "A stand-in explainer",
        durationSec: 2,
        brief: { approach: "story" },
        cost: { metaUsd: 0, voiceUsd: 0 },
        outputs: { mp4 },
      },
    });
    process.exit(0);
  }, stages.length * step);
}
