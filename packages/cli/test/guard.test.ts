import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));

const run = (args: string[]) =>
  new Promise<{ code: number; out: string }>((resolve, reject) => {
    // the guard flag must not leak in from the test runner's own environment
    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.EXPLANIMATE_ALLOW_PRIVATE_URLS;
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-cli-guard-"));
    env.TEMP = scratch;
    env.TMP = scratch;
    execFile(
      process.execPath,
      ["--import", "tsx", bin, ...args],
      { env: env as NodeJS.ProcessEnv, cwd: root, timeout: 120_000 },
      (err, stdout, stderr) => {
        fs.rmSync(scratch, { recursive: true, force: true });
        if (err && typeof (err as NodeJS.ErrnoException).code !== "number") return reject(err);
        resolve({ code: (err as { code?: number })?.code ?? 0, out: String(stdout) + String(stderr) });
      },
    );
  });

test("the CLI names --allow-private in its help", async () => {
  const r = await run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /--allow-private/);
});

test("the CLI refuses a localhost link by default, before any render", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-cli-guard-out-"));
  const r = await run(["http://127.0.0.1:9/x", "--out", out, "--json"]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /private network/);
  assert.ok(!fs.existsSync(path.join(out, "manifest.json")), "no video was started");
  fs.rmSync(out, { recursive: true, force: true });
});
