"use client";

import { minutesOf } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import { dayKey } from "@/lib/weather";
import { milesBetween } from "@/components/PeopleFilter";

/**
 * THE week grid — one calendar view for the whole OS. The diary modal reads
 * it, and the booking flows write into it: pass `onPick` and every empty
 * half-hour becomes a target, with the chosen slot drawn as a solid block
 * among the real appointments. Booking against the week you can SEE is the
 * whole point — the clash is visible before it's made.
 */

const DAY_START = 8 * 60; // 08:00 →
const DAY_END = 19 * 60; //        → 19:00
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The 7 offsets-from-today of the week `week` weeks away, Monday-first. */
export function weekOffsets(week: number): { date: Date; offset: number }[] {
  const t = todayStart();
  const dow = (t.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const offset = week * 7 + i - dow;
    const date = new Date(t);
    date.setDate(date.getDate() + offset);
    return { date, offset };
  });
}

export type Wx = { glyph: string; temp: number; word: string };

export default function DiaryGrid({
  week,
  hourPx = 52,
  selApptId = null,
  onAppt,
  pick = null,
  onPick,
  pickLabel = "New",
  origin = null,
  weather,
}: {
  week: number;
  /** Vertical scale — the booker runs slightly tighter than the diary. */
  hourPx?: number;
  selApptId?: string | null;
  onAppt?: (id: string) => void;
  /** The slot being booked, if any. */
  pick?: { day: number; slot: string } | null;
  /** Present = the grid is a PICKER: clicks on empty space choose a slot. */
  onPick?: (day: number, slot: string) => void;
  pickLabel?: string;
  /** Where the new appointment will be — appointments then say how far away
   *  they are, because a day is planned by drive, not by gaps. */
  origin?: { lat: number; lng: number } | null;
  /** Per-day forecast, keyed by lib/weather dayKey — big, in the header. */
  weather?: Record<string, Wx | undefined>;
}) {
  const { appts: DIARY } = useDiary();
  const PX = hourPx / 60;
  const columns = weekOffsets(week);
  const gridH = (DAY_END - DAY_START) * PX;
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);

  function pickAt(e: React.MouseEvent<HTMLDivElement>, offset: number) {
    if (!onPick || offset < 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = DAY_START + (e.clientY - rect.top) / PX;
    const snapped = Math.max(DAY_START, Math.min(DAY_END - 30, Math.round(mins / 30) * 30));
    onPick(offset, `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`);
  }

  return (
    <div className="min-w-[720px]">
      {/* Day headers — sticky, so the week survives scrolling. */}
      <div className="sticky top-0 z-10 grid grid-cols-[52px_repeat(7,1fr)] border-b border-line/70 bg-page">
        <div />
        {columns.map((c, i) => {
          const isToday = c.offset === 0;
          const wx = weather?.[dayKey(c.date)];
          return (
            <div
              key={i}
              className={`border-l border-line/40 px-2 py-2 text-center ${
                isToday ? "bg-accent-soft/40" : ""
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  isToday ? "text-accent-dark" : "text-muted"
                }`}
              >
                {DAY_NAMES[i]}
              </span>
              <span
                className={`figures block text-[17px] leading-tight ${isToday ? "text-accent-dark" : ""}`}
              >
                {c.date.getDate()}
              </span>
              {/* The sky, big, where it informs the choice. */}
              {wx && c.offset >= 0 && (
                <span className="mt-0.5 block leading-none" title={wx.word}>
                  <span className="text-[17px]">{wx.glyph}</span>
                  <span className="figures ml-1 text-[10.5px] text-muted">{wx.temp}°</span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Hours down, days across. */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)]">
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

        {columns.map((c, i) => {
          const appts = DIARY.filter((a) => a.day === c.offset);
          const isToday = c.offset === 0;
          const past = c.offset < 0;
          const pickable = Boolean(onPick) && !past;
          const picked = pick && pick.day === c.offset ? pick : null;
          return (
            <div
              key={i}
              onClick={(e) => pickAt(e, c.offset)}
              className={`relative border-l border-line/40 ${isToday ? "bg-accent-soft/20" : ""} ${
                pickable ? "cursor-copy" : ""
              } ${onPick && past ? "opacity-40" : ""}`}
              style={{ height: gridH }}
            >
              {hours.map((h) => (
                <span
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-line/40"
                  style={{ top: (h * 60 - DAY_START) * PX }}
                />
              ))}

              {appts.map((a) => {
                const top = (minutesOf(a.start) - DAY_START) * PX;
                const h = Math.max(a.mins * PX, 26);
                const on = selApptId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppt?.(a.id);
                    }}
                    className={`absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 py-1 text-left transition-colors ${
                      on
                        ? "border-accent-dark bg-accent-soft"
                        : past
                          ? "border-line/70 bg-page opacity-60 hover:opacity-100"
                          : "border-accent-dark/40 bg-accent-soft/55 hover:border-accent-dark"
                    } ${onPick ? "pointer-events-none" : ""}`}
                    style={{ top: top + 1, height: h - 2 }}
                  >
                    <span className="figures block text-[9px] leading-none text-accent-dark">
                      {a.start}
                    </span>
                    <span className="hand block truncate text-[10.5px] leading-tight">
                      {a.what.replace(/^[^—]+—\s*/, "")}
                    </span>
                    {h > 44 && (
                      <span className="block truncate text-[9px] text-muted">
                        {origin && a.lat != null && a.lng != null
                          ? `${Math.round(milesBetween(origin, { lat: a.lat, lng: a.lng }))} mi away · ${a.who}`
                          : a.who}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* The slot being booked — solid, unmistakably yours. */}
              {picked && (
                <div
                  className="pointer-events-none absolute inset-x-1 z-10 rounded-lg bg-accent-dark px-1.5 py-1 text-page shadow-[0_8px_18px_-8px_rgba(0,0,0,0.4)]"
                  style={{ top: (minutesOf(picked.slot) - DAY_START) * PX + 1, height: Math.max(30 * PX, 26) }}
                >
                  <span className="figures block text-[9px] leading-none">{picked.slot}</span>
                  <span className="hand block truncate text-[10.5px] leading-tight">{pickLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
