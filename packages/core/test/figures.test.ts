import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFigure, parseDated, figureInQuote } from "@explanimate/core";

test("a chart row gives back its label, value and the number as written", () => {
  assert.deepEqual(parseFigure("chrome 65%"), { label: "chrome", value: 65, shown: "65%", unit: "%" });
  assert.deepEqual(parseFigure("us spending $1.2 trillion"), { label: "us spending", value: 1.2e12, shown: "$1.2 trillion", unit: "$" });
  assert.equal(parseFigure("root servers: 13")?.value, 13);
  assert.equal(parseFigure("1,500 domains registered")?.value, 1500);
  assert.deepEqual(parseFigure("1993 share 1%"), { label: "1993 share", value: 1, shown: "1%", unit: "%" }, "a year in the label is not the bar");
  assert.equal(parseFigure("1983 hosts 562")?.value, 562);
  assert.equal(parseFigure("no number here"), undefined);
  assert.equal(parseFigure("42"), undefined, "a number with no label is not a bar");
});

test("a timeline row gives back its date and sorts BC before AD and months in order", () => {
  assert.deepEqual(parseDated("1983 dns is invented"), { label: "dns is invented", when: "1983", key: 1983 * 12 });
  const rows = ["march 1985 first .com", "1983 dns invented", "january 1985 root zone", "300 bc euclid's elements"].map((t) => parseDated(t)!);
  assert.deepEqual(rows.sort((a, b) => a.key - b.key).map((r) => r.label), ["euclid's elements", "dns invented", "root zone", "first .com"]);
  assert.equal(parseDated("1990s web grows")?.when, "1990s");
  assert.deepEqual(parseDated("1 october 2016 community takes stewardship"), { label: "community takes stewardship", when: "1 october 2016", key: 2016 * 12 + 9 });
  assert.equal(parseDated("no date"), undefined);
});

test("a figure counts only when the quote states that exact number", () => {
  assert.ok(figureInQuote("65%", "Chrome holds about 65 percent of the market"));
  assert.ok(figureInQuote("$1,200", "a budget of 1200 dollars"));
  assert.ok(!figureInQuote("65%", "Chrome holds about 165 percent"));
  assert.ok(!figureInQuote("6.5", "version 6.55 shipped"));
  assert.ok(!figureInQuote("1983", "it was invented in the eighties"));
});
