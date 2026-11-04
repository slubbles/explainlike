"use client";
import { useState } from "react";
import AuthNav from "./AuthNav";
import Logo from "./Logo";

export default function Nav({ initialEmail }: { initialEmail?: string | null }) {
  const [open, setOpen] = useState(false);
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
            <button type="button" className="menubtn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              <span aria-hidden="true">☰</span>
            </button>
            {open && (
              <div className="navdrop">
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
