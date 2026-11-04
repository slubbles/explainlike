"use client";
import { useEffect } from "react";

/** The whole page crashed (even the layout): a plain note, reported once to /api/client-error. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
    <html lang="en">
      <body style={{ background: "#000", color: "#fafafa", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "120px 24px" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#a1a1aa", lineHeight: 1.55 }}>The page crashed. Your videos are safe.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "linear-gradient(180deg, #4d8dff 0%, #2563eb 100%)",
                color: "#fff",
                border: 0,
                borderRadius: 999,
                padding: "9px 18px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a href="/" style={{ alignSelf: "center", color: "#a1a1aa" }}>
              Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
