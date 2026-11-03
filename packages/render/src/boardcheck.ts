/**
 * Self-check for the editable boards: every box, arrow and word from the sketch made it into the file,
 * every reference (parent, binding, asset, file) points at something that exists, and every shape sits
 * at a real position. A board that fails here would open broken or empty in tldraw or Excalidraw.
 */
import type { Sketch } from "./compose.js";
import { tidySketch } from "./tidy.js";

export interface BoardCheck {
  format: "tldr" | "excalidraw";
  ok: boolean;
  counts: Record<string, number>;
  problems: string[];
}

const finite = (...v: unknown[]) => v.every((x) => typeof x === "number" && Number.isFinite(x));
const richText = (r: any): string =>
  (r?.content ?? []).map((p: any) => (p.content ?? []).map((c: any) => c.text ?? "").join("")).join("\n");

export function checkTldr(doc: any, raw: Sketch): BoardCheck {
  const sk = tidySketch(raw),
    problems: string[] = [];
  if (doc?.tldrawFileFormatVersion !== 1) problems.push("not a tldraw v1 file");
  const recs: any[] = doc?.records ?? [];
  const byId = new Map(recs.map((r) => [r.id, r]));
  if (byId.size !== recs.length) problems.push("duplicate record ids");
  if (!byId.has("document:document") || !recs.some((r) => r.typeName === "page")) problems.push("missing document or page");
  const shapes = recs.filter((r) => r.typeName === "shape");
  for (const s of shapes) {
    if (!byId.has(s.parentId)) problems.push(`${s.id} has no parent ${s.parentId}`);
    if (!finite(s.x, s.y)) problems.push(`${s.id} has no position`);
    if (s.type === "image" && byId.get(s.props?.assetId)?.typeName !== "asset") problems.push(`${s.id} image has no asset`);
    if (s.type === "image" && !String(byId.get(s.props?.assetId)?.props?.src ?? "").startsWith("data:image/"))
      problems.push(`${s.id} image asset is empty`);
  }
  for (const b of recs.filter((r) => r.typeName === "binding")) {
    if (byId.get(b.fromId)?.type !== "arrow") problems.push(`${b.id} does not start at an arrow`);
    if (byId.get(b.toId)?.typeName !== "shape") problems.push(`${b.id} points at nothing`);
  }
  const boxes = shapes.filter((s) => s.type === "geo" && s.props?.geo === "rectangle"),
    arrows = shapes.filter((s) => s.type === "arrow");
  if (boxes.length < sk.nodes.length) problems.push(`${boxes.length} boxes for ${sk.nodes.length} nodes`);
  if (arrows.length !== sk.edges.length) problems.push(`${arrows.length} arrows for ${sk.edges.length} edges`);
  const words = new Set(shapes.flatMap((s) => richText(s.props?.richText).split("\n")).filter(Boolean));
  for (const n of sk.nodes) if (!words.has(n.keyword)) problems.push(`box "${n.keyword}" lost its name`);
  for (const t of sk.texts) if (t.text.trim() && !words.has(t.text)) problems.push(`text "${t.text}" is missing`);
  return {
    format: "tldr",
    ok: !problems.length,
    counts: {
      shapes: shapes.length,
      boxes: boxes.length,
      arrows: arrows.length,
      bindings: recs.filter((r) => r.typeName === "binding").length,
      assets: recs.filter((r) => r.typeName === "asset").length,
    },
    problems,
  };
}

export function checkExcalidraw(doc: any, raw: Sketch): BoardCheck {
  const sk = tidySketch(raw),
    problems: string[] = [];
  if (doc?.type !== "excalidraw" || doc?.version !== 2) problems.push("not an excalidraw v2 file");
  const els: any[] = doc?.elements ?? [],
    files = doc?.files ?? {};
  const byId = new Map(els.map((e) => [e.id, e]));
  if (byId.size !== els.length) problems.push("duplicate element ids");
  for (const e of els) {
    if (!finite(e.x, e.y, e.width, e.height)) problems.push(`${e.id} (${e.type}) has no position or size`);
    if (e.type === "image" && !String(files[e.fileId]?.dataURL ?? "").startsWith("data:image/")) problems.push(`${e.id} image has no file`);
    if ((e.type === "arrow" || e.type === "line") && (!Array.isArray(e.points) || e.points.length < 2))
      problems.push(`${e.id} ${e.type} has under two points`);
    for (const end of ["startBinding", "endBinding"]) {
      const to = e[end]?.elementId;
      if (to && !byId.get(to)?.boundElements?.some((b: any) => b.id === e.id)) problems.push(`${e.id} ${end} is not tied back from ${to}`);
    }
    for (const b of e.boundElements ?? []) if (!byId.has(b.id)) problems.push(`${e.id} is bound to missing ${b.id}`);
  }
  const boxes = els.filter((e) => e.type === "rectangle"),
    arrows = els.filter((e) => e.type === "arrow");
  if (boxes.length < sk.nodes.length) problems.push(`${boxes.length} boxes for ${sk.nodes.length} nodes`);
  if (arrows.length !== sk.edges.length) problems.push(`${arrows.length} arrows for ${sk.edges.length} edges`);
  const words = new Set(els.filter((e) => e.type === "text").map((e) => e.text));
  for (const n of sk.nodes) if (!words.has(n.keyword)) problems.push(`box "${n.keyword}" lost its name`);
  for (const t of sk.texts) if (t.text.trim() && !words.has(t.text)) problems.push(`text "${t.text}" is missing`);
  for (const e of sk.edges) if (e.label && e.labelBox && !words.has(e.label)) problems.push(`arrow label "${e.label}" is missing`);
  return {
    format: "excalidraw",
    ok: !problems.length,
    counts: { elements: els.length, boxes: boxes.length, arrows: arrows.length, files: Object.keys(files).length },
    problems,
  };
}
