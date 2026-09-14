"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

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
export type RailItem = { href: string; label: string; exact?: boolean; icon?: string };

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
}: {
  /** The small caps line under the wordmark — "Admin", "Marketing". */
  label: string;
  groups: RailGroup[];
  /** Optional action pinned to the bottom, e.g. "Leave admin". */
  footer?: React.ReactNode;
}) {
  const path = usePathname();
  const isOn = (t: RailItem) => (t.exact ? path === t.href : path.startsWith(t.href));

  /* Per workspace, so folding Kirstie's does not fold Francesca's. Read after
     mount rather than during: the server has no localStorage, and a rail that
     renders wide and then jumps narrow is worse than one that starts wide. */
  const key = `os-workspace-collapsed:${label.toLowerCase()}`;
  const [collapsed, setCollapsed] = useState(false);
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
        style={{ width: collapsed ? 72 : 240 }}
        className={`sticky top-3 mb-3 hidden h-[calc(100vh-24px)] shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel py-5 transition-[width,padding] duration-200 md:flex ${
          collapsed ? "px-2.5" : "px-4"
        }`}
      >
        <div className={`relative flex items-center px-1 ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
          {collapsed ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/brand/tle-os-house.png" alt="TLE OS" className="h-12 w-auto shrink-0 object-contain" />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo.png" alt="TLE OS" className="art-light h-auto w-[78%] object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo-dark.png" alt="" aria-hidden className="art-dark h-auto w-[78%] object-contain" />
            </>
          )}
          {/* The same arrow, in the same place, as the agent rail's. */}
          <button
            type="button"
            onClick={fold}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line/80 text-[11px] text-muted transition-colors hover:text-ink ${
              collapsed ? "" : "absolute right-1 top-[64.5%] -translate-y-1/2"
            }`}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <p
          className={`mt-1 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-accent-dark transition-[max-height,opacity] duration-200 ${
            collapsed ? "max-h-0 overflow-hidden opacity-0" : "max-h-5 opacity-100"
          }`}
        >
          {label}
        </p>

        {/* The line around the outside is the panel's border; this is the one
            under the mark, exactly as the agent rail has it. */}
        <div className="mb-1 mt-3 border-t border-line/70 pt-3" />

        <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
          {groups.map((g, i) => (
            <div
              key={g.title ?? `group-${i}`}
              className={g.rule ? "mt-5 border-t border-line/70 pt-4" : g.title ? "mt-3" : ""}
            >
              {g.title && !collapsed && (
                <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
                  {g.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((t) => (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      title={collapsed ? t.label : undefined}
                      className={`flex items-center rounded-lg py-2 text-[12.5px] transition-colors ${
                        collapsed ? "justify-center px-0" : "gap-3 px-3"
                      } ${
                        isOn(t)
                          ? "bg-accent-soft font-semibold text-accent-dark"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {t.icon && <DoodleIcon name={t.icon} size={16} className={isOn(t) ? "text-accent-dark" : ""} />}
                      {/* The word itself goes to nothing rather than being
                          dropped, so the fold is one movement and the icons
                          do not jump into place afterwards. */}
                      <span
                        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ${
                          collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"
                        }`}
                      >
                        {t.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {footer && !collapsed ? <div className="mt-auto pt-3">{footer}</div> : null}
      </aside>

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
