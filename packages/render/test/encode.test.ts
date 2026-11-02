import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { encodeMp4, mp4Encoder } from "../src/index.js";

const videoHash = (file: string) => spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v", "-f", "framemd5", "-"], { encoding: "utf8" }).stdout.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(",").pop()!.trim());

test("frames streamed to ffmpeg out of order give the same video as encoding them from disk", { timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-encode-"));
  const frames = path.join(dir, "frames");
  fs.mkdirSync(frames);
  // a moving pattern, so a frame out of place would show
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x180:r=10:d=3", "-q:v", "3", "-start_number", "0", path.join(frames, "f%06d.jpg")]);
  const files = fs.readdirSync(frames).sort();
  await encodeMp4(frames, 10, path.join(dir, "disk.mp4"), undefined, { music: false, duration: 3 });
  const enc = mp4Encoder(10, path.join(dir, "pipe.mp4"), { duration: 3, workDir: dir, music: false });
  // how parallel workers hand frames over: interleaved, never in order
  const order = files.map((_, i) => i).sort((a, b) => (a % 4) - (b % 4) || b - a);
  await Promise.all(order.map((i) => enc.frame(i, fs.readFileSync(path.join(frames, files[i])))));
  await enc.done();
  const disk = videoHash(path.join(dir, "disk.mp4")), pipe = videoHash(path.join(dir, "pipe.mp4"));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(disk.length, 30);
  assert.deepEqual(pipe, disk);
});

test("the streaming encoder refuses to finish with a frame missing", { timeout: 30_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-encode-"));
  const enc = mp4Encoder(10, path.join(dir, "x.mp4"), { duration: 1, workDir: dir, music: false });
  const jpg = path.join(dir, "a.jpg");
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=white:s=64x64", "-frames:v", "1", jpg]);
  await enc.frame(1, fs.readFileSync(jpg));
  await assert.rejects(enc.done(), /frames missing before 1/);
  enc.abort();
  fs.rmSync(dir, { recursive: true, force: true });
});
