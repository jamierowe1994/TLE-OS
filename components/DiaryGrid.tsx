"use client";

import { minutesOf } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import { dayKey } from "@/lib/weather";
import { milesBetween } from "@/components/PeopleFilter";

/**
 * NOTE on clicks: in a pure BOOKING flow (onPick with no onAppt) the
 * appointments are inert, because every click there means "put it here".
 * The diary passes both — a block opens its record, empty space starts
 * something new — so blocks must stay clickable.
 *
 * THE week grid — one calendar view for the whole OS. The diary modal reads
 * it, and the booking flows write into it: pass `onPick` and every empty
 * half-hour becomes a target, with the chosen slot drawn as a solid block
 * among the real appointments. Booking against the week you can SEE is the
 * whole point — the clash is visible before it's made.
 */

/**
 * The day the grid always shows. It is a FLOOR, not a cage: if the week
 * holds a 20:00 viewing or a 05:00 start, the window stretches to include
 * it. An appointment that exists and can't be seen is worse than a long
 * scroll — that's how somebody misses a job that's actually in the diary.
 */
const BASE_START = 8 * 60; // 08:00 →
const BASE_END = 19 * 60; //        → 19:00
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


/**
 * Where each appointment sits across the width of its day.
 *
 * Every block used to be full-width, so two viewings an hour apart with a
 * 90-minute first one simply buried each other — which is exactly what a
 * busy Monday looks like in this book. Overlapping appointments are grouped
 * into clusters and dealt lanes, so a clash is something you can SEE rather
 * than something hidden underneath.
 */
const MAX_LANES = 4;

function laneMap(appts: { id: string; start: string; mins: number }[]) {
  const sorted = [...appts].sort(
    (a, b) => minutesOf(a.start) - minutesOf(b.start) || b.mins - a.mins
  );
  const out = new Map<string, { lane: number; lanes: number; hidden?: boolean }>();
  let cluster: typeof sorted = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    for (const a of cluster) {
      const s = minutesOf(a.start);
      const e = s + a.mins;
      let lane = laneEnds.findIndex((end) => end <= s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e);
      } else laneEnds[lane] = e;
      out.set(a.id, { lane, lanes: 1 });
    }
    // A genuinely stacked morning can want ten lanes, and ten lanes is ten
    // slivers with one letter in each. Past four, the extras fold into a
    // "+N" on the last lane — the day still says it's busy, and the detail
    // is one click away rather than shredded across the column.
    const lanes = Math.min(laneEnds.length, MAX_LANES);
    for (const a of cluster) {
      const seat = out.get(a.id)!;
      seat.lanes = lanes;
      if (seat.lane >= MAX_LANES) seat.hidden = true;
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const a of sorted) {
    const s = minutesOf(a.start);
    const e = s + a.mins;
    if (cluster.length && s < clusterEnd) {
      cluster.push(a);
      clusterEnd = Math.max(clusterEnd, e);
    } else {
      flush();
      cluster = [a];
      clusterEnd = e;
    }
  }
  flush();
  return out;
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
  /** How long the booking runs. Half an hour is where every appointment
   *  starts; an appraisal on a four-bed is not a half-hour job. */
  pickMins = 30,
  onPickMins,
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
  pickMins?: number;
  /** Present = the picked block grows a handle and can be dragged longer. */
  onPickMins?: (mins: number) => void;
  /** Where the new appointment will be — appointments then say how far away
   *  they are, because a day is planned by drive, not by gaps. */
  origin?: { lat: number; lng: number } | null;
  /** Per-day forecast, keyed by lib/weather dayKey — big, in the header. */
  weather?: Record<string, Wx | undefined>;
}) {
  const { appts: DIARY } = useDiary();
  const columns = weekOffsets(week);

  // The window: the base day, widened to hold anything outside it.
  const visible = columns.flatMap((c) => DIARY.filter((a) => a.day === c.offset));
  const earliest = visible.reduce((m, a) => Math.min(m, minutesOf(a.start)), BASE_START);
  const latest = visible.reduce((m, a) => Math.max(m, minutesOf(a.start) + a.mins), BASE_END);
  const DAY_START = Math.floor(earliest / 60) * 60;
  const DAY_END = Math.ceil(latest / 60) * 60;

  const PX = hourPx / 60;
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
          // Overlapping appointments share the column rather than burying
          // one another — a clash you can see is a clash you can fix.
          const lanes = laneMap(appts);
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

              {(() => {
                const over = appts.filter((a) => lanes.get(a.id)?.hidden).length;
                if (!over) return null;
                return (
                  <span className="pointer-events-none absolute right-1 top-1 z-20 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-semibold text-page">
                    +{over}
                  </span>
                );
              })()}
              {appts.map((a) => {
                const top = (minutesOf(a.start) - DAY_START) * PX;
                const h = Math.max(a.mins * PX, 26);
                const seat = lanes.get(a.id) ?? { lane: 0, lanes: 1, hidden: false };
                if (seat.hidden) return null;
                const widthPct = 100 / seat.lanes;
                const on = selApptId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppt?.(a.id);
                    }}
                    style={{
                      top: top + 1,
                      height: h - 2,
                      left: `calc(${seat.lane * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                    className={`absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left transition-colors ${
                      on
                        ? "border-accent-dark bg-accent-soft"
                        : past
                          ? "border-line/70 bg-page opacity-60 hover:opacity-100"
                          : "border-accent-dark/40 bg-accent-soft/55 hover:border-accent-dark"
                    } ${onPick && !onAppt ? "pointer-events-none" : ""}`}
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

              {/* The slot being booked — solid, unmistakably yours, and
                  STRETCHABLE. Half an hour is where every booking starts and
                  almost no appraisal actually is one; making the length a
                  thing you drag rather than a field you fill is the whole
                  point of booking on a calendar instead of in a form. */}
              {picked && (
                <div
                  className="absolute inset-x-1 z-10 rounded-lg bg-accent-dark px-1.5 py-1 text-page shadow-[0_8px_18px_-8px_rgba(0,0,0,0.4)]"
                  style={{
                    top: (minutesOf(picked.slot) - DAY_START) * PX + 1,
                    height: Math.max(pickMins * PX, 26),
                    pointerEvents: onPickMins ? "auto" : "none",
                  }}
                >
                  <span className="figures block text-[9px] leading-none">{picked.slot}</span>
                  <span className="hand block truncate text-[10.5px] leading-tight">{pickLabel}</span>
                  {pickMins !== 30 && (
                    <span className="figures absolute right-1.5 top-1 text-[9px] leading-none opacity-80">
                      {pickMins >= 60
                        ? `${Math.floor(pickMins / 60)}h${pickMins % 60 ? ` ${pickMins % 60}m` : ""}`
                        : `${pickMins}m`}
                    </span>
                  )}

                  {onPickMins && (
                    /* Pointer events, not mouse: the same handler then works
                       under a finger, and setPointerCapture means the drag
                       survives the cursor leaving the little handle — which
                       it does immediately, because the handle is 10px tall
                       and the gesture is vertical. */
                    <div
                      role="separator"
                      aria-label="Drag to change how long"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const el = e.currentTarget;
                        el.setPointerCapture(e.pointerId);
                        const startY = e.clientY;
                        const startMins = pickMins;
                        const move = (ev: PointerEvent) => {
                          const delta = (ev.clientY - startY) / PX;
                          // Snapped to the quarter hour: a diary that can hold
                          // 47 minutes is a diary nobody trusts.
                          const next = Math.round((startMins + delta) / 15) * 15;
                          onPickMins(Math.min(240, Math.max(15, next)));
                        };
                        const up = () => {
                          el.removeEventListener("pointermove", move);
                          el.removeEventListener("pointerup", up);
                        };
                        el.addEventListener("pointermove", move);
                        el.addEventListener("pointerup", up);
                      }}
                      className="absolute inset-x-0 -bottom-1 flex h-3 cursor-ns-resize items-end justify-center"
                    >
                      <span className="h-1 w-7 rounded-full bg-page/70" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
