import fs from "node:fs";
import sharp from "sharp";
import type { Sketch } from "./compose.js";
import { textWidth } from "./measure.js";
import { NODE } from "./layout.js";
import { tidySketch } from "./tidy.js";

/**
 * Writes a .tldr file (the JSON a tldraw editor saves and opens) from the final canvas.
 * We build the records by hand so the kit needs no tldraw package. The record shapes and
 * the version numbers below follow the public schema in tldraw's repo
 * (packages/tlschema, version 5.6). Files saved at these versions open in tldraw.com,
 * which migrates them forward if it is newer.
 */
export const TLDR_SCHEMA = {
  schemaVersion: 2,
  sequences: {
    "com.tldraw.store": 5,
    "com.tldraw.asset": 1,
    "com.tldraw.camera": 1,
    "com.tldraw.document": 2,
    "com.tldraw.instance": 26,
    "com.tldraw.instance_page_state": 5,
    "com.tldraw.page": 1,
    "com.tldraw.instance_presence": 6,
    "com.tldraw.pointer": 1,
    "com.tldraw.shape": 4,
    "com.tldraw.user": 1,
    "com.tldraw.asset.image": 6,
    "com.tldraw.asset.video": 5,
    "com.tldraw.asset.bookmark": 2,
    "com.tldraw.shape.arrow": 8,
    "com.tldraw.shape.bookmark": 2,
    "com.tldraw.shape.draw": 5,
    "com.tldraw.shape.embed": 4,
    "com.tldraw.shape.frame": 1,
    "com.tldraw.shape.geo": 12,
    "com.tldraw.shape.group": 0,
    "com.tldraw.shape.highlight": 4,
    "com.tldraw.shape.image": 5,
    "com.tldraw.shape.line": 5,
    "com.tldraw.shape.note": 13,
    "com.tldraw.shape.text": 4,
    "com.tldraw.shape.video": 4,
    "com.tldraw.binding.arrow": 1,
  },
} as const;

/** tldraw's named colours. Its editor swaps them for light and dark mode itself. */
export type TlColor =
  | "black"
  | "grey"
  | "light-violet"
  | "violet"
  | "blue"
  | "light-blue"
  | "yellow"
  | "orange"
  | "green"
  | "light-green"
  | "light-red"
  | "red"
  | "white";
/** Our colour names mapped to the closest tldraw colour. White is the ink colour, so it becomes black (white in dark mode). */
export const TL_COLOR: Record<string, TlColor> = {
  white: "black",
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  purple: "violet",
  teal: "light-blue",
  pink: "light-violet",
  gray: "grey",
};

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** The n-th fractional index key in order: a0..az, then b00..bzz. */
export function indexKey(n: number): string {
  if (n < 62) return "a" + DIGITS[n];
  n -= 62;
  if (n < 62 * 62) return "b" + DIGITS[Math.floor(n / 62)] + DIGITS[n % 62];
  throw new Error("too many shapes for one layer");
}

const rich = (lines: string[]) => ({
  type: "doc",
  content: lines.map((t) => (t ? { type: "paragraph", content: [{ type: "text", text: t }] } : { type: "paragraph" })),
});

export interface TldrOptions {
  /** hex colour -> our colour name, from the theme (so the export uses tldraw's palette) */
  colorNames: Record<string, string>;
  /** the icons are white doodles; tldraw opens in light mode, so draw them dark */
  darkIcons?: boolean;
  name?: string;
}

export async function toTldraw(raw: Sketch, opts: TldrOptions) {
  const sk = tidySketch(raw);
  const color = (hex: string): TlColor => TL_COLOR[opts.colorNames[hex.toLowerCase()] ?? ""] ?? "black";
  const page = "page:page";
  const records: any[] = [
    { typeName: "document", id: "document:document", gridSize: 10, name: opts.name ?? "", meta: {} },
    { typeName: "page", id: page, name: "Page 1", index: "a1", meta: {} },
  ];
  let z = 0,
    uid = 0;
  const id = (kind: string) => `${kind}:m${(uid++).toString(36)}`;
  const shape = (type: string, x: number, y: number, props: any, parentId = page) => {
    const r = {
      typeName: "shape",
      id: id("shape"),
      type,
      x,
      y,
      rotation: 0,
      index: indexKey(z++),
      parentId,
      isLocked: false,
      opacity: 1,
      props,
      meta: {},
    };
    records.push(r);
    return r;
  };
  const assets = new Map<string, string>();
  // every icon the board needs, inverted up front and side by side: the negate calls are
  // independent, and awaiting them one by one is the slowest part of the export. The records
  // below are still built in the same order, so the file is unchanged.
  const warmed = new Map<string, Buffer>();
  const wanted = new Map<string, { file: string; invert: boolean }>();
  for (const im of sk.images) wanted.set(`${im.file}|false`, { file: im.file, invert: false });
  for (const n of sk.nodes) if (n.icon) wanted.set(`${n.icon}|${!!opts.darkIcons}`, { file: n.icon, invert: !!opts.darkIcons });
  await Promise.all(
    [...wanted].map(async ([key, { file, invert }]) => {
      let buf: Buffer = fs.readFileSync(file);
      if (invert) buf = await sharp(buf).negate({ alpha: false }).png().toBuffer();
      warmed.set(key, buf);
    }),
  );
  const asset = async (file: string, w: number, h: number, invert: boolean) => {
    const key = `${file}|${invert}`;
    if (!assets.has(key)) {
      let buf = warmed.get(key);
      if (!buf) {
        buf = fs.readFileSync(file);
        if (invert) buf = await sharp(buf).negate({ alpha: false }).png().toBuffer();
      }
      const a = id("asset");
      records.push({
        typeName: "asset",
        id: a,
        type: "image",
        meta: {},
        props: {
          name: file.split("/").pop() ?? "image.png",
          src: `data:image/png;base64,${buf.toString("base64")}`,
          w,
          h,
          mimeType: "image/png",
          isAnimated: false,
        },
      });
      assets.set(key, a);
    }
    return assets.get(key)!;
  };
  const image = async (file: string, x: number, y: number, w: number, h: number, invert: boolean, parentId = page) =>
    shape(
      "image",
      x,
      y,
      { w, h, playing: true, url: "", assetId: await asset(file, w, h, invert), crop: null, flipX: false, flipY: false, altText: "" },
      parentId,
    );
  const text = (t: string, x: number, y: number, size: number, c: TlColor, anchor: "start" | "middle") => {
    const w = Math.max(8, textWidth(t, size));
    shape("text", anchor === "middle" ? x - w / 2 : x, y - size * 0.95, {
      color: c,
      size: "m",
      font: "draw",
      textAlign: anchor === "middle" ? "middle" : "start",
      w,
      richText: rich([t]),
      scale: size / 24,
      autoSize: true,
    });
  };

  for (const im of sk.images) await image(im.file, im.box.x, im.box.y, im.box.w, im.box.h, false);

  // each box is a group: the rectangle with its words, and its icon on top
  const boxes = new Map<string, { id: string; box: { x: number; y: number; w: number; h: number } }>();
  for (const n of sk.nodes) {
    const g = shape("group", n.box.x, n.box.y, {});
    const r = shape(
      "geo",
      0,
      0,
      {
        geo: "rectangle",
        dash: "draw",
        url: "",
        w: n.box.w,
        h: n.box.h,
        growY: 0,
        scale: 1,
        flipX: false,
        flipY: false,
        labelColor: "black",
        color: color(n.color),
        fill: "none",
        size: "s",
        font: "draw",
        align: "middle",
        verticalAlign: "end",
        richText: rich(n.sub ? [n.keyword, n.sub] : [n.keyword]),
      },
      g.id,
    );
    boxes.set(n.id, { id: r.id, box: n.box });
    const isz = n.iconSize ?? NODE.icon;
    if (n.icon) await image(n.icon, n.box.w / 2 - isz / 2, n.iconSize ? 18 : 16, isz, isz, !!opts.darkIcons, g.id);
  }

  for (const e of sk.edges) {
    const [x0, y0] = e.points[0],
      [x1, y1] = e.points.at(-1)!;
    const bent = e.points.length > 2;
    const a = shape("arrow", x0, y0, {
      kind: bent ? "elbow" : "arc",
      labelColor: "black",
      color: color(e.color),
      fill: "none",
      dash: "draw",
      size: "m",
      arrowheadStart: e.both ? "arrow" : "none",
      arrowheadEnd: "arrow",
      font: "draw",
      start: { x: 0, y: 0 },
      end: { x: x1 - x0, y: y1 - y0 },
      bend: 0,
      richText: rich(e.label ? [e.label] : []),
      labelPosition: 0.5,
      scale: 1,
      elbowMidPoint: 0.5,
    });
    // tie each end to its box at the point where the drawn line meets it, so tldraw keeps the
    // same route and the arrow follows the box when it is moved
    for (const [terminal, to, [px, py]] of [
      ["start", e.from, e.points[0]],
      ["end", e.to, e.points.at(-1)!],
    ] as const) {
      const b = to ? boxes.get(to) : undefined;
      if (!b) continue;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      records.push({
        typeName: "binding",
        id: id("binding"),
        type: "arrow",
        fromId: a.id,
        toId: b.id,
        meta: {},
        props: {
          terminal,
          normalizedAnchor: { x: clamp((px - b.box.x) / b.box.w), y: clamp((py - b.box.y) / b.box.h) },
          isExact: false,
          isPrecise: true,
          snap: "none",
        },
      });
    }
  }

  for (const el of sk.ellipses)
    shape("geo", el.box.x, el.box.y, {
      geo: "ellipse",
      dash: "draw",
      url: "",
      w: el.box.w,
      h: el.box.h,
      growY: 0,
      scale: 1,
      flipX: false,
      flipY: false,
      labelColor: "black",
      color: color(el.color),
      fill: "none",
      size: "l",
      font: "draw",
      align: "middle",
      verticalAlign: "middle",
      richText: rich([]),
    });
  for (const p of sk.polygons) {
    const [x0, y0] = p.points[0];
    const pts = [...p.points, p.points[0]];
    shape("line", x0, y0, {
      color: color(p.color),
      dash: "draw",
      size: "l",
      spline: "line",
      scale: 1,
      points: Object.fromEntries(pts.map(([x, y], i) => [`p${i}`, { id: `p${i}`, index: indexKey(i), x: x - x0, y: y - y0 }])),
    });
  }
  for (const t of sk.texts) text(t.text, t.x, t.y, t.size, color(t.color), t.anchor);

  return { tldrawFileFormatVersion: 1, schema: TLDR_SCHEMA, records };
}
