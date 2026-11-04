import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isSecretPath } from "./secrets.js";

/**
 * The current checkout's own working changes: the subject of a "what is this feature we are
 * working on" video. Branch name, diff against the merge-base with the default branch (or against
 * HEAD on the default branch), untracked new files with short excerpts, and recent branch commits.
 */

export interface FileChange {
  file: string;
  staged: boolean;
  unstaged: boolean;
  added: number;
  removed: number;
}

export interface UntrackedFile {
  file: string;
  /** first lines of a small text file, or "" with a reason when it cannot be shown */
  excerpt: string;
  skipped?: string;
}

export interface BranchCommit {
  hash: string;
  subject: string;
}

export interface WorkingChanges {
  dir: string;
  /** current branch, or "detached HEAD (abc1234)" */
  branch: string;
  /** default branch the feature branch is compared against, when on a feature branch */
  base?: string;
  /** true when the repo has no commits yet */
  empty: boolean;
  /** true when there is anything uncommitted (tracked edits or untracked files) */
  hasChanges: boolean;
  /** per-file stats, capped */
  stats: FileChange[];
  statsTruncated: boolean;
  /** unified diff of the changed files, capped */
  diff: string;
  diffTruncated: boolean;
  /** secret-looking changed files are counted here and never shown */
  hiddenSecrets: number;
  /** new files git does not track yet, capped */
  untracked: UntrackedFile[];
  untrackedTruncated: boolean;
  /** commits on this branch past the merge-base (or the latest commits, on the default branch) */
  commits: BranchCommit[];
}

export interface ChangesOptions {
  maxFiles?: number;
  maxDiffChars?: number;
  maxFileDiffChars?: number;
  maxUntracked?: number;
  maxExcerptChars?: number;
  maxCommits?: number;
}

const DEFAULTS = { maxFiles: 40, maxDiffChars: 8000, maxFileDiffChars: 1200, maxUntracked: 12, maxExcerptChars: 600, maxCommits: 10 };

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|svg|mp4|mov|mp3|wav|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|wasm|so|dylib|exe|bin|lock|snap|map|min\.js|min\.css|db|sqlite)$/i;

/** A numstat path with its rename resolved ("a/{old => new}" or "old => new" becomes the new name). */
function plainName(p: string): string {
  const arrow = p.indexOf(" => ");
  if (arrow < 0) return p;
  const brace = /\{[^}]* => ([^}]*)\}/.exec(p);
  if (brace) return p.slice(0, brace.index) + brace[1] + p.slice(brace.index + brace[0].length);
  return p.slice(arrow + 4);
}

function git(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 16 << 20,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return undefined;
  }
}

/** The default branch to compare a feature branch against: origin's HEAD, else main, else master. */
function defaultBranch(dir: string, branch: string): string | undefined {
  const head = git(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])?.trim().replace(/^origin\//, "");
  const cands = [head, "main", "master"].filter(Boolean) as string[];
  for (const c of cands) {
    if (c !== branch && git(dir, ["rev-parse", "--verify", "--quiet", c])) return c;
  }
  return undefined;
}

/** Short excerpt of a new file, or a reason it cannot be shown (binary, huge, secret-looking). */
function excerpt(dir: string, file: string, max: number): { excerpt: string; skipped?: string } {
  if (isSecretPath(file)) return { excerpt: "", skipped: "secret-looking name" };
  if (BINARY_EXT.test(file)) return { excerpt: "", skipped: "binary" };
  try {
    const abs = path.join(dir, file);
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > 256_000) return { excerpt: "", skipped: "too large" };
    const head = fs.readFileSync(abs, "utf8").slice(0, Math.max(max, 4096));
    if (head.includes("\0")) return { excerpt: "", skipped: "binary" };
    return { excerpt: head.slice(0, max).replace(/\n{3,}/g, "\n\n").trim() };
  } catch {
    return { excerpt: "", skipped: "unreadable" };
  }
}

/**
 * Collect the working changes of a local checkout, bounded so prompts stay small. Returns null
 * when the folder is not a git checkout (the caller explains its files instead); never throws for
 * odd repos (empty, detached, no default branch).
 */
export function collectWorkingChanges(dir: string, o: ChangesOptions = {}): WorkingChanges | null {
  const { maxFiles, maxDiffChars, maxFileDiffChars, maxUntracked, maxExcerptChars, maxCommits } = { ...DEFAULTS, ...o };
  const abs = path.resolve(dir);
  if (git(abs, ["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") return null;
  const empty = git(abs, ["rev-parse", "--verify", "--quiet", "HEAD"]) === undefined;
  let branch = git(abs, ["branch", "--show-current"])?.trim() ?? "";
  if (!branch) branch = `detached HEAD (${git(abs, ["rev-parse", "--short", "HEAD"])?.trim() ?? "no commits"})`;
  const base = empty ? undefined : defaultBranch(abs, branch);
  const mergeBase = !empty && base ? git(abs, ["merge-base", "HEAD", base])?.trim() || undefined : undefined;
  // on a feature branch the diff covers the branch's commits too; on the default branch it is the working tree
  const ref = empty ? undefined : mergeBase ?? "HEAD";

  // per-file state from the status, line counts from the diff; secret-looking files are never shown
  const status = git(abs, ["status", "--porcelain=v1", "--untracked-files=normal"]) ?? "";
  const staged = new Map<string, boolean>();
  const unstaged = new Map<string, boolean>();
  const untrackedNames: string[] = [];
  let hiddenSecrets = 0;
  for (const line of status.split("\n")) {
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let file = line.slice(3).trim();
    const arrow = file.indexOf(" -> ");
    if (arrow >= 0) file = file.slice(arrow + 4);
    if (isSecretPath(file)) {
      hiddenSecrets++;
      continue;
    }
    if (x === "?" || y === "?") {
      untrackedNames.push(file);
    } else {
      if (x !== " " && x !== "!") staged.set(file, true);
      if (y !== " " && y !== "!") unstaged.set(file, true);
    }
  }
  const numstat = (args: string[]) => git(abs, args) ?? "";
  const counts = new Map<string, { added: number; removed: number }>();
  const addNumstat = (out: string) => {
    for (const line of out.split("\n")) {
      const m = /^(\d+|-)\s+(\d+|-)\s+(.+)$/.exec(line.trim());
      if (!m) continue;
      const cur = counts.get(plainName(m[3])) ?? { added: 0, removed: 0 };
      cur.added += m[1] === "-" ? 0 : Number(m[1]);
      cur.removed += m[2] === "-" ? 0 : Number(m[2]);
      counts.set(plainName(m[3]), cur);
    }
  };
  if (ref) {
    addNumstat(numstat(["diff", "--numstat", ref]));
  } else {
    // no commits yet: staged changes against the empty tree, plus unstaged ones
    addNumstat(numstat(["diff", "--cached", "--numstat"]));
    addNumstat(numstat(["diff", "--numstat"]));
  }
  const names = [...new Set([...counts.keys(), ...staged.keys(), ...unstaged.keys()])].sort();
  const stats: FileChange[] = names.slice(0, maxFiles).map((file) => ({
    file,
    staged: staged.get(file) ?? false,
    unstaged: unstaged.get(file) ?? false,
    added: counts.get(file)?.added ?? 0,
    removed: counts.get(file)?.removed ?? 0,
  }));
  // a unified diff per file, each truncated, so one huge file cannot eat the budget
  const diffParts: string[] = [];
  let diffCut = false;
  for (const file of names.slice(0, maxFiles)) {
    const part = ref ? (git(abs, ["diff", ref, "--", file]) ?? "") : `${git(abs, ["diff", "--", file]) ?? ""}${git(abs, ["diff", "--cached", "--", file]) ?? ""}`;
    if (!part.trim()) continue;
    diffParts.push(part.length > maxFileDiffChars ? `${part.slice(0, maxFileDiffChars)}\n[... ${file} truncated]` : part.trimEnd());
  }
  let diff = diffParts.join("\n");
  if (diff.length > maxDiffChars) {
    diff = `${diff.slice(0, maxDiffChars)}\n[... diff truncated]`;
    diffCut = true;
  }
  const untracked: UntrackedFile[] = untrackedNames.slice(0, maxUntracked).map((file) => ({ file, ...excerpt(abs, file, maxExcerptChars) }));

  // branch commits past the merge-base; on the default branch (or with no base) the latest commits
  const logArgs = mergeBase
    ? ["log", `${mergeBase}..HEAD`, `--max-count=${maxCommits}`, "--format=%h%x1f%s%x1e"]
    : empty
      ? []
      : ["log", `--max-count=${maxCommits}`, "--format=%h%x1f%s%x1e"];
  const commits: BranchCommit[] = logArgs.length
    ? (git(abs, logArgs) ?? "")
        .split("\x1e")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e) => {
          const [hash, ...rest] = e.split("\x1f");
          return { hash: (hash ?? "").trim(), subject: rest.join(" ").trim().slice(0, 200) };
        })
        .filter((c) => c.hash)
    : [];
  const hasChanges = stats.length > 0 || untracked.length > 0;
  return {
    dir: abs,
    branch,
    base,
    empty,
    hasChanges,
    stats,
    statsTruncated: names.length > stats.length,
    diff,
    diffTruncated: diffCut || names.length > stats.length,
    hiddenSecrets,
    untracked,
    untrackedTruncated: untrackedNames.length > untracked.length,
    commits,
  };
}

/**
 * The working changes as a planning source: branch, per-file stats, truncated diff, new files and
 * branch commits. With no uncommitted changes it says so and frames the branch commits as the
 * subject instead, so the video still answers the question.
 */
export function formatWorkingChanges(wc: WorkingChanges, question?: string): string {
  const sec: string[] = [];
  const head = wc.empty
    ? `Branch "${wc.branch}" (no commits yet).`
    : wc.base
      ? `Branch "${wc.branch}" (from "${wc.base}").`
      : `On "${wc.branch}".`;
  const subject = wc.hasChanges
    ? "Explain what this feature/change does and why, grounded in the diff below; the rest of the repo is context only."
    : wc.commits.length
      ? "There are no uncommitted changes; explain what this branch's recent commits did and why."
      : "There are no working changes and no recent commits; explain the repo as it stands.";
  sec.push(`## working changes (the video's subject)\n${head}${question ? ` The viewer asked: "${question.trim().slice(0, 300)}".` : ""} ${subject}`);
  if (wc.stats.length) {
    const lines = wc.stats.map(
      (s) => `- ${s.file} (+${s.added} -${s.removed})${s.staged && s.unstaged ? " staged and unstaged" : s.staged ? " staged" : s.unstaged ? " unstaged" : ""}`,
    );
    if (wc.statsTruncated) lines.push("- ... and more");
    sec.push(`### changed files (${wc.stats.length}${wc.statsTruncated ? "+" : ""})\n${lines.join("\n")}`);
  }
  if (wc.diff.trim()) sec.push(`### diff${wc.diffTruncated ? " (truncated)" : ""}\n${wc.diff.trim()}`);
  if (wc.hiddenSecrets) sec.push(`(${wc.hiddenSecrets} secret-looking file(s) hidden)`);
  if (wc.untracked.length) {
    const lines = wc.untracked.map((u) => (u.excerpt ? `- ${u.file}:\n${u.excerpt}` : `- ${u.file} (${u.skipped ?? "hidden"})`));
    if (wc.untrackedTruncated) lines.push("- ... and more");
    sec.push(`### new untracked files (${wc.untracked.length}${wc.untrackedTruncated ? "+" : ""})\n${lines.join("\n")}`);
  }
  if (wc.commits.length) sec.push(`### recent commits (${wc.commits.length})\n${wc.commits.map((c) => `- ${c.hash} ${c.subject}`).join("\n")}`);
  return sec.join("\n\n");
}
