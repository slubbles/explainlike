"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/** The panel's top bar: the menu button on phones, the path, video search and the create button. */
export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="app-top">
      <button type="button" className="app-menu" aria-label="Open menu" onClick={onMenu}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <span className="app-crumb">explanimate.co{pathname}</span>
      <span className="grow" aria-hidden="true" />
      <form
        className="app-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(`/app/videos${typeof q === "string" && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        }}
      >
        <input name="q" type="search" aria-label="Search videos" placeholder="⌕ Search videos" autoComplete="off" maxLength={120} />
      </form>
      <Link className="btn solid" href="/app/new">
        + New video
      </Link>
    </div>
  );
}
