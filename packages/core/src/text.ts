/** Shared text helpers used by planners and validators. */
export const lower = (s: string) => s.toLowerCase().trim();
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const isKeyword = (s: string, max = 3) => wordCount(s) >= 1 && wordCount(s) <= max && s === s.toLowerCase();
/** normalize for fuzzy quote matching (a sentence-ending period is not part of the word; 3.5 keeps its dot) */
export const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^a-z0-9%$.' ]+/g, " ").replace(/\.+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
export function quoteInSource(quote: string, source: string): boolean {
  const q = norm(quote), s = norm(source);
  if (!q) return false;
  if (s.includes(q)) return true;
  // tolerate small edits: 80% of the quote's words appear in order (longest common subsequence) within a window
  const qw = q.split(" "); const sw = s.split(" ");
  const need = Math.ceil(qw.length * 0.8);
  for (let i = 0; i < sw.length; i++) {
    if (!qw.slice(0, qw.length - need + 1).includes(sw[i])) continue;
    const win = sw.slice(i, i + qw.length * 2);
    let prev = new Array(win.length + 1).fill(0);
    for (const w of qw) {
      const cur = [0];
      for (let k = 0; k < win.length; k++) cur.push(w === win[k] ? prev[k] + 1 : Math.max(prev[k + 1], cur[k]));
      prev = cur;
    }
    if (prev[win.length] >= need) return true;
  }
  return false;
}

/**
 * Mechanical clean-up of spoken narration before it is voiced and captioned:
 * single spaces, no space before punctuation, no word said twice in a row,
 * each sentence starting with a capital and the whole ending with a full stop.
 */
export function tidySpeech(s: string): string {
  let t = s.replace(/\s+/g, " ").trim()
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[A-Za-z])/g, "$1 ")
    .replace(/\.{2,}(?!\.)/g, ".")
    .replace(/\b(\w+) \1\b/gi, (m, w: string) => (/^(that|had|is)$/i.test(w) ? m : w));
  // a new sentence starts with a capital; "e.g." or "vs." do not end one
  t = t.replace(/(^|(\S*)[.!?] )([a-z])/g, (m, a: string, w: string | undefined, c: string) =>
    /^(e\.g|i\.e|vs|etc|approx)$/i.test(w ?? "") ? m : a + c.toUpperCase());
  if (t && !/[.!?]["')]?$/.test(t)) t += ".";
  return t;
}
