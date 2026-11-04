import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Nav from "../../components/Nav";
import { authEnabled, sessionUser } from "../../lib/auth";
import SignInPanel from "./SignInPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Explanimate", robots: { index: false } };

/** Where to land after signing in: a local path, never someone else's site. */
const safeNext = (v: unknown): string => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/app");

/** Sign in with a one-time email code. Signed-in visits skip straight to where they were headed. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const to = safeNext((await searchParams).next);
  if (authEnabled()) {
    const h = await headers();
    const init: Record<string, string> = {};
    h.forEach((v, k) => {
      init[k] = v;
    });
    if (await sessionUser(new Request("http://localhost/signin", { headers: init }))) redirect(to);
  }
  return (
    <>
      <Nav />
      <main className="page">
        <h1 className="sr">Sign in</h1>
        <SignInPanel next={to} enabled={authEnabled()} />
      </main>
    </>
  );
}
