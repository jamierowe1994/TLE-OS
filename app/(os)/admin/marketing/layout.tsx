"use client";

import WorkspaceRail from "@/components/WorkspaceRail";

/**
 * Francesca's view, with the same rail as everybody else.
 *
 * ── Why this is a THIRD level of navigation ───────────────────────────────
 *
 * Her view is not a page in James's admin, it is a workspace of its own — the
 * same shape Kirstie's and Susan's have. So it takes the window, hides the
 * admin rail, and puts up its own.
 *
 * That is also what makes it hand-over-able. When Francesca gets a login this
 * becomes what she lands on, unchanged; James's admin rail simply is not there
 * for her, and the "Back to admin" pill is the only thing she will not see.
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
      { href: "/admin/marketing", label: "Overview", exact: true },
      { href: "/admin/marketing/campaigns", label: "Nurture campaigns" },
      { href: "/admin/marketing/paid-leads", label: "Paid leads & social" },
    ],
  },
  {
    title: "Content",
    rule: true,
    items: [
      { href: "/admin/marketing/templates", label: "Email templates" },
      { href: "/admin/marketing/storage", label: "File storage" },
      { href: "/admin/marketing/assistant", label: "The assistant" },
    ],
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <WorkspaceRail label="Marketing" groups={GROUPS} />
      <div className="min-w-0 flex-1 py-3">{children}</div>
    </div>
  );
}
