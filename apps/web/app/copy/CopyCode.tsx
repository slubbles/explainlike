"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./copy.module.css";

/** Copies text, with a legacy fallback for browsers without the async clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Safari blocks clipboard writes until the first tap: the button retries there */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The code, large, plus the big button that copies it (also tried once on load). */
export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    if (await copyText(code)) setCopied(true);
  }, [code]);
  useEffect(() => {
    void copy();
  }, [copy]);
  return (
    <>
      <p className={styles.code}>{code}</p>
      <p className={styles.actions}>
        <button type="button" className={styles.copy} aria-live="polite" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy code"}
        </button>
      </p>
    </>
  );
}
