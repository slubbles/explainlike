"use client";
import { useState } from "react";

/** A config block with a copy button. Falls back to select-and-copy where the clipboard API is missing. */
export default function ConfigBlock({ body, lang, file }: { body: string; lang: string; file: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(body);
      else throw new Error("no clipboard");
    } catch {
      const el = document.createElement("textarea");
      el.value = body;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <div className="cfg">
      <div className="cfghead">
        <span>
          {file} · {lang}
        </span>
        <button type="button" className="copy" onClick={copy}>
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{body}</code>
      </pre>
    </div>
  );
}
