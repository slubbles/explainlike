"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./docs.module.css";

interface Hit {
  id: string;
  label: string;
  group: string;
}

interface Found {
  h: Hit;
  score: number;
  snippet: string;
}

/** The text of one docs section: its heading plus everything after it up to the next heading. */
function sectionText(id: string): string {
  const head = document.getElementById(id);
  if (!head) return "";
  let text = head.textContent ?? "";
  for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
    if (/^H[1-3]$/.test(el.tagName) && el.id) break;
    text += ` ${el.textContent ?? ""}`;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** A short piece of the section around the first matched word. */
function snippetOf(text: string, words: string[]): string {
  const low = text.toLowerCase();
  const at = words.map((w) => low.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return "";
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/**
 * Searches the docs sections on this page, headings and body text (titles weigh most). Ctrl/⌘+K
 * focuses whichever search box is visible; arrow keys move through the results.
 */
export default function DocsSearch({ index, id = "docs-search", className }: { index: Hit[]; id?: string; className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTexts(Object.fromEntries(index.map((h) => [h.id, sectionText(h.id)])));
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && input.current?.offsetParent) {
        e.preventDefault();
        input.current.focus();
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
  }, [index]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: Found[] =
    words.length === 0
      ? []
      : index
          .map((h): Found | null => {
            const label = h.label.toLowerCase();
            const group = h.group.toLowerCase();
            const text = texts[h.id] ?? "";
            const body = text.toLowerCase();
            let score = 0;
            for (const w of words) {
              if (label.includes(w)) score += 3;
              else if (group.includes(w)) score += 2;
              else if (body.includes(w)) score += 1;
              else return null;
            }
            return { h, score, snippet: snippetOf(text, words) };
          })
          .filter((x): x is Found => !!x)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);

  const go = (target: string) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${target}`);
  };

  const list = `${id}-results`;
  return (
    <div className={`${styles.search} ${className ?? ""}`} ref={box}>
      <label
        htmlFor={id}
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        Search docs
      </label>
      <input
        id={id}
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && words.length > 0}
        aria-controls={list}
        aria-activedescendant={open && hits[active] ? `${list}-${active}` : undefined}
        autoComplete="off"
        placeholder="Search docs…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQ("");
            setOpen(false);
            input.current?.blur();
          } else if (e.key === "ArrowDown" && hits.length) {
            e.preventDefault();
            setActive((a) => (a + 1) % hits.length);
          } else if (e.key === "ArrowUp" && hits.length) {
            e.preventDefault();
            setActive((a) => (a - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter" && hits.length) {
            e.preventDefault();
            go((hits[active] ?? hits[0]).h.id);
          }
        }}
      />
      <kbd aria-hidden="true">Ctrl K</kbd>
      {open && words.length > 0 && (
        <ul id={list} role="listbox" className={styles.results}>
          {hits.length === 0 ? (
            <li className={styles.noresults}>Nothing matches “{q.trim()}”.</li>
          ) : (
            hits.map(({ h, snippet }, i) => (
              <li key={h.id} id={`${list}-${i}`} role="option" aria-selected={i === active}>
                <button type="button" className={i === active ? styles.active : undefined} onMouseEnter={() => setActive(i)} onClick={() => go(h.id)}>
                  {h.label}
                  <small>{h.group}</small>
                  {snippet && <span className={styles.snippet}>{snippet}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
