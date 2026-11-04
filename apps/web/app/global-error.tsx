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
      <body
        style={{
          background: "#0a0a0a",
          color: "#ededed",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          margin: 0,
        }}
      >
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "200px 24px 160px", textAlign: "center" }}>
          <div style={{ color: "#4ea1ff", fontSize: 13, fontWeight: 500 }}>Error</div>
          <h1 style={{ fontSize: 36, fontWeight: 450, letterSpacing: "-0.9px", margin: "10px 0 0" }}>Something went wrong</h1>
          <p style={{ color: "#a1a1a1", fontSize: 17, lineHeight: 1.55, margin: "14px 0 0" }}>The page crashed. Your videos are safe.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#0866ff",
                color: "#fff",
                border: 0,
                borderRadius: 10,
                padding: "9px 18px",
                minHeight: 44,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a href="/" style={{ alignSelf: "center", color: "#a1a1a1", fontSize: 14 }}>
              Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
