"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Set one account's daily video limit (0 is the default). Posts to /api/admin/limits. */
export default function LimitForm() {
  const [email, setEmail] = useState("");
  const [limit, setLimit] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await fetch("/api/admin/limits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), limit: Number(limit) }),
      }).catch(() => null);
      if (!r) return setErr("Could not reach the server. Check your connection and try again.");
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(typeof data?.error === "string" ? data.error : `The server had a problem (${r.status}).`);
      setMsg(`${email.trim()} now gets ${data.limit} videos a day.`);
      setEmail("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="lform"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label>
        Account email
        <input
          type="email"
          autoComplete="email"
          placeholder="somebody@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="narrow">
        Videos a day
        <input type="number" min={0} max={1000} step={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
      </label>
      <button type="submit" className="btn solid" disabled={busy || !email.trim()}>
        {busy ? "Saving…" : "Save limit"}
      </button>
      {msg && (
        <p className="note" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
