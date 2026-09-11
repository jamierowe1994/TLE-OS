"use client";

import DoodleIcon from "@/components/DoodleIcon";

/**
 * The five questions an agent arrives with, as tiles the width of the
 * calendar beneath them.
 *
 * They used to be a row of their own across the whole page (the shared
 * StageTabs), which left the calendar starting a row lower than the day
 * panel beside it and the two never lining up (James, 11 Sep 2026: "the four
 * buttons should fit in the same space as the calendar, therefore allowing
 * the calendar to come up and fill that space above it"). So they are
 * compact, and they live in the calendar's column.
 *
 * Picking one changes what the panel beside the calendar answers, and never
 * takes you to a different screen.
 */
export type Tile<T extends string> = {
  id: T;
  label: string;
  icon: string;
  count: number;
  blurb?: string;
  on: boolean;
};

export default function Tiles<T extends string>({
  tiles,
  onPick,
}: {
  tiles: Tile<T>[];
  onPick: (id: T) => void;
}) {
  return (
    <nav
      aria-label="What to show"
      /* A scrolling row on a phone, five across from a tablet up. */
      className="fade-up -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0"
    >
      {tiles.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={t.on}
          title={t.blurb}
          onClick={() => onPick(t.id)}
          className={`min-w-[104px] shrink-0 rounded-2xl border px-3 py-2.5 text-left transition-colors sm:min-w-0 ${
            t.on ? "border-accent/70 bg-accent-soft/60" : "border-line/50 bg-white hover:border-ink/40"
          }`}
        >
          <span className={`flex items-center gap-1.5 ${t.on ? "text-accent-dark" : "text-muted"}`}>
            <DoodleIcon name={t.icon} size={13} />
            <span className="figures text-[19px] font-semibold leading-none text-ink">{t.count}</span>
          </span>
          <span className="mt-1.5 block text-[11px] leading-tight">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
