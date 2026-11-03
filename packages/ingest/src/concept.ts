import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { SourceDoc } from "@explanimate/core";
import { redact } from "./secrets.js";
import { publicFetch, PrivateAddressError } from "./net.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface SourceShotOut {
  file: string;
  width: number;
  height: number;
  rects: Record<string, Rect[]>;
}
export interface ConceptSource {
  doc: SourceDoc;
  /** render a source card holding the quotes, screenshot it to pngPath and return each quote's boxes (CSS px) */
  locate(quotes: string[], pngPath: string): Promise<SourceShotOut>;
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 explanimate";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9]+/g, "");

export function xStatusId(url: string): string | undefined {
  return url.match(/(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/(\d+)/i)?.[1] ?? url.match(/\/i\/(?:web\/)?status\/(\d+)/)?.[1];
}

/** Chrome's usual Windows install folders, so a fresh shell works without setting EXPLANIMATE_CHROME. */
function windowsChromePaths(): string[] {
  if (process.platform !== "win32") return [];
  const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return [
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
  ];
}

function findChrome(): string {
  const c = [
    process.env.EXPLANIMATE_CHROME,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ...windowsChromePaths(),
  ].filter(Boolean) as string[];
  const f = c.find((p) => fs.existsSync(p));
  if (!f) throw new Error("no Chrome/Chromium found; set EXPLANIMATE_CHROME");
  return f;
}

/** blocks of text, each rendered as one paragraph on the card */
export interface Card {
  kind: "x-post" | "article";
  title?: string;
  author?: string;
  handle?: string;
  avatar?: string;
  site?: string;
  date?: string;
  blocks: string[];
  photo?: string;
  stats?: string;
}

const CSS = `
*{box-sizing:border-box;margin:0}
body{background:#0b0d10;font-family:"Nunito","Inter","Helvetica Neue",Arial,sans-serif;color:#e7e9ea;width:1200px;padding:40px}
.card{background:#16181c;border:1px solid #2f3336;border-radius:22px;padding:40px 48px}
.who{display:flex;align-items:center;gap:18px;margin-bottom:26px}
.av{width:64px;height:64px;border-radius:50%;background:#333 center/cover}
.nm{font-weight:800;font-size:26px}.hd{color:#71767b;font-size:22px}
h1{font-size:40px;line-height:1.2;margin-bottom:18px;font-weight:800}
.site{color:#71767b;font-size:20px;margin-bottom:26px}
p{font-size:28px;line-height:1.5;margin:0 0 20px;white-space:pre-wrap}
.gap{color:#71767b;font-size:28px;text-align:center;margin:6px 0 20px}
.ph{width:100%;border-radius:16px;margin-top:8px;max-height:620px;object-fit:cover}
.st{color:#71767b;font-size:20px;margin-top:22px;border-top:1px solid #2f3336;padding-top:18px}`;

function cardHtml(c: Card, blocks: (string | null)[]): string {
  const body = blocks.map((b) => (b === null ? `<div class="gap">…</div>` : `<p>${esc(b)}</p>`)).join("\n");
  const head =
    c.kind === "x-post"
      ? `<div class="who"><div class="av" style="background-image:url('${esc(c.avatar ?? "")}')"></div><div><div class="nm">${esc(c.author ?? "")}</div><div class="hd">@${esc(c.handle ?? "")}${c.date ? " · " + esc(c.date) : ""}</div></div></div>${c.title ? `<h1>${esc(c.title)}</h1>` : ""}`
      : `<h1>${esc(c.title ?? "")}</h1><div class="site">${esc([c.site, c.author, c.date].filter(Boolean).join(" · "))} · reader view</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="card">${head}${body}${c.photo ? `<img class="ph" src="${esc(c.photo)}">` : ""}${c.stats ? `<div class="st">${esc(c.stats)}</div>` : ""}</div></body></html>`;
}

/** fetch with a time limit, turning a hang or a dropped connection into a sentence a person can act on. */
async function get(url: string, what: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await publicFetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof PrivateAddressError || /^(Could not find the site|That link redirects)/.test((e as Error)?.message ?? "")) throw e;
    const name = (e as Error)?.name;
    throw new Error(
      name === "TimeoutError" || name === "AbortError"
        ? `${what} did not load within ${FETCH_TIMEOUT_MS / 1000} s. Try again, or try another link.`
        : `Could not reach ${what}. Check the link and the internet connection.`,
    );
  }
}
const FETCH_TIMEOUT_MS = 20_000;
/** the most HTML read from one page; real articles are far smaller */
export const MAX_PAGE_BYTES = 5 << 20;

/** A failed page or post fetch, said plainly. */
export function fetchError(kind: "x-post" | "article", status: number): string {
  if (kind === "x-post") {
    if (status === 404) return "That X post was not found. It may be deleted, from a private account, or the link may be cut off.";
    if (status === 429) return "X is rate-limiting reads right now. Wait a minute and try again.";
    return `Could not read that X post (HTTP ${status}). Try again in a minute.`;
  }
  if (status === 404 || status === 410) return "That page was not found (HTTP 404). Check the link.";
  if (status === 401 || status === 402 || status === 403)
    return `That site does not let automated readers in (HTTP ${status}), often because of a paywall or a bot check. Try a link to the same story on another site.`;
  if (status === 429) return "That site is rate-limiting reads right now. Wait a minute and try again.";
  return `Could not fetch that page (HTTP ${status}). Try again, or try another link.`;
}

async function fetchX(url: string, id: string): Promise<Card & { url: string }> {
  const r = await get(`https://api.fxtwitter.com/status/${id}`, "X", { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(fetchError("x-post", r.status));
  const j: any = await r.json().catch(() => ({}));
  const t = j.tweet;
  if (!t) throw new Error(fetchError("x-post", 404));
  let blocks: string[] = String(t.text ?? "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  let title: string | undefined;
  const art = t.article;
  if (art) {
    title = art.title;
    const ab = (art.content?.blocks ?? []).map((b: any) => String(b.text ?? "").trim()).filter(Boolean);
    if (ab.length) blocks = ab;
    else if (art.preview_text) blocks = [art.preview_text];
  }
  const fmt = (n?: number) => (n == null ? "" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n));
  const stats = [
    t.replies != null && `${fmt(t.replies)} replies`,
    t.retweets != null && `${fmt(t.retweets)} reposts`,
    t.likes != null && `${fmt(t.likes)} likes`,
    t.views && `${fmt(t.views)} views`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return {
    kind: "x-post",
    url: t.url ?? url,
    title,
    author: t.author?.name,
    handle: t.author?.screen_name,
    avatar: t.author?.avatar_url,
    date: t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : undefined,
    blocks,
    photo: t.media?.photos?.[0]?.url ?? art?.cover_media?.media_info?.original_img_url,
    stats,
  };
}

export async function fetchArticle(url: string): Promise<Card & { url: string }> {
  const r = await get(url, new URL(url).hostname, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!r.ok) throw new Error(fetchError("article", r.status));
  const type = r.headers.get("content-type") ?? "";
  if (type && !/html|xml|text\/plain/i.test(type))
    throw new Error(`That link is not a web page (${type.split(";")[0]}). Link to an article instead.`);
  if (Number(r.headers.get("content-length") ?? 0) > MAX_PAGE_BYTES)
    throw new Error("That page is too large to read (over 5 MB). Link to a single article.");
  const html = (await r.text()).slice(0, MAX_PAGE_BYTES);
  const { document } = parseHTML(html);
  const meta = (n: string) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.getAttribute("content") ?? undefined;
  const art = new Readability(document as any).parse();
  if (!art?.content)
    throw new Error("Could not find article text on that page. It may need JavaScript or a login; try a direct link to the article.");
  const { document: d2 } = parseHTML(`<html><body>${art.content}</body></html>`);
  const blocks = Array.from(d2.querySelectorAll("p,li,h2,h3,h4,pre,blockquote") as any as ArrayLike<any>)
    .filter((el: any) => !el.parentElement?.closest?.("li,blockquote"))
    .map((el: any) =>
      String(el.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length > 1);
  return {
    kind: "article",
    url: r.url || url,
    title: art.title ?? meta("og:title"),
    author: art.byline ?? meta("author") ?? undefined,
    site: art.siteName ?? meta("og:site_name") ?? new URL(url).hostname.replace(/^www\./, ""),
    date: (meta("article:published_time") ?? "").slice(0, 10) || undefined,
    blocks,
  };
}

/** pick the blocks that contain the quotes (plus the first block for context), with "…" gaps */
function selectBlocks(blocks: string[], quotes: string[], maxChars = 2600): (string | null)[] {
  const nb = blocks.map(norm);
  const want = new Set<number>([
    Math.max(
      0,
      blocks.findIndex((b) => b.length >= 80),
    ),
  ]);
  for (const q of quotes) {
    const nq = norm(q);
    let i = nb.findIndex((b) => b.includes(nq));
    if (i < 0) i = nb.findIndex((b) => nq.length > 12 && b.includes(nq.slice(0, Math.floor(nq.length * 0.6))));
    if (i >= 0) want.add(i);
  }
  const idx = [...want].sort((a, b) => a - b);
  // keep it to a readable card: trim long blocks around the quote
  let total = 0;
  const out: (string | null)[] = [];
  let prev = -1;
  for (const i of idx) {
    let b = blocks[i];
    if (b.length > 700) {
      const q = quotes.find((q) => norm(b).includes(norm(q)));
      const at = q ? b.toLowerCase().indexOf(q.toLowerCase().slice(0, 20)) : -1;
      const s = Math.max(0, (at < 0 ? 0 : at) - 250);
      b = (s > 0 ? "…" : "") + b.slice(s, s + 650) + (s + 650 < b.length ? "…" : "");
    }
    if (total + b.length > maxChars && out.length) break;
    if (prev >= 0 && i > prev + 1) out.push(null);
    out.push(b);
    total += b.length;
    prev = i;
  }
  if (prev < blocks.length - 1 && blocks.length > 1) out.push(null);
  return out;
}

// plain JS (not compiled) so bundler helpers never leak into the page
const LOCATE_JS = `(qs) => {
          const n = (c) => c.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9]/g, "");
          const card = document.querySelector(".card");
          const base = card.getBoundingClientRect();
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          const map = []; let s = "";
          for (let t = walker.nextNode(); t; t = walker.nextNode()) {
            const v = t.data;
            for (let i = 0; i < v.length; i++) { const c = n(v[i]); if (c) { s += c; map.push([t, i]); } }
          }
          const out = {};
          for (const q of qs) {
            let nq = n(q), at = s.indexOf(nq);
            // fallback: the longest leading part of the quote that is present
            while (at < 0 && nq.length > 14) { nq = nq.slice(0, Math.floor(nq.length * 0.8)); at = s.indexOf(nq); }
            if (at < 0) continue;
            const [sn, so] = map[at], [en, eo] = map[at + nq.length - 1];
            const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo + 1);
            const lines = [];
            for (const b of r.getClientRects()) {
              if (b.width < 2) continue;
              const last = lines[lines.length - 1];
              if (last && Math.abs(last.y - (b.top - base.top)) < 4) { const x2 = Math.max(last.x + last.w, b.right - base.left); last.x = Math.min(last.x, b.left - base.left); last.w = x2 - last.x; }
              else lines.push({ x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height });
            }
            out[q] = lines;
          }
          return out;
        }`;

export async function ingestConcept(input: string, _outDir: string): Promise<ConceptSource> {
  const id = xStatusId(input);
  const card = id ? await fetchX(input, id) : await fetchArticle(input);
  const text = redact(card.blocks.join("\n\n")).slice(0, 60000);
  if (text.trim().length < 20) throw new Error("That source has almost no text to explain. Try a longer post or article.");
  const doc: SourceDoc = {
    kind: card.kind,
    url: card.url,
    title: card.title ?? (card.kind === "x-post" ? `post by @${card.handle}` : "article"),
    author: card.kind === "x-post" ? `${card.author} (@${card.handle})` : card.author,
    text,
    images: card.photo ? [card.photo] : undefined,
  };
  return withLocate(doc, card);
}

/** The source card the video zooms into: render the blocks that hold the quotes and find each quote's boxes. */
export function withLocate(doc: SourceDoc, card: Card): ConceptSource {
  return {
    doc,
    async locate(quotes, pngPath) {
      const blocks = card.kind === "x-post" && card.blocks.join("").length < 3200 ? card.blocks : selectBlocks(card.blocks, quotes);
      const html = cardHtml(card, blocks);
      const browser = await chromium.launch({
        executablePath: findChrome(),
        args: ["--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars"],
      });
      try {
        // 2x pixels: the video zooms into quoted lines, and a 1.5x shot looked soft there
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        const rects = (await page.evaluate(`(${LOCATE_JS})(${JSON.stringify(quotes)})`)) as Record<string, Rect[]>;
        const el = (await page.$(".card"))!;
        const box = (await el.boundingBox())!;
        await el.screenshot({ path: pngPath });
        return { file: pngPath, width: box.width, height: box.height, rects };
      } finally {
        await browser.close();
      }
    },
  };
}
