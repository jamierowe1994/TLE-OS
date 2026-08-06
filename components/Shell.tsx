"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The OS chrome: a Notion-ish left rail with the eight areas of the system.
 * The order is the order of a tenancy's life — find the lead, list the
 * property, show it, process the application, manage it, then the money.
 */
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/leads", label: "Leads", icon: "target" },
  { href: "/listings", label: "Listings", icon: "home" },
  { href: "/viewings", label: "Viewings", icon: "calendar" },
  { href: "/applications", label: "Applications", icon: "checklist" },
  { href: "/property-management", label: "Property management", icon: "key" },
  { href: "/portfolio", label: "Portfolio", icon: "folder" },
  { href: "/finances", label: "Finances", icon: "wallet" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/70 px-4 py-6 lg:flex">
        <div className="px-3">
          <div className="hand text-3xl leading-none">TLE OS</div>
          <div className="mt-1.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
            Internal preview
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
                  active
                    ? "bg-card font-semibold shadow-sm"
                    : "font-medium text-muted hover:bg-card/60 hover:text-ink"
                }`}
              >
                <DoodleIcon
                  name={item.icon}
                  size={17}
                  className={active ? "text-accent-dark" : "text-muted"}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-3 text-[11px] leading-relaxed text-muted">
          <p className="font-semibold text-ink">Wireframe v0.1</p>
          <p className="mt-1">
            Nothing here is connected yet — dashed boxes show where live data
            will land, and each carries the system it flows from.
          </p>
        </div>
      </aside>

      {/* Mobile: a simple top bar; the wireframe is a desktop pitch first. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line/70 px-5 py-4 lg:hidden">
          <span className="hand text-2xl">TLE OS</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
            Preview
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
