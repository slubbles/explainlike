import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloneTimeoutMs, digestRepo } from "@explanimate/ingest";

test("a garbage clone timeout falls back to 180 s instead of NaN", () => {
  assert.equal(cloneTimeoutMs({}), 180_000);
  assert.equal(cloneTimeoutMs({ EXPLANIMATE_CLONE_TIMEOUT_S: "30" }), 30_000);
  for (const v of ["soon", "NaN", "", "0", "-5", "Infinity"]) {
    const ms = cloneTimeoutMs({ EXPLANIMATE_CLONE_TIMEOUT_S: v });
    assert.ok(Number.isFinite(ms) && ms > 0, v);
    assert.equal(ms, 180_000, v);
  }
});

test("symlinks are listed by nothing and followed by nothing, even inside the repo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-repo-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-outside-"));
  try {
    fs.writeFileSync(path.join(dir, "README.md"), "# demo\n");
    fs.writeFileSync(path.join(dir, "inside.txt"), "inside content");
    fs.writeFileSync(path.join(outside, "secret.txt"), "outside secret content");
    let files = true;
    for (const [target, link] of [
      [path.join(outside, "secret.txt"), path.join(dir, "evil.txt")],
      [path.join(dir, "inside.txt"), path.join(dir, "inner.txt")],
    ] as const) {
      try {
        fs.symlinkSync(target, link);
      } catch {
        files = false;
        break;
      }
    }
    // a directory link needs no privilege anywhere (junction on Windows), so this half always runs
    fs.symlinkSync(outside, path.join(dir, "evildir"), process.platform === "win32" ? "junction" : undefined);
    const d = digestRepo(dir);
    assert.ok(!d.files.includes("evildir"), "a linked directory is not listed");
    assert.equal(d.read("evildir"), "");
    if (!files) {
      assert.ok(true, "file symlinks skipped: this user cannot create them");
      return;
    }
    assert.ok(!d.files.includes("evil.txt"), "an escaping symlink is not listed");
    assert.ok(!d.files.includes("inner.txt"), "an inside symlink is not listed either");
    assert.equal(d.read("evil.txt"), "");
    assert.doesNotMatch(d.text, /outside secret content/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
