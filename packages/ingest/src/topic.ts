/**
 * A plain topic with no link ("how DNS works"): find a few reputable pages, read them, and hand the
 * planner their text with each source named, so every claim in the video can be quoted and cited.
 * Search is Wikipedia's public API (no key); the other sources are the reputable references the
 * matching Wikipedia article itself cites (standards bodies, universities, governments, major outlets).
 */
import { type SourceDoc } from "@explanimate/core";
import { fetchArticle, withLocate, type Card, type ConceptSource } from "./concept.js";
import { redact } from "./secrets.js";

const WIKI = "https://en.wikipedia.org/w/api.php";
const UA = "Explanimate/0.1 (https://github.com/slubbles/explanimate)";
const PER_SOURCE = 14000;

/** The search words: "explain how DNS works like I'm five" -> "how DNS works". */
export function topicQuery(input: string): string {
  return input.trim()
    .replace(/^(please\s+)?(can you\s+)?(explain|tell me|teach me)\s+(to me\s+)?/i, "")
    .replace(/\s+(like|as if) (i'?m|i am) (5|five|a \w+)\b.*$/i, "")
    .replace(/[?.!]+$/, "").trim() || input.trim();
}

/** Sites trusted as sources: standards bodies, governments, universities, reference works and major outlets. */
const REPUTABLE = /(^|\.)((gov|edu|mil)(\.[a-z]{2})?|ietf\.org|rfc-editor\.org|w3\.org|whatwg\.org|iso\.org|ieee\.org|acm\.org|nist\.gov|icann\.org|iana\.org|developer\.mozilla\.org|mozilla\.org|britannica\.com|nature\.com|science\.org|arxiv\.org|who\.int|un\.org|europa\.eu|oecd\.org|imf\.org|worldbank\.org|bbc\.co\.uk|bbc\.com|reuters\.com|apnews\.com|economist\.com|cloudflare\.com|kernel\.org|python\.org|apache\.org|khanacademy\.org|nasa\.gov|ox\.ac\.uk|cam\.ac\.uk)$/i;
export function reputable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && REPUTABLE.test(u.hostname) && !/\.pdf$/i.test(u.pathname);
  } catch { return false; }
}

async function wiki(params: Record<string, string>): Promise<any> {
  const q = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const r = await fetch(`${WIKI}?${q}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
  if (!r?.ok) throw new Error("Could not reach Wikipedia to find sources for that topic. Try again, or pass a link to an article about it.");
  return r.json();
}

export interface TopicSource { title: string; url: string; site: string; text: string }

const FILLER = new Set("how why what when where who which does do did is are was were the a an of to in on for and or works work working explain mean means meaning about like happen happens really actually".split(" "));
/** The words that name the subject: "how DNS works" -> ["dns"]. */
export function topicWords(query: string): string[] {
  return query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w))
    // plain plural to its stem so "vaccines" matches a page titled "Vaccine"
    .map((w) => (w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w));
}

/** How much a page is about the subject: the share of its first part that names it, with the title weighted most. */
export function relevance(title: string, text: string, words: string[]): number {
  if (!words.length) return 0;
  const t = title.toLowerCase(), body = text.slice(0, 4000).toLowerCase();
  const inTitle = words.filter((w) => t.includes(w)).length / words.length;
  const hits = words.reduce((n, w) => n + (body.match(new RegExp(`\\b${w.replace(/[-]/g, "\\-")}`, "g"))?.length ?? 0), 0);
  return inTitle * 2 + Math.min(1, hits / 12);
}

export async function findTopicSources(topic: string, max = 3): Promise<TopicSource[]> {
  const query = topicQuery(topic);
  const words = topicWords(query);
  const none = () => new Error(`Found no reputable source about "${query}". Try other words, or pass a link to an article about it.`);
  // an article titled with the subject itself ("DNS" -> Domain Name System) beats a search hit
  // except for "why" questions, where the noun ("sky blue") names the wrong article (the colour)
  const direct = words.length && !/^why\b/i.test(query) ? (await wiki({ action: "query", titles: words.join(" "), redirects: "1", prop: "pageprops" })).query?.pages?.[0] : undefined;
  const directOk = direct && !direct.missing && !("disambiguation" in (direct.pageprops ?? {}));
  const hits: { title: string }[] = directOk ? [] : (await wiki({ action: "query", list: "search", srsearch: /^why\b/i.test(query) ? query : words.join(" ") || query, srlimit: "5" })).query?.search ?? [];
  const first = directOk ? direct.title : hits.map((h) => h.title).find((t) => !/\(disambiguation\)$/i.test(t));
  if (!first) throw none();
  const page = (await wiki({ action: "query", prop: "extracts|extlinks|info", inprop: "url", explaintext: "1", exsectionformat: "plain", ellimit: "300", redirects: "1", titles: first })).query?.pages?.[0];
  const text = String(page?.extract ?? "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) throw none();
  const out: TopicSource[] = [{ title: page.title, url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, site: "en.wikipedia.org", text: text.slice(0, PER_SOURCE) }];
  // the reputable pages the article cites, kept only when they are about the same subject
  const about = [...new Set([...words, ...topicWords(page.title)])];
  const links: string[] = [...new Set<string>((page.extlinks ?? []).map((l: { url: string }) => l.url).filter(reputable))].slice(0, 24);
  const read = await Promise.all(links.map(async (url) => {
    try {
      const c = await fetchArticle(url);
      const body = c.blocks.filter((b) => b.length > 40).join("\n\n");
      const title = c.title ?? new URL(c.url).hostname;
      return body.length < 600 ? undefined : { title, url: c.url, site: new URL(c.url).hostname.replace(/^www\./, ""), text: body.slice(0, PER_SOURCE), score: relevance(title, body, about) };
    } catch { return undefined; } // a cited page that is gone or needs JavaScript is skipped
  }));
  const seen = new Set<string>();
  for (const r of read.filter((r) => r && r.score >= 1.2).sort((a, b) => b!.score - a!.score)) {
    if (out.length >= max) break;
    if (seen.has(r!.site)) continue;
    seen.add(r!.site);
    out.push({ title: r!.title, url: r!.url, site: r!.site, text: r!.text });
  }
  return out;
}

/** The planner's text: each source under its own numbered header, so quotes can be cited back to it. */
export function topicText(sources: TopicSource[]): string {
  return sources.map((s, i) => `[Source ${i + 1}: ${s.title} (${s.site})]\n${s.text}`).join("\n\n");
}

export async function ingestTopic(topic: string): Promise<ConceptSource> {
  const sources = await findTopicSources(topic);
  const title = topicQuery(topic);
  const text = redact(topicText(sources)).slice(0, 60000);
  const doc: SourceDoc = { kind: "topic", url: sources[0]!.url, title, author: `${sources.length} sources: ${sources.map((s) => s.site).join(", ")}`, text, sources: sources.map(({ title, url, site }) => ({ title, url, site })) };
  const card: Card = {
    kind: "article", title, site: sources.map((s) => s.site).join(" · "),
    blocks: sources.flatMap((s) => [`Source: ${s.title} (${s.site})`, ...s.text.split(/\n{2,}|\n/).map((b) => b.trim()).filter((b) => b.length > 1)]),
  };
  return withLocate(doc, card);
}
