import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(import.meta.dirname, "../app/globals.css"), "utf8");

/** WCAG relative luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))![1];

test("muted and dim text reach 4.5:1 on the page, the panels and a lifted card", () => {
  for (const fg of [token("mut"), token("dim")])
    for (const bg of ["#000000", token("panel"), token("panel2"), "#1c1c1f"])
      assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
});

test("no text colour below 4.5:1 is hard-coded, like the old #52525b legal line", () => {
  for (const rule of css.matchAll(/\{([^}]*)\}/g)) {
    const fg = rule[1].match(/(?<![-\w])color:\s*(#[0-9a-f]{6})\b/i)?.[1];
    if (!fg) continue;
    // a rule that sets its own solid background is measured against it (the white tap-hint chip)
    const bg = rule[1].match(/background:\s*(#[0-9a-f]{6}|#fff)\b/i)?.[1].replace(/^#fff$/i, "#ffffff") ?? "#000000";
    assert.ok(contrast(fg, bg) >= 4.5, `color ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
  }
});
