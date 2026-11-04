/**
 * The /app gate, checked on the server by the dashboard layout: the signed-in account, or a
 * redirect. With sign-in off the dashboard has no accounts to show, so it sends people to the
 * landing page, which works without sign-in; with sign-in on but no session, to the sign-in
 * page, which lands back on /app afterwards.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authEnabled, sessionUser, type SessionUser } from "./auth";

export async function requireAppUser(): Promise<SessionUser> {
  if (!authEnabled()) redirect("/");
  const h = await headers();
  const init: Record<string, string> = {};
  h.forEach((v, k) => {
    init[k] = v;
  });
  const user = await sessionUser(new Request("http://localhost/app", { headers: init }));
  if (!user) redirect("/signin?next=%2Fapp");
  return user;
}
