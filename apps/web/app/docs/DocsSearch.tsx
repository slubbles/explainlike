"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./docs.module.css";

interface Hit {
  id: string;
  label: string;
  group: string;
}

/** Searches the docs sections rendered on this page (titles weigh most). Ctrl/⌘+K focuses it. */
export default function DocsSearch({ index }: { index: Hit[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits =
    words.length === 0
      ? []
      : index
          .map((h) => {
            const hay = `${h.label} ${h.group}`.toLowerCase();
            const el = document.getElementById(h.id);
            const body = el?.textContent?.toLowerCase() ?? "";
            let score = 0;
            for (const w of words) {
              if (h.label.toLowerCase().includes(w)) score += 3;
              else if (hay.includes(w)) score += 2;
              else if (body.includes(w)) score += 1;
              else return null;
            }
            return { h, score };
          })
          .filter((x): x is { h: Hit; score: number } => !!x)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);

  const go = (id: string) => {
    setOpen(false);
    setQ("");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className={styles.search} ref={box}>
      <label
        htmlFor="docs-search"
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        Search docs
      </label>
      <input
        id="docs-search"
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && words.length > 0}
        aria-controls="docs-search-results"
        autoComplete="off"
        placeholder="Search docs…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQ("");
            setOpen(false);
            input.current?.blur();
          } else if (e.key === "Enter" && hits.length) {
            e.preventDefault();
            go(hits[0].h.id);
          }
        }}
      />
      <kbd aria-hidden="true">Ctrl K</kbd>
      {open && words.length > 0 && (
        <ul id="docs-search-results" role="listbox" className={styles.results}>
          {hits.length === 0 ? (
            <li className={styles.noresults}>Nothing matches “{q.trim()}”.</li>
          ) : (
            hits.map(({ h }) => (
              <li key={h.id} role="option" aria-selected="false">
                <button type="button" onClick={() => go(h.id)}>
                  {h.label}
                  <small>{h.group}</small>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
