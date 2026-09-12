"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The portal's sections, to James's mock of 12 Sep 2026: Home, My tenancy,
 * Documents, Maintenance, Payments, Messages. Knows which page it is on so
 * the right row is lit. Same shape as the landlord's.
 */
const ITEMS = [
  { href: "/tenant", label: "Home", icon: "home" },
  { href: "/tenant/tenancy", label: "My tenancy", icon: "home-1" },
  { href: "/tenant/documents", label: "Documents", icon: "doc" },
  { href: "/tenant/maintenance", label: "Maintenance", icon: "setting" },
  { href: "/tenant/payments", label: "Payments", icon: "wallet" },
  { href: "/tenant/messages", label: "Messages", icon: "message" },
];

export default function SideNav({ variant }: { variant: "side" | "pills" }) {
  const path = usePathname() ?? "/tenant";
  const on = (href: string) => (href === "/tenant" ? path === "/tenant" : path.startsWith(href));

  if (variant === "pills") {
    return (
      <>
        {ITEMS.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] ${
              on(n.href) ? "border-transparent bg-accent-soft font-semibold text-ink" : "border-line/60 text-muted"
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
      {ITEMS.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
            on(n.href) ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-accent-soft/50 hover:text-ink"
          }`}
        >
          <DoodleIcon name={n.icon} size={17} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
