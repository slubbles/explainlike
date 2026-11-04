"use client";
import { useEffect, useState } from "react";

/** The sign-in corner of the nav: nothing when auth is off, else who is signed in. */
export default function AuthNav() {
  const [state, setState] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    let stop = false;
    fetch("/api/auth-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!stop && j?.enabled) setState({ email: typeof j.user?.email === "string" ? j.user.email : undefined });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  if (!state) return null;
  if (!state.email)
    return (
      <button type="button" className="navl" onClick={() => dispatchEvent(new CustomEvent("explanimate:signin"))}>
        Sign in
      </button>
    );
  return (
    <span className="navuser">
      Signed in as {state.email} ·{" "}
      <button
        type="button"
        className="navout"
        onClick={async () => {
          await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => null);
          location.reload();
        }}
      >
        Sign out
      </button>
    </span>
  );
}
