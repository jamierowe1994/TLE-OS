"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Francesca's view, with her own rail.
 *
 * ── Why this is a THIRD level of navigation ───────────────────────────────
 *
 * Her view is not a page in James's admin, it is a workspace of its own — the
 * same shape Kirstie's and Susan's have. So it takes the window, hides the
 * admin rail, and puts up its own.
 *
 * That is also what makes it hand-over-able. When Francesca gets a login this
 * becomes what she lands on, unchanged; James's admin rail simply is not there
 * for her, and the "Back to admin" pill is the only thing she will not see.
 */

const TABS = [
  { href: "/admin/marketing", label: "Overview", exact: true },
  { href: "/admin/marketing/campaigns", label: "Nurture campaigns" },
  { href: "/admin/marketing/paid-leads", label: "Paid leads & social" },
  { href: "/admin/marketing/templates", label: "Email templates" },
  { href: "/admin/marketing/storage", label: "File storage" },
  { href: "/admin/marketing/assistant", label: "The assistant" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <>
      {/* Her workspace takes the window — James's admin rail steps aside, the
          same way the agent sidebar steps aside for admin. */}
<div className="flex gap-6 pt-10">
        <nav
          aria-label="Marketing"
          className="sticky top-6 hidden h-fit w-52 shrink-0 flex-col gap-0.5 md:flex"
        >
          <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
            Marketing
          </p>
          {TABS.map((t) => {
            const on = t.exact ? path === t.href : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                  on ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <nav aria-label="Marketing" className="mb-4 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {TABS.map((t) => {
            const on = t.exact ? path === t.href : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] ${
                  on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
