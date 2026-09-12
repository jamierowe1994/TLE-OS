"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The portal's sections, to James's mock of 12 Sep 2026: Home, My tenancy,
 * Documents, Maintenance, Payments, Messages. Knows which page it is on so
 * the right row is lit. Same shape as the landlord's.
 */
const ITEMS = [
  { path: "", label: "Home", icon: "home" },
  { path: "/tenancy", label: "My tenancy", icon: "home-1" },
  { path: "/documents", label: "Documents", icon: "doc" },
  { path: "/maintenance", label: "Maintenance", icon: "setting" },
  { path: "/payments", label: "Payments", icon: "wallet" },
  { path: "/messages", label: "Messages", icon: "message" },
];

export default function SideNav({ variant }: { variant: "side" | "pills" }) {
  const path = usePathname() ?? "/tenant";
  const params = useSearchParams();
  /* The sample stays inside the sample, and keeps its ?from=admin so the
     preview bar survives the click - as the landlord's does. */
  const base = path.startsWith("/tenant/demo") ? "/tenant/demo" : "/tenant";
  const q = params?.get("from") === "admin" ? "?from=admin" : "";
  const items = ITEMS.map((n) => ({ ...n, href: `${base}${n.path}${q}` }));
  const on = (n: { path: string }) => (n.path === "" ? path === base : path.startsWith(`${base}${n.path}`));

  if (variant === "pills") {
    return (
      <>
        {items.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] ${
              on(n) ? "border-transparent bg-accent-soft font-semibold text-ink" : "border-line/60 text-muted"
            }`}
          >
            <DoodleIcon name={n.icon} size={14} />
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
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
            on(n) ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-accent-soft/50 hover:text-ink"
          }`}
        >
          <DoodleIcon name={n.icon} size={17} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
