"use client";
import { useEffect } from "react";
import styles from "./error.module.css";

/** A crashed section shows this instead of a blank page, and reports to /api/client-error once. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: String(error?.message ?? "unknown error").slice(0, 500),
        digest: typeof error?.digest === "string" ? error.digest.slice(0, 100) : "",
        path: typeof location !== "undefined" ? location.pathname.slice(0, 200) : "",
      }),
    }).catch(() => {});
  }, [error]);
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.crumb}>Error</div>
        <h2>Something went wrong</h2>
        <p className={styles.lead}>This part of the page crashed. Your videos are safe.</p>
        <button type="button" className={styles.retry} onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
