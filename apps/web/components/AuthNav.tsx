"use client";
import { useEffect, useState } from "react";
import { fetchAuthConfig } from "../lib/session";

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
      <button type="button" className="navl ghost" onClick={() => {
          // only the home page has the sign-in panel; every other page goes to /signin and comes back
          if (location.pathname === "/") dispatchEvent(new CustomEvent("explanimate:signin"));
          else location.href = `/signin?next=${encodeURIComponent(location.pathname)}`;
        }}>
        Sign in
      </button>
    );
  // public pages only point signed-in people at the dashboard; Sign out lives there
  return (
    <a className="ghost" href="/app" title={state.email}>
      Dashboard
    </a>
  );
}
