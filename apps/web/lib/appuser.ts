/**
 * The /app gate, checked on the server by the dashboard layout: the signed-in account, or a
 * redirect. With sign-in off the dashboard has no accounts to show, so it sends people to the
 * landing page, which works without sign-in; with sign-in on but no session, to the sign-in
 * page, which lands back on the page that was asked for afterwards.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "./next-path";
import { authEnabled, sessionUser, type SessionUser } from "./auth";

export async function requireAppUser(): Promise<SessionUser> {
  if (!authEnabled()) redirect("/");
  const h = await headers();
  const init: Record<string, string> = {};
  h.forEach((v, k) => {
    init[k] = v;
  });
  const user = await sessionUser(new Request("http://localhost/app", { headers: init }));
  if (!user) redirect(signinRedirect(h.get("x-explanimate-path")));
  return user;
}

/** The sign-in URL for a signed-out visit to `path`; anything off /app falls back to /app. */
export function signinRedirect(path: string | null | undefined): string {
  const p = safeNext(path ?? undefined);
  return `/signin?next=${encodeURIComponent(p === "/app" || p.startsWith("/app/") || p.startsWith("/app?") ? p : "/app")}`;
}
