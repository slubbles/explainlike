"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/** The dashboard frame every /app page sits in: the sidebar, the top bar and the page itself. */
export default function AppShell({ email, admin, children }: { email: string; admin: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <a className="app-skip" href="#app-main">
        Skip to content
      </a>
      <Sidebar email={email} admin={admin} open={open} onClose={() => setOpen(false)} />
      <div className="app-main">
        <Topbar onMenu={() => setOpen(true)} />
        <div id="app-main">{children}</div>
      </div>
    </div>
  );
}
