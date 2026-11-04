import { isAdminEmail } from "../../lib/admin";
import { requireAppUser } from "../../lib/appuser";
import AppShell from "./components/AppShell";
import "./app.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "App — Explanimate", robots: { index: false } };

/** The signed-in dashboard: gated on the server, so signed-out visits never see the frame. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAppUser();
  return (
    <AppShell email={user.email} admin={isAdminEmail(user.email)}>
      {children}
    </AppShell>
  );
}
