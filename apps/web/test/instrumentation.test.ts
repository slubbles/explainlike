import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("server startup loads the repo-root .env and adopts pre-rename names", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "el-dotenv-"));
  fs.writeFileSync(path.join(root, ".env"), "EL_TEST_DOTENV_LOADED=yes\nEXPLAINLIKE_TRUST_PROXY=1\n");
  const keys = ["EL_TEST_DOTENV_LOADED", "EXPLAINLIKE_TRUST_PROXY", "EXPLANIMATE_TRUST_PROXY", "EXPLANIMATE_ROOT", "NEXT_RUNTIME"];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];
  try {
    for (const k of ["EL_TEST_DOTENV_LOADED", "EXPLAINLIKE_TRUST_PROXY", "EXPLANIMATE_TRUST_PROXY"]) delete process.env[k];
    process.env.EXPLANIMATE_ROOT = root;
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation.ts");
    await register();
    assert.equal(process.env.EL_TEST_DOTENV_LOADED, "yes");
    assert.equal(process.env.EXPLANIMATE_TRUST_PROXY, "1");
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("server startup does nothing outside the Node.js runtime", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "el-dotenv-edge-"));
  fs.writeFileSync(path.join(root, ".env"), "EL_TEST_DOTENV_EDGE=yes\n");
  const keys = ["EL_TEST_DOTENV_EDGE", "EXPLANIMATE_ROOT", "NEXT_RUNTIME"];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];
  try {
    delete process.env.EL_TEST_DOTENV_EDGE;
    process.env.EXPLANIMATE_ROOT = root;
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("../instrumentation.ts");
    await register();
    assert.equal(process.env.EL_TEST_DOTENV_EDGE, undefined);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
