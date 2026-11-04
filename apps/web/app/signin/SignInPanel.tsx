"use client";
import SignIn from "../../components/SignIn";

/** The sign-in panel on its own page: after signing in, land where the visit was headed. The page read the public settings on the server, so the panel renders at once. */
export default function SignInPanel({
  next,
  enabled,
  siteKey,
  google,
}: {
  next: string;
  enabled: boolean;
  siteKey: string;
  google: boolean;
}) {
  if (!enabled)
    return (
      <p className="app-signin">
        Sign-in is not configured on this server. <a href="/">Back to the start page</a>
      </p>
    );
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
