import fs from "node:fs";
import { tmpRoot } from "./helpers";

/** Fresh database, jobs and captured mail for every run (ports match playwright.auth.config.ts). */
export default function globalSetup() {
  for (const port of [3124, 3125]) fs.rmSync(tmpRoot(port), { recursive: true, force: true });
}
