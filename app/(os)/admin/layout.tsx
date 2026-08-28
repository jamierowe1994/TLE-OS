"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * Admin's own world, with its own rail.
 *
 * ── Why a left rail rather than the strip across the top ──────────────────
 *
 * The strip was fine at five tabs. It is not fine at ten, and admin is now
 * growing a section per person — Susan, Francesca, Kirstie, and whoever comes
 * after. Tabs across the top wrap onto a second line and then read as two
 * unrelated rows; a left rail just gets longer, which is the one direction
 * this list is certain to go.
 *
 * It also lets the list be GROUPED. "People" and "Susan's view" are different
 * kinds of thing — one is a job you do, the other is a place you look — and a
 * flat strip cannot say so.
 *
 * ── The agent sidebar is still hidden ─────────────────────────────────────
 *
 * Two rails would be one too many, and the OS's own is a list of an agent's
 * jobs, none of which is what an owner is doing in here.
 */

const GROUPS: Array<{ title: string | null; items: Array<{ href: string; label: string; exact?: boolean }> }> = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/people", label: "People" },
      { href: "/admin/permissions", label: "Permissions" },
      { href: "/admin/pre-launch", label: "Pre-launch" },
    ],
  },
  {
    /* One entry per person, because that is genuinely how these differ: each
       is somebody's whole working picture, not a feature of the OS. */
    title: "Views",
    items: [
      { href: "/admin/business", label: "Susan's view" },
      { href: "/admin/marketing", label: "Francesca's view" },
      { href: "/admin/pre-tenancy", label: "Kirstie's view" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/connections", label: "Connections" },
      { href: "/admin/activity", label: "Activity" },
      { href: "/admin/todo", label: "To do" },
    ],
  },
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

      <div className="flex gap-6">
        <nav
          aria-label="Admin"
          className="sticky top-6 hidden h-fit w-52 shrink-0 flex-col gap-4 md:flex"
        >
          {GROUPS.map((g) => (
            <div key={g.title ?? "top"}>
              {g.title && (
                <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
                  {g.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((t) => {
                  const on = t.exact ? path === t.href : path.startsWith(t.href);
                  return (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        className={`block rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                          on ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted hover:text-ink"
                        }`}
                      >
                        {t.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-2 rounded-lg border border-line/80 px-3 py-2 text-[12px] text-muted"
          >
            Leave admin
          </button>
        </nav>

        {/* On a phone the rail becomes a scrolling strip — a 52px column beside
            content on a 375px screen leaves neither of them usable. */}
        <nav
          aria-label="Admin"
          className="mb-4 flex gap-1.5 overflow-x-auto pb-1 md:hidden"
        >
          {GROUPS.flatMap((g) => g.items).map((t) => {
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
    </div>
  );
}
