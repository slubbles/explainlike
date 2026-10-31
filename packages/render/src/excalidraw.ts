import fs from "node:fs";
import crypto from "node:crypto";
import type { Sketch } from "./compose.js";
import { textWidth } from "./measure.js";
import { NODE } from "./layout.js";
import { tidySketch } from "./tidy.js";

/** Write an editable .excalidraw scene from the final state of the video's canvas. */
export function toExcalidraw(raw: Sketch, opts: { background: string; source?: string; ink?: string; muted?: string; edgeLabel?: string }) {
  const sk = tidySketch(raw);
  let seed = 1000;
  const els: any[] = [];
  const files: Record<string, any> = {};
  const now = Date.now();
  const base = (type: string, x: number, y: number, w: number, h: number, stroke: string, extra: any = {}) => ({
    id: crypto.randomUUID().slice(0, 20), type, x, y, width: w, height: h, angle: 0, strokeColor: stroke, backgroundColor: "transparent",
    fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
    seed: seed++, version: 1, versionNonce: seed * 7, isDeleted: false, boundElements: null, updated: now, link: null, locked: false, ...extra,
  });
  const text = (t: string, x: number, y: number, size: number, color: string, anchor: "start" | "middle", groupIds: string[] = []) => {
    const w = textWidth(t, size), h = size * 1.25;
    return base("text", anchor === "middle" ? x - w / 2 : x, y - size * 0.95, w, h, color, {
      text: t, originalText: t, fontSize: size, fontFamily: 5, textAlign: anchor === "middle" ? "center" : "left", verticalAlign: "top",
      containerId: null, lineHeight: 1.25, autoResize: true, groupIds,
    });
  };
  const fileFor = (file: string) => {
    const buf = fs.readFileSync(file);
    const id = crypto.createHash("sha1").update(buf).digest("hex");
    files[id] ??= { mimeType: "image/png", id, dataURL: `data:image/png;base64,${buf.toString("base64")}`, created: now };
    return id;
  };

  for (const im of sk.images) els.push(base("image", im.box.x, im.box.y, im.box.w, im.box.h, "transparent", { fileId: fileFor(im.file), status: "saved", scale: [1, 1], crop: null }));

  const rects = new Map<string, any>();
  for (const n of sk.nodes) {
    const gid = crypto.randomUUID().slice(0, 12);
    const r = base("rectangle", n.box.x, n.box.y, n.box.w, n.box.h, n.color, { strokeWidth: 2, roundness: null, groupIds: [gid], boundElements: [], customData: { explainlikeId: n.id } });
    rects.set(n.id, r);
    els.push(r);
    const isz = n.iconSize ?? NODE.icon;
    if (n.icon) els.push(base("image", n.box.x + n.box.w / 2 - isz / 2, n.box.y + (n.iconSize ? 18 : 16), isz, isz, "transparent", { fileId: fileFor(n.icon), status: "saved", scale: [1, 1], crop: null, groupIds: [gid] }));
    els.push(text(n.keyword, n.box.x + n.box.w / 2, n.box.y + (n.kwY ?? 160), n.kwSize ?? NODE.kwSize, opts.ink ?? "#f2f2f2", "middle", [gid]));
    if (n.sub) els.push(text(n.sub, n.box.x + n.box.w / 2, n.box.y + 194, NODE.subSize, opts.muted ?? "#a0a4a8", "middle", [gid]));
  }
  for (const e of sk.edges) {
    const [x0, y0] = e.points[0];
    const a = base("arrow", x0, y0, 0, 0, e.color, {
      points: e.points.map(([x, y]) => [x - x0, y - y0]), lastCommittedPoint: null, startArrowhead: e.both ? "arrow" : null, endArrowhead: "arrow", elbowed: false,
      startBinding: e.from && rects.has(e.from) ? { elementId: rects.get(e.from).id, focus: 0, gap: 1 } : null,
      endBinding: e.to && rects.has(e.to) ? { elementId: rects.get(e.to).id, focus: 0, gap: 1 } : null,
    });
    const xs = e.points.map((p) => p[0]), ys = e.points.map((p) => p[1]);
    a.width = Math.max(...xs) - Math.min(...xs); a.height = Math.max(...ys) - Math.min(...ys);
    for (const id of [e.from, e.to]) if (id && rects.has(id)) rects.get(id).boundElements.push({ id: a.id, type: "arrow" });
    els.push(a);
    if (e.label && e.labelBox) els.push(text(e.label, e.labelBox.x + e.labelBox.w / 2, e.labelBox.y + e.labelBox.h * 0.72, e.labelSize ?? NODE.labelSize, opts.edgeLabel ?? "#bdbdbd", "middle"));
  }
  for (const el of sk.ellipses) els.push(base("ellipse", el.box.x, el.box.y, el.box.w, el.box.h, el.color, { strokeWidth: 4, roughness: 2 }));
  for (const p of sk.polygons) {
    const [x0, y0] = p.points[0];
    const pts = [...p.points, p.points[0]].map(([x, y]) => [x - x0, y - y0]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    els.push(base("line", x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), p.color, { points: pts, backgroundColor: p.color, fillStyle: "hachure", strokeWidth: 4, lastCommittedPoint: null, startArrowhead: null, endArrowhead: null }));
  }
  for (const t of sk.texts) els.push(text(t.text, t.x, t.y, t.size, t.color, t.anchor));

  return {
    type: "excalidraw", version: 2, source: opts.source ?? "https://github.com/slubbles/explainlike",
    elements: els,
    appState: { viewBackgroundColor: opts.background, theme: "light", gridSize: null, currentItemFontFamily: 5 },
    files,
  };
}
