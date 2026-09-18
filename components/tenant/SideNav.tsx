"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { NavKey } from "@/lib/tenant-journey";

/**
 * The portal's sections, in the order James set on 12 Sep 2026: Home,
 * Documents, My tenancy, then the rest, Messages last. Knows which page it
 * is on so the right row is lit, and which pages are locked at this stage
 * of the tenant's journey - a locked row is drawn quiet with a padlock and
 * says what opens it, and still opens onto a page that says the same, so
 * nobody wonders where the page went.
 */
const ITEMS: { key: NavKey; path: string; label: string; icon: string }[] = [
  { key: "home", path: "", label: "Home", icon: "home" },
  /* Find a home, inside the portal (James, 18 Sep 2026) - never locked:
     somebody moving in can still look, and somebody living in may move on. */
  { key: "homes", path: "/homes", label: "Finding Home", icon: "search" },
  { key: "documents", path: "/documents", label: "Documents", icon: "doc" },
  { key: "tenancy", path: "/tenancy", label: "My tenancy", icon: "home-1" },
  { key: "maintenance", path: "/maintenance", label: "Maintenance", icon: "setting" },
  { key: "payments", path: "/payments", label: "Payments", icon: "wallet" },
  { key: "messages", path: "/messages", label: "Messages", icon: "message" },
];

export default function SideNav({ variant, locks = {} }: { variant: "side" | "pills"; locks?: Partial<Record<NavKey, string>> }) {
  const path = usePathname() ?? "/tenant";
  const params = useSearchParams();
  /* The sample stays inside the sample, and keeps its ?from=admin so the
     preview bar survives the click - as the landlord's does. */
  const base = path.startsWith("/tenant/demo") ? "/tenant/demo" : "/tenant";
  const q = params?.get("from") === "admin" ? "?from=admin" : "";
  const items = ITEMS.map((n) => ({ ...n, href: `${base}${n.path}${q}`, locked: locks[n.key] ?? null }));
  const on = (n: { path: string }) => (n.path === "" ? path === base : path.startsWith(`${base}${n.path}`));

  if (variant === "pills") {
    return (
      <>
        {items.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            title={n.locked ?? undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] ${
              on(n) ? "border-transparent bg-accent-soft font-semibold text-ink" : n.locked ? "border-line/40 text-muted/60" : "border-line/60 text-muted"
            }`}
          >
            <DoodleIcon name={n.locked ? "lock" : n.icon} size={14} />
            {n.label}
          </Link>
        ))}
      </>
    );
  }
  return (
    <nav className="mt-10 space-y-1">
      {items.map((n) => (
        <Link
          key={n.label}
          href={n.href}
          title={n.locked ?? undefined}
          aria-disabled={n.locked ? true : undefined}
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
            on(n) ? "bg-accent-soft font-semibold text-ink" : n.locked ? "text-muted/60 hover:bg-panel hover:text-muted" : "text-muted hover:bg-accent-soft/50 hover:text-ink"
          }`}
        >
          <DoodleIcon name={n.icon} size={17} className={n.locked ? "opacity-60" : ""} />
          <span className="flex-1">{n.label}</span>
          {n.locked && <DoodleIcon name="lock" size={12} className="opacity-70" />}
        </Link>
      ))}
    </nav>
  );
}
