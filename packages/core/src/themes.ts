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
}

const dark: Theme = {
  id: "caleb-dark",
  background: "#000000",
  ink: "#f2f2f2",
  dimOpacity: 0.22,
  edge: "#c8c8c8",
  edgeLabel: "#bdbdbd",
  caption: { color: "#e9e9e9", highlight: "#ffd23f", background: "rgba(0,0,0,0.72)" },
  accent: "#0866FF",
  colors: {
    white: "#f2f2f2", red: "#ff4d5e", orange: "#ff9f1c", yellow: "#ffd23f", green: "#3ddc84",
    blue: "#5aa9ff", purple: "#b47cff", teal: "#3fd0c9", pink: "#f78fb3", gray: "#a0a4a8",
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
    white: "#1e1e1e", red: "#e03131", orange: "#e8590c", yellow: "#b08900", green: "#2f9e44",
    blue: "#1971c2", purple: "#7048e8", teal: "#0c8599", pink: "#c2255c", gray: "#666666",
  },
  invertIcons: true,
};

const registry = new Map<string, Theme>([[dark.id, dark], [light.id, light]]);
export function getTheme(id = "caleb-dark"): Theme {
  const t = registry.get(id);
  if (!t) throw new Error(`unknown theme "${id}". Known: ${[...registry.keys()].join(", ")}`);
  return t;
}
/** Plugin point: register a theme. */
export function registerTheme(t: Theme) { registry.set(t.id, t); }
export function listThemes() { return [...registry.keys()]; }
