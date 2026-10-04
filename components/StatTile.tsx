"use client";

import type { ReactNode } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE FIGURE TILE, ONE LOOK FOR THE PORTFOLIO PAGES (James, 4 Oct 2026).
 *
 * Portfolio's tiles - white, a hairline outline, the icon in a soft circle -
 * and the one that matters most on the page filled in: light pink when it
 * needs a hand, light green when it is clear. Compliance, Maintenance,
 * Inspections, Tenancy reviews and Move-outs each drew their own grey boxes;
 * they all draw this now, so the five can never drift apart again.
 *
 * `onClick` makes it a button (Compliance filters its book by tile), and
 * `active` outlines the chosen one in ink.
 */
export type StatTone = "pink" | "green";

export default function StatTile({
  label,
  value,
  hint,
  icon,
  tone,
  onClick,
  active,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: string;
  tone?: StatTone;
  onClick?: () => void;
  active?: boolean;
  /** Anything under the hint - Maintenance's change since last week. */
  children?: ReactNode;
}) {
  const fill =
    tone === "pink"
      ? "border-transparent bg-accent-soft/70"
      : tone === "green"
        ? "border-transparent bg-[#f1f4ec]"
        : "border-line/70 bg-card";
  const ring = active ? "!border-ink" : onClick ? "hover:border-ink/60" : "";
  const body = (
    <>
      <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${tone ? "bg-white/80" : "bg-accent-soft"} ${tone === "green" ? "text-[#56634a]" : "text-accent-dark"}`}>
          <DoodleIcon name={icon} size={13} />
        </span>
        {label}
      </p>
      <div className="figures mt-2 text-[30px] font-semibold leading-none tracking-tight">{value}</div>
      {hint && <p className="mt-2 text-[11px] leading-relaxed text-muted">{hint}</p>}
      {children}
    </>
  );
  const cls = `fade-up block w-full rounded-2xl border p-5 text-left transition-colors ${fill} ${ring}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Pink when there is something to do, green when there is not, nothing while it is still reading. */
export const toneFor = (n: number | null | undefined): StatTone | undefined => (n == null ? undefined : n > 0 ? "pink" : "green");
