"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Kirstie's four screens, as pills at the top of each.
 *
 * Her workspace hides the sidebar (OwnWorkspace), so without this the only
 * way between the dashboard, the board, the feed and the queue was the
 * back-links each page happened to carry. Fixed top centre, the one edge
 * none of the four pages puts anything on; the back-to-my-view pill sits at
 * the bottom centre for the same reason.
 */

const TABS = [
  { href: "/pre-tenancy/dashboard", label: "Dashboard" },
  { href: "/pre-tenancy", label: "Board", exact: true },
  { href: "/pre-tenancy/feed", label: "What moved" },
  { href: "/pre-tenancy/plc", label: "PLC queue" },
];

export default function PreTenancyTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Pre-tenancy"
      className="fixed left-1/2 top-3 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-full border border-line/80 bg-panel p-1 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]"
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${
              active ? "bg-accent-soft/70 font-semibold text-accent-dark" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
