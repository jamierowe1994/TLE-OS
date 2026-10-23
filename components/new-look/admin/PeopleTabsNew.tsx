"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchMe } from "@/lib/me";
import { can } from "@/lib/roles";

/**
 * People | Invites | Permissions in the new look: text tabs on a hairline.
 * The same three routes and the same rules as components/admin/PeopleTabs -
 * Invites only for see:prelaunch, Permissions only for see:roles - so nobody
 * is offered a door that refuses them.
 */
export default function PeopleTabsNew() {
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

  const tabs = [
    { href: "/admin/people", label: "People", exact: true },
    ...(canInvite ? [{ href: "/admin/people/invites", label: "Invites" }] : []),
    ...(canRoles ? [{ href: "/admin/permissions", label: "Permissions" }] : []),
  ];
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="People" className="nl-tabs nl-adm-ptabs">
      {tabs.map((t) => {
        const on = "exact" in t && t.exact ? path === t.href || (path.startsWith(`${t.href}/`) && !path.startsWith("/admin/people/invites")) : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`nl-tab${on ? " is-on" : ""}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
