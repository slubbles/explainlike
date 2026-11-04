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

test("closing a gallery video by Esc or the stop button refocuses the card that opened it", () => {
  const s = src("components/GalleryGrid.tsx");
  assert.match(s, /document\.addEventListener\("keydown"/, "Esc is heard even from the native video controls");
  assert.match(s, /if \(e\.key === "Escape"\) stop\(playing\)/);
  assert.match(s, /onClick=\{\(\) => stop\(v\.id\)\}/, "the stop button takes the same way back");
  assert.match(s, /playRefs\.current\.get\(id\)\?\.focus\(\)/, "focus lands back on the triggering card");
});

test("playable videos are labelled with a captions track; previews stay hidden", () => {
  const player = src("components/Player.tsx");
  assert.match(player, /aria-label=\{title \?\? "Explainer video"\}/);
  assert.match(player, /<track kind="captions" src=\{captions\} srcLang="en" label="English" default \/>/);
  const grid = src("components/GalleryGrid.tsx");
  assert.match(grid, /aria-label=\{v\.title\}/);
  assert.match(grid, /<track kind="captions" src=\{v\.captions\} srcLang="en" label="English" default \/>/);
  assert.match(src("lib/gallery.ts"), /galleryCaptionsUrl/, "gallery items carry a captions URL when the folder holds them");
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
        ".navmenu summary",
        ".navdrop a",
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
