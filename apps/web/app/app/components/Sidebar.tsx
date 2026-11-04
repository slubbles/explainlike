"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../../../components/Logo";
import UserMenu from "./UserMenu";

/** A 16px outline icon in the current color, matching the dashboard mock. */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const OVERVIEW = (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>
);
const PLUS = <path d="M12 5v14M5 12h14" />;
const VIDEO = (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 9l5 3-5 3z" />
  </>
);
const PLUG = <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0zM12 16v5" />;
const CHART = <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />;
const GEAR = (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
  </>
);
const SHIELD = <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />;
const HELP = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" />
  </>
);
const EXTERNAL = <path d="M7 17L17 7M8 7h9v9" />;
const IMAGE = (
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 15l-5-5L5 21" />
  </>
);

const NAV: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/app", label: "Overview", icon: OVERVIEW },
  { href: "/app/new", label: "New video", icon: PLUS },
  { href: "/app/videos", label: "My videos", icon: VIDEO },
  { href: "/app/connect", label: "Connect (MCP)", icon: PLUG },
  { href: "/app/usage", label: "Usage", icon: CHART },
  { href: "/app/settings", label: "Settings", icon: GEAR },
];

/** The dashboard sidebar: the logo, the sections, help links and the account card. A drawer on phones. */
export default function Sidebar({ email, admin, open, onClose }: { email: string; admin: boolean; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const on = (href: string) => (href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <>
      {open && <button type="button" className="app-overlay" aria-label="Close menu" onClick={onClose} tabIndex={-1} />}
      <aside className={`app-side${open ? " open" : ""}`} aria-label="Dashboard">
        <Link className="app-brand" href="/app" onClick={onClose}>
          <Logo />
          Explanimate
        </Link>
        <nav aria-label="Sections" onClick={onClose}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              className={`app-link${on(n.href) ? " on" : ""}`}
              href={n.href}
              aria-current={on(n.href) ? "page" : undefined}
            >
              <Icon>{n.icon}</Icon>
              {n.label}
            </Link>
          ))}
          {admin && (
            <Link className={`app-link app-gap${on("/admin") ? " on" : ""}`} href="/admin">
              <Icon>{SHIELD}</Icon>
              Admin<span className="app-atag">admins only</span>
            </Link>
          )}
        </nav>
        <div className="app-grow">
          <a className="app-link" href="https://github.com/slubbles/explanimate/issues" target="_blank" rel="noreferrer">
            <Icon>{HELP}</Icon>
            Support
          </a>
          <Link className="app-link" href="/docs" onClick={onClose}>
            <Icon>{EXTERNAL}</Icon>
            Docs
          </Link>
          <Link className="app-link" href="/gallery" onClick={onClose}>
            <Icon>{IMAGE}</Icon>
            Gallery
          </Link>
        </div>
        <UserMenu email={email} />
      </aside>
    </>
  );
}
