/**
 * Charts and timelines are built only from numbers and dates the source states. The planner writes each row
 * as plain text ("chrome 65%", "1983 dns is invented") with a verbatim quote; these read the figure back out
 * and check the quote really contains it, so a bar or a date on screen is never made up.
 */

export interface Figure { label: string; value: number; shown: string; unit: string }
export interface Dated { label: string; when: string; key: number }

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mn: 1e6, b: 1e9, bn: 1e9, billion: 1e9, trillion: 1e12, t: 1e12 };
const NUM = /(\$|€|£)?(\d[\d,]*(?:\.\d+)?)\s*(%|percent\b|trillion\b|billion\b|million\b|thousand\b|bn\b|mn\b|[kmbt]\b)?/i;
const digits = (s: string) => s.replace(/,/g, "");

/** "chrome 65%" -> { label: "chrome", value: 65, shown: "65%", unit: "%" }; undefined when there is no number or no label. */
export function parseFigure(text: string): Figure | undefined {
  // "1993 share 1%": the bar's number is the one with a unit, else the last one; the rest is the label
  const all = [...text.matchAll(new RegExp(NUM.source, "gi"))];
  const m = all.filter((x) => x[1] || x[3]).pop() ?? all.pop();
  if (!m || m.index === undefined) return undefined;
  const label = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").replace(/^[\s:,-]+|[\s:,-]+$/g, "");
  if (!label) return undefined;
  const word = (m[3] ?? "").toLowerCase();
  const unit = word === "percent" ? "%" : word === "%" ? "%" : m[1] ? m[1] : "";
  const value = Number(digits(m[2])) * (SCALE[word] ?? 1);
  if (!Number.isFinite(value)) return undefined;
  return { label, value, shown: m[0].trim(), unit };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "1983", "march 1985", "jan 5, 1985", "1 october 2016", "1990s", "300 bc"
const DATE = /\b(?:(?:\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2},?\s+)?)?(\d{3,4})(s)?\s*(bce?|ad|ce)?\b/i;

/** "1983 dns is invented" -> { label: "dns is invented", when: "1983", key: 1983 }; BC years sort before AD ones. */
export function parseDated(text: string): Dated | undefined {
  const m = DATE.exec(text);
  if (!m) return undefined;
  const label = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").replace(/^[\s:,-]+|[\s:,-]+$/g, "");
  if (!label) return undefined;
  const year = Number(m[2]) * (/^bc/i.test(m[4] ?? "") ? -1 : 1);
  const month = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : 0;
  return { label, when: m[0].trim(), key: year * 12 + month };
}

/** Whether a quote contains the figure's number as written (commas ignored), e.g. "65" in "about 65 percent of". */
export function figureInQuote(shownNumber: string, quote: string): boolean {
  const n = digits(/\d[\d,]*(?:\.\d+)?/.exec(shownNumber)?.[0] ?? "");
  if (!n) return false;
  return new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}([^\\d]|$)`).test(digits(quote));
}
