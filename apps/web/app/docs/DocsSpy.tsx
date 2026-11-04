"use client";
import { useEffect } from "react";

/** Highlights the sidebar and rail links for the section in view. Progressive enhancement: without JS the anchors still work. */
export default function DocsSpy({ ids }: { ids: string[] }) {
  useEffect(() => {
    const links = new Map<string, HTMLElement[]>();
    for (const id of ids) {
      const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-spy-link="${id}"]`));
      if (found.length) links.set(id, found);
    }
    const sections = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el && links.has(el.id));
    if (!sections.length) return;
    let current = "";
    const show = (id: string) => {
      if (id === current) return;
      current = id;
      for (const [key, els] of links)
        for (const el of els) {
          if (key === id) {
            el.setAttribute("data-active", "true");
            el.setAttribute("aria-current", "true");
          } else {
            el.removeAttribute("data-active");
            el.removeAttribute("aria-current");
          }
        }
    };
    const seen = new Map<string, number>();
    const pick = () => {
      let best = "",
        bestTop = Infinity;
      for (const [id, top] of seen) {
        if (top < bestTop) {
          bestTop = top;
          best = id;
        }
      }
      if (best) show(best);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.set(e.target.id, e.boundingClientRect.top);
          else seen.delete(e.target.id);
        }
        pick();
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const s of sections) observer.observe(s);
    return () => observer.disconnect();
  }, [ids]);
  return null;
}
