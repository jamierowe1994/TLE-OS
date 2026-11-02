"use client";

import { currentMonth, monthProgressLabel } from "@/lib/business/format";

/**
 * One of Susan's My Business tabs, drawn inside somebody else's workspace.
 *
 * Susan, 2 Nov 2026: Kirstie's view "needs to include oversight of the
 * move-ins and Pipeline like mine", and the Compliance overview "needs to be
 * on Michaels view also". Same tab, same routes, same figures - so the two
 * screens can never disagree - in the house heading and colours that
 * company-figures/frame draws, on the month we are standing in.
 */
export default function FiguresPage({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: (month: string) => React.ReactNode;
}) {
  const month = currentMonth();
  return (
    <div className="type-admin biz-os">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-dark">{eyebrow}</p>
          <h1 className="mt-1.5 leading-[1.02] text-[clamp(30px,2.6vw,44px)]">{title}</h1>
          <p className="mt-2 max-w-[68ch] leading-relaxed text-muted text-[clamp(13px,0.95vw,15px)]">{blurb}</p>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-semibold text-accent-dark">
          {monthProgressLabel(month)}
        </span>
      </header>
      {children(month)}
    </div>
  );
}
