import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRepoSubpath, parseGithubUrl } from "../src/repopath.ts";

test("plain repo links parse to owner and repo, ignoring blob paths and queries", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/milind-soni/OpenMausBot"), { owner: "milind-soni", repo: "OpenMausBot" });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo/"), { owner: "owner", repo: "repo" });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo.git"), { owner: "owner", repo: "repo" });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo/blob/main/README.md"), { owner: "owner", repo: "repo" });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo?tab=readme"), { owner: "owner", repo: "repo" });
  assert.equal(parseGithubUrl("https://example.com/owner/repo"), null);
  assert.equal(parseGithubUrl("not a link"), null);
});

test("tree links parse to branch and subfolder", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo/tree/main"), { owner: "owner", repo: "repo", ref: "main" });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo/tree/main/"), { owner: "owner", repo: "repo", ref: "main" });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo/tree/main/packages/cli"), {
    owner: "owner",
    repo: "repo",
    ref: "main",
    subpath: "packages/cli",
  });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/repo/tree/dev/a/b/?plain=1"), {
    owner: "owner",
    repo: "repo",
    ref: "dev",
    subpath: "a/b",
  });
  assert.deepEqual(parseGithubUrl("https://github.com/owner/my.repo/tree/v1.2/docs"), {
    owner: "owner",
    repo: "my.repo",
    ref: "v1.2",
    subpath: "docs",
  });
});

test("a subfolder path is cleaned, and an empty one means the whole repo", () => {
  assert.equal(normalizeRepoSubpath(undefined), undefined);
  assert.equal(normalizeRepoSubpath(""), undefined);
  assert.equal(normalizeRepoSubpath("  "), undefined);
  assert.equal(normalizeRepoSubpath("."), undefined);
  assert.equal(normalizeRepoSubpath("packages/cli"), "packages/cli");
  assert.equal(normalizeRepoSubpath("  packages/cli/ "), "packages/cli");
  assert.equal(normalizeRepoSubpath("a"), "a");
  assert.equal(normalizeRepoSubpath(".github/workflows"), ".github/workflows");
});

test("an escaping or absolute path is refused with a reason", () => {
  for (const p of ["..", "../etc", "a/../b", "a/./b", "/etc", "/a/b", "C:\\repo", "a\\b", "a//b"]) {
    assert.throws(() => normalizeRepoSubpath(p), /Invalid path/, p);
  }
  assert.throws(() => normalizeRepoSubpath("a".repeat(501)), /over 500/);
});
