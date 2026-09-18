"use client";

import { usePathname, useSearchParams } from "next/navigation";
import PhoneShell from "@/components/landlord/PhoneShell";
import TenantSignOut from "@/components/TenantSignOut";
import type { NavKey } from "@/lib/tenant-journey";

/**
 * The tenant portal on a phone: the landlord's drawer (components/landlord
 * PhoneShell), with the tenant's own pages in it (James, 18 Sep 2026:
 * "replicate one for one"). The same order as the sidebar; a page not open
 * yet at this stage sits in the list drawn quieter, and still opens onto the
 * page that says what unlocks it - as the sidebar's padlock rows do.
 */
const PAGES: { key: NavKey; path: string; label: string }[] = [
  { key: "home", path: "", label: "Home" },
  { key: "homes", path: "/homes", label: "Finding Home" },
  { key: "documents", path: "/documents", label: "Documents" },
  { key: "tenancy", path: "/tenancy", label: "My tenancy" },
  { key: "maintenance", path: "/maintenance", label: "Maintenance" },
  { key: "payments", path: "/payments", label: "Payments" },
  { key: "messages", path: "/messages", label: "Messages" },
];

export default function TenantPhoneShell({
  signedIn,
  locks,
  children,
}: {
  signedIn: boolean;
  locks: Partial<Record<NavKey, string>>;
  children: React.ReactNode;
}) {
  const path = usePathname() ?? "/tenant";
  const params = useSearchParams();
  const base = path.startsWith("/tenant/demo") ? "/tenant/demo" : "/tenant";
  const q = params?.get("from") === "admin" ? "?from=admin" : "";
  const links = [
    ...PAGES.map((p) => ({ href: `${base}${p.path}${q}`, label: p.label, muted: Boolean(locks[p.key]) })),
    /* My details: the avatar that opens it is off the phone's header. */
    ...(signedIn && base === "/tenant" ? [{ href: "/tenant/profile", label: "My details" }] : []),
  ];
  return (
    /* Always Sign out, never Sign in (James, 18 Sep 2026): nobody reaches a
       page in here without being signed in. In the sample it lands on the
       sign-in page, which is where a real tenant's would. */
    <PhoneShell signedIn letHere={false} links={links} signInHref="/tenant/sign-in" signOut={<TenantSignOut variant="drawer" />}>
      {children}
    </PhoneShell>
  );
}
