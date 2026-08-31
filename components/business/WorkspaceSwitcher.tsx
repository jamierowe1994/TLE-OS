"use client";

/**
 * The brand corner of Susan's figures.
 *
 * ── It used to be a switcher, and it was the leak ─────────────────────────
 *
 * Ported from the portal, where one login wore two hats and this flipped
 * between them. Inside TLE OS it was actively wrong in three ways at once, and
 * on Susan's screen every one of them landed on her:
 *
 *   1. The page hardcodes `isAdmin: true` for anybody who reaches it (the real
 *      permission is decided by the APIs), so the menu ALWAYS opened.
 *   2. Its first entry linked straight to James's admin area, from the top left
 *      of the client's own dashboard. This is the thing he found.
 *   3. Its second linked to `/pretenancy`, which is not a route in this app
 *      (Kirstie's board is `/pre-tenancy`), so it was a 404 wearing a label.
 *
 * Switching workspaces belongs to the OS rail — the "Yours only" group, built
 * from what the person actually holds. So this is the static brand block it
 * always fell back to, and nothing more. Kept as a component rather than
 * inlined because both the desktop and the mobile header render it.
 */

import BrandMark from "@/components/business/BrandMark";

export type WorkspaceKey = "admin" | "pretenancy";

export default function WorkspaceSwitcher({
  current,
  size = 34,
}: {
  current: WorkspaceKey;
  size?: number;
}) {
  const label = current === "pretenancy" ? "Pre-Tenancy" : "Business";

  return (
    <div className="flex items-center gap-2.5 text-left">
      <BrandMark size={size} />
      {/* The mark alone below 640px. On a 375px screen this block plus the
          three buttons beside it measured 453px against a 375px viewport — the
          whole page scrolled sideways, which is the single most-reported class
          of bug on this product. Only the phone loses the words; the desktop
          rail is inside a `lg:` container, so it is always above this. */}
      <div className="hidden min-w-0 leading-tight sm:block">
        <div className="truncate text-[15px] font-semibold tracking-tight">
          The Lettings Expert
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      </div>
    </div>
  );
}
