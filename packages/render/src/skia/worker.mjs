// One Skia drawing thread: draws the frames it is asked for and hands back raw RGBA pixels
// (plus a JPEG for the few frames the frame check reads from disk).
import { parentPort, workerData } from "node:worker_threads";
import path from "node:path";
import * as lib from "@napi-rs/canvas";
import { makeSkiaStage } from "./draw.mjs";

const { film, layout, fonts, jpegFrames } = workerData;
// Fonts are shared by every thread in the process, and registering one again after an earlier render's
// threads have exited corrupts its glyph advances (words run together). So each font file gets its own
// family name and is registered once per process.
const family = (file) => {
  const name = "skia-" + path.basename(file, path.extname(file));
  if (!lib.GlobalFonts.has(name)) lib.GlobalFonts.registerFromPath(file, name);
  return name;
};
const stage = await makeSkiaStage(film, layout, lib, { hand: family(fonts.hand), sans: family(fonts.sans) });
const jpeg = new Set(jpegFrames);

parentPort.on("message", (m) => {
  if (m === "exit") { parentPort.close(); return; }
  try {
    stage.render(m.f / film.fps);
    const px = stage.canvas.data();
    // copy out of the canvas so the buffer can be moved to the main thread without a second copy
    const buf = new Uint8Array(px.length);
    buf.set(px);
    const transfer = [buf.buffer];
    let jpg;
    if (jpeg.has(m.f)) { const j = stage.canvas.encodeSync("jpeg", 92); jpg = new Uint8Array(j.length); jpg.set(j); transfer.push(jpg.buffer); }
    parentPort.postMessage({ f: m.f, buf, jpg }, transfer);
  } catch (e) {
    parentPort.postMessage({ f: m.f, error: String(e?.stack ?? e) });
  }
});
parentPort.postMessage({ ready: true });
