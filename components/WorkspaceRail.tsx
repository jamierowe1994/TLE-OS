"use client";

import { useEffect, useState } from "react";
import Wordmark from "@/components/Wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LineIcon from "@/components/LineIcon";
import { useNewLook } from "@/lib/use-new-look";

/**
 * The rail every workspace uses. One frame, whoever you are.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * James, 29 Aug: "they should all basically be the same. It doesn't matter who
 * you are, so that the frame and the outside is just the contents of the
 * navbar."
 *
 * There were two rails, and they had drifted into different products. Admin
 * had a rounded panel, the house mark, the TLE OS wordmark, a rule under it
 * and grouped sections with rules between them. Marketing had a bare sticky
 * column of links with none of that — no panel, no mark, no rules, and its own
 * top padding. Kirstie had no rail of her own at all, which is the only reason
 * hers looked right: she was sitting inside admin's.
 *
 * So the frame is one component and the CONTENTS are the argument. Adding a
 * workspace is now a list of links, not a layout, and the next one cannot come
 * out looking like a different application.
 *
 * ── The mobile strip is part of it, not an afterthought ───────────────────
 *
 * A 240px column beside content on a 375px screen leaves neither usable, so
 * below md the rail becomes a scrolling row of pills. That behaviour lived in
 * admin and was simply missing from marketing — which is how a workspace ends
 * up with no navigation at all on a phone.
 *
 * ── It folds, like the agent's own ────────────────────────────────────────
 *
 * James, 14 Sep 2026, on Kirstie's screens: the same arrow as the home rail,
 * folding this one down to its icons. She works on a 14in laptop and the board
 * beside this is the screen she sits on all day, so 168px of it back is real
 * room. Folded or not is remembered in the browser, per workspace - the agent
 * rail keeps its own flag, and somebody who folds pre-tenancy has not asked
 * for marketing to fold too.
 */

/** `icon` is a DoodleIcon name. Optional: the admin rail has none, and a
 *  rail with icons on some rows and not others would look broken. */
export type RailItem = { href: string; label: string; exact?: boolean; icon?: string; /** Other routes that light this entry - a page shown as its tab. */ also?: string[] };

export type RailGroup = {
  /** Section heading. Null or omitted for the first, unlabelled group —
   *  null because the admin groups already model it that way. */
  title?: string | null;
  /** Draw a divider and a gap ABOVE this group. */
  rule?: boolean;
  items: RailItem[];
};

export default function WorkspaceRail({
  label,
  groups,
  footer,
  at,
}: {
  /** The small caps line under the wordmark — "Admin", "Marketing". */
  label: string;
  groups: RailGroup[];
  /** Optional action pinned to the bottom, e.g. "Leave admin". */
  footer?: React.ReactNode;
  /** The page to light, when it is not the address: the Showroom's demo draws this rail around a real screen at /preview/... */
  at?: string;
}) {
  const live = usePathname();
  const path = at ?? live;
  const isOn = (t: RailItem) => (t.exact ? path === t.href : path.startsWith(t.href)) || Boolean(t.also?.some((a) => path.startsWith(a)));

  /* Per workspace, so folding Kirstie's does not fold Francesca's. Read after
     mount rather than during: the server has no localStorage, and a rail that
     renders wide and then jumps narrow is worse than one that starts wide. */
  const key = `os-workspace-collapsed:${label.toLowerCase()}`;
  const [collapsed, setCollapsed] = useState(false);
  /* The new look's sidebar (lib/new-look "nav"): flush to the left, full height, a line down its edge. */
  const look = useNewLook("nav") === true;
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(key) === "1");
    } catch {
      /* Storage off is not a reason to lose the rail. */
    }
  }, [key]);
  const fold = () =>
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(key, c ? "0" : "1");
      } catch {
        /* as above */
      }
      return !c;
    });

  return (
    <>
      <aside
        data-admin-rail
        /* The width is a style, not a class. Next splits the stylesheet by
           route group, and an arbitrary utility only reaches the bundles whose
           routes already used it - `w-[72px]` lives in the agent shell's sheet
           and is simply absent from this workspace's, so the class applied and
           did nothing (14 Sep 2026). A number cannot go missing. */
        style={{ width: look ? (collapsed ? 72 : 264) : collapsed ? 72 : 240 }}
        /* From lg it sits on the shell's grey at the window's left, flat like
           the agent sidebar, and the page's white panel starts after it
           (components/Shell frame, 10 Oct 2026). The spacer below holds its
           place in the row. A tablet keeps the card. */
        /* The same frame as the agent's sidebar (components/LaunchNav, James
           11 Oct 2026: "the same width ... the same structure as the standard
           navigation bar"): the wordmark at 21, one row height, line icons,
           quiet section names, the page you are on as a soft fill. From lg it
           sits on the shell's grey at the window's left and the page's white
           panel starts after it; the spacer below holds its place. */
        className={look
          ? "nl-nav sticky top-[var(--os-band-h,0px)] mb-3 hidden h-[calc(100vh-var(--os-band-h,0px))] shrink-0 flex-col overflow-hidden border-r border-[var(--nv-line)] transition-[width] duration-200 md:flex lg:fixed lg:left-0 lg:z-[50] lg:mb-0"
          : "sticky top-[calc(12px+var(--os-band-h,0px))] mb-3 hidden h-[calc(100vh-24px-var(--os-band-h,0px))] shrink-0 flex-col overflow-hidden bg-[var(--shell-nav-bg)] px-2.5 py-3 transition-[width] duration-200 md:flex lg:fixed lg:left-2 lg:z-[50] lg:mb-0"}
      >
        <div className={look ? `nl-nav-head${collapsed ? " is-tight" : ""}` : `flex h-9 items-center ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
          {look ? <span className="nl-nav-logo">{collapsed ? "OS" : "TLE OS"}</span> : <Wordmark collapsed={collapsed} size={21} />}
          {!collapsed && (
            <>
              <span className={look ? "ml-2 truncate text-[12px] text-[var(--nv-muted)]" : "truncate text-[12px] text-[var(--launch-icon)]"}>{label}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={fold}
                title="Collapse"
                aria-label="Collapse the menu"
                className={look ? "nl-nav-icon" : "flex h-7 w-7 items-center justify-center rounded-md text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink"}
              >
                <LineIcon name="panel" size={look ? 17 : 15} />
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={fold}
            title="Expand"
            aria-label="Expand the menu"
            className="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--launch-icon)] hover:bg-[var(--launch-hover)] hover:text-ink"
          >
            <LineIcon name="panel" size={15} />
          </button>
        )}

        {!look && <div className="mx-auto mt-3 w-4/5 border-t border-[var(--launch-guide)]" />}

        <nav aria-label={label} className={look ? "nl-nav-list" : "mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2"}>
          {groups.map((g, i) => (
            <div key={g.title ?? `group-${i}`} className={look ? "" : i === 0 ? "" : "mt-4"}>
              {g.title && !collapsed && (
                <p className={look ? "nl-nav-label" : "mb-0.5 flex h-6 items-center px-2 text-[11.5px] font-medium text-[var(--launch-icon)]"}>{g.title}</p>
              )}
              {g.title && collapsed && <div className="mx-auto mb-2 w-5 border-t border-[var(--launch-guide)]" />}
              <ul className="space-y-px">
                {g.items.map((t) => {
                  const on = isOn(t);
                  return (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        data-admin-nav={t.href}
                        title={collapsed ? t.label : undefined}
                        className={look ? `nl-nav-item${on ? " is-on" : ""}${collapsed ? " is-tight" : ""}` : `group flex h-8 items-center rounded-md text-[13px] transition-colors ${collapsed ? "justify-center px-0" : "gap-2.5 px-2"} ${
                          on ? "bg-[var(--launch-active)] text-ink" : "text-[var(--launch-text)] hover:bg-[var(--launch-hover)] hover:text-ink"
                        }`}
                      >
                        {t.icon ? (
                          <LineIcon name={t.icon} size={look ? 17 : undefined} className={look ? "" : on ? "text-ink" : "text-[var(--launch-icon)] group-hover:text-ink"} />
                        ) : collapsed ? (
                          <span className="text-[11px] font-semibold">{t.label.slice(0, 2)}</span>
                        ) : null}
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{t.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {footer && !collapsed ? (
          <>
            {!look && <div className="mx-auto my-2 w-4/5 border-t border-[var(--launch-guide)]" />}
            <div className={look ? "nl-nav-foot" : undefined}>{footer}</div>
          </>
        ) : null}
      </aside>
      <div aria-hidden className="hidden shrink-0 lg:block" style={{ width: look ? (collapsed ? 72 : 264) - 16 : (collapsed ? 72 : 240) - 12 }} />

      {/* On a phone the rail becomes a scrolling strip — a 240px column beside
          content on a 375px screen leaves neither of them usable.

          `min-w-0` is what makes `overflow-x-auto` mean anything. This nav is a
          flex ITEM of the wrapper each layout draws, and a flex item's default
          `min-width: auto` refuses to shrink below its own content — so the
          strip never scrolled, it just grew, and took the whole document
          sideways with it. Every admin page scrolled horizontally on a phone
          because of it, by exactly the width of the pills that did not fit. */}
      <nav
        data-admin-rail
        aria-label={label}
        className="mb-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1 md:hidden"
      >
        {groups
          .flatMap((g) => g.items)
          .map((t) => (
            <Link
              key={t.href}
              data-admin-nav={t.href}
              href={t.href}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] ${
                isOn(t) ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
              }`}
            >
              {t.label}
            </Link>
          ))}
      </nav>
    </>
  );
}
