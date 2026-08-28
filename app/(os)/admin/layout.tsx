"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * Admin has its own world.
 *
 * James, 27 Aug: "as an admin I don't need the normal nav bar on the left."
 * He is right, and the reason is sharper than tidiness — the agent sidebar is
 * a list of an AGENT's jobs, and none of them is what an owner is doing here.
 * Leads, Viewings and Compliance are noise on a screen about who has signed in
 * and what is broken, and worse, they invite an owner to wander into the
 * business-wide book by accident when the whole point of this session was to
 * look at one person's.
 *
 * So the agent rail is hidden while inside /admin and replaced with this one.
 * The way back out is explicit: "Leave admin".
 */

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/people", label: "People" },
  { href: "/admin/pre-launch", label: "Pre-launch" },
  { href: "/admin/connections", label: "Connections" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/todo", label: "To do" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  return (
    <div className="admin-scope">
      {/* Hides the agent sidebar for the whole of /admin. Done in CSS against
          the shell's own element rather than by restructuring the layout tree,
          because the shell also carries the theme, the intro gate and the
          view-as bar — all of which must survive. */}
      <style>{`
        [data-os-sidebar] { display: none !important; }
        [data-os-content] { padding-left: 0 !important; margin-left: 0 !important; }
      `}</style>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Admin sections">
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
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted"
        >
          Leave admin
        </button>
      </div>
      {children}
    </div>
  );
}
