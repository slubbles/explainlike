// stands in for the real CLI in tests: reports progress, then finishes like a render would
const wait = Number(process.env.FAKE_DELAY_MS ?? 300);
console.log(JSON.stringify({ type: "progress", stage: "plan", message: "planning", pct: 10 }));
setTimeout(() => {
  console.log(JSON.stringify({ type: "done", manifest: {
    title: "a stand-in", durationSec: 1, brief: { approach: "story" }, cost: { metaUsd: 0, voiceUsd: 0 }, outputs: {},
  } }));
  process.exit(0);
}, wait);
