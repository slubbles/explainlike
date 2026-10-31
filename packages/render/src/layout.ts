import ELK from "elkjs/lib/elk.bundled.js";
import { textWidth } from "./measure.js";

export interface GNode { id: string; keyword: string; sub?: string; icon?: string; color: string; quote?: string[]; count?: number }
export interface GEdge { from: string; to: string; label?: string; both?: boolean }
export interface Box { x: number; y: number; w: number; h: number }
export interface PlacedNode extends GNode, Box {}
export interface PlacedEdge extends GEdge { points: [number, number][]; labelBox?: Box }
export interface Layout { nodes: Map<string, PlacedNode>; edges: PlacedEdge[]; bbox: Box }

export const NODE = { h: 214, minW: 220, pad: 60, icon: 104, kwSize: 36, subSize: 26, labelSize: 25 };

export function nodeWidth(n: GNode) {
  return Math.max(NODE.minW, textWidth(n.keyword, NODE.kwSize) + NODE.pad, n.sub ? textWidth(n.sub, NODE.subSize) + 44 : 0);
}

const elk = new (ELK as any)();

/** Layered left-to-right layout with orthogonal edges and reserved label space. */
export interface LayoutOpts { direction?: "RIGHT" | "DOWN"; size?: (n: GNode) => { w: number; h: number }; labelSize?: number; layerGap?: number; nodeGap?: number }

/** Wrap text in Excalifont to a max width; ellipsis on the last line. */
export function wrapText(text: string, size: number, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const next = cur ? cur + " " + words[i] : words[i];
    if (textWidth(next, size) <= maxW || !cur) { cur = next; continue; }
    lines.push(cur); cur = words[i];
    if (lines.length === maxLines) { cur = ""; lines[maxLines - 1] = lines[maxLines - 1].replace(/[,.;:]?$/, "…"); break; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

export async function layoutGraph(nodes: GNode[], edges: GEdge[], opts: LayoutOpts = {}): Promise<Layout> {
  const labelSize = opts.labelSize ?? NODE.labelSize;
  const size = opts.size ?? ((n: GNode) => ({ w: nodeWidth(n), h: NODE.h }));
  const ids = new Set(nodes.map((n) => n.id));
  // a>b and b>a become one two-way edge so the diagram stays calm
  const es: GEdge[] = [];
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    const rev = es.find((x) => x.from === e.to && x.to === e.from);
    if (rev) { rev.both = true; continue; }
    if (!es.some((x) => x.from === e.from && x.to === e.to)) es.push({ ...e });
  }
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": opts.direction ?? "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(opts.nodeGap ?? 90),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(opts.layerGap ?? 150),
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.spacing.edgeEdge": "26",
      "elk.spacing.edgeLabel": "6",
      "elk.edgeLabels.inline": "false",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.semiInteractive": "false",
      "elk.separateConnectedComponents": "false",
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodes.map((n) => { const z = size(n); return { id: n.id, width: z.w, height: z.h }; }),
    edges: es.map((e, i) => ({
      id: `e${i}`, sources: [e.from], targets: [e.to],
      labels: e.label ? [{ text: e.label, width: textWidth(e.label, labelSize) + 16, height: labelSize * 1.36, layoutOptions: { "elk.edgeLabels.placement": "CENTER" } }] : [],
    })),
  };
  const res = await elk.layout(graph);
  const placed = new Map<string, PlacedNode>();
  for (const c of res.children) {
    const n = nodes.find((x) => x.id === c.id)!;
    placed.set(c.id, { ...n, x: c.x, y: c.y, w: c.width, h: c.height });
  }
  const pe: PlacedEdge[] = res.edges.map((re: any, i: number) => {
    const s = re.sections?.[0];
    const pts: [number, number][] = s ? [[s.startPoint.x, s.startPoint.y], ...(s.bendPoints ?? []).map((b: any) => [b.x, b.y]), [s.endPoint.x, s.endPoint.y]] : [];
    const l = re.labels?.[0];
    return { ...es[i], points: pts, labelBox: l ? { x: l.x, y: l.y, w: l.width, h: l.height } : undefined };
  });
  return { nodes: placed, edges: pe, bbox: { x: 0, y: 0, w: res.width, h: res.height } };
}

export function unionBox(boxes: Box[], pad = 0): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function shiftLayout(l: Layout, dx: number, dy: number): Layout {
  const nodes = new Map([...l.nodes].map(([k, n]) => [k, { ...n, x: n.x + dx, y: n.y + dy }]));
  const edges = l.edges.map((e) => ({ ...e, points: e.points.map(([x, y]) => [x + dx, y + dy] as [number, number]), labelBox: e.labelBox && { ...e.labelBox, x: e.labelBox.x + dx, y: e.labelBox.y + dy } }));
  return { nodes, edges, bbox: { ...l.bbox, x: l.bbox.x + dx, y: l.bbox.y + dy } };
}
