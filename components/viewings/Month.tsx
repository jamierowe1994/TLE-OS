"use client";

import { useMemo } from "react";
import type { Appt } from "@/lib/diary";
import { DAY_NAMES, card, offsetOf, todayStart } from "@/components/viewings/shared";

/**
 * The month. One card, the days as a grid, a dot or a count under each day
 * for what is in it. Clicking a day puts it in the panel beside this card;
 * nothing else happens here, because a calendar that also filters and also
 * navigates is a calendar nobody trusts.
 */
export default function Month({
  byDay,
  selected,
  onSelect,
  monthShift,
  onMonthShift,
}: {
  byDay: Map<number, Appt[]>;
  /** The day open in the panel, as an offset from today. */
  selected: number;
  onSelect: (offset: number) => void;
  /** Which month is on screen, in months from this one. */
  monthShift: number;
  onMonthShift: (shift: number) => void;
}) {
  /** The grid: whole weeks, Monday first, covering the shown month. */
  const { cells, monthLabel } = useMemo(() => {
    const anchor = todayStart();
    // Day 1 of the shown month - set the date BEFORE the month, or the 31st
    // of a long month rolls the short one it lands in forward by a month.
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + monthShift, 1);
    const lead = (first.getDay() + 6) % 7; // Mon = 0
    const start = new Date(first);
    start.setDate(1 - lead);
    const out: { date: Date; offset: number; thisMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({ date: d, offset: offsetOf(d), thisMonth: d.getMonth() === first.getMonth() });
    }
    // Six rows always fits; five is enough for most months and a trailing
    // blank week reads as a fault, so drop it when it is genuinely empty.
    const rows = out.slice(35).every((c) => !c.thisMonth) ? out.slice(0, 35) : out;
    return {
      cells: rows,
      monthLabel: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }, [monthShift]);

  const nav =
    "flex size-7 items-center justify-center rounded-full border border-line/60 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink";

  return (
    <section className={`fade-up ${card} p-5`}>
      <div className="flex items-center gap-2">
        <h2 className="hand whitespace-nowrap text-[17px] leading-none">{monthLabel}</h2>
        <div className="ml-1 flex items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => onMonthShift(monthShift - 1)} className={nav}>
            ‹
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthShift(monthShift + 1)} className={nav}>
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onMonthShift(0);
            onSelect(0);
          }}
          className="ml-auto rounded-full border border-line/60 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink"
        >
          Today
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/80">
        {DAY_NAMES.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {cells.map((c) => {
          const n = byDay.get(c.offset)?.length ?? 0;
          const isToday = c.offset === 0;
          const isSel = c.offset === selected;
          return (
            <button
              key={c.offset}
              type="button"
              onClick={() => onSelect(c.offset)}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${c.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${n ? `, ${n} in the diary` : ""}`}
              className="group flex flex-col items-center gap-[3px] py-1.5"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full text-[12.5px] transition-colors ${
                  isSel
                    ? "bg-brown font-semibold text-white"
                    : isToday
                      ? "font-semibold text-accent-dark ring-1 ring-accent-dark/70 group-hover:bg-accent-soft/50"
                      : c.thisMonth
                        ? "text-ink group-hover:bg-panel"
                        : "text-muted/40 group-hover:bg-panel"
                }`}
              >
                {c.date.getDate()}
              </span>
              {/* One dot per appointment up to three, then a count - a row
                  of eight dots is a smudge, not information. */}
              <span className="flex h-[6px] items-center gap-[3px]">
                {n > 3 ? (
                  <span className="figures text-[8.5px] font-bold leading-none text-accent-dark">{n}</span>
                ) : (
                  Array.from({ length: n }, (_, i) => (
                    <span key={i} className="size-[4px] rounded-full bg-accent-dark" />
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
