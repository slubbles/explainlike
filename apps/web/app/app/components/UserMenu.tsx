"use client";
import { useEffect, useRef, useState } from "react";
import { signOut as endSession } from "../../../lib/session";

/** Two letters for the avatar, from the address. */
const initials = (email: string) =>
  (
    email
      .split("@")[0]
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 2) || "··"
  ).toUpperCase();

/** The account card at the bottom of the sidebar: the address, and Sign out behind a tap. */
export default function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("mousedown", away);
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("mousedown", away);
      removeEventListener("keydown", esc);
    };
  }, [open]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await endSession();
    // home either way: the landing page reads the session fresh and shows the truth
    location.href = "/";
  }

  return (
    <div className="app-user" ref={box}>
      {open && (
        <div className="app-pop" role="menu" aria-label="Account">
          <p className="who">{email}</p>
          <button type="button" className="out" role="menuitem" data-testid="app-sign-out" disabled={busy} onClick={signOut}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
      <button
        type="button"
        className="app-ubtn"
        data-testid="app-user-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="app-ava" aria-hidden="true">
          {initials(email)}
        </span>
        <span className="app-umeta">
          <b>{email.split("@")[0]}</b>
          <span>{email}</span>
        </span>
        <span className="app-uchev" aria-hidden="true">
          ⌄
        </span>
      </button>
    </div>
  );
}
