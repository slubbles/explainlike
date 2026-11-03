import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { galleryFile, galleryItems, loadGallery } from "../lib/gallery.ts";

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
