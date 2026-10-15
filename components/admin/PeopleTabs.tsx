"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchMe } from "@/lib/me";
import { can } from "@/lib/roles";

/**
 * People | Invites | Permissions, as tabs under one rail entry (James, 2 Oct 2026:
 * "permissions could be a tab within people"). Each tab is still its own
 * page and route, guarded as before; the Permissions tab is only drawn for
 * somebody who holds see:roles, so nobody is offered a door that refuses them.
 */
export default function PeopleTabs() {
  const path = usePathname() ?? "";
  const [canRoles, setCanRoles] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => {
        if (gone) return;
        setCanRoles(can(j?.role ?? null, "see:roles"));
        setCanInvite(can(j?.role ?? null, "see:prelaunch"));
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);

  /* Invites came in from Admin > Launch on 15 Oct 2026, when Launch and
     Pre-launch went: letting a new starter in is a People job. */
  const tabs = [
    { href: "/admin/people", label: "People", exact: true },
    ...(canInvite ? [{ href: "/admin/people/invites", label: "Invites" }] : []),
    ...(canRoles ? [{ href: "/admin/permissions", label: "Permissions" }] : []),
  ];
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="People" className="mt-6 flex gap-1.5">
      {tabs.map((t) => {
        /* People is also the start of every person's file (/admin/people/<id>),
           but not of Invites. */
        const on = "exact" in t && t.exact ? path === t.href || (path.startsWith(`${t.href}/`) && !path.startsWith("/admin/people/invites")) : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-[12.5px] transition-colors ${
              on ? "border-brown bg-brown font-semibold text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
