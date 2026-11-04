/** GitHub URL parsing and repo subfolder validation, shared by the CLI, the job APIs and ingest. */

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Split a GitHub URL into owner, repo, and (for .../tree/<branch>/<path> links) the branch
 * and subfolder. Any other suffix (a blob path, a query) is ignored, as before: the link
 * still means the repo itself. A branch name with a slash is ambiguous in a tree URL, so
 * the first segment after tree/ reads as the branch and the rest as the folder.
 */
export function parseGithubUrl(u: string): { owner: string; repo: string; ref?: string; subpath?: string } | null {
  const m = u.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?=\/|$|[?#])/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  const rest = u.slice((m.index ?? 0) + m[0].length);
  const tree = rest.match(/^\/tree\/([^/?#]+)(?:\/([^?#]*))?/);
  if (!tree) return { owner, repo };
  const ref = safeDecode(tree[1]).trim();
  const rawSub = safeDecode(tree[2] ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!ref) return { owner, repo };
  if (!rawSub) return { owner, repo, ref };
  return { owner, repo, ref, subpath: rawSub };
}

/**
 * Check a repo subfolder path (--path, or the folder in a tree URL) and return it clean:
 * no leading or trailing slashes, no empty result. Empty input means the whole repo.
 * Throws when the path is absolute, escapes with .., or is otherwise not a folder in the repo.
 */
export function normalizeRepoSubpath(input?: string): string | undefined {
  if (input === undefined || input === null) return undefined;
  const raw = String(input).trim();
  if (!raw || raw === ".") return undefined;
  const fail = (why: string): never => {
    throw new Error(`Invalid path "${String(input).slice(0, 120)}": ${why}. Use a folder inside the repo, like "packages/cli".`);
  };
  if (raw.length > 500) fail("it is over 500 characters");
  if (/^[\\/]/.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) fail("it is absolute");
  if (raw.includes("\\")) fail('it uses "\\" instead of "/"');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep the raw text */
  }
  const clean = decoded.trim().replace(/^\/+|\/+$/g, "");
  if (!clean || clean === ".") return undefined;
  if (/^[\\/]/.test(decoded.trim())) fail("it is absolute");
  const parts = clean.split("/");
  for (const p of parts) {
    if (!p) fail("it has an empty part");
    if (p === "." || p === "..") fail('it contains ".."');
  }
  return parts.join("/");
}
