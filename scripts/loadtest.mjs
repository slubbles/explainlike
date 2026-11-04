#!/usr/bin/env node
// Load test: fire N concurrent short, cheap generate requests at an Explanimate server and report
// how long each waited for a render slot and how long it rendered (p50/p95).
//
//   node scripts/loadtest.mjs 10 --base http://localhost:3000
//   node scripts/loadtest.mjs 10 --dry   # print the plan without sending anything
//
// The base URL comes from --base, LOADTEST_BASE_URL, or BASE_URL (default http://localhost:3000).
// Each request is a short silent topic video: no voice cost and the smallest plan. Never run this
// against production: explanimate.co is refused unless --allow-prod is passed.

const args = process.argv.slice(2);
const usage = () => `usage: node scripts/loadtest.mjs [N] [--base URL] [--input TEXT] [--timeout S] [--dry] [--allow-prod]`;

let count = 10;
let base = process.env.LOADTEST_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
let input = "how DNS works";
let timeoutS = 600;
let dry = false;
let allowProd = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry") dry = true;
  else if (a === "--allow-prod") allowProd = true;
  else if (a === "--base") base = args[++i] ?? base;
  else if (a === "--input") input = args[++i] ?? input;
  else if (a === "--timeout") timeoutS = Number(args[++i]) || timeoutS;
  else if (a === "--help" || a === "-h") {
    console.log(usage());
    process.exit(0);
  } else if (/^\d+$/.test(a)) count = Number(a);
  else {
    console.error(`unknown argument: ${a}\n${usage()}`);
    process.exit(1);
  }
}
if (!Number.isInteger(count) || count < 1 || count > 100) {
  console.error("N is a whole number of concurrent videos, 1 to 100.");
  process.exit(1);
}
let baseUrl;
try {
  baseUrl = new URL(base);
} catch {
  console.error(`not a URL: ${base}`);
  process.exit(1);
}
if (!allowProd && /(^|\.)explanimate\.co$/i.test(baseUrl.hostname)) {
  console.error("refusing to load test production (explanimate.co). Point --base at a local server instead.");
  process.exit(1);
}

const payload = { input, voice: "silent", format: "short" };
console.log(`target: ${baseUrl.origin}  videos: ${count}  input: "${input}" (short, silent)`);
if (dry) {
  console.log(`dry run: would POST ${count} concurrent jobs to ${baseUrl.origin}/api/jobs and poll each to done.`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (n) => `${(n / 1000).toFixed(1)}s`;
const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length))) - 1];
};

/** POST one job; throws with the server's message on refusal. */
async function submit(i) {
  const r = await fetch(`${baseUrl.origin}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("the server needs sign-in; load test a local server with auth off");
  if (!r.ok) throw new Error(`job ${i + 1} refused (${r.status}): ${body.error ?? "no reason given"}`);
  return { id: body.id, posted: Date.now() };
}

/**
 * Poll one job to done. A waiting job shows "starting soon"; the first poll past that is when its
 * render slot picked it up, so posted->picked up is the queue wait and picked up->done is the render.
 */
async function follow(job) {
  const deadline = Date.now() + timeoutS * 1000;
  let pickedUp;
  for (;;) {
    const r = await fetch(`${baseUrl.origin}/api/jobs/${job.id}`, { headers: { "cache-control": "no-store" } });
    if (!r.ok) throw new Error(`job ${job.id}: poll failed (${r.status})`);
    const j = await r.json();
    const now = Date.now();
    if (!pickedUp && (j.message !== "starting soon" || j.pct > 0 || j.stage !== "start")) pickedUp = now;
    if (j.state === "done" || j.state === "error") {
      return { id: job.id, state: j.state, error: j.error, waitMs: (pickedUp ?? now) - job.posted, renderMs: now - (pickedUp ?? now) };
    }
    if (now > deadline) return { id: job.id, state: "timeout", waitMs: (pickedUp ?? now) - job.posted, renderMs: now - (pickedUp ?? now) };
    await sleep(1000);
  }
}

const t0 = Date.now();
const jobs = await Promise.all([...Array(count).keys()].map(submit)).catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
console.log(`submitted ${jobs.length} jobs, polling to done (timeout ${timeoutS}s each)...`);
const results = await Promise.all(jobs.map(follow));
const done = results.filter((r) => r.state === "done");
const failed = results.filter((r) => r.state !== "done");
const waits = done.map((r) => r.waitMs).sort((a, b) => a - b);
const renders = done.map((r) => r.renderMs).sort((a, b) => a - b);
console.log(
  `finished in ${ms(Date.now() - t0)}: ${done.length} done, ${failed.length} failed${failed.length ? ` (${failed.map((f) => f.id).join(", ")})` : ""}`,
);
for (const f of failed.slice(0, 5)) console.log(`  ${f.id}: ${f.state}${f.error ? ` — ${String(f.error).slice(0, 160)}` : ""}`);
if (done.length) {
  console.log(`queue wait  p50 ${ms(percentile(waits, 0.5))}  p95 ${ms(percentile(waits, 0.95))}`);
  console.log(`render time p50 ${ms(percentile(renders, 0.5))}  p95 ${ms(percentile(renders, 0.95))}`);
}
process.exit(failed.length ? 1 : 0);
