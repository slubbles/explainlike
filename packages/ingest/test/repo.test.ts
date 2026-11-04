import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkout, cloneTimeoutMs, digestRepo, ingestRepo } from "@explanimate/ingest";

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

test("a scoped checkout reads only the folder: files, title and digest stay inside it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-scope-"));
  try {
    fs.mkdirSync(path.join(dir, "packages", "cli"), { recursive: true });
    fs.mkdirSync(path.join(dir, "packages", "api"), { recursive: true });
    fs.writeFileSync(path.join(dir, "packages", "cli", "index.ts"), "export const cli = 1;\n");
    fs.writeFileSync(path.join(dir, "packages", "cli", "README.md"), "# cli\n");
    fs.writeFileSync(path.join(dir, "packages", "api", "index.ts"), "export const api = 1;\n");
    fs.writeFileSync(path.join(dir, "README.md"), "# root\n");
    const r = await ingestRepo(dir, { subpath: "packages/cli" });
    assert.equal(r.subpath, "packages/cli");
    assert.equal(r.title, `${path.basename(dir)}/packages/cli`);
    assert.deepEqual([...r.files].sort(), ["README.md", "index.ts"]);
    assert.equal(r.digest.read("index.ts").trim(), "export const cli = 1;");
    assert.equal(r.digest.read("packages/api/index.ts"), "", "outside files are unreadable");
    assert.doesNotMatch(r.text, /export const api/);
    assert.match(r.text, /export const cli/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a scoped git checkout lists the folder through git, relative to the folder", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-scope-git-"));
  try {
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], {
        encoding: "utf8",
      });
    git("init", "-b", "main");
    fs.mkdirSync(path.join(dir, "sub", "deep"), { recursive: true });
    fs.writeFileSync(path.join(dir, "sub", "deep", "a.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(dir, "top.ts"), "export const top = 1;\n");
    git("add", "-A");
    git("commit", "-m", "x", "--quiet");
    const co = checkout(dir, { subpath: "sub" });
    const d = digestRepo(co.dir);
    assert.deepEqual(d.files, ["deep/a.ts"]);
    const r = await ingestRepo(dir, { subpath: "sub/deep" });
    assert.deepEqual(r.files, ["a.ts"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a scoped folder that is missing, a file, or escaping is refused with a reason", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-scope-err-"));
  try {
    fs.writeFileSync(path.join(dir, "file.txt"), "x\n");
    await assert.rejects(ingestRepo(dir, { subpath: "nope" }), /was not found/);
    await assert.rejects(ingestRepo(dir, { subpath: "file.txt" }), /not a folder/);
    await assert.rejects(ingestRepo(dir, { subpath: "../etc" }), /Invalid path/);
    await assert.rejects(ingestRepo(dir, { subpath: "/abs" }), /Invalid path/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
