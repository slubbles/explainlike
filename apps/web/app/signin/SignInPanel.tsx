"use client";
import { useEffect, useState } from "react";
import SignIn from "../../components/SignIn";

/** The sign-in panel on its own page: after signing in, land where the visit was headed. */
export default function SignInPanel({ next, enabled }: { next: string; enabled: boolean }) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/auth-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setGoogle(j?.google === true);
        setSiteKey(typeof j?.turnstileSiteKey === "string" ? j.turnstileSiteKey : "");
      })
      .catch(() => setSiteKey(""));
  }, [enabled]);
  if (!enabled)
    return (
      <p className="app-signin">
        Sign-in is not configured on this server. <a href="/">Back to the start page</a>
      </p>
    );
  if (siteKey === null) return <p className="app-signin">Loading sign-in…</p>;
  return (
    <SignIn
      siteKey={siteKey}
      google={google}
      onCancel={() => {
        location.href = "/";
      }}
      onDone={() => {
        dispatchEvent(new CustomEvent("explanimate:auth-changed"));
        location.href = next;
      }}
    />
  );
}
