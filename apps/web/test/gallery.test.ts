import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { galleryCaptionsUrl, galleryCaptionsVtt, galleryFile, galleryItems, loadGallery } from "../lib/gallery.ts";

function folder(manifest: unknown, files: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-"));
  for (const [n, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), body);
  if (manifest !== undefined)
    fs.writeFileSync(path.join(dir, "gallery.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  return dir;
}

test("the manifest lists the videos that are in the folder, in order, with URLs to play them", () => {
  const dir = folder(
    {
      videos: [
        {
          id: "minbpe",
          title: "karpathy/minbpe",
          kind: "repo",
          source: "https://github.com/karpathy/minbpe",
          durationSec: 174.5,
          file: "minbpe.mp4",
          poster: "minbpe.jpg",
        },
        { id: "dns", title: "How names find computers", kind: "topic", durationSec: 94.9, file: "dns.mp4" },
      ],
    },
    { "minbpe.mp4": "v", "minbpe.jpg": "p", "dns.mp4": "v" },
  );
  assert.deepEqual(
    loadGallery(dir).map((v) => v.id),
    ["minbpe", "dns"],
  );
  const [a, b] = galleryItems(dir);
  assert.equal(a.src, "/api/gallery/minbpe.mp4");
  assert.equal(a.poster, "/api/gallery/minbpe.jpg");
  assert.equal(a.source, "https://github.com/karpathy/minbpe");
  assert.equal(a.kind, "repo");
  assert.equal(b.poster, undefined);
  assert.equal(b.source, undefined);
  assert.ok(!("file" in a));
});

test("entries with a missing video, a bad name, a repeated id or no title are left out", () => {
  const dir = folder(
    [
      { id: "gone", title: "Gone", file: "gone.mp4" },
      { id: "../x", title: "Bad id", file: "ok.mp4" },
      { id: "up", title: "Climbs", file: "../ok.mp4" },
      { id: "ok", title: "Ok", file: "ok.mp4", poster: "../../etc/passwd", source: "javascript:alert(1)", kind: "nonsense" },
      { id: "ok", title: "Twice", file: "ok.mp4" },
      { id: "untitled", file: "ok.mp4" },
    ],
    { "ok.mp4": "v" },
  );
  const list = loadGallery(dir);
  assert.deepEqual(
    list.map((v) => v.title),
    ["Ok"],
  );
  assert.equal(list[0].poster, undefined);
  assert.equal(list[0].source, undefined);
  assert.equal(list[0].kind, "topic");
});

test("no folder, a missing folder, no manifest or a broken one is an empty gallery", () => {
  assert.deepEqual(loadGallery(undefined), []);
  assert.deepEqual(loadGallery(path.join(os.tmpdir(), "no-such-gallery-folder")), []);
  assert.deepEqual(loadGallery(folder(undefined, { "a.mp4": "v" })), []);
  assert.deepEqual(loadGallery(folder("{not json")), []);
  assert.deepEqual(loadGallery(folder({ videos: "no" })), []);
});

test("only files the manifest names can be fetched, never a path out of the folder", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-up-"));
  fs.writeFileSync(path.join(parent, "secret.mp4"), "s");
  const dir = path.join(parent, "g");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "a.mp4"), "v");
  fs.writeFileSync(path.join(dir, "a.jpg"), "p");
  fs.writeFileSync(path.join(dir, "extra.mp4"), "x");
  fs.writeFileSync(path.join(dir, "gallery.json"), JSON.stringify([{ id: "a", title: "A", file: "a.mp4", poster: "a.jpg" }]));
  assert.equal(galleryFile("a.mp4", dir), path.join(dir, "a.mp4"));
  assert.equal(galleryFile("a.jpg", dir), path.join(dir, "a.jpg"));
  for (const bad of ["extra.mp4", "gallery.json", "../secret.mp4", "..%2Fsecret.mp4", "..\\secret.mp4", "/etc/passwd", ".", ""]) {
    assert.equal(galleryFile(bad, dir), undefined, bad);
  }
  assert.equal(galleryFile("a.mp4", undefined), undefined);
});

test("a video whose manifest names a .vtt gets a captions URL serving that file", () => {
  const vtt = "WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nHello there\n";
  const dir = folder([{ id: "a", title: "A", file: "a.mp4", captions: "a.vtt" }], { "a.mp4": "v", "a.vtt": vtt });
  const [item] = galleryItems(dir);
  assert.equal(item.captions, galleryCaptionsUrl("a"));
  assert.equal(item.captions, "/api/gallery/captions/a");
  assert.equal(galleryCaptionsVtt("a", dir), vtt);
  assert.ok(!("file" in item));
});

test("a .vtt beside the video is picked up without a manifest field; the manifest wins on a clash", () => {
  const dir = folder(
    [
      { id: "auto", title: "Auto", file: "auto.mp4" },
      { id: "named", title: "Named", file: "named.mp4", captions: "other.vtt" },
    ],
    {
      "auto.mp4": "v",
      "auto.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nauto\n",
      "named.mp4": "v",
      "named.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nbeside\n",
      "other.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nnamed\n",
    },
  );
  const [auto, named] = galleryItems(dir);
  assert.equal(auto.captions, "/api/gallery/captions/auto");
  assert.match(galleryCaptionsVtt("auto", dir)!, /auto/);
  assert.equal(named.captions, "/api/gallery/captions/named");
  assert.match(galleryCaptionsVtt("named", dir)!, /named/);
});

test("film-style timed words in JSON become WebVTT, from the manifest or beside the video", () => {
  const timed = JSON.stringify({
    captions: [
      { t0: 0.5, t1: 2, words: [{ w: "Hello" }, { w: "there" }] },
      { t0: 5, t1: 4, words: [{ w: "bad times" }] },
    ],
  });
  const dir = folder(
    [
      { id: "m", title: "M", file: "m.mp4", captions: "m.json" },
      { id: "b", title: "B", file: "b.mp4" },
    ],
    { "m.mp4": "v", "m.json": timed, "b.mp4": "v", "b.captions.json": timed },
  );
  const want = "WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nHello there\n";
  assert.equal(galleryCaptionsVtt("m", dir), want);
  assert.equal(galleryCaptionsVtt("b", dir), want);
  const [m, b] = galleryItems(dir);
  assert.equal(m.captions, "/api/gallery/captions/m");
  assert.equal(b.captions, "/api/gallery/captions/b");
});

test("no captions data, a torn file or a bad id means no captions", () => {
  const dir = folder(
    [
      { id: "bare", title: "Bare", file: "bare.mp4" },
      { id: "torn", title: "Torn", file: "torn.mp4" },
      { id: "notvtt", title: "Not VTT", file: "notvtt.mp4" },
      { id: "missing", title: "Missing", file: "missing.mp4", captions: "gone.vtt" },
      { id: "evil", title: "Evil", file: "evil.mp4", captions: "../secret.vtt" },
    ],
    {
      "bare.mp4": "v",
      "torn.mp4": "v",
      "torn.captions.json": "{broken",
      "notvtt.mp4": "v",
      "notvtt.vtt": "this is not webvtt",
      "missing.mp4": "v",
      "evil.mp4": "v",
    },
  );
  for (const id of ["bare", "torn", "notvtt", "missing", "evil", "../x", "nope"]) {
    assert.equal(galleryCaptionsVtt(id, dir), undefined, id);
  }
  assert.equal(galleryCaptionsVtt("bare", undefined), undefined);
  for (const item of galleryItems(dir)) assert.ok(!("captions" in item), item.id);
  assert.equal(loadGallery(dir).find((v) => v.id === "missing")?.captions, undefined);
  assert.equal(loadGallery(dir).find((v) => v.id === "evil")?.captions, undefined);
});

test("the gallery captions route serves text/vtt, or 404 without captions", async () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n";
  const dir = folder(
    [
      { id: "a", title: "A", file: "a.mp4" },
      { id: "bare", title: "Bare", file: "bare.mp4" },
    ],
    { "a.mp4": "v", "a.vtt": vtt, "bare.mp4": "v" },
  );
  const saved = process.env.EXPLANIMATE_GALLERY_DIR;
  process.env.EXPLANIMATE_GALLERY_DIR = dir;
  try {
    const { GET } = await import("../app/api/gallery/captions/[id]/route.ts");
    const ok = await GET(new Request("http://x/api/gallery/captions/a"), { params: Promise.resolve({ id: "a" }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "text/vtt");
    assert.equal(await ok.text(), vtt);
    for (const id of ["bare", "nope", "../x"]) {
      const r = await GET(new Request(`http://x/api/gallery/captions/${id}`), { params: Promise.resolve({ id }) });
      assert.equal(r.status, 404, id);
    }
  } finally {
    if (saved === undefined) delete process.env.EXPLANIMATE_GALLERY_DIR;
    else process.env.EXPLANIMATE_GALLERY_DIR = saved;
  }
});
