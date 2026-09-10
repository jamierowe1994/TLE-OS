"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { KIND_META, minutesOf, type Appt } from "@/lib/diary";

/**
 * The month, and one day out of it.
 *
 * The diary list answers "what is left today". This answers the other
 * question an agent actually opens a calendar for — "what have I got on the
 * 23rd" — which a list of today's rows cannot answer at all (James, 10 Sep
 * 2026). So the month is the DEFAULT shape of the Viewings page and the list
 * is the alternative, not the other way round.
 *
 * Everything here is derived from `new Date()` at render and from the diary's
 * own day offsets. There is no month literal anywhere in this file: open it
 * on the 31st of December and it rolls into January on its own, which is the
 * standing rule and the thing that has bitten this stack before.
 *
 * It shows every KIND of appointment, not only viewings — an agent's day is
 * viewings, appraisals, travel and the private entries in between, and a
 * calendar that hides four of those is lying about how full the day is.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * How many of a day's appointments are drawn before you ask for more.
 *
 * A real agent's Thursday came back from REX with 32 entries on it, which
 * drew a list longer than the month beside it and pushed everything under it
 * off the screen (James, 10 Sep 2026). Six is about a screenful next to the
 * calendar, and the rest are one press away rather than gone.
 */
const PAGE = 6;

/** Midnight today, so day arithmetic never trips over the current time. */
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Days between two midnights — the diary's own unit. */
function offsetOf(d: Date): number {
  return Math.round((d.getTime() - todayStart().getTime()) / 86_400_000);
}

function dateOfOffset(offset: number): Date {
  const d = todayStart();
  d.setDate(d.getDate() + offset);
  return d;
}

const fmtFull = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Today" / "Tomorrow" / "Yesterday", or nothing — a badge, not the heading. */
function nearLabel(offset: number): string | null {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return null;
}

/** The property out of "Viewing — 41 Harewood Road". */
function subjectOf(a: Appt): string {
  return a.what.replace(/^[^—]+—\s*/, "");
}

/**
 * One appointment in the day panel.
 *
 * A viewing opens its drawer. Anything else opens the record it belongs to if
 * it has one, and otherwise is a plain row: an appraisal with no link and a
 * "Busy" block from someone's own calendar are both things you can only look
 * at, and a button that does nothing when pressed is worse than a line of
 * text.
 */
function DayRow({ a, onOpen }: { a: Appt; onOpen?: (a: Appt) => void }) {
  const meta = KIND_META[a.kind];
  const subject = subjectOf(a);
  const inside = (
    <>
      <span className="figures w-[52px] shrink-0 text-[12.5px] text-accent-dark">
        {a.allDay ? "All day" : a.start}
      </span>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/45">
        <DoodleIcon name={meta.icon} size={15} className="text-accent-dark" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="hand block truncate text-[13px]">{a.who || subject}</span>
        <span className="block truncate text-[10.5px] text-muted">
          {a.who ? subject : meta.label}
          {a.where ? ` · ${a.where}` : ""}
        </span>
      </span>
      {/* Tenanted is the fact that changes how an agent turns up, so it wins
          the slot on a viewing. Everything else says what it is instead. */}
      <span className="hidden shrink-0 lg:block">
        {a.kind === "viewing" && a.tenant ? (
          <Pill tone="accent">Tenanted</Pill>
        ) : (
          <Pill tone={a.kind === "viewing" ? "accent" : "neutral"}>{meta.label}</Pill>
        )}
      </span>
      <span className="hidden w-24 shrink-0 items-center gap-1.5 truncate text-[11px] text-muted xl:flex">
        <DoodleIcon name="user" size={12} className="shrink-0 opacity-70" />
        <span className="truncate">{a.agent}</span>
      </span>
      {/* Only where there is genuinely something behind the row. A chevron on
          a "Busy" block from someone's own calendar promises a door that
          isn't there. */}
      <span className="w-3 shrink-0 text-right text-[12px] text-muted">
        {(a.kind === "viewing" && onOpen) || a.link ? "›" : ""}
      </span>
    </>
  );

  const shared =
    "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors";

  return (
    <li className="border-b border-line/40 last:border-0">
      {a.kind === "viewing" && onOpen ? (
        <button type="button" onClick={() => onOpen(a)} className={`${shared} hover:bg-accent-soft/25`}>
          {inside}
        </button>
      ) : a.link ? (
        <Link href={a.link.href} className={`${shared} hover:bg-accent-soft/25`}>
          {inside}
        </Link>
      ) : (
        <span className={shared}>{inside}</span>
      )}
    </li>
  );
}

export default function DiaryMonth({
  appts,
  loading,
  onOpen,
  onOpenWeek,
}: {
  appts: Appt[];
  loading?: boolean;
  /** Open a viewing's own file. */
  onOpen?: (a: Appt) => void;
  /** The week grid, for when the month is not close enough. */
  onOpenWeek?: () => void;
}) {
  /** Which month is on screen, as an offset in months from this one. */
  const [monthShift, setMonthShift] = useState(0);
  /** Which day is open on the right, as an offset in days from today. */
  const [selected, setSelected] = useState(0);
  /** How much of that day has been asked for. Reset by every day change —
   *  "see more" is a question about THIS day, not a setting. */
  const [shown, setShown] = useState(PAGE);

  function show(offset: number) {
    setSelected(offset);
    setShown(PAGE);
  }

  /** offset → its appointments, in time order. Built once per diary. */
  const byDay = useMemo(() => {
    const m = new Map<number, Appt[]>();
    for (const a of appts) {
      const list = m.get(a.day);
      if (list) list.push(a);
      else m.set(a.day, [a]);
    }
    for (const list of m.values()) {
      // All-day entries first: they frame the day rather than sit in it.
      list.sort(
        (x, y) =>
          Number(!!y.allDay) - Number(!!x.allDay) || minutesOf(x.start) - minutesOf(y.start)
      );
    }
    return m;
  }, [appts]);

  /** The grid: whole weeks, Monday first, covering the shown month. */
  const { cells, monthLabel } = useMemo(() => {
    const anchor = todayStart();
    // Day 1 of the shown month — set the date BEFORE the month, or the 31st
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

  const selDate = dateOfOffset(selected);
  const selList = byDay.get(selected) ?? [];
  const selNear = nearLabel(selected);

  /** Today and the six days after it — the strip along the bottom. */
  const week = Array.from({ length: 7 }, (_, i) => i);
  const weekTotal = week.reduce((n, o) => n + (byDay.get(o)?.length ?? 0), 0);

  /** Jump the month view to whichever month a day lives in. */
  function pick(offset: number) {
    show(offset);
    const d = dateOfOffset(offset);
    const anchor = todayStart();
    setMonthShift((d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth()));
  }

  return (
    <div className="fade-up mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* ── The month ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line/80 bg-page p-5">
        <div className="flex items-center gap-3">
          <h2 className="whitespace-nowrap text-[17px] leading-none">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthShift((m) => m - 1)}
              className="flex size-7 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthShift((m) => m + 1)}
              className="flex size-7 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => pick(0)}
            className="hand ml-auto rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink"
          >
            Today
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 border-b border-line/70 pb-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted/70">
          {DAY_NAMES.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const n = byDay.get(c.offset)?.length ?? 0;
            /* The whole LAST ROW loses its underline, not just the last cell:
               `last:border-0` left the rule running under six days and
               stopping before Sunday, which reads as a broken table. */
            const lastRow = i >= cells.length - 7;
            const isToday = c.offset === 0;
            const isSel = c.offset === selected;
            return (
              <button
                key={c.offset}
                type="button"
                onClick={() => show(c.offset)}
                aria-current={isToday ? "date" : undefined}
                className={`group flex flex-col items-center gap-1 py-2.5 ${
                  lastRow ? "" : "border-b border-line/40"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-[12.5px] transition-colors ${
                    isSel
                      ? "bg-accent-soft font-semibold text-accent-dark"
                      : c.thisMonth
                        ? "text-ink group-hover:bg-accent-soft/40"
                        : "text-muted/40 group-hover:bg-accent-soft/25"
                  } ${isToday && !isSel ? "ring-1 ring-accent-dark/60" : ""}`}
                >
                  {c.date.getDate()}
                </span>
                {/* One dot per appointment up to three, then a count — a
                    row of eight dots is a smudge, not information. */}
                <span className="flex h-[5px] items-center gap-[3px]">
                  {n > 3 ? (
                    <span className="figures text-[8.5px] font-bold leading-none text-accent-dark">
                      {n}
                    </span>
                  ) : (
                    Array.from({ length: n }, (_, i) => (
                      <span
                        key={i}
                        className={`size-[4px] rounded-full ${n > 1 ? "bg-accent-dark" : "bg-accent"}`}
                      />
                    ))
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 pt-3 text-[10.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-[5px] rounded-full bg-accent" /> One appointment
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-[5px] rounded-full bg-accent-dark" /> More than one
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent-soft" /> Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full ring-1 ring-accent-dark/60" /> Today
          </span>
        </div>
      </div>

      {/* ── The chosen day, then the week ahead ──────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line/80 bg-page p-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/70 pb-3">
            <h2 className="text-[17px] leading-tight">{fmtFull(selDate)}</h2>
            {selNear && <Pill tone={selected === 0 ? "accent" : "neutral"}>{selNear}</Pill>}
            <span className="ml-auto text-[11px] text-muted">
              {selList.length
                ? `${selList.length} appointment${selList.length === 1 ? "" : "s"}`
                : "Nothing booked"}
            </span>
          </div>

          {selList.length ? (
            <>
              <ul className="mt-1">
                {selList.slice(0, shown).map((a) => (
                  <DayRow key={a.id} a={a} onOpen={onOpen} />
                ))}
              </ul>
              {/* The count is on the button, not under it: "see more" with no
                  number is a question the screen already knows the answer to. */}
              {selList.length > shown ? (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE)}
                  className="hand mt-3 w-full rounded-xl border border-line/80 py-2.5 text-center text-[12.5px] transition-colors hover:border-ink"
                >
                  See more · {selList.length - shown} to go
                </button>
              ) : (
                shown > PAGE && (
                  <button
                    type="button"
                    onClick={() => setShown(PAGE)}
                    className="hand mt-3 w-full rounded-xl border border-line/80 py-2.5 text-center text-[12.5px] text-muted transition-colors hover:border-ink hover:text-ink"
                  >
                    Show less
                  </button>
                )
              )}
            </>
          ) : (
            <p className="py-10 text-center text-[12.5px] text-muted">
              {loading
                ? "Reading the diary…"
                : selected < 0
                  ? "Nothing was booked that day."
                  : "The day is free — the listings page is where viewings start."}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-line/80 bg-page p-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-[14px] leading-none">The week ahead</h3>
            <span className="ml-auto text-[11px] text-muted">
              {weekTotal} appointment{weekTotal === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {week.map((o) => {
              const d = dateOfOffset(o);
              const n = byDay.get(o)?.length ?? 0;
              const isSel = o === selected;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => pick(o)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${
                    isSel
                      ? "border-accent-dark/40 bg-accent-soft/60"
                      : "border-line/70 bg-page hover:border-ink"
                  }`}
                >
                  <span className="block text-[10.5px] text-muted">
                    {d.toLocaleDateString("en-GB", { weekday: "short" })}
                  </span>
                  <span className="block text-[10.5px] text-muted">
                    {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span
                    className={`figures mt-1.5 block text-[17px] leading-none ${
                      n ? "text-accent-dark" : "text-muted/40"
                    }`}
                  >
                    {n}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] text-muted/80">
                    {n === 1 ? "appointment" : "appointments"}
                  </span>
                </button>
              );
            })}
          </div>
          {onOpenWeek && (
            <button
              type="button"
              onClick={onOpenWeek}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-line/70 bg-page px-3.5 py-2.5 text-left transition-colors hover:border-ink"
            >
              <DoodleIcon name="calendar" size={16} className="shrink-0 text-accent-dark" />
              <span className="hand text-[12.5px]">Open the week grid</span>
              <span className="ml-auto text-[12px] text-muted">→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
