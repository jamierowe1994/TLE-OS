"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { FlowTag } from "@/components/Wire";
import { DIARY, KIND_META, minutesOf, type Appt } from "@/lib/diary";

/**
 * The full calendar — what the dashboard's Today box opens out into.
 *
 * The shape of a 365 week view, drawn in our style: a time grid, seven day
 * columns, appointment blocks you can click. Clicking one opens its file
 * down the right — who, where, which record it belongs to, and whether the
 * emails around it actually went, because that last question is the reason
 * an agent opens a diary at all.
 *
 * Wireframe truth: the entries are the sample book. Once sign-in lands the
 * grid reads each agent's own 365 calendar live — the header tag says so.
 */

const DAY_START = 8 * 60; // the grid runs 08:00 →
const DAY_END = 19 * 60; //             → 19:00
const PX_PER_MIN = 52 / 60; // an hour is 52px tall

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Midnight today, so day arithmetic never trips over the current time. */
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The Monday of the week `offset` weeks away from this one. */
function mondayOf(offset: number): Date {
  const d = todayStart();
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow + offset * 7);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric" });
const fmtRange = (a: Date, b: Date) =>
  `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
const fmtFull = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

function endTime(a: Appt): string {
  const end = minutesOf(a.start) + a.mins;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export default function DiaryCalendar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [week, setWeek] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWeek(0);
    setSelId(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Which offset-from-today does each visible column represent?
  const columns = useMemo(() => {
    const mon = mondayOf(week);
    const todayDow = (todayStart().getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => ({
      date: addDays(mon, i),
      offset: week * 7 + i - todayDow,
    }));
  }, [week]);

  const mon = columns[0].date;
  const sel = DIARY.find((a) => a.id === selId) ?? null;
  const gridH = (DAY_END - DAY_START) * PX_PER_MIN;
  const hours = Array.from(
    { length: (DAY_END - DAY_START) / 60 },
    (_, i) => DAY_START / 60 + i
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div className="fade-up relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        {/* ── Header: the week, and how to move through it. ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line/70 px-6 py-4">
          <DoodleIcon name="calendar" size={20} className="text-accent-dark" />
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">The diary</h2>
            <p className="text-[11.5px] text-muted">{fmtRange(mon, columns[6].date)}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <FlowTag from="Their own 365 calendar (sign-in TBC)" />
            <button
              type="button"
              onClick={() => setWeek((w) => w - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] transition-colors hover:border-ink"
              aria-label="Previous week"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setWeek(0)}
              className={`hand rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                week === 0 ? "border-accent-dark text-accent-dark" : "border-line/80 hover:border-ink"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWeek((w) => w + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] transition-colors hover:border-ink"
              aria-label="Next week"
            >
              ›
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ── The grid. ── */}
          <div className="min-w-0 flex-1 overflow-auto">
            <div className="min-w-[760px]">
              {/* Day headers — sticky, so the week survives scrolling. */}
              <div className="sticky top-0 z-10 grid grid-cols-[52px_repeat(7,1fr)] border-b border-line/70 bg-page">
                <div />
                {columns.map((c, i) => {
                  const isToday = c.offset === 0;
                  return (
                    <div
                      key={i}
                      className={`border-l border-line/40 px-2 py-2.5 text-center ${
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
                        className={`figures block text-[17px] leading-tight ${
                          isToday ? "text-accent-dark" : ""
                        }`}
                      >
                        {fmtDay(c.date)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Hours down, days across. */}
              <div className="grid grid-cols-[52px_repeat(7,1fr)]">
                {/* The time gutter. */}
                <div className="relative" style={{ height: gridH }}>
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="figures absolute right-2 -translate-y-1/2 text-[10px] text-muted"
                      style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>

                {columns.map((c, i) => {
                  const appts = DIARY.filter((a) => a.day === c.offset);
                  const isToday = c.offset === 0;
                  const past = c.offset < 0;
                  return (
                    <div
                      key={i}
                      className={`relative border-l border-line/40 ${
                        isToday ? "bg-accent-soft/20" : ""
                      }`}
                      style={{ height: gridH }}
                    >
                      {/* The hour rules. */}
                      {hours.map((h) => (
                        <span
                          key={h}
                          className="absolute inset-x-0 border-t border-line/40"
                          style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}
                        />
                      ))}

                      {appts.map((a) => {
                        const top = (minutesOf(a.start) - DAY_START) * PX_PER_MIN;
                        const h = Math.max(a.mins * PX_PER_MIN, 26);
                        const on = selId === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelId(on ? null : a.id)}
                            className={`absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 py-1 text-left transition-colors ${
                              on
                                ? "border-accent-dark bg-accent-soft"
                                : past
                                  ? "border-line/70 bg-page opacity-60 hover:opacity-100"
                                  : "border-accent-dark/40 bg-accent-soft/55 hover:border-accent-dark"
                            }`}
                            style={{ top: top + 1, height: h - 2 }}
                          >
                            <span className="figures block text-[9px] leading-none text-accent-dark">
                              {a.start}
                            </span>
                            <span className="hand block truncate text-[10.5px] leading-tight">
                              {a.what.replace(/^[^—]+—\s*/, "")}
                            </span>
                            {h > 44 && (
                              <span className="block truncate text-[9px] text-muted">{a.who}</span>
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

          {/* ── The appointment's file, down the right. ── */}
          {sel && (
            <aside className="fade-up w-[290px] shrink-0 overflow-y-auto border-l border-line/70 px-5 py-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent-dark">
                  <DoodleIcon name={KIND_META[sel.kind].icon} size={12} />
                  {KIND_META[sel.kind].label}
                </span>
                <button
                  type="button"
                  onClick={() => setSelId(null)}
                  className="text-[11px] text-muted transition-colors hover:text-ink"
                >
                  ✕
                </button>
              </div>

              <h3 className="mt-3 text-[16px] leading-snug">{sel.what}</h3>
              <p className="mt-1 text-[11.5px] text-muted">
                {fmtFull(addDays(todayStart(), sel.day))}
              </p>
              <p className="figures text-[12.5px] text-accent-dark">
                {sel.start} – {endTime(sel)}
              </p>

              <dl className="mt-4 space-y-2.5 border-t border-line/60 pt-4 text-[12px]">
                <div className="flex gap-2">
                  <dt className="w-[52px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Where
                  </dt>
                  <dd>{sel.where}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-[52px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    With
                  </dt>
                  <dd>{sel.who}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-[52px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Agent
                  </dt>
                  <dd>{sel.agent}</dd>
                </div>
              </dl>

              {/* Did the emails actually go? The question the diary answers. */}
              <div className="mt-4 border-t border-line/60 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Messages around this
                </p>
                <ul className="mt-2.5 space-y-2">
                  {sel.comms.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-[11.5px]">
                      <span
                        className={`mt-px flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[8px] ${
                          c.done
                            ? "border-accent-dark bg-accent-soft text-accent-dark"
                            : "border-line text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span className={c.done ? "" : "text-muted"}>
                        {c.label}
                        {!c.done && (
                          <span className="ml-1.5 text-[9.5px] font-semibold text-accent-dark">
                            NOT SENT
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {sel.link && (
                <Link
                  href={sel.link.href}
                  onClick={onClose}
                  className="press-ring mt-5 flex items-center justify-center gap-2 rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-page"
                >
                  <DoodleIcon name="folder" size={14} />
                  Open the file — {sel.link.label}
                </Link>
              )}

              <p className="mt-4 text-[10px] leading-relaxed text-muted">
                Booked through TLE OS. Once sign-in lands, this reads the agent&apos;s
                own 365 calendar live — same grid, real entries.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
