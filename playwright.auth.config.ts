import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/**
 * Sign-up and limit tests against production builds with auth on. Each server uses a local
 * SQLite stand-in for D1, captures login codes to a file instead of sending them, and takes
 * Cloudflare's documented Turnstile test keys. Build first: pnpm --filter @explanimate/web build.
 * CHROME_PATH points at a local Chrome; otherwise the installed Chrome channel is used.
 */
const chrome = process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : { channel: "chrome" as const };

const server = (port: number, extra: Record<string, string>) => {
  const tmp = path.join(os.tmpdir(), `explanimate-e2e-${port}`);
  return {
    command: `pnpm --filter @explanimate/web exec next start -p ${port}`,
    url: `http://localhost:${port}/docs`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      EXPLANIMATE_CLI: path.resolve("e2e/fake-cli.mjs"),
      EXPLANIMATE_JOBS_DIR: path.join(tmp, "jobs"),
      EXPLANIMATE_GALLERY_DIR: path.resolve("e2e/fixtures/gallery"),
      EXPLANIMATE_AUTH_ENABLED: "1",
      BETTER_AUTH_SECRET: "e2e-test-secret-not-for-production-0123456789",
      BETTER_AUTH_URL: `http://localhost:${port}`,
      EXPLANIMATE_D1_LOCAL_PATH: path.join(tmp, "auth.db"),
      EXPLANIMATE_EMAIL_CAPTURE_DIR: path.join(tmp, "mail"),
      EXPLANIMATE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      EXPLANIMATE_TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
      EXPLANIMATE_TURNSTILE_HOSTNAMES: "localhost,127.0.0.1",
      EXPLANIMATE_TRUST_PROXY: "1",
      EXPLANIMATE_DAILY_VIDEOS: "3",
      EXPLANIMATE_JOBS_PER_HOUR: "3",
      FAKE_STEP_MS: "200",
      NEXT_TELEMETRY_DISABLED: "1",
      ...extra,
    },
  };
};

export default defineConfig({
  testDir: "e2e/auth",
  globalSetup: "./e2e/auth/global-setup.ts",
  timeout: 30_000,
  // one worker: the tests share one database, jobs folder and rate-limit memory per server
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", ...chrome },
  projects: [
    { name: "auth", testMatch: ["signup.spec.ts", "limits.spec.ts"], use: { baseURL: "http://localhost:3124" } },
    {
      name: "auth-env",
      testMatch: ["daily-env.spec.ts"],
      use: { baseURL: "http://localhost:3125" },
    },
  ],
  webServer: [server(3124, {}), server(3125, { EXPLANIMATE_DAILY_VIDEOS: "1", EXPLANIMATE_JOBS_PER_HOUR: "1000" })],
});
