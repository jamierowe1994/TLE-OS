"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin's own navigation.
 *
 * James, 27 Aug: "rather than having To Do and People and Connections all in
 * one… as I click them, they'll all be different." He is right — the single
 * page was already four unrelated jobs stacked vertically, and it would only
 * have got longer.
 *
 * A SECOND rail rather than five more entries in the main sidebar. The left
 * sidebar is the agent's working day — Leads, Listings, Viewings — and burying
 * "Connections" among them would put an environment switch one slip away from
 * a lettings screen. This rail only exists once you are inside Admin.
 */

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/people", label: "People" },
  { href: "/admin/connections", label: "Connections" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/todo", label: "To do" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <nav className="fade-up mb-5 flex flex-wrap gap-1.5" aria-label="Admin sections">
        {TABS.map((t) => {
          const on = t.exact ? path === t.href : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
