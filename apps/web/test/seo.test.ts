import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  appJsonLd,
  jobPageMetadata,
  organizationJsonLd,
  pageMetadata,
  robotsConfig,
  sitemapEntries,
  websiteJsonLd,
  SITE_URL,
  PAGES,
} from "../lib/seo.ts";

const WEB = path.resolve(import.meta.dirname, "..");

test("the site URL is the bare https domain, never www", () => {
  assert.equal(SITE_URL, "https://explanimate.co");
});

test("every page has a unique title and description, and a canonical URL on the bare domain", () => {
  const keys = Object.keys(PAGES);
  assert.deepEqual(keys.sort(), ["docs", "gallery", "home"]);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const key of keys as (keyof typeof PAGES)[]) {
    const meta = pageMetadata(key) as {
      title: string;
      description: string;
      alternates?: { canonical: string };
      openGraph?: { title: string; description: string; url: string; siteName: string };
      twitter?: { card: string; title: string; description: string };
    };
    assert.ok(meta.title.length > 10, `${key}: title`);
    assert.ok(meta.description.length > 50 && meta.description.length < 300, `${key}: description length`);
    assert.ok(!titles.has(meta.title as string), `${key}: title is unique`);
    assert.ok(!descriptions.has(meta.description as string), `${key}: description is unique`);
    titles.add(meta.title as string);
    descriptions.add(meta.description as string);
    assert.equal(meta.alternates?.canonical, key === "home" ? SITE_URL : `${SITE_URL}${PAGES[key].path}`, `${key}: canonical`);
    assert.ok(!meta.alternates!.canonical.includes("www."), `${key}: no www`);
    assert.equal(meta.openGraph?.title, meta.title, `${key}: og:title`);
    assert.equal(meta.openGraph?.description, meta.description, `${key}: og:description`);
    assert.equal(meta.openGraph?.url, meta.alternates?.canonical, `${key}: og:url`);
    assert.equal(meta.openGraph?.siteName, "Explanimate", `${key}: og:site_name`);
    assert.equal(meta.twitter?.card, "summary_large_image", `${key}: twitter card`);
    assert.equal(meta.twitter?.title, meta.title, `${key}: twitter title`);
    assert.equal(meta.twitter?.description, meta.description, `${key}: twitter description`);
  }
});

test("every page shares one 1200x630 image that resolves to an absolute URL", () => {
  for (const key of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
    const meta = pageMetadata(key) as {
      openGraph?: { images?: { url: string; width: number; height: number; alt: string }[] };
      twitter?: { images?: string[] };
    };
    const [image] = meta.openGraph?.images ?? [];
    assert.equal(image.width, 1200, `${key}: width`);
    assert.equal(image.height, 630, `${key}: height`);
    assert.ok(image.alt.includes("Explanimate"), `${key}: alt names the product`);
    assert.equal(new URL(image.url, `${SITE_URL}/`).href, `${SITE_URL}/og.png`, `${key}: absolute og:image`);
    assert.deepEqual(meta.twitter?.images, [image.url], `${key}: twitter image`);
  }
});

test("a result link gets its own title, description and canonical, and stays out of search", () => {
  const meta = jobPageMetadata({ id: "abcdef123456", title: "karpathy/minbpe", input: "https://github.com/karpathy/minbpe" }) as {
    title: string;
    description: string;
    alternates?: { canonical: string };
    robots?: { index: boolean };
    openGraph?: { url: string };
  };
  assert.match(meta.title, /karpathy\/minbpe/);
  assert.match(meta.description, /karpathy\/minbpe/);
  assert.notEqual(meta.title, (pageMetadata("home") as { title: string }).title);
  assert.equal(meta.alternates?.canonical, `${SITE_URL}/?job=abcdef123456`);
  assert.equal(meta.robots?.index, false);
  assert.equal(meta.openGraph?.url, meta.alternates?.canonical);
});

test("a result page names its video in the one h1", () => {
  const src = fs.readFileSync(path.join(WEB, "components/ResultView.tsx"), "utf8");
  assert.match(src, /<h1 className="t">\{job\.title\}<\/h1>/);
  assert.equal(src.match(/<h1/g)?.length, 1);
});

test("an unknown path gets the branded 404, kept out of search", async () => {
  const nf = await import("../app/not-found.tsx");
  const meta = nf.metadata as { title: string; robots?: { index: boolean } };
  assert.match(meta.title, /not found · Explanimate/i);
  assert.equal(meta.robots?.index, false);
  const src = fs.readFileSync(path.join(WEB, "app/not-found.tsx"), "utf8");
  assert.match(src, /<h1>Page not found<\/h1>/);
  assert.match(src, /<Nav \/>/);
  assert.match(src, /href="\/"/);
});

test("a result without a title falls back to its input, cut to a readable length", () => {
  const meta = jobPageMetadata({ id: "abcdef123456", input: `how DNS works ${"and more ".repeat(60)}` }) as {
    title: string;
    description: string;
  };
  assert.match(meta.title, /how DNS works/);
  assert.ok(meta.title.length <= 80, "title stays short");
  assert.ok(meta.description.length <= 220, "description stays short");
});

test("the sitemap lists the public pages, and nothing private or transient", () => {
  const entries = sitemapEntries();
  assert.deepEqual(entries.map((e) => e.url).sort(), [SITE_URL, `${SITE_URL}/docs`, `${SITE_URL}/gallery`]);
  for (const e of entries) {
    assert.ok(!e.url.includes("/api/"), "no API routes");
    assert.ok(!e.url.includes("?job="), "no job views");
    assert.ok(e.priority !== undefined && e.priority > 0 && e.priority <= 1, "priority set");
  }
});

test("robots allows the public pages, blocks the API, and points at the sitemap", () => {
  const robots = robotsConfig() as { rules: { userAgent: string; allow: string; disallow: string[] }; sitemap: string };
  assert.equal(robots.rules.userAgent, "*");
  assert.equal(robots.rules.allow, "/");
  assert.ok(robots.rules.disallow.includes("/api/"), "API is not crawled");
  assert.ok(robots.rules.disallow.includes("/admin"), "admin is not crawled");
  assert.equal(robots.sitemap, `${SITE_URL}/sitemap.xml`);
});

test("the Next sitemap and robots routes serve the shared entries", async () => {
  const { default: sitemap } = await import("../app/sitemap.ts");
  const { default: robots } = await import("../app/robots.ts");
  assert.deepEqual(sitemap(), sitemapEntries());
  assert.deepEqual(robots(), robotsConfig());
});

test("the docs and gallery pages export the shared metadata", async () => {
  const docs = await import("../app/docs/page.tsx");
  const gallery = await import("../app/gallery/page.tsx");
  assert.deepEqual(docs.metadata, pageMetadata("docs"));
  assert.deepEqual(gallery.metadata, pageMetadata("gallery"));
});

test("the share image is a 1200x630 PNG, small enough for social crawlers", () => {
  const file = path.join(WEB, "public", "og.png");
  assert.ok(fs.existsSync(file), "public/og.png is committed");
  const png = fs.readFileSync(file);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 1200, "width");
  assert.equal(png.readUInt32BE(20), 630, "height");
  assert.ok(png.length < 8 * 1024 * 1024, "under the 8 MB og:image limit");
});

test("JSON-LD describes the app, the site and the org, with no third-party marks", () => {
  const app = appJsonLd();
  assert.equal(app["@context"], "https://schema.org");
  assert.equal(app["@type"], "WebApplication");
  assert.equal(app.name, "Explanimate");
  assert.equal(app.url, SITE_URL);
  const site = websiteJsonLd();
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.url, SITE_URL);
  const org = organizationJsonLd();
  assert.equal(org["@type"], "Organization");
  assert.deepEqual(org.sameAs, ["https://github.com/slubbles/explanimate"]);
  for (const block of [app, site, org]) {
    assert.doesNotMatch(JSON.stringify(block), /meta\.com|facebook|logo.*meta/i, "no Meta marks");
  }
});
