"use client";

import DoodleIcon from "@/components/DoodleIcon";
import { laneMap } from "@/components/DiaryGrid";
import { minutesOf, type Appt } from "@/lib/diary";
import {
  block,
  card,
  dateOfOffset,
  endTime,
  lengthLabel,
  primary,
  subjectOf,
  toneOf,
} from "@/components/viewings/shared";

/**
 * The next seven days, hour by hour.
 *
 * "Next 7 days" used to switch you to the list. James, 11 Sep 2026: "rather
 * than it taking us to a different view, it should expand the calendar and
 * then show the next 7 days, but in more detail." So this is the calendar,
 * opened out: today and the six days after it as columns, the hours down the
 * side, every block clickable through to its quick look.
 *
 * Rolling from TODAY, not Monday-to-Sunday: on a Thursday the question is
 * "what have I got between now and next Wednesday", and a grid that starts
 * three days ago answers something else.
 *
 * Same window rules as the shared week grid: 08:00-19:00 as a floor,
 * widened by timed entries, never past 06:00-22:00; all-day entries are
 * chips under the day, not blocks at midnight.
 */

const BASE_START = 8 * 60;
const BASE_END = 19 * 60;
const FLOOR = 6 * 60;
const CEILING = 22 * 60;
const HOUR_PX = 56;

export default function WeekGrid({
  appts,
  onOpen,
  onPrint,
  onPickDay,
}: {
  /** Already narrowed to the person and kinds being looked at. */
  appts: Appt[];
  onOpen: (a: Appt) => void;
  onPrint: () => void;
  onPickDay: (offset: number) => void;
}) {
  const columns = Array.from({ length: 7 }, (_, i) => ({ offset: i, date: dateOfOffset(i) }));
  const visible = appts.filter((a) => a.day >= 0 && a.day <= 6);
  const timed = visible.filter((a) => !a.allDay);
  const earliest = timed.reduce((m, a) => Math.min(m, minutesOf(a.start)), BASE_START);
  const latest = timed.reduce((m, a) => Math.max(m, minutesOf(a.start) + a.mins), BASE_END);
  const DAY_START = Math.max(FLOOR, Math.floor(earliest / 60) * 60);
  const DAY_END = Math.min(CEILING, Math.ceil(latest / 60) * 60);
  const PX = HOUR_PX / 60;
  const gridH = (DAY_END - DAY_START) * PX;
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);

  /* Where "now" falls, for the line across today. */
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop = nowMins >= DAY_START && nowMins <= DAY_END ? (nowMins - DAY_START) * PX : null;

  return (
    <section className={`fade-up ${card} p-5`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/60 pb-3">
        <h2 className="hand text-[17px] leading-tight">The next 7 days</h2>
        <span className="text-[11px] text-muted">
          {columns[0].date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} –{" "}
          {columns[6].date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {visible.length} {visible.length === 1 ? "appointment" : "appointments"}
          </span>
          <button type="button" onClick={onPrint} className={primary} title="Print the week as a run sheet">
            <DoodleIcon name="doc" size={13} />
            Print
          </button>
        </span>
      </div>

      {/* Scrolls inside its own box, so the page stays a page. */}
      <div className="mt-3 max-h-[540px] overflow-auto rounded-xl border border-line/50">
        <div className="min-w-[760px]">
          <div className="sticky top-0 z-10 grid grid-cols-[48px_repeat(7,1fr)] border-b border-line/60 bg-white">
            <div />
            {columns.map((c) => {
              const isToday = c.offset === 0;
              const allDay = visible.filter((a) => a.day === c.offset && a.allDay);
              return (
                <button
                  key={c.offset}
                  type="button"
                  onClick={() => onPickDay(c.offset)}
                  title="Open this day"
                  className={`border-l border-line/40 px-2 py-2 text-center transition-colors hover:bg-panel ${
                    isToday ? "bg-accent-soft/40" : ""
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isToday ? "text-accent-dark" : "text-muted"}`}>
                    {isToday ? "Today" : c.date.toLocaleDateString("en-GB", { weekday: "short" })}
                  </span>
                  <span className={`figures block text-[17px] font-semibold leading-tight ${isToday ? "text-accent-dark" : ""}`}>
                    {c.date.getDate()}
                  </span>
                  {allDay.map((a) => (
                    <span
                      key={a.id}
                      title={[a.what, a.where, a.who].filter(Boolean).join(" · ")}
                      className="mt-1 block truncate rounded-md border border-line/60 bg-panel px-1 py-0.5 text-[9px] leading-tight text-muted"
                    >
                      {a.what}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[48px_repeat(7,1fr)]">
            <div className="relative" style={{ height: gridH }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className="figures absolute right-2 -translate-y-1/2 text-[10px] text-muted"
                  style={{ top: (h * 60 - DAY_START) * PX }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>

            {columns.map((c) => {
              const dayAppts = visible.filter((a) => a.day === c.offset && !a.allDay);
              const lanes = laneMap(dayAppts);
              const over = dayAppts.filter((a) => lanes.get(a.id)?.hidden).length;
              const isToday = c.offset === 0;
              return (
                <div
                  key={c.offset}
                  className={`relative border-l border-line/40 ${isToday ? "bg-accent-soft/15" : ""}`}
                  style={{ height: gridH }}
                >
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-line/30"
                      style={{ top: (h * 60 - DAY_START) * PX }}
                    />
                  ))}
                  {isToday && nowTop !== null && (
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-brown/70" style={{ top: nowTop }}>
                      <span className="absolute -left-[3px] -top-[4px] size-[7px] rounded-full bg-brown" />
                    </span>
                  )}
                  {over > 0 && (
                    <span className="pointer-events-none absolute right-1 top-1 z-20 rounded-full bg-brown px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      +{over}
                    </span>
                  )}
                  {dayAppts.map((a) => {
                    const seat = lanes.get(a.id) ?? { lane: 0, lanes: 1, hidden: false };
                    if (seat.hidden) return null;
                    const rawTop = (minutesOf(a.start) - DAY_START) * PX;
                    const top = Math.max(0, Math.min(rawTop, gridH - 26));
                    const h = Math.max(Math.min(a.mins * PX, gridH - top), 26);
                    const widthPct = 100 / seat.lanes;
                    const isTravel = a.kind === "travel";
                    /* Gone by, on today's column: quiet. */
                    const past = isToday && minutesOf(a.start) + a.mins < nowMins;
                    const b = block(toneOf(a.kind), past);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        title={[
                          `${a.start}–${endTime(a)} (${lengthLabel(a.mins)})`,
                          a.what,
                          a.where,
                          a.who && `With ${a.who}`,
                        ]
                          .filter(Boolean)
                          .join("\n")}
                        onClick={() => onOpen(a)}
                        style={{
                          top: top + 1,
                          height: h - 2,
                          left: `calc(${seat.lane * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          ...b.style,
                        }}
                        className={`absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left transition-[filter] hover:brightness-95 ${b.className}`}
                      >
                        <span className={`figures block text-[9px] font-semibold leading-none ${isTravel ? "text-muted" : ""}`}>{a.start}</span>
                        <span className="block truncate text-[10.5px] font-semibold leading-tight">{subjectOf(a)}</span>
                        {h > 44 && !isTravel && (a.who || a.where) && (
                          <span className="block truncate text-[9px] text-muted">{a.who || a.where}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[10.5px] text-muted">Click a block to see what it is. Click a day to open it beside the month.</p>
    </section>
  );
}
