"use client";

import WorkspaceRail from "@/components/WorkspaceRail";
import OwnWorkspace from "@/components/OwnWorkspace";

/**
 * Francesca's view, with the same rail as everybody else.
 *
 * ── Why this is a THIRD level of navigation ───────────────────────────────
 *
 * Her view is not a page in James's admin, it is a workspace of its own — the
 * same shape Kirstie's and Susan's have. So it takes the window, hides the
 * admin rail, and puts up its own.
 *
 * It is no longer nested in his admin either: it was /admin/marketing, and the
 * capability it demanded was `see:business`, so the only way to hand Francesca
 * marketing was to hand her GCI, arrears and every partner's earnings with it.
 * There is a `marketing` role and a `see:marketing` capability now, and this is
 * the whole of what they open.
 *
 * ── The frame is no longer hers alone ─────────────────────────────────────
 *
 * It used to draw its own: a bare sticky column of links, no panel, no house
 * mark, no wordmark, no rules, and its own top padding. Beside James's admin
 * it read as a different application, and on a phone it had no navigation at
 * all. It now uses WorkspaceRail, so the frame is identical and only the links
 * differ — which is the whole point of a workspace.
 */

const GROUPS = [
  {
    items: [
      { href: "/marketing-hub", label: "Overview", exact: true },
      { href: "/marketing-hub/campaigns", label: "Nurture campaigns" },
      { href: "/marketing-hub/paid-leads", label: "Paid leads & social" },
    ],
  },
  {
    title: "Content",
    rule: true,
    items: [
      { href: "/marketing-hub/templates", label: "Email templates" },
      { href: "/marketing-hub/storage", label: "File storage" },
      { href: "/marketing-hub/assistant", label: "The assistant" },
    ],
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnWorkspace needs="see:marketing">
      {/* No padding of its own, exactly as before: the workspace strips the
          shell's and this rail has always sat flush to the window edge. */}
      {/* Stacked below md for the same reason the admin layout is: the rail
          turns into a scrolling strip at that breakpoint, and a strip beside
          the content squeezes both. */}
      <div className="flex flex-col gap-5 md:flex-row">
        <WorkspaceRail label="Marketing" groups={GROUPS} />
        {/* pb-20 leaves room for the workspace's floating back pill. This is
            the one of the three screens that scrolls normally, so without it
            the last paragraph on a long page ends underneath the pill. */}
        <div className="min-w-0 flex-1 py-3 pb-20">{children}</div>
      </div>
    </OwnWorkspace>
  );
}
