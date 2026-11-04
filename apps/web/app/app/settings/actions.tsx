"use client";
import { useState } from "react";
import { signOut } from "../../../lib/session";

/** Sign out from the settings page, back to the landing page. */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        // home either way: the landing page reads the session fresh and shows the truth
        location.href = "/";
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

/** Delete the account: says what goes, asks once, then signs out on the way home. */
export function DeleteAccountButton({ videos }: { videos: number }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!asking)
    return (
      <button type="button" className="btn stop" onClick={() => setAsking(true)}>
        Delete my account
      </button>
    );
  const what = videos > 0 ? ` and your ${videos} ${videos === 1 ? "video" : "videos"}` : "";
  return (
    <span className="app-confirm">
      <span>Delete your account{what} for good? This cannot be undone.</span>
      <button
        type="button"
        className="btn stop"
        disabled={busy}
        autoFocus
        onClick={async () => {
          setBusy(true);
          setErr("");
          const r = await fetch("/api/me/account", { method: "DELETE" }).catch(() => null);
          if (!r) {
            setBusy(false);
            return setErr("Could not reach the server. Check your connection and try again.");
          }
          if (!r.ok) {
            setBusy(false);
            const data = await r.json().catch(() => ({}));
            return setErr(typeof data?.error === "string" ? data.error : `Deleting failed (${r.status}). Try again in a moment.`);
          }
          await signOut();
          location.href = "/";
        }}
      >
        {busy ? "Deleting…" : "Yes, delete everything"}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={() => setAsking(false)}>
        Keep my account
      </button>
      {err && (
        <span role="alert" className="app-note">
          {err}
        </span>
      )}
    </span>
  );
}
