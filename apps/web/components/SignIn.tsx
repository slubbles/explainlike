"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      reset(id?: string): void;
    };
  }
}

/** Sign in with a one-time email code: email + Turnstile, then the 6-digit code. */
export default function SignIn({ siteKey, onDone, onCancel }: { siteKey: string; onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [token, setToken] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);

  // the Turnstile script loads only here, and renders explicitly with action "login"
  useEffect(() => {
    if (!siteKey || step !== "email" || typeof window === "undefined") return;
    let stop = false;
    const render = () => {
      if (stop || widget.current || !window.turnstile || !box.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        action: "login",
        theme: "dark",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if (window.turnstile) {
      render();
      return () => {
        stop = true;
      };
    }
    let s = document.getElementById("turnstile-script") as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = "turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", render);
    return () => {
      stop = true;
      s?.removeEventListener("load", render);
    };
  }, [siteKey, step]);

  const said = (data: unknown, status: number) => {
    const d = (data ?? {}) as { message?: unknown; error?: unknown };
    if (typeof d.message === "string" && d.message) return d.message;
    if (typeof d.error === "string" && d.error) return d.error;
    return `The server had a problem (${status}). Try again in a moment.`;
  };

  async function send() {
    if (busy || !email.trim()) return;
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-turnstile-token": token },
        body: JSON.stringify({ email: email.trim(), type: "sign-in" }),
      }).catch(() => null);
      if (!r) return setErr("Could not reach the server. Check your connection and try again.");
      if (!r.ok) return setErr(said(await r.json().catch(() => ({})), r.status));
      setStep("code");
    } finally {
      setBusy(false);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      setToken("");
    }
  }

  async function verify() {
    if (busy || code.trim().length !== 6) return;
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: code.trim() }),
      }).catch(() => null);
      if (!r) return setErr("Could not reach the server. Check your connection and try again.");
      if (!r.ok) return setErr(said(await r.json().catch(() => ({})), r.status));
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-back" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="signin">
        <button type="button" className="sx" aria-label="Close sign-in" onClick={onCancel}>
          ×
        </button>
        <h2>Sign in to make a video</h2>
        {!siteKey ? (
          <p className="err" role="alert">
            Sign-in is not configured on this server.
          </p>
        ) : step === "email" ? (
          <>
            <p className="ssub">Enter your email and we will send you a 6-digit code.</p>
            <label className="sr" htmlFor="signin-email">
              Email
            </label>
            <input
              id="signin-email"
              className="sfield"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <div ref={box} className="scap" />
            <button type="button" className="btn solid wide" disabled={busy || !email.trim() || !token} onClick={send}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </>
        ) : (
          <>
            <p className="ssub">We sent a code to {email.trim()}. It expires in 10 minutes.</p>
            <label className="sr" htmlFor="signin-code">
              6-digit code
            </label>
            <input
              id="signin-code"
              className="sfield code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") verify();
              }}
            />
            <button type="button" className="btn solid wide" disabled={busy || code.trim().length !== 6} onClick={verify}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="sback"
              onClick={() => {
                widget.current = undefined;
                setCode("");
                setErr("");
                setStep("email");
              }}
            >
              Use a different email
            </button>
          </>
        )}
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
