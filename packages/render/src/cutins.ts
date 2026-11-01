import { parseFigure, parseDated, type NoteItem } from "@explainlike/core";
import { wrapText, type Box } from "./layout.js";
import { textWidth } from "./measure.js";

/**
 * News-explainer cut-ins drawn on the whiteboard: a bar chart of figures the source states, and a timeline of
 * its dates. Positions are relative to the panel's top-left so the region grid can place the panel anywhere.
 */

export const CHART = { row: 136, bar: 72, size: 50, maxBar: 1000, gap: 34 };
export interface Bar { item: number; label: string; shown: string; label_x: number; bar: Box; value_x: number; text_y: number }

/** Bars share one scale starting at zero, longest = maxBar, so their lengths compare honestly. */
export function chartLayout(items: NoteItem[]): { w: number; h: number; bars: Bar[] } {
  const figs = items.map((it) => parseFigure(it.text)!);
  const labelW = Math.max(...figs.map((f) => textWidth(f.label, CHART.size)));
  const top = Math.max(...figs.map((f) => f.value)) || 1;
  const x0 = labelW + CHART.gap;
  const bars = figs.map((f, i) => {
    const y = i * CHART.row;
    const w = Math.max(14, (f.value / top) * CHART.maxBar);
    return { item: i, label: f.label, shown: f.shown, label_x: 0, bar: { x: x0, y: y + (CHART.row - CHART.bar) / 2, w, h: CHART.bar }, value_x: x0 + w + 24, text_y: y + CHART.row / 2 + CHART.size * 0.35 };
  });
  const valueW = Math.max(...figs.map((f) => textWidth(f.shown, CHART.size)));
  return { w: x0 + CHART.maxBar + 24 + valueW, h: figs.length * CHART.row, bars };
}

export const TIMELINE = { step: 440, date: 52, label: 40, labelW: 400, lineY: 110 };
export interface Tick { item: number; x: number; when: string; lines: string[] }

/** Evenly spaced ticks in date order: the date above the line, what happened below it. */
export function timelineLayout(items: NoteItem[]): { w: number; h: number; lineY: number; ticks: Tick[] } {
  const rows = items.map((it, i) => ({ i, d: parseDated(it.text)! })).sort((a, b) => a.d.key - b.d.key);
  const pad = TIMELINE.labelW / 2;
  const ticks = rows.map((r, k) => ({ item: r.i, x: pad + k * TIMELINE.step, when: r.d.when, lines: wrapText(r.d.label, TIMELINE.label, TIMELINE.labelW, 2) }));
  const deepest = Math.max(...ticks.map((t) => t.lines.length));
  return { w: pad * 2 + (rows.length - 1) * TIMELINE.step, h: TIMELINE.lineY + 70 + deepest * TIMELINE.label * 1.25, lineY: TIMELINE.lineY, ticks };
}

export const cutInSize = (kind: "chart" | "timeline", items: NoteItem[]) => { const l = kind === "chart" ? chartLayout(items) : timelineLayout(items); return { w: l.w, h: l.h }; };
