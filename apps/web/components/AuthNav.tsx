"use client";
import { useEffect, useState } from "react";

/** The sign-in corner of the nav: nothing when auth is off, else who is signed in. */
export default function AuthNav() {
  const [state, setState] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => {
      fetch("/api/auth-config")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!stop && j?.enabled) setState({ email: typeof j.user?.email === "string" ? j.user.email : undefined });
        })
        .catch(() => {});
    };
    load();
    // the sign-in panel and the sign-out button announce here, so the nav updates at once
    addEventListener("explanimate:auth-changed", load);
    return () => {
      stop = true;
      removeEventListener("explanimate:auth-changed", load);
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
      <span className="who" title={state.email}>
        Signed in as {state.email} ·
      </span>
      <button
        type="button"
        className="navout"
        onClick={async () => {
          const r = await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => null);
          if (r?.ok) dispatchEvent(new CustomEvent("explanimate:auth-changed"));
        }}
      >
        Sign out
      </button>
    </span>
  );
}
