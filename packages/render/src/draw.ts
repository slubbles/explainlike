import { getStroke } from "perfect-freehand";

type Op = { op: "move" | "bcurveTo" | "lineTo"; data: number[] };

/** Points along rough.js ops, split into separate pen strokes at every move. */
function strokesOf(ops: Op[]): number[][][] {
  const out: number[][][] = [];
  let cur: number[][] = [];
  let last = [0, 0];
  const add = (p: number[]) => {
    const q = cur[cur.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) cur.push(p);
  };
  for (const { op, data } of ops) {
    if (op === "move") {
      if (cur.length > 1) out.push(cur);
      cur = [data.slice(0, 2)];
      last = data.slice(0, 2);
    } else if (op === "lineTo") {
      const n = Math.max(2, Math.ceil(Math.hypot(data[0] - last[0], data[1] - last[1]) / 6));
      for (let i = 1; i <= n; i++) add([last[0] + ((data[0] - last[0]) * i) / n, last[1] + ((data[1] - last[1]) * i) / n]);
      last = data.slice(0, 2);
    } else {
      const [x1, y1, x2, y2, x, y] = data,
        [x0, y0] = last;
      const n = Math.max(3, Math.ceil((Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2)) / 6));
      for (let i = 1; i <= n; i++) {
        const t = i / n,
          u = 1 - t;
        add([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        ]);
      }
      last = [x, y];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

const avg = (a: number, b: number) => ((a + b) / 2).toFixed(1);
function svgPath(pts: number[][]): string {
  if (pts.length < 4) return "";
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i],
      [x1, y1] = pts[(i + 1) % pts.length];
    d += `Q${f(x0)},${f(y0)} ${avg(x0, x1)},${avg(y0, y1)}`;
  }
  return d + "Z";
}

/** Even spacing along the stroke, with a slow made-up pen pressure so the width swells and thins smoothly. */
function withPressure(pts: number[][], step = 8): number[][] {
  const out: number[][] = [];
  const phase = (pts[0][0] * 0.013 + pts[0][1] * 0.007) % (Math.PI * 2);
  let s = 0,
    carry = 0;
  const push = (x: number, y: number) => out.push([x, y, 0.5 + 0.22 * Math.sin(s / 140 + phase) + 0.1 * Math.sin(s / 47 + phase * 2)]);
  push(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1],
      [x1, y1] = pts[i],
      L = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= L) {
      s += step;
      push(x0 + ((x1 - x0) * d) / L, y0 + ((y1 - y0) * d) / L);
      d += step;
    }
    carry = L - (d - step);
  }
  const [lx, ly] = pts[pts.length - 1];
  push(lx, ly);
  return out;
}

/**
 * A marker-pen outline for a rough.js stroke: the line swells and thins along
 * its length, like a hand-drawn board. Returns a filled path; the plain centre
 * line is still used to animate drawing.
 */
export function penOutline(ops: Op[], width: number): string {
  return strokesOf(ops)
    .map((pts) =>
      svgPath(
        getStroke(withPressure(pts), {
          size: width * 2.3,
          thinning: 0.55,
          smoothing: 0.7,
          streamline: 0.45,
          simulatePressure: false,
          start: { taper: false, cap: true },
          end: { taper: false, cap: true },
          last: true,
        }),
      ),
    )
    .filter(Boolean)
    .join(" ");
}
