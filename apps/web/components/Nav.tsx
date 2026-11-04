"use client";
import { useEffect, useRef, useState } from "react";
import AuthNav from "./AuthNav";
import Logo from "./Logo";

export default function Nav({ initialEmail }: { initialEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Esc closes the open menu and hands focus back to the Menu button, wherever focus sits
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <nav className="nav">
      <div className="wrap">
        <a className="brand" href="/">
          <Logo />
          Explanimate
        </a>
        <div className="navr">
          <a className="navl" href="/gallery">
            Examples
          </a>
          <a className="navl" href="/docs">
            Docs
          </a>
          <a className="gh" href="https://github.com/slubbles/explanimate" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <AuthNav initialEmail={initialEmail} />
          <div className="navmenu">
            <button
              ref={btnRef}
              type="button"
              className="menubtn"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            {open && (
              <div className="navdrop" onClick={() => setOpen(false)}>
                <a href="/gallery">Examples</a>
                <a href="/docs">Docs</a>
                <a href="https://github.com/slubbles/explanimate" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
