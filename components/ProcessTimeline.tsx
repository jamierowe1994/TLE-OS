"use client";

import DoodleIcon from "@/components/DoodleIcon";
import type { JourneyStep } from "@/lib/journey";

/**
 * Where this lead is up to, drawn as a track.
 *
 * It sits directly under the contact details because "who is this and where
 * are we with them" is one question, not two — you should never have to open
 * a tab to find out whether somebody has been sent anything.
 *
 * Steps are clickable, but stepping FORWARD from here is deliberately not the
 * main route: the Next-action card carries the real button, because moving to
 * "viewing booked" ought to mean a viewing actually got booked. Clicking the
 * rail is for correcting a mistake, which is why going back is unrestricted
 * and jumping ahead more than one step is not allowed.
 */

export interface Branch {
  label: string;
  /** Indices of the steps the branch hangs off (first and last). */
  from: number;
  to: number;
  /** The lead is ON the branch. */
  active: boolean;
  /** Whether the branch can be taken from here. */
  available: boolean;
  onClick: () => void;
  hint?: string;
}

export default function ProcessTimeline({
  steps,
  current,
  onPick,
  stalled,
  doneAt,
  pickAny,
  branch,
}: {
  steps: JourneyStep[];
  current: number;
  onPick: (index: number) => void;
  stalled?: boolean;
  /**
   * Which steps are ticked. Default: everything before `current`. A DERIVED
   * spine passes its own answer, so a step that was skipped - the landlord
   * who booked on the first call was never emailed - stays hollow rather
   * than being ticked by position.
   */
  doneAt?: (index: number) => boolean;
  /** Let any step be picked, for reading it - the derived spine cannot be
   *  moved by hand, so there is nothing to protect. */
  pickAny?: boolean;
  /**
   * The losing branch, drawn under the steps it splits from: a dashed drop
   * to a pill. James, 23 Aug: "Nurture is a SPLIT, not a failure" - the
   * agent should see the fork while they are still on it.
   */
  branch?: Branch;
}) {
  const isDone = (i: number) => (doneAt ? doneAt(i) : i < current);
  return (
    <div className={stalled ? "opacity-45 grayscale" : undefined}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Process
        </p>
        <p className="figures text-[11px] text-muted">
          Step {current + 1} of {steps.length}
          {stalled && " · stopped"}
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-[560px] items-start">
          {steps.map((s, i) => {
            const done = isDone(i);
            const here = i === current;
            const reachable = pickAny || i <= current + 1;
            return (
              <li key={s.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                {/* The rail. Drawn as two half-segments per step so the line
                    can change from solid (walked) to dashed (still to come)
                    at the dot itself rather than between dots. */}
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`absolute right-1/2 top-[13px] h-px w-full ${
                      i <= current ? "bg-accent-dark" : "border-t border-dashed border-line"
                    }`}
                  />
                )}

                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => onPick(i)}
                  title={reachable ? s.title : "Finish the step you're on first"}
                  className="group relative z-[1] flex flex-col items-center gap-2 px-1 disabled:cursor-not-allowed"
                >
                  <span
                    className={`flex items-center justify-center rounded-full border-[1.5px] transition-all ${
                      here
                        ? "h-[27px] w-[27px] border-accent-dark bg-accent-dark text-page shadow-[0_0_0_4px_var(--accent-soft)]"
                        : done
                          ? "h-[21px] w-[21px] border-accent-dark bg-accent-soft text-accent-dark"
                          : "h-[21px] w-[21px] border-line bg-page text-muted group-enabled:group-hover:border-ink/40"
                    }`}
                  >
                    {done ? (
                      <span className="text-[10px] font-bold">✓</span>
                    ) : (
                      <DoodleIcon name={s.icon} size={here ? 14 : 11} />
                    )}
                  </span>
                  <span
                    className={`max-w-[86px] text-center text-[10.5px] leading-tight ${
                      here ? "hand text-[12px] text-ink" : done ? "text-muted" : "text-muted/70"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {branch && (
          <div className="relative mt-1 min-w-[560px]">
            {/* The drop: from the middle of the span the branch hangs off, down to the pill. */}
            <div
              className="absolute top-0 flex flex-col items-center"
              style={{
                left: `${((branch.from + 0.5) / steps.length) * 100}%`,
                width: `${((branch.to - branch.from) / steps.length) * 100}%`,
              }}
            >
              <span
                aria-hidden
                className={`h-px w-full border-t border-dashed ${branch.active ? "border-accent-dark" : "border-line"}`}
              />
              <span
                aria-hidden
                className={`h-4 w-px border-l border-dashed ${branch.active ? "border-accent-dark" : "border-line"}`}
              />
              <button
                type="button"
                onClick={branch.onClick}
                disabled={!branch.available && !branch.active}
                title={branch.hint}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[10.5px] transition-colors disabled:cursor-not-allowed ${
                  branch.active
                    ? "border-accent-dark bg-accent-dark font-semibold text-page"
                    : branch.available
                      ? "border-dashed border-line text-muted hover:border-ink/40 hover:text-ink"
                      : "border-dashed border-line/60 text-muted/50"
                }`}
              >
                <DoodleIcon name="clock" size={11} />
                {branch.label}
              </button>
            </div>
            <div className="h-12" />
          </div>
        )}
      </div>
    </div>
  );
}
