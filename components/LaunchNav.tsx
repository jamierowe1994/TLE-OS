"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OPEN_SEARCH } from "@/components/SearchPalette";
import LineIcon from "@/components/LineIcon";
import Wordmark from "@/components/Wordmark";
import { warmRoute } from "@/lib/route-warm";
import type { NavItem } from "@/lib/nav";

/**
 * The Launch Day sidebar (James, 11 Oct 2026): "I want it to look really
 * clean, like a Linear or Attio kind of navigation bar ... it just feels a
 * little bit rough around the edges." One of the look lab's layouts.
 *
 * What makes those two read clean, and what this keeps to:
 *   - thin line icons, all one size and weight (components/LineIcon), not the
 *     hand-drawn doodles;
 *   - one type size and weight, rows of one height, nothing bold;
 *   - quiet section names in sentence case, and space between the groups
 *     rather than rules across them;
 *   - the page you are on as a soft fill, not a raised pill.
 * Showroom is not in it ("we're going to get rid of Showroom").
 */

type Me = { name?: string | null; email?: string | null; photo?: string | null } | null;

function initials(me: Me): string {
  return (me?.name || me?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const row = (active: boolean, collapsed: boolean) =>
  `group flex h-8 w-full items-center rounded-md text-[13px] transition-colors ${collapsed ? "justify-center px-0" : "gap-2.5 px-2"} ${
    active ? "bg-[var(--launch-active)] text-ink" : "text-[var(--launch-text)] hover:bg-[var(--launch-hover)] hover:text-ink"
  }`;

function Item({ item, pathname, currentHref, collapsed, go }: { item: NavItem; pathname: string; currentHref: string; collapsed: boolean; go: (href: string) => void }) {
  const kids = item.children ?? [];
  /* A child page lights its group too: Maintenance, Compliance and the rest
     live under Portfolio but are not under its address, so on them nothing
     was lit and the group stayed shut (11 Oct 2026). */
  const active = pathname.startsWith(item.href) || kids.some((c) => { const p = c.href.split("?")[0]; return p !== item.href && (pathname === p || pathname.startsWith(`${p}/`)); });
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  const showKids = open && kids.length > 0 && !collapsed;
  /* One highlight at a time: on a child page the child is filled and the
     parent only darkens, as Linear does. */
  const childOn = showKids && kids.some((c) => c.href === currentHref);
  return (
    <li>
      <div className="relative">
        <a
          href={item.href}
          data-nav={item.href}
          title={collapsed ? item.label : undefined}
          onMouseEnter={() => warmRoute(kids[0]?.href ?? item.href)}
          onClick={(e) => {
            e.preventDefault();
            go(item.href);
          }}
          className={`${row(active && !childOn, collapsed)} ${childOn ? "text-ink" : ""}`}
        >
          <LineIcon name={item.icon} className={active ? "text-ink" : "text-[var(--launch-icon)] group-hover:text-ink"} />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        </a>
        {kids.length > 0 && !collapsed && (
          <button
            type="button"
            aria-label={open ? `Hide ${item.label}` : `Show ${item.label}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink"
          >
            <LineIcon name={open ? "chevron-down" : "chevron-right"} size={14} />
          </button>
        )}
      </div>
      {showKids && (
        <ul className="mb-1 ml-[18px] mt-0.5 space-y-px border-l border-[var(--launch-guide)] pl-2">
          {kids.map((c) => {
            const on = currentHref === c.href;
            return (
              <li key={c.href}>
                <a
                  href={c.href}
                  data-nav={c.href}
                  onMouseEnter={() => warmRoute(c.href)}
                  onClick={(e) => {
                    e.preventDefault();
                    go(c.href);
                  }}
                  className={`flex h-7 items-center rounded-md px-2 text-[12.5px] transition-colors ${on ? "bg-[var(--launch-active)] text-ink" : "text-[var(--launch-text)] hover:bg-[var(--launch-hover)] hover:text-ink"}`}
                >
                  <span className="truncate">{c.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Section({ title, items, collapsed, ...rest }: { title: string | null; items: NavItem[]; pathname: string; currentHref: string; collapsed: boolean; go: (href: string) => void }) {
  const [shut, setShut] = useState(false);
  if (!items.length) return null;
  return (
    <div className="mt-4 first:mt-0">
      {title && !collapsed && (
        <button
          type="button"
          onClick={() => setShut((s) => !s)}
          className="group mb-0.5 flex h-6 w-full items-center gap-1 rounded-md px-2 text-left text-[11.5px] font-medium text-[var(--launch-icon)] hover:text-ink"
        >
          {title}
          <LineIcon name={shut ? "chevron-right" : "chevron-down"} size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
      {title && collapsed && <div className="mx-auto mb-2 w-5 border-t border-[var(--launch-guide)]" />}
      {!shut && (
        <ul className="space-y-px">
          {items.map((it) => (
            <Item key={it.href} item={it} collapsed={collapsed} {...rest} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LaunchNav({
  front,
  back,
  mine,
  pathname,
  currentHref,
  go,
  collapsed,
  onToggleCollapse,
  me,
  onSignOut,
  menuOpen,
  onMenu,
}: {
  front: NavItem[];
  back: NavItem[];
  mine: NavItem[];
  pathname: string;
  currentHref: string;
  go: (href: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  me: Me;
  onSignOut: () => void;
  /* The shell holds the profile menu's state, so a guide or the tour can open it. */
  menuOpen?: boolean;
  onMenu?: (open: boolean) => void;
}) {
  const [ownMenu, setOwnMenu] = useState(false);
  const menu = menuOpen ?? ownMenu;
  const setMenu = (v: boolean | ((m: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(menu) : v;
    if (onMenu) onMenu(next);
    else setOwnMenu(next);
  };
  /* Dashboard on its own, the lettings work under a name, Showroom gone. */
  const home = front.filter((i) => i.href === "/dashboard");
  const lettings = front.filter((i) => i.href !== "/dashboard" && i.href !== "/showroom");

  /* Search, or ⌘K / Ctrl+K: Search for anything (components/SearchPalette,
     10 Oct 2026) - the one search in the OS, from every screen. */
  const focusSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const common = { pathname, currentHref, collapsed, go };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The workspace, and the collapse. */}
      {/* Just the wordmark, no box round it (James, 11 Oct 2026). Collapsed,
          it is the OS on its own, as the old rail did. */}
      <div className={`flex h-9 items-center ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
        <Wordmark collapsed={collapsed} size={21} />
        {!collapsed && (
          <>
            <span className="flex-1" />
            <button type="button" onClick={onToggleCollapse} title="Collapse" className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink">
              <LineIcon name="panel" size={15} />
            </button>
          </>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={onToggleCollapse} title="Expand" className="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink">
          <LineIcon name="panel" size={15} />
        </button>
      )}

      {/* Search, as a row: it opens the page's own search. */}
      <button type="button" data-os-search onClick={focusSearch} title={collapsed ? "Search (⌘K)" : undefined} className={`mt-3 ${row(false, collapsed)}`}>
        <LineIcon name="search" className="text-[var(--launch-icon)] group-hover:text-ink" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border border-[var(--launch-guide)] px-1.5 font-sans text-[10.5px] text-[var(--launch-icon)]">⌘K</kbd>
          </>
        )}
      </button>

      {/* A short rule under Search, and room before Dashboard (James, 11 Oct 2026). */}
      <div className="mx-auto mt-3 w-4/5 border-t border-[var(--launch-guide)]" />
      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
        <Section title={null} items={home} {...common} />
        <Section title="Lettings" items={lettings} {...common} />
        <Section title="Back office" items={back} {...common} />
        <Section title="Your workspaces" items={mine} {...common} />
      </nav>

      <ul className="space-y-px pt-2">
        <li>
          <Link href="/guides" data-os-help title={collapsed ? "Help" : undefined} className={row(pathname.startsWith("/guides"), collapsed)}>
            <LineIcon name="help" className="text-[var(--launch-icon)] group-hover:text-ink" />
            {!collapsed && <span>Help</span>}
          </Link>
        </li>
        <li>
          <Link href="/profile" data-os-settings title={collapsed ? "Settings" : undefined} className={row(pathname.startsWith("/profile"), collapsed)}>
            <LineIcon name="setting" className="text-[var(--launch-icon)] group-hover:text-ink" />
            {!collapsed && <span>Settings</span>}
          </Link>
        </li>
      </ul>

      {/* You, at the foot, set off by a short rule. */}
      <div className="mx-auto my-2 w-4/5 border-t border-[var(--launch-guide)]" />
      <div className="relative">
        {menu && !collapsed && (
          <div data-os-profile-menu className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-[var(--launch-guide)] bg-[var(--shell-panel)] p-1 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.3)]">
            <Link href="/profile" onClick={() => setMenu(false)} className={row(false, false)}>
              <LineIcon name="user" className="text-[var(--launch-icon)]" />
              Your profile
            </Link>
            <button type="button" onClick={onSignOut} className={row(false, false)}>
              <LineIcon name="logout" className="text-[var(--launch-icon)]" />
              Sign out
            </button>
          </div>
        )}
        <button type="button" data-os-profile onClick={() => (collapsed ? onToggleCollapse() : setMenu((m) => !m))} className={row(false, collapsed)}>
          {me?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.photo} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent-dark">{initials(me)}</span>
          )}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-ink">{me?.name || me?.email || "Signing in…"}</span>
              <LineIcon name="chevron-down" size={14} className={`text-[var(--launch-icon)] transition-transform ${menu ? "rotate-180" : ""}`} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
