/**
 * Cheap checks before a run starts, so a bad input fails at once instead of after "Starting…":
 * keyboard-mash topics, and GitHub repos that do not exist. Network checks fail open: if GitHub
 * is slow or down, the run starts and the engine reports the problem as before.
 */

export const GIBBERISH_ERROR = 'That doesn\'t look like a topic. Try a few plain words, like "how DNS works".';
export const REPO_404_ERROR = "We couldn't find that GitHub repo. Check the link. Private repos don't work.";

/** True for a topic that reads like keyboard mashing ("asdfghjkl", "xqzv bnmw"). */
export function looksLikeGibberish(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return false;
  const words = s.match(/[A-Za-z]+/g) ?? [];
  if (words.some((w) => /[bcdfghjklmnpqrstvwxz]{6,}/i.test(w))) return true;
  // acronyms like CRDTs or TCP have capitals and are fine; lowercase words with no vowels are not
  const plain = words.filter((w) => w.length >= 3 && w === w.toLowerCase());
  if (plain.length < 2) return false;
  return plain.filter((w) => /[aeiouy]/.test(w)).length / plain.length < 0.5;
}

/** owner/repo from a github.com link, or null when it is not a repo link. */
export function githubRepo(s: string): { owner: string; repo: string } | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#].*)?$/i.exec(s);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** A plain error when the input can be rejected up front, else null. */
export async function precheckInput(input: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (looksLikeGibberish(input)) return GIBBERISH_ERROR;
  const gh = githubRepo(input);
  if (!gh) return null;
  try {
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "explanimate" };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetchImpl(`https://api.github.com/repos/${gh.owner}/${gh.repo}`, { headers, signal: AbortSignal.timeout(4000) });
    return r.status === 404 ? REPO_404_ERROR : null;
  } catch {
    return null;
  }
}
