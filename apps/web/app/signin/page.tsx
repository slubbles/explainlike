import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Nav from "../../components/Nav";
import { authEnabled, githubEnabled, googleEnabled, sessionUser } from "../../lib/auth";
import SignInPanel from "./SignInPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Explanimate", robots: { index: false } };

/** Where to land after signing in: a local path, never someone else's site. */
const safeNext = (v: unknown): string => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/app");

/** Sign in with a one-time email code. Signed-in visits skip straight to where they were headed. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const to = safeNext((await searchParams).next);
  const enabled = authEnabled();
  if (enabled) {
    const h = await headers();
    const init: Record<string, string> = {};
    h.forEach((v, k) => {
      init[k] = v;
    });
    if (await sessionUser(new Request("http://localhost/signin", { headers: init }))) redirect(to);
  }
  // signed-in visits never render this page (see the redirect above), so the nav is signed
  // out; the panel's public settings come from the environment, and nothing fetches.
  return (
    <>
      <Nav initialEmail={enabled ? null : undefined} />
      <main className="page">
        <h1 className="sr">Sign in</h1>
        <SignInPanel
          next={to}
          enabled={enabled}
          siteKey={process.env.EXPLANIMATE_TURNSTILE_SITE_KEY ?? ""}
          google={googleEnabled(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)}
          github={githubEnabled(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)}
        />
      </main>
    </>
  );
}
