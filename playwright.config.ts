import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/**
 * Browser tests against a production build of the web app. The pipeline is swapped for e2e/fake-cli.mjs,
 * so no model or voice keys are needed. Build first: pnpm --filter @explanimate/web build.
 * CHROME_PATH points at a local Chrome; otherwise the installed Chrome channel is used.
 */
const PORT = Number(process.env.E2E_PORT ?? 3123);
const tmp = path.join(os.tmpdir(), `explanimate-e2e-${PORT}`);
const chrome = process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : { channel: "chrome" as const };

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...chrome },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], ...chrome } },
  ],
  webServer: {
    command: `pnpm --filter @explanimate/web exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/docs`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      EXPLANIMATE_CLI: path.resolve("e2e/fake-cli.mjs"),
      EXPLANIMATE_JOBS_DIR: path.join(tmp, "jobs"),
      EXPLANIMATE_GALLERY_DIR: path.resolve("e2e/fixtures/gallery"),
      EXPLANIMATE_AUTH_ENABLED: "0",
      EXPLANIMATE_JOBS_PER_HOUR: "1000",
      EXPLANIMATE_REQ_PER_MIN: "1000",
      FAKE_STEP_MS: "200",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
