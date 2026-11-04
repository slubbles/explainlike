import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createVideo, jobsDir, signIn, uniqueEmail, uniqueIp } from "./helpers";

test("the 4th video in a day is refused with a friendly limit error", async ({ request, baseURL }) => {
  const email = uniqueEmail();
  await signIn(request, baseURL!, email, uniqueIp());
  // a fresh caller per video: the hourly per-IP cap must not fire before the daily per-account one
  for (let i = 0; i < 3; i++) {
    const res = await createVideo(request, baseURL!, `how DNS works ${i}`, uniqueIp());
    expect(res.ok()).toBe(true);
  }
  const fourth = await createVideo(request, baseURL!, "how TCP works", uniqueIp());
  expect(fourth.status()).toBe(429);
  expect((await fourth.json()).error).toBe("You've used all 3 videos for today. Your limit resets at 00:00 UTC.");

  const config = await request.get("/api/auth-config");
  expect(((await config.json()) as { videos: unknown }).videos).toMatchObject({ used: 3, limit: 3, left: 0 });
});

test("the hourly per-IP limit holds across accounts, and another address still works", async ({ request, baseURL }) => {
  const ip = uniqueIp();
  for (let i = 0; i < 3; i++) {
    const email = uniqueEmail();
    await signIn(request, baseURL!, email, uniqueIp());
    const res = await createVideo(request, baseURL!, `per-ip video ${i}`, ip);
    expect(res.ok()).toBe(true);
  }
  const fourthEmail = uniqueEmail();
  await signIn(request, baseURL!, fourthEmail, uniqueIp());
  const limited = await createVideo(request, baseURL!, "per-ip video 3", ip);
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error).toMatch(/Hourly limit reached/);

  const freshEmail = uniqueEmail();
  await signIn(request, baseURL!, freshEmail, uniqueIp());
  const fresh = await createVideo(request, baseURL!, "per-ip video fresh", uniqueIp());
  expect(fresh.ok()).toBe(true);
});

test("the global daily spend guard blocks new jobs", async ({ request, baseURL }) => {
  const email = uniqueEmail();
  await signIn(request, baseURL!, email, uniqueIp());
  const dir = jobsDir(Number(new URL(baseURL!).port));
  fs.mkdirSync(dir, { recursive: true });
  const ledger = path.join(dir, "spend.jsonl");
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : null;
  try {
    fs.appendFileSync(ledger, JSON.stringify({ t: Date.now(), what: "e2e spend guard", meta: 10, voice: 0 }) + "\n");
    const res = await createVideo(request, baseURL!, "how DNS works", uniqueIp());
    expect(res.status()).toBe(429);
    expect((await res.json()).error).toBe("Today's budget is used up, new videos are paused until 00:00 UTC.");
  } finally {
    if (before === null) fs.rmSync(ledger, { force: true });
    else fs.writeFileSync(ledger, before);
  }
});
