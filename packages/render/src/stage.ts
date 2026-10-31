import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Film } from "./film.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One self-contained HTML file that can draw every frame of the film. */
export function stageHtml(film: Film): string {
  const tpl = fs.readFileSync(path.join(here, "stage/stage.html"), "utf8");
  const js = fs.readFileSync(path.join(here, "stage/stage.js"), "utf8");
  const rep: Record<string, string> = {
    __W__: String(film.width), __H__: String(film.height), __BG__: film.theme.background, __INK__: film.theme.ink,
    __ACCENT__: film.theme.accent, __CAP__: film.theme.caption.color, __CAPBG__: film.theme.caption.background, __HI__: film.theme.caption.highlight,
    __HAND__: film.fonts.hand, __SANS__: film.fonts.sans, __BRAND__: film.brand,
    __ENDTITLE__: esc(film.end?.title ?? ""), __ENDLINES__: (film.end?.lines ?? []).map(esc).join("<br>"), __CREDIT__: esc(film.end?.credit ?? ""),
  };
  let html = tpl.replace(/__[A-Z]+__/g, (m) => (m === "__FILM__" || m === "__STAGE__" ? m : rep[m] ?? m));
  // film JSON is inserted last; escape "</" so it cannot close the script tag
  html = html.replace("__STAGE__", () => js).replace("__FILM__", () => JSON.stringify({ ...film, fonts: undefined }).replace(/<\//g, "<\\/"));
  return html;
}
