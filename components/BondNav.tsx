"use client";

import { useEffect, useState } from "react";
import { OPEN_SEARCH } from "@/components/SearchPalette";
import LineIcon from "@/components/LineIcon";
import { row } from "@/components/LaunchNav";
import { fetchMe } from "@/lib/me";

/**
 * Bond's sidebar, drawn as the OS's own (James, 12 Oct 2026: "get the nav bar
 * the same as we've got on the dashboard for the OS"). The same Launch Day
 * hand as components/LaunchNav: line icons of one size, rows of one height,
 * quiet section names, the room you are in as a soft fill, the foot set off by
 * a short rule, and the same collapse to icons, remembered under the OS's own
 * key so folding one folds the other.
 *
 * What differs is only what Bond needs: its rooms rather than the OS's pages,
 * Ask Bond, the patch, and Back to OS where Help and Settings sit.
 */

export interface BondRoomItem {
  key: string;
  label: string;
  icon: string;
  more?: boolean;
}

type Me = { name?: string | null; email?: string | null; photo?: string | null } | null;

function initials(me: Me): string {
  return (me?.name || me?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const COLLAPSE_KEY = "os-nav-collapsed";

export default function BondNav({
  rooms,
  room,
  onRoom,
  onAsk,
  patch,
  onPatch,
  onBack,
  onCollapse,
}: {
  rooms: BondRoomItem[];
  room: string;
  onRoom: (key: string) => void;
  onAsk: () => void;
  patch: string[] | null;
  onPatch: () => void;
  onBack: () => void;
  /** The width changes with it, so the page beside it is told. */
  onCollapse?: (collapsed: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [me, setMe] = useState<Me>(null);
  const [menu, setMenu] = useState(false);
  const inMore = rooms.some((r) => r.more && r.key === room);
  const [moreOpen, setMoreOpen] = useState(inMore);
  useEffect(() => {
    if (inMore) setMoreOpen(true);
  }, [inMore]);

  useEffect(() => {
    let c = false;
    try {
      c = localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {}
    setCollapsed(c);
    onCollapse?.(c);
    fetchMe()
      .then((j) => setMe(j?.user ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    onCollapse?.(next);
    if (next) setMenu(false);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {}
    /* The same per-person habit the OS keeps (components/Shell). */
    void fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: COLLAPSE_KEY, value: next ? "1" : "0" }),
    }).catch(() => {});
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/sign-in");
  }

  const main = rooms.filter((r) => !r.more);
  const more = rooms.filter((r) => r.more);
  const icon = (on: boolean) => (on ? "text-ink" : "text-[var(--launch-icon)] group-hover:text-ink");

  const RoomRow = ({ r }: { r: BondRoomItem }) => {
    const on = room === r.key;
    return (
      <li>
        <button type="button" onClick={() => onRoom(r.key)} title={collapsed ? r.label : undefined} aria-current={on ? "page" : undefined} className={row(on, collapsed)}>
          <LineIcon name={r.icon} className={icon(on)} />
          {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{r.label}</span>}
        </button>
      </li>
    );
  };

  const patchLine = patch == null ? "Not chosen" : patch.length === 0 ? "Whole patch" : `${patch.length} district${patch.length === 1 ? "" : "s"}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The mark, and the collapse. Bond in the OS wordmark's face and weight. */}
      <div className={`flex h-9 items-center ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
        <span
          aria-label="Bond"
          className="select-none whitespace-nowrap font-[800] leading-none tracking-[-0.03em] text-ink"
          style={{ fontFamily: "var(--font-bricolage), var(--font-heading)", fontSize: 21 }}
        >
          {collapsed ? "B" : "Bond"}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1" />
            <button type="button" onClick={toggle} title="Collapse" className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink">
              <LineIcon name="panel" size={15} />
            </button>
          </>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={toggle} title="Expand" className="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink">
          <LineIcon name="panel" size={15} />
        </button>
      )}

      {/* Search: the OS's own, over Bond (⌘K works here too). */}
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))} title={collapsed ? "Search (⌘K)" : undefined} className={`mt-3 ${row(false, collapsed)}`}>
        <LineIcon name="search" className={icon(false)} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border border-[var(--launch-guide)] px-1.5 font-sans text-[10.5px] text-[var(--launch-icon)]">⌘K</kbd>
          </>
        )}
      </button>
      <button type="button" onClick={onAsk} title={collapsed ? "Ask Bond" : undefined} className={`mt-px ${row(false, collapsed)}`}>
        <LineIcon name="magic-wand" className={icon(false)} />
        {!collapsed && <span className="flex-1 text-left">Ask Bond</span>}
      </button>

      <div className="mx-auto mt-3 w-4/5 border-t border-[var(--launch-guide)]" />
      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
        <ul className="space-y-px">
          {main.map((r) => (
            <RoomRow key={r.key} r={r} />
          ))}
        </ul>
        {more.length > 0 && (
          <div className="mt-4">
            {collapsed ? (
              <div className="mx-auto mb-2 w-5 border-t border-[var(--launch-guide)]" />
            ) : (
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className="group mb-0.5 flex h-6 w-full items-center gap-1 rounded-md px-2 text-left text-[11.5px] font-medium text-[var(--launch-icon)] hover:text-ink"
              >
                More
                <LineIcon name={moreOpen ? "chevron-down" : "chevron-right"} size={12} />
              </button>
            )}
            {(moreOpen || collapsed) && (
              <ul className="space-y-px">
                {more.map((r) => (
                  <RoomRow key={r.key} r={r} />
                ))}
              </ul>
            )}
          </div>
        )}
      </nav>

      <ul className="space-y-px pt-2">
        <li>
          <button
            type="button"
            onClick={onPatch}
            title={collapsed ? `Your patch: ${patchLine}` : patch && patch.length ? patch.join(", ") : undefined}
            className={row(false, collapsed)}
          >
            <LineIcon name="target" className={icon(false)} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Your patch</span>
                <span className="text-[11.5px] text-[var(--launch-icon)]">{patchLine}</span>
              </>
            )}
          </button>
        </li>
        <li>
          <button type="button" onClick={onBack} title={collapsed ? "Back to OS" : undefined} className={row(false, collapsed)}>
            <LineIcon name="arrow-left" className={icon(false)} />
            {!collapsed && <span className="flex-1 text-left">Back to OS</span>}
          </button>
        </li>
      </ul>

      <div className="mx-auto my-2 w-4/5 border-t border-[var(--launch-guide)]" />
      <div className="relative">
        {menu && !collapsed && (
          <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-[var(--launch-guide)] bg-[var(--shell-panel)] p-1 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.3)]">
            <a href="/profile" className={row(false, false)}>
              <LineIcon name="user" className="text-[var(--launch-icon)]" />
              Your profile
            </a>
            <button type="button" onClick={signOut} className={row(false, false)}>
              <LineIcon name="logout" className="text-[var(--launch-icon)]" />
              Sign out
            </button>
          </div>
        )}
        <button type="button" onClick={() => (collapsed ? toggle() : setMenu((m) => !m))} className={row(false, collapsed)}>
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
