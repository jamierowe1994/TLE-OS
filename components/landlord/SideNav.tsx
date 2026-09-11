"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The portal's sections. Home and Journey are pages; Documents, Maintenance
 * and Messages are sections of the home page. Knows which page it is on, so
 * the right row is lit, and keeps the demo inside the demo (with its
 * ?from=admin, so the preview bar survives the click).
 */
export default function SideNav({ variant }: { variant: "side" | "pills" }) {
  const path = usePathname() ?? "/landlord";
  const params = useSearchParams();
  const base = path.startsWith("/landlord/demo") ? "/landlord/demo" : "/landlord";
  const q = params?.get("from") === "admin" ? "?from=admin" : "";
  const onJourney = path.endsWith("/journey");
  const items = [
    { href: `${base}${q}`, label: "Home", icon: "home", on: !onJourney },
    { href: `${base}/journey${q}`, label: "Journey", icon: "trend-up", on: onJourney },
    { href: `${base}${q}#documents`, label: "Documents", icon: "doc", on: false },
    { href: `${base}${q}#maintenance`, label: "Maintenance", icon: "setting", on: false },
    { href: `${base}${q}#messages`, label: "Messages", icon: "message", on: false },
  ];

  if (variant === "pills") {
    return (
      <>
        {items.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] ${
              n.on ? "border-transparent bg-accent-soft font-semibold text-ink" : "border-line/60 text-muted"
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
            n.on ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-accent-soft/50 hover:text-ink"
          }`}
        >
          <DoodleIcon name={n.icon} size={17} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
