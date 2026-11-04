#!/usr/bin/env node
// Load test: fire N concurrent short, cheap generate requests at an Explanimate server and report
// per-job wait and total time (p50/p95), sampling server CPU/RAM from /api/admin/metrics while it runs.
//
//   node scripts/loadtest.mjs 10 --base http://localhost:3000
//   node scripts/loadtest.mjs 10 --dry   # print the plan without sending anything
//
// The base URL comes from --base, LOADTEST_BASE_URL, or BASE_URL (default http://localhost:3000).
// Each request is a short silent topic video: no voice cost and the smallest plan. Never run this
// against production: explanimate.co is refused unless --allow-prod is passed.
//
// Server timings come from each job's status (wait for an API slot + render-slot wait inside the
// run, and request to video). Server CPU/RAM come from the admin-only /api/admin/metrics endpoint,
// sampled every --metrics-interval seconds; pass --cookie with a signed-in admin session cookie
// (or run with auth off, where the endpoint still answers 404 and sampling is skipped).

const args = process.argv.slice(2);
const usage = () =>
  `usage: node scripts/loadtest.mjs [N] [--base URL] [--input TEXT] [--timeout S] [--cookie COOKIE] [--metrics-interval S] [--dry] [--allow-prod]`;

let count = 10;
let base = process.env.LOADTEST_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
let input = "how DNS works";
let timeoutS = 600;
let cookie = process.env.LOADTEST_COOKIE || "";
let metricsIntervalS = 2;
let dry = false;
let allowProd = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry") dry = true;
  else if (a === "--allow-prod") allowProd = true;
  else if (a === "--base") base = args[++i] ?? base;
  else if (a === "--input") input = args[++i] ?? input;
  else if (a === "--timeout") timeoutS = Number(args[++i]) || timeoutS;
  else if (a === "--cookie") cookie = args[++i] ?? cookie;
  else if (a === "--metrics-interval") metricsIntervalS = Number(args[++i]) || metricsIntervalS;
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
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

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

// Server CPU/RAM samples from the admin-only metrics endpoint, taken in the background.
const samples = [];
let metricsNote = "";
async function sampleMetrics(stop) {
  const headers = cookie ? { cookie } : {};
  let tried = false;
  while (!stop.done) {
    try {
      const r = await fetch(`${baseUrl.origin}/api/admin/metrics`, { headers });
      if (r.status === 404 && !tried) {
        metricsNote = "server metrics unavailable (the metrics endpoint is admin-only; pass --cookie with an admin session)";
        return;
      }
      if (r.ok) {
        const m = await r.json();
        if (Array.isArray(m.loadavg) && m.process && typeof m.freemem === "number") samples.push({ at: Date.now(), ...m });
      }
    } catch {
      /* the server is busy rendering; a missed sample is fine */
    }
    tried = true;
    await sleep(metricsIntervalS * 1000);
  }
}

/**
 * Poll one job to done. Wait and total come from the server's own timings when it reports
 * them (queue wait + render-slot wait, and request to video); otherwise they are inferred
 * from the polls, as before.
 */
async function follow(job) {
  const deadline = Date.now() + timeoutS * 1000;
  let pickedUp;
  let last = null;
  for (;;) {
    const r = await fetch(`${baseUrl.origin}/api/jobs/${job.id}`, { headers: { "cache-control": "no-store" } });
    if (!r.ok) throw new Error(`job ${job.id}: poll failed (${r.status})`);
    const j = await r.json();
    last = j;
    const now = Date.now();
    if (!pickedUp && (j.message !== "starting soon" || j.pct > 0 || j.stage !== "start")) pickedUp = now;
    if (j.state === "done" || j.state === "error") {
      const t = j.timings ?? {};
      const queueMs = typeof t.waitMs === "number" ? t.waitMs : (pickedUp ?? now) - job.posted;
      const renderWaitMs = typeof t.renderWaitMs === "number" ? t.renderWaitMs : 0;
      const totalMs = typeof t.totalMs === "number" ? t.totalMs : now - job.posted;
      return { id: job.id, state: j.state, error: j.error, queueMs, renderWaitMs, waitMs: queueMs + renderWaitMs, totalMs };
    }
    if (now > deadline) {
      const t = last?.timings ?? {};
      const queueMs = typeof t.waitMs === "number" ? t.waitMs : (pickedUp ?? now) - job.posted;
      return { id: job.id, state: "timeout", queueMs, renderWaitMs: 0, waitMs: queueMs, totalMs: now - job.posted };
    }
    await sleep(1000);
  }
}

const t0 = Date.now();
const jobs = await Promise.all([...Array(count).keys()].map(submit)).catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
console.log(`submitted ${jobs.length} jobs, polling to done (timeout ${timeoutS}s each)...`);
const stop = { done: false };
const sampling = sampleMetrics(stop);
const results = await Promise.all(jobs.map(follow));
stop.done = true;
await sampling;
const done = results.filter((r) => r.state === "done");
const failed = results.filter((r) => r.state !== "done");
const waits = done.map((r) => r.waitMs).sort((a, b) => a - b);
const totals = done.map((r) => r.totalMs).sort((a, b) => a - b);
console.log(
  `finished in ${ms(Date.now() - t0)}: ${done.length} done, ${failed.length} failed${failed.length ? ` (${failed.map((f) => f.id).join(", ")})` : ""}`,
);
for (const f of failed.slice(0, 5)) console.log(`  ${f.id}: ${f.state}${f.error ? ` — ${String(f.error).slice(0, 160)}` : ""}`);
for (const r of done) {
  console.log(`  ${r.id}: wait ${ms(r.waitMs)} (queue ${ms(r.queueMs)} + render slot ${ms(r.renderWaitMs)}), total ${ms(r.totalMs)}`);
}
if (done.length) {
  console.log(`wait  p50 ${ms(percentile(waits, 0.5))}  p95 ${ms(percentile(waits, 0.95))}`);
  console.log(`total p50 ${ms(percentile(totals, 0.5))}  p95 ${ms(percentile(totals, 0.95))}`);
}
if (samples.length) {
  const load1 = samples.map((s) => s.loadavg[0]);
  const rss = samples.map((s) => s.process.rss);
  const free = samples.map((s) => s.freemem);
  const gb = (n) => `${(n / 1024 ** 3).toFixed(2)} GB`;
  const mb = (n) => `${Math.round(n / 1024 ** 2)} MB`;
  console.log(
    `server over ${samples.length} samples: load1 avg ${avg(load1).toFixed(2)} max ${Math.max(...load1).toFixed(2)} (${samples[0].cpus} cores), ` +
      `app RSS avg ${mb(avg(rss))} max ${mb(Math.max(...rss))}, free mem min ${gb(Math.min(...free))}`,
  );
} else if (metricsNote) {
  console.log(metricsNote);
}
process.exit(failed.length ? 1 : 0);
