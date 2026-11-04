"use client";
import { useEffect } from "react";

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
    <main className="page">
      <div className="wrap" style={{ paddingTop: 120 }}>
        <h2>Something went wrong</h2>
        <p className="lead">This part of the page crashed. Your videos are safe.</p>
        <button type="button" className="btn solid" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
