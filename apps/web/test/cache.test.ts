import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IMMUTABLE, NO_STORE_VALUE, cacheControlFor } from "../lib/cache.ts";
import { withErrors } from "../lib/route.ts";

test("versioned build output and named static files cache for a year", () => {
  for (const p of [
    "/_next/static/chunks/app.js",
    "/_next/static/media/InterVariable.woff2",
    "/_next/image",
    "/og.png",
    "/hero.jpg",
    "/icon.svg",
    "/favicon.ico",
    "/fonts/InterVariable.woff2",
  ]) {
    assert.equal(cacheControlFor(p), IMMUTABLE, p);
  }
  assert.equal(IMMUTABLE, "public, max-age=31536000, immutable");
});

test("gallery files cache, the gallery list does not", () => {
  for (const p of ["/api/gallery/sample.mp4", "/api/gallery/poster.jpg", "/api/gallery/a.PNG"]) {
    assert.equal(cacheControlFor(p), IMMUTABLE, p);
  }
  assert.equal(cacheControlFor("/api/gallery"), NO_STORE_VALUE);
  assert.equal(cacheControlFor("/api/gallery/gallery.json"), NO_STORE_VALUE);
});

test("pages and every other API answer are never stored", () => {
  for (const p of [
    "/",
    "/docs",
    "/gallery",
    "/admin",
    "/no-such-page",
    "/robots.txt",
    "/sitemap.xml",
    "/api/jobs",
    "/api/jobs/abcdef123456",
    "/api/jobs/abcdef123456/file/explainer.mp4",
    "/api/health",
    "/api/auth-config",
    "/api/admin/users",
  ]) {
    assert.equal(cacheControlFor(p), NO_STORE_VALUE, p);
  }
});

test("API answers carry no-store unless the handler set its own value", async () => {
  const plain = withErrors("test.GET", async () => Response.json({ fine: true }));
  const r = await plain(new Request("http://x/api/jobs"), undefined as never);
  assert.equal(r.headers.get("cache-control"), "no-store");
  await r.arrayBuffer();

  const kept = withErrors("test.GET", async () => new Response("v", { headers: { "cache-control": IMMUTABLE } }));
  const k = await kept(new Request("http://x/api/gallery/a.mp4"), undefined as never);
  assert.equal(k.headers.get("cache-control"), IMMUTABLE);
  await k.arrayBuffer();

  const failing = withErrors("test.GET", async () => {
    throw new Error("boom");
  });
  const orig = console.log;
  console.log = () => {};
  try {
    const e = await failing(new Request("http://x/api/jobs"), undefined as never);
    assert.equal(e.status, 500);
    assert.equal(e.headers.get("cache-control"), "no-store");
    await e.arrayBuffer();
  } finally {
    console.log = orig;
  }
});

test("the gallery list is not stored and its files are immutable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-gallery-"));
  fs.writeFileSync(path.join(dir, "a.mp4"), "v");
  fs.writeFileSync(path.join(dir, "a.jpg"), "p");
  fs.writeFileSync(path.join(dir, "gallery.json"), JSON.stringify([{ id: "a", title: "A", file: "a.mp4", poster: "a.jpg" }]));
  const saved = process.env.EXPLANIMATE_GALLERY_DIR;
  process.env.EXPLANIMATE_GALLERY_DIR = dir;
  try {
    const { GET: list } = await import("../app/api/gallery/route.ts");
    const l = await list(new Request("http://x/api/gallery"), undefined as never);
    assert.equal(l.headers.get("cache-control"), "no-store");
    await l.arrayBuffer();

    const { GET: file } = await import("../app/api/gallery/[name]/route.ts");
    const ok = await file(new Request("http://x/api/gallery/a.mp4"), { params: Promise.resolve({ name: "a.mp4" }) });
    assert.equal(ok.headers.get("cache-control"), IMMUTABLE);
    await ok.arrayBuffer();
    const missing = await file(new Request("http://x/api/gallery/gallery.json"), {
      params: Promise.resolve({ name: "gallery.json" }),
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    await missing.arrayBuffer();
  } finally {
    if (saved === undefined) delete process.env.EXPLANIMATE_GALLERY_DIR;
    else process.env.EXPLANIMATE_GALLERY_DIR = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the Next headers cover the named static files (the build output keeps Next's own)", async () => {
  const { default: config } = await import("../next.config.mjs");
  const headers = (await config.headers()) as { source: string; headers: { key: string; value: string }[] }[];
  const bySource = new Map(headers.map((h) => [h.source, h.headers[0]?.value]));
  for (const s of ["/og.png", "/hero.jpg", "/icon.svg", "/favicon.ico", "/api/gallery/:path*"]) {
    assert.equal(bySource.get(s), IMMUTABLE, s);
  }
  assert.equal(bySource.has("/_next/static/:path*"), false);
});
