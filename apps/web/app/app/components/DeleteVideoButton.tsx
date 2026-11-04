"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Delete one video: asks once first, like cancel does, then refreshes the list (or leaves the page when the open video is gone). */
export default function DeleteVideoButton({ id, title, redirectTo }: { id: string; title: string; redirectTo?: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function del() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/me/videos/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r) return setErr("Could not reach the server. Check your connection and try again.");
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return setErr(typeof data?.error === "string" ? data.error : `Deleting failed (${r.status}). Try again in a moment.`);
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  if (!asking)
    return (
      <button type="button" className="app-abtn danger" onClick={() => setAsking(true)}>
        Delete
      </button>
    );
  return (
    <span className="app-confirm">
      <span>Delete “{title}” for good?</span>
      <button type="button" className="app-abtn danger" disabled={busy} onClick={del} autoFocus>
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" className="app-abtn" disabled={busy} onClick={() => setAsking(false)}>
        Keep
      </button>
      {err && (
        <span role="alert" className="app-note">
          {err}
        </span>
      )}
    </span>
  );
}
