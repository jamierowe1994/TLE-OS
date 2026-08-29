"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
 */

export type RailItem = { href: string; label: string; exact?: boolean };

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

  return (
    <>
      <aside
        data-admin-rail
        className="sticky top-3 mb-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel px-4 py-5 md:flex"
      >
        <div className="flex items-center px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/house.png" alt="" className="art h-7 w-7" />
          <span className="hand ml-2 text-[17px] leading-none">TLE OS</span>
        </div>
        <p className="mt-1 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-accent-dark">
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
              {g.title && (
                <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
                  {g.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((t) => (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      className={`block rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                        isOn(t)
                          ? "bg-accent-soft font-semibold text-accent-dark"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
      </aside>

      {/* On a phone the rail becomes a scrolling strip — a 240px column beside
          content on a 375px screen leaves neither of them usable. */}
      <nav
        data-admin-rail
        aria-label={label}
        className="mb-4 flex gap-1.5 overflow-x-auto pb-1 md:hidden"
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
