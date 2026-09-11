"use client";

import DoodleIcon from "@/components/DoodleIcon";

/**
 * The row of stages across the top of a board, and the filter for it.
 *
 * ── Why this is a component and not three copies ──────────────────────────
 *
 * Market Appraisals drew it, Applications drew a read-only "Pipeline" that
 * looked similar and did nothing when clicked, and Listings had a different
 * shape again. James, 10 September 2026: "everything has a slightly different
 * view... we shouldn't be crossing the styles every time they click onto a
 * new screen." Three boards asking the same question - how many are at each
 * stage, now show me those - should not be three answers.
 *
 * The counts are the reason to look, so they are the biggest thing in each
 * box rather than a number tucked after a word. The chevrons say these are a
 * sequence rather than a menu; a board whose stages are NOT a journey passes
 * `flow={false}` and gets plain tabs.
 *
 * Not to be confused with StageSpine, which draws ONE record's progress
 * through its stages. This draws the whole board's, and each stop is a filter.
 *
 * Deliberately not percentage deltas. We hold no previous period to compare
 * against, and an invented "up 20%" on a screen somebody uses to decide who
 * to ring is worse than no figure at all.
 */

export type StageTab<T extends string> = {
  id: T;
  label: string;
  icon: string;
  count: number;
  /** One line on hover. What sitting at this stage actually means. */
  blurb?: string;
};

export default function StageTabs<T extends string>({
  stages,
  value,
  onChange,
  /** The id that means "everything still in play". Clicking the stage that is
   *  already on returns here, so a filter can always be taken off without
   *  hunting for the way back. */
  allId,
  flow = true,
  label = "Stages",
}: {
  stages: StageTab<T>[];
  value: T;
  onChange: (id: T) => void;
  allId: T;
  flow?: boolean;
  label?: string;
}) {
  return (
    <nav
      className="fade-up mt-4 -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1"
      aria-label={label}
    >
      {stages.map((st, i, arr) => {
        const on = value === st.id;
        return (
          <div key={st.id} className="flex shrink-0 items-center">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on && st.id !== allId ? allId : st.id)}
              title={st.blurb}
              className={`min-w-[124px] rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                on
                  ? "border-accent-dark bg-accent-soft/60"
                  : "border-line/80 bg-panel hover:border-ink/40"
              }`}
            >
              <span className={`flex items-center gap-1.5 ${on ? "text-accent-dark" : "text-muted"}`}>
                <DoodleIcon name={st.icon} size={14} />
                <span className="figures text-[19px] font-semibold leading-none text-ink">
                  {st.count}
                </span>
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-tight">{st.label}</span>
            </button>
            {flow && i < arr.length - 1 && (
              <span aria-hidden className="px-1.5 text-[11px] text-muted/50">
                &rsaquo;
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
