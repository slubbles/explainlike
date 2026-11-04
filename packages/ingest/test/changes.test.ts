import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { collectWorkingChanges, formatWorkingChanges } from "../src/changes.ts";
import { digestRepo, ingestRepo } from "../src/repo.ts";

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-changes-"));
const write = (dir: string, file: string, body: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
};
const repo = () => {
  const dir = scratch();
  git(dir, "init", "-b", "main");
  return dir;
};
const commitAll = (dir: string, msg: string) => {
  git(dir, "add", "-A");
  git(dir, "commit", "-m", msg, "--quiet");
};

test("a folder that is not a git repo has no working changes to collect", () => {
  const dir = scratch();
  write(dir, "app.ts", "console.log(1);\n");
  assert.equal(collectWorkingChanges(dir), null);
});

test("an empty repo reports no commits and no changes", () => {
  const wc = collectWorkingChanges(repo())!;
  assert.equal(wc.empty, true);
  assert.equal(wc.branch, "main");
  assert.equal(wc.hasChanges, false);
  assert.deepEqual(wc.stats, []);
  assert.deepEqual(wc.commits, []);
  assert.match(formatWorkingChanges(wc), /no working changes and no recent commits/);
});

test("an empty repo with staged files reports them as the change", () => {
  const dir = repo();
  write(dir, "app.ts", "console.log(1);\n");
  git(dir, "add", "app.ts");
  const wc = collectWorkingChanges(dir)!;
  assert.equal(wc.empty, true);
  assert.equal(wc.hasChanges, true);
  assert.equal(wc.stats.length, 1);
  assert.equal(wc.stats[0].file, "app.ts");
  assert.equal(wc.stats[0].staged, true);
  assert.match(wc.diff, /console\.log\(1\)/);
});

test("staged, unstaged and untracked changes are collected; secrets stay hidden", () => {
  const dir = repo();
  write(dir, "a.txt", "one\n");
  commitAll(dir, "first");
  write(dir, "a.txt", "one\ntwo\n");
  write(dir, "b.txt", "staged new file\n");
  git(dir, "add", "b.txt");
  write(dir, "c.txt", "hello new file\n");
  write(dir, ".env", "KEY=secret\n");
  write(dir, "snap.bin", Buffer.from([0, 1, 2, 3]));
  const wc = collectWorkingChanges(dir)!;
  assert.equal(wc.branch, "main");
  assert.equal(wc.base, undefined, "on the default branch there is no base");
  assert.equal(wc.hasChanges, true);
  const byName = new Map(wc.stats.map((s) => [s.file, s]));
  assert.equal(byName.get("a.txt")?.unstaged, true);
  assert.equal(byName.get("b.txt")?.staged, true);
  assert.match(wc.diff, /\n\+two\n/);
  assert.match(wc.diff, /staged new file/);
  const un = new Map(wc.untracked.map((u) => [u.file, u]));
  assert.match(un.get("c.txt")?.excerpt ?? "", /hello new file/);
  assert.equal(un.get("snap.bin")?.skipped, "binary");
  assert.ok(!un.has(".env"), "a secret-looking name is never shown");
  assert.ok(wc.hiddenSecrets >= 1);
  const md = formatWorkingChanges(wc, "explain my current changes");
  assert.match(md, /Branch "main"|On "main"/);
  assert.match(md, /a\.txt \(\+1 -0\)/);
  assert.match(md, /new untracked files/);
  assert.match(md, /explain my current changes/);
  assert.ok(!md.includes("KEY=secret"));
});

test("a feature branch diffs against the merge-base with the default branch", () => {
  const dir = repo();
  write(dir, "a.txt", "one\n");
  write(dir, "b.txt", "keep\n");
  commitAll(dir, "base");
  git(dir, "checkout", "-b", "feature", "--quiet");
  write(dir, "a.txt", "one\nbranch line\n");
  write(dir, "feat.txt", "the new thing\n");
  commitAll(dir, "add the feature");
  write(dir, "b.txt", "keep\nwip\n");
  const wc = collectWorkingChanges(dir)!;
  assert.equal(wc.branch, "feature");
  assert.equal(wc.base, "main");
  assert.deepEqual(
    wc.commits.map((c) => c.subject),
    ["add the feature"],
  );
  const names = wc.stats.map((s) => s.file).sort();
  assert.deepEqual(names, ["a.txt", "b.txt", "feat.txt"]);
  assert.match(wc.diff, /branch line/, "the branch commit's diff is included");
  assert.match(wc.diff, /the new thing/);
  assert.match(wc.diff, /wip/, "and the uncommitted edit too");
  assert.match(formatWorkingChanges(wc), /Branch "feature" \(from "main"\)/);
});

test("a clean default branch has no changes but keeps its latest commits", () => {
  const dir = repo();
  write(dir, "a.txt", "one\n");
  commitAll(dir, "first");
  write(dir, "b.txt", "two\n");
  commitAll(dir, "second");
  const wc = collectWorkingChanges(dir)!;
  assert.equal(wc.hasChanges, false);
  assert.equal(wc.diff, "");
  assert.deepEqual(
    wc.commits.map((c) => c.subject),
    ["second", "first"],
  );
  assert.match(formatWorkingChanges(wc), /no uncommitted changes/);
});

test("caps bound every part of the collected changes", () => {
  const dir = repo();
  write(dir, "a.txt", "one\n");
  for (let i = 0; i < 4; i++) write(dir, `f${i}.txt`, `base ${i}\n`);
  commitAll(dir, "first");
  for (let i = 0; i < 4; i++) write(dir, `f${i}.txt`, `base ${i}\nchange ${i}\n`);
  for (let i = 0; i < 3; i++) write(dir, `new${i}.txt`, `new file ${i}\n`);
  const wc = collectWorkingChanges(dir, { maxFiles: 2, maxDiffChars: 60, maxUntracked: 1, maxCommits: 5 })!;
  assert.equal(wc.stats.length, 2);
  assert.equal(wc.statsTruncated, true);
  assert.equal(wc.diffTruncated, true);
  assert.ok(wc.diff.length <= 120);
  assert.equal(wc.untracked.length, 1);
  assert.equal(wc.untrackedTruncated, true);
  assert.match(formatWorkingChanges(wc), /\.\.\. and more/);
});

test("a plain folder is digested from its files, ignoring junk; binaries are listed but never read", () => {
  const dir = scratch();
  write(dir, "app/main.ts", "export const x = 1;\n");
  write(dir, "README.md", "# demo\n");
  write(dir, "node_modules/dep/index.js", "junk\n");
  write(dir, "dist/out.js", "junk\n");
  write(dir, "img.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const d = digestRepo(dir);
  assert.ok(d.files.includes("app/main.ts"));
  assert.ok(d.files.includes("README.md"));
  assert.ok(!d.files.some((f) => f.startsWith("node_modules/") || f.startsWith("dist/")));
  assert.equal(d.read("img.png"), "", "a binary is never read as text");
  assert.match(d.read("app/main.ts"), /export const x/);
  assert.equal(d.truncated, false);
});

test("digestRepo caps huge listings and says so", () => {
  const dir = scratch();
  for (let i = 0; i < 30; i++) write(dir, `f${i}.txt`, `file ${i}\n`);
  const d = digestRepo(dir, 42000, 10);
  assert.equal(d.files.length, 10);
  assert.equal(d.truncated, true);
  assert.match(d.text, /capped/);
});

test("ingestRepo refuses an empty folder and an empty repo with a friendly message", async () => {
  await assert.rejects(ingestRepo(scratch()), /no files to explain/);
  await assert.rejects(ingestRepo(repo()), /no commits and no files yet/);
  const secrets = scratch();
  write(secrets, ".env", "KEY=x\n");
  await assert.rejects(ingestRepo(secrets), /looks like a secret/);
});

test("ingestRepo explains a repo whose files are only staged (no commits yet)", async () => {
  const dir = repo();
  write(dir, "app.ts", "console.log(1);\n");
  git(dir, "add", "app.ts");
  const r = await ingestRepo(dir);
  assert.ok(r.digest.files.includes("app.ts"));
});
