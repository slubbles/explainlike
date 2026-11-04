"use client";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { authClient } from "../lib/auth-client";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      reset(id?: string): void;
    };
  }
}

/** Sign in with Google or GitHub, or with a one-time email code: email + Turnstile, then the 6-digit code. */
export default function SignIn({
  siteKey,
  google,
  github,
  onDone,
  onCancel,
}: {
  siteKey: string;
  google: boolean;
  github: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [gbusy, setGbusy] = useState(false);
  const [ghbusy, setGhbusy] = useState(false);
  const [err, setErr] = useState("");
  const [token, setToken] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  // local dev sets no Turnstile keys: the email flow stays, the widget goes, and the
  // server logs the code to its console instead of sending it.
  const needCaptcha = Boolean(siteKey);

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
    // the Send button stays disabled until the CAPTCHA check answers; Enter must wait too
    if (needCaptcha && !token) return setErr("Finish the CAPTCHA check first, then send the code.");
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
      trackEvent("signin_code_sent");
      setStep("code");
    } finally {
      setBusy(false);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      setToken("");
    }
  }

  async function signinWithGoogle() {
    if (gbusy) return;
    setErr("");
    setGbusy(true);
    // success leaves this page (the client sends the browser to Google); anything that
    // answers here failed, so the button unlocks with an explanation
    const r = await authClient.signIn.social({ provider: "google", callbackURL: "/" }).catch(() => null);
    setGbusy(false);
    if (!r || r.error) setErr("Could not reach Google. Check your connection and try again.");
  }

  async function signinWithGitHub() {
    if (ghbusy) return;
    setErr("");
    setGhbusy(true);
    // success leaves this page (the client sends the browser to GitHub); anything that
    // answers here failed, so the button unlocks with an explanation
    const r = await authClient.signIn.social({ provider: "github", callbackURL: "/" }).catch(() => null);
    setGhbusy(false);
    if (!r || r.error) setErr("Could not reach GitHub. Check your connection and try again.");
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
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(said(data, r.status));
      // a session whose user was just created reads as a new account, anything else as a login
      const created = (data as { user?: { createdAt?: unknown } })?.user?.createdAt;
      const age = Date.now() - Date.parse(typeof created === "string" ? created : "");
      trackEvent("signin_success", { new_account: Number.isFinite(age) && age >= 0 && age < 120000 });
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
        {step === "email" ? (
          <>
            {google && (
              <button type="button" className="gbtn" disabled={gbusy} onClick={signinWithGoogle}>
                <svg className="gg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {gbusy ? "Connecting…" : "Continue with Google"}
              </button>
            )}
            {github && (
              <button type="button" className="gbtn" disabled={ghbusy} onClick={signinWithGitHub}>
                <svg className="gh" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                  />
                </svg>
                {ghbusy ? "Connecting…" : "Continue with GitHub"}
              </button>
            )}
            {(google || github) && (
              <>
                <div className="sor" aria-hidden="true">
                  or
                </div>
              </>
            )}
            <>
              <p className="ssub">Enter your email and we will send you a 6-digit code.</p>
              {!needCaptcha && <p className="ssub">Local dev: the code is logged to the server console.</p>}
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
              {needCaptcha && <div ref={box} className="scap" />}
              <button type="button" className="btn solid wide" disabled={busy || !email.trim() || (needCaptcha && !token)} onClick={send}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </>
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
