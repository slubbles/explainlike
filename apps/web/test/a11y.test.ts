import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const src = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

test("the voice radiogroup uses roving tabindex with arrow-key selection", () => {
  const s = src("components/InputScreen.tsx");
  assert.match(s, /role="radiogroup"/);
  assert.match(s, /role="radio"/);
  assert.match(s, /tabIndex=\{form\.voice === v\.id \? 0 : -1\}/);
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) assert.match(s, new RegExp(key), key);
});

test("a playing gallery video has a stop button that returns to the thumbnail", () => {
  const s = src("components/GalleryGrid.tsx");
  assert.match(s, /aria-label=\{`Stop playing \$\{v\.title\}`\}/);
  assert.match(s, /setPlaying\(undefined\)/);
  assert.match(s, /Escape/);
});

test("playable videos are labelled with a captions track; previews stay hidden", () => {
  const player = src("components/Player.tsx");
  assert.match(player, /aria-label=\{title \?\? "Explainer video"\}/);
  assert.match(player, /<track kind="captions" src=\{captions\} srcLang="en" label="English" \/>/);
  assert.match(src("components/GalleryGrid.tsx"), /aria-label=\{v\.title\}/);
  const result = src("components/ResultView.tsx");
  assert.match(result, /captions=\{captionsUrl\(job\.id\)\}/);
  assert.match(result, /#t=4.*aria-hidden="true"/, "the clip preview is decorative inside its labelled link");
});

test("every touch target is at least 44px", () => {
  const sheets: [string, string[]][] = [
    [
      "app/globals.css",
      [
        ".btn",
        "button.chip",
        ".pill",
        ".mic",
        ".send",
        ".gh",
        ".navl",
        ".brand",
        ".go",
        ".pick select",
        ".copy",
        ".more",
        ".dl .link",
        ".vid .meta a",
        ".vid .stop",
        ".prompt .field",
        ".jobbar .in",
        ".vtype input",
      ],
    ],
    ["app/signin.css", [".sx", ".sback", ".navout"]],
    ["app/admin/admin.css", [".adm td a", ".adm .lform input"]],
  ];
  for (const [file, selectors] of sheets) {
    const css = src(file);
    for (const sel of selectors) {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const blocks = css.match(new RegExp(`${esc} \\{[^}]*\\}`, "g")) ?? [];
      assert.ok(blocks.length > 0, `${file}: ${sel} has a rule`);
      assert.ok(
        blocks.some((b) => b.includes("44px")),
        `${file}: ${sel} reaches 44px`,
      );
    }
  }
  const footer = src("app/globals.css").match(/footer \.l a, footer \.flogo \{[^}]*\}/);
  assert.ok(footer && footer[0].includes("44px"), "footer links reach 44px");
});
