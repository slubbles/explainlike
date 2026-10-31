/** Shared text helpers used by planners and validators. */
export const lower = (s: string) => s.toLowerCase().trim();
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const isKeyword = (s: string, max = 3) => wordCount(s) >= 1 && wordCount(s) <= max && s === s.toLowerCase();
/** normalize for fuzzy quote matching */
export const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^a-z0-9%$.' ]+/g, " ").replace(/\s+/g, " ").trim();
export function quoteInSource(quote: string, source: string): boolean {
  const q = norm(quote), s = norm(source);
  if (!q) return false;
  if (s.includes(q)) return true;
  // tolerate small edits: 80% of the quote's words appear in order within a window
  const qw = q.split(" "); const sw = s.split(" ");
  for (let i = 0; i < sw.length; i++) {
    if (sw[i] !== qw[0]) continue;
    let j = 0, k = i;
    while (k < sw.length && k < i + qw.length * 2 && j < qw.length) { if (sw[k] === qw[j]) j++; k++; }
    if (j / qw.length >= 0.8) return true;
  }
  return false;
}
