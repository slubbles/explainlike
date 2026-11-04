"use client";
import { useEffect, useState } from "react";
import { fetchAuthConfig } from "../lib/session";
import { trackEvent } from "../lib/analytics";

/**
 * The sign-in corner of the nav: nothing when auth is off, else who is signed in.
 * A page that already knows the session on the server passes it in and skips the read;
 * any later sign-in or sign-out still refreshes through the shared event.
 */
export default function AuthNav({ initialEmail }: { initialEmail?: string | null }) {
  const [state, setState] = useState<{ email?: string } | null>(initialEmail === undefined ? null : { email: initialEmail ?? undefined });

  useEffect(() => {
    let stop = false;
    const load = () => {
      fetchAuthConfig().then((j) => {
        if (!stop && j?.enabled) setState({ email: typeof j.user?.email === "string" ? j.user.email : undefined });
      });
    };
    if (initialEmail === undefined) load();
    // the sign-in panel and the sign-out button announce here, so the nav updates at once
    addEventListener("explanimate:auth-changed", load);
    return () => {
      stop = true;
      removeEventListener("explanimate:auth-changed", load);
    };
  }, [initialEmail]);

  if (!state) return null;
  if (!state.email)
    return (
      <button type="button" className="navl ghost" onClick={() => dispatchEvent(new CustomEvent("explanimate:signin"))}>
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
          const r = await fetch("/api/auth/sign-out", {
            // Better Auth rejects a POST without a JSON content type (415)
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          }).catch(() => null);
          // a signed-out click reports itself, then refreshes the nav and the page through the event
          if (r?.ok) trackEvent("sign_out");
          if (r?.ok) dispatchEvent(new CustomEvent("explanimate:auth-changed"));
        }}
      >
        Sign out
      </button>
    </span>
  );
}
