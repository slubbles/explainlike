import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  budget,
  clientIp,
  dailyBudget,
  dailyCap,
  dailyReserve,
  rateLimit,
  readBody,
  recordSpend,
  spent,
  spentToday,
} from "../lib/guard.ts";

test("the per-IP limit lets a burst through, then says how long to wait, then frees up", () => {
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit("k:1.2.3.4", 3, 60_000, t + i), 0);
  const wait = rateLimit("k:1.2.3.4", 3, 60_000, t + 10);
  assert.ok(wait > 0 && wait <= 60, String(wait));
  assert.equal(rateLimit("k:5.6.7.8", 3, 60_000, t + 10), 0, "another address has its own window");
  assert.equal(rateLimit("k:1.2.3.4", 3, 60_000, t + 60_001), 0);
});

test("X-Forwarded-For is only believed behind a trusted proxy", () => {
  const req = new Request("http://x/", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
  delete process.env.EXPLANIMATE_TRUST_PROXY;
  assert.equal(clientIp(req), "direct");
  process.env.EXPLANIMATE_TRUST_PROXY = "1";
  assert.equal(clientIp(req), "9.9.9.9");
  delete process.env.EXPLANIMATE_TRUST_PROXY;
});

test("oversized and broken bodies are refused with a plain message", async () => {
  // like the site's own requests: a fetch string body would default to text/plain and answer 415 instead
  const json = { "content-type": "application/json" };
  const big = await readBody(
    new Request("http://x/", { method: "POST", headers: json, body: JSON.stringify({ input: "a".repeat(20_000) }) }),
  );
  assert.ok("error" in big && big.error.status === 413);
  const bad = await readBody(new Request("http://x/", { method: "POST", headers: json, body: "{not json" }));
  assert.ok("error" in bad && bad.error.status === 400);
  const ok = await readBody(
    new Request("http://x/", { method: "POST", headers: json, body: JSON.stringify({ input: "https://github.com/a/b" }) }),
  );
  assert.deepEqual("body" in ok && ok.body, { input: "https://github.com/a/b" });
});

test("the spend guard warns past 80% of a cap and pauses before a job could cross it", () => {
  const caps = { meta: 25, voice: 3 },
    reserve = { meta: 1, voice: 0.15 };
  assert.deepEqual(budget({ meta: 5, voice: 0.5 }, caps, reserve), {
    ok: true,
    error: undefined,
    warnings: [],
    spent: { meta: 5, voice: 0.5 },
    caps,
  });
  const warn = budget({ meta: 21, voice: 0.5 }, caps, reserve);
  assert.ok(warn.ok);
  assert.match(warn.warnings[0], /Meta \(Muse\) spend is at \$21\.00 of a \$25\.00 cap/);
  const stop = budget({ meta: 3, voice: 2.9 }, caps, reserve);
  assert.equal(stop.ok, false);
  assert.match(stop.error!, /Deepgram budget is nearly used up \(\$2\.90 of \$3\.00\).*EXPLANIMATE_VOICE_CAP_USD/);
});

test("spend adds every job's meter to the ledger of side calls", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-spend-"));
  recordSpend(dir, { meta: 0.01 }, "voice turn");
  recordSpend(dir, { voice: 0.002 }, "voice speak");
  fs.appendFileSync(path.join(dir, "spend.jsonl"), '{"torn');
  const s = spent(dir, [{ usd: { meta: 0.3, voice: 0.09 } }, {}]);
  assert.ok(Math.abs(s.meta - 0.31) < 1e-9 && Math.abs(s.voice - 0.092) < 1e-9, JSON.stringify(s));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("today's spend counts only jobs started today plus today's ledger lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-daily-"));
  const today = Date.parse("2026-05-01T12:00:00Z");
  const yesterday = Date.parse("2026-04-30T12:00:00Z");
  fs.writeFileSync(
    path.join(dir, "spend.jsonl"),
    [
      JSON.stringify({ t: today, what: "voice turn", meta: 0.01, voice: 0 }),
      JSON.stringify({ t: yesterday, what: "old", meta: 9, voice: 9 }),
      '{"torn',
    ].join("\n"),
  );
  const total = spentToday(
    dir,
    [{ started: today, usd: { meta: 0.2, voice: 0.05 } }, { started: yesterday, usd: { meta: 5, voice: 5 } }, { started: today }],
    today,
  );
  assert.ok(Math.abs(total - 0.26) < 1e-9, String(total));
  assert.equal(spentToday(dir, [], yesterday + 1), 18, "yesterday still sums on its own day");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the daily guard pauses new videos once today's spend plus one reserve passes the cap", () => {
  assert.deepEqual(dailyBudget(1, 3, 1.15), { ok: true });
  assert.deepEqual(dailyBudget(1.86, 3, 1.15), {
    ok: false,
    error: "Today's budget is used up, new videos are paused until 00:00 UTC.",
  });
  const saved = {
    cap: process.env.EXPLANIMATE_DAILY_CAP_USD,
    meta: process.env.EXPLANIMATE_META_RESERVE_USD,
    voice: process.env.EXPLANIMATE_VOICE_RESERVE_USD,
  };
  delete process.env.EXPLANIMATE_DAILY_CAP_USD;
  delete process.env.EXPLANIMATE_META_RESERVE_USD;
  delete process.env.EXPLANIMATE_VOICE_RESERVE_USD;
  assert.equal(dailyCap(), 3);
  assert.ok(Math.abs(dailyReserve() - 1.15) < 1e-9, String(dailyReserve()));
  process.env.EXPLANIMATE_DAILY_CAP_USD = "10";
  assert.equal(dailyCap(), 10);
  for (const [k, v] of Object.entries(saved)) {
    const name = { cap: "EXPLANIMATE_DAILY_CAP_USD", meta: "EXPLANIMATE_META_RESERVE_USD", voice: "EXPLANIMATE_VOICE_RESERVE_USD" }[k]!;
    if (v === undefined) delete process.env[name];
    else process.env[name] = v;
  }
});

test("no client code reads a server secret", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const files = ["app", "components", "lib"]
    .flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true }).map((f) => path.join(root, d, String(f))))
    .filter((f) => /\.tsx?$/.test(f));
  const client = files.filter((f) => /^["']use client["']/m.test(fs.readFileSync(f, "utf8")));
  assert.ok(client.length > 3);
  for (const f of client) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /process\.env|API_KEY/, path.relative(root, f));
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /NEXT_PUBLIC_[A-Z_]*KEY/, path.relative(root, f));
});

test("job status reads get their own limit, roomy enough for a one-second poll, while other routes keep 12/min", async () => {
  const { limitRequest, pollPerMin } = await import("../lib/guard.ts");
  delete process.env.EXPLANIMATE_POLL_PER_MIN;
  delete process.env.EXPLANIMATE_REQ_PER_MIN;
  assert.ok(pollPerMin() >= 120);
  const req = () => new Request("http://x/api/jobs/abcdefabcdef");
  for (let i = 0; i < 90; i++) assert.equal(limitRequest(req(), "job-test-poll", pollPerMin()), undefined, `poll ${i} allowed`);
  for (let i = 0; i < 12; i++) assert.equal(limitRequest(req(), "jobs-test-create"), undefined);
  assert.equal(limitRequest(req(), "jobs-test-create")?.status, 429, "creation stays at 12/min");
  const route = fs.readFileSync(path.resolve(import.meta.dirname, "../app/api/jobs/[id]/route.ts"), "utf8");
  assert.match(route, /limitRequest\(req, "job", pollPerMin\(\)\)/);
});
