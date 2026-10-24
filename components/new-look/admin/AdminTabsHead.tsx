"use client";

import Link from "next/link";
import { tabAt, tabsFor, whereIs } from "@/components/new-look/admin/areas";

/**
 * The tabs on top of a bolted-together Admin entry (James, 24 Oct 2026): the
 * entry's name, then its screens as text tabs on a hairline, each one a real
 * address. Only the tabs this person holds are drawn, so nobody is offered a
 * door that refuses them. An entry with one tab for this person gets no tabs.
 */
export default function AdminTabsHead({ path, role }: { path: string; role: string | null }) {
  const at = whereIs(path);
  if (!at?.tool.tabs) return null;
  const tabs = tabsFor(role, at.tool);
  if (tabs.length < 2) return null;
  const now = tabAt(path, tabs);
  return (
    <div className="nl-page nl-adm-tabshead">
      <div className="nl-eyebrow">{at.area.name}</div>
      <h1 className="nl-title nl-adm-tabs-title">{at.tool.label}</h1>
      <nav aria-label={at.tool.label} className="nl-tabs nl-adm-tabs">
        {tabs.map((x) => (
          <Link key={x.href} href={x.href} aria-current={now?.href === x.href ? "page" : undefined} className={`nl-tab${now?.href === x.href ? " is-on" : ""}`}>
            {x.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
