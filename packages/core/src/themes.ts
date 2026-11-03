import type { Color } from "./schemas.js";

export interface Theme {
  id: string;
  background: string;
  ink: string;
  dimOpacity: number;
  edge: string;
  edgeLabel: string;
  caption: { color: string; highlight: string; background: string };
  accent: string;
  colors: Record<Color, string>;
  /** icons are white doodles; on a light theme we invert them */
  invertIcons: boolean;
  /** handwriting font (default excalifont) */
  hand?: "excalifont" | "shantell";
  /** rough: sketchy double lines; pen: one marker line that swells and thins (default rough) */
  stroke?: "rough" | "pen";
}

const dark: Theme = {
  id: "chalk-dark",
  background: "#000000",
  ink: "#f2f2f2",
  dimOpacity: 0.3,
  edge: "#c8c8c8",
  edgeLabel: "#bdbdbd",
  caption: { color: "#e9e9e9", highlight: "#ffd23f", background: "rgba(0,0,0,0.72)" },
  accent: "#0866FF",
  colors: {
    white: "#f2f2f2",
    red: "#ff4d5e",
    orange: "#ff9f1c",
    yellow: "#ffd23f",
    green: "#3ddc84",
    blue: "#5aa9ff",
    purple: "#b47cff",
    teal: "#3fd0c9",
    pink: "#f78fb3",
    gray: "#a0a4a8",
  },
  invertIcons: false,
};

const light: Theme = {
  id: "whiteboard-light",
  background: "#fbfaf7",
  ink: "#1e1e1e",
  dimOpacity: 0.2,
  edge: "#3a3a3a",
  edgeLabel: "#555555",
  caption: { color: "#1e1e1e", highlight: "#0064E0", background: "rgba(255,255,255,0.85)" },
  accent: "#0064E0",
  colors: {
    white: "#1e1e1e",
    red: "#e03131",
    orange: "#e8590c",
    yellow: "#b08900",
    green: "#2f9e44",
    blue: "#1971c2",
    purple: "#7048e8",
    teal: "#0c8599",
    pink: "#c2255c",
    gray: "#666666",
  },
  invertIcons: true,
};

/** Light board with marker-pen lines, a friendly hand font and soft colours. The default. */
const pen: Theme = {
  id: "pen-light",
  background: "#f9fafb",
  ink: "#1d1d1d",
  dimOpacity: 0.3,
  edge: "#1d1d1d",
  edgeLabel: "#4b5058",
  caption: { color: "#1d1d1d", highlight: "#0064E0", background: "rgba(249,250,251,0.9)" },
  accent: "#0064E0",
  colors: {
    white: "#1d1d1d",
    red: "#e03131",
    orange: "#e16919",
    yellow: "#f1ac4b",
    green: "#099268",
    blue: "#4465e9",
    purple: "#ae3ec9",
    teal: "#4ba1f1",
    pink: "#e085f4",
    gray: "#868e96",
  },
  invertIcons: true,
  hand: "shantell",
  stroke: "pen",
};

export const DEFAULT_THEME = pen.id;
const registry = new Map<string, Theme>([
  [pen.id, pen],
  [dark.id, dark],
  [light.id, light],
]);
export function getTheme(id = DEFAULT_THEME): Theme {
  const t = registry.get(id);
  if (!t) throw new Error(`unknown theme "${id}". Known: ${[...registry.keys()].join(", ")}`);
  return t;
}

export function listThemes() {
  return [...registry.keys()];
}
