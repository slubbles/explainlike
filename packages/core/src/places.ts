import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A small gazetteer from Natural Earth (public domain): country outlines and named cities, so a map cut-in
 * only shows places that really exist, drawn where they really are.
 */
export const MAP_CREDIT = "Made with Natural Earth";

export interface Country {
  name: string;
  iso: string;
  alt: string[];
  rings: [number, number][][];
}
export type Place =
  | { kind: "country"; name: string; iso: string; lon: number; lat: number; bbox: [number, number, number, number] }
  | { kind: "city"; name: string; iso: string; lon: number; lat: number };

interface Data {
  countries: Country[];
  places: [string, number, number, string, number][];
}
let data: Data | undefined;
const load = (): Data =>
  (data ??= JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/naturalearth.json"), "utf8")));

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const EXTRA: Record<string, string> = {
  usa: "USA",
  us: "USA",
  america: "USA",
  uk: "GBR",
  britain: "GBR",
  "great britain": "GBR",
  england: "GBR",
  holland: "NLD",
  // older names a history topic will use for the same land
  persia: "IRN",
  burma: "MMR",
  siam: "THA",
  ceylon: "LKA",
  zaire: "COD",
  swaziland: "SWZ",
  macedonia: "MKD",
  turkiye: "TUR",
};

export const countries = (): Country[] => load().countries;

export function ringsBox(rings: [number, number][][]): [number, number, number, number] {
  let x0 = 180,
    y0 = 90,
    x1 = -180,
    y1 = -90;
  for (const r of rings)
    for (const [x, y] of r) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

/** The country's largest ring, so a pin for "france" sits in mainland France, not in French Guiana. */
function mainRing(c: Country): [number, number][] {
  const area = (r: [number, number][]) =>
    Math.abs(
      r.reduce((a, [x, y], i) => {
        const [u, v] = r[(i + 1) % r.length];
        return a + x * v - u * y;
      }, 0) / 2,
    );
  return c.rings.reduce((a, b) => (area(b) > area(a) ? b : a));
}

/** A country by any of its names, or else the most populous city of that name. "merv, turkmenistan" is
 * tried as written, then as the city before the comma, then as the country after it. */
export function findPlace(name: string): Place | undefined {
  const parts = name
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length > 1) return findOne(name) ?? parts.map(findOne).find(Boolean);
  return findOne(name);
}

function findOne(name: string): Place | undefined {
  const k = key(name);
  if (!k) return undefined;
  const d = load();
  const c =
    d.countries.find((c) => key(c.name) === k || c.alt.some((a) => key(a) === k)) ??
    (EXTRA[k] ? d.countries.find((c) => c.iso === EXTRA[k]) : undefined);
  if (c) {
    const m = mainRing(c),
      [x0, y0, x1, y1] = ringsBox([m]);
    return { kind: "country", name: c.name, iso: c.iso, lon: (x0 + x1) / 2, lat: (y0 + y1) / 2, bbox: ringsBox([m]) };
  }
  const p = d.places.filter((p) => key(p[0]) === k).sort((a, b) => b[4] - a[4])[0];
  return p ? { kind: "city", name: p[0], iso: p[3], lon: p[1], lat: p[2] } : undefined;
}
