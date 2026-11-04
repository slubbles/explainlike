import { expect, test } from "@playwright/test";
import { createVideo, signIn, uniqueEmail, uniqueIp } from "./helpers";

test("EXPLANIMATE_DAILY_VIDEOS=1 lets one video through, then refuses the next", async ({ request, baseURL }) => {
  const email = uniqueEmail();
  await signIn(request, baseURL!, email, uniqueIp());
  expect((await createVideo(request, baseURL!, "how DNS works", uniqueIp())).ok()).toBe(true);
  const second = await createVideo(request, baseURL!, "how TCP works", uniqueIp());
  expect(second.status()).toBe(429);
  expect((await second.json()).error).toBe("You've used all 1 videos for today. Your limit resets at 00:00 UTC.");
});
