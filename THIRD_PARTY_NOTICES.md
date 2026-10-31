# Third-party notices

Metual is MIT licensed (see `LICENSE`). It bundles or depends on the following.

## Bundled assets

| Asset | Where | License |
|---|---|---|
| Excalifont (by Excalidraw) | `packages/render/assets/fonts/Excalifont-Regular.*` | SIL Open Font License 1.1 (`packages/render/assets/fonts/OFL.txt`) |
| Doodle icon pack | `packages/render/packs/doodle/*.png` | Generated for this project with Meta Muse Image; released under MIT with this repo |

The font is redistributed unmodified apart from a WOFF2 to TTF container conversion
(needed to read glyph outlines). It is not sold by itself.

## Runtime dependencies (not vendored, installed from npm)

| Package | License | Use |
|---|---|---|
| roughjs | MIT | hand-drawn strokes |
| elkjs | EPL-2.0 | graph layout |
| opentype.js | MIT | glyph outlines for handwriting text |
| esbuild | MIT | bundles the stage script |
| playwright-core | Apache-2.0 | headless Chrome frame capture, screenshots |
| sharp | Apache-2.0 | image processing |
| zod | MIT | schemas |
| @mozilla/readability | Apache-2.0 | article text extraction |
| linkedom | ISC | DOM for Readability |
| next, react | MIT | web app |
| ffmpeg (system binary) | LGPL/GPL | video encoding, invoked as an external process, not linked |

## File formats

The `.excalidraw` output follows the open Excalidraw JSON scene format
(excalidraw/excalidraw, MIT). No Excalidraw source is copied into this repo.

## Trademarks

"Meta", "Muse", "Excalidraw" and other names belong to their owners. Metual is an
independent project; it is not affiliated with or endorsed by Meta. It only calls
Meta's public Model API, credited in plain text as "Powered by Meta Muse models".
