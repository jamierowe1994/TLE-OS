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
    /* On a phone the strip sits in the flow under the top bar and scrolls
       sideways; fixed top centre it landed on top of the wordmark and the
       bell. On a desktop the top centre is the one free edge. */
    <nav
      aria-label="Pre-tenancy"
      className="mx-auto mt-3 flex w-fit max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap rounded-full border border-line/80 bg-panel p-1 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] lg:fixed lg:left-1/2 lg:top-3 lg:z-[80] lg:mt-0 lg:-translate-x-1/2"
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
