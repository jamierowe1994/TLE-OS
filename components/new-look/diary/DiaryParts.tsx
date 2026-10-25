"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, type Tone as BadgeTone } from "@/components/new-look/Parts";
import { KIND_META, type Appt } from "@/lib/diary";
import { DAY_NAMES, dateOfOffset, fmtFull, fmtShort, nearLabel, offsetOf, subOf, titleOf, todayStart, toneOf } from "@/components/viewings/shared";

/**
 * The Diary in the new look (lib/new-look "diary", 23 Oct 2026): the day dial,
 * the agenda rows, the month grid. Drawn from the same live diary store and
 * the same day offsets as the older screen (components/viewings/*); nothing
 * here reads data of its own.
 *
 * Every date is worked out from the clock at the moment it draws, through the
 * shared day arithmetic (components/viewings/shared). There is no month or
 * year written anywhere in this file.
 */

/** The dot an appointment wears: what kind of thing it is, at a glance. */
export function dotTone(a: Appt): string {
  if (a.fromPersonal) return "personal";
  return toneOf(a.kind, a.unaccompanied);
}

/** The kind, in words, for the right of a row and the month cells. */
export function kindWord(a: Appt): string {
  if (a.fromPersonal) return "Personal";
  return KIND_META[a.kind].label;
}

/**
 * The one fact on a row that changes how the agent turns up or what is owed.
 * The same order as the older diary's pill (components/viewings/Agenda), so
 * the two looks never disagree about a viewing.
 */
export function statusOf(a: Appt, sentExtra?: Set<string>): { label: string; tone: BadgeTone } | null {
  const missing = a.comms.filter((c) => !c.done && !sentExtra?.has(`${a.id}:${c.label}`)).length;
  const past = a.day < 0;
  if (a.kind === "viewing" && past) {
    return a.feedback
      ? { label: a.feedback.outcome ?? a.feedback.interest ?? (a.feedback.note ? "Feedback in" : "Logged"), tone: "good" }
      : { label: "Feedback due", tone: "accent" };
  }
  if (a.kind === "viewing" && a.tenant) return { label: "Tenanted", tone: "accent" };
  if (a.confirmPending) return { label: "Not confirmed", tone: "warning" };
  if (a.comms.length && missing > 0) return { label: `${missing} to send`, tone: "accent" };
  if (a.comms.length && missing === 0) return { label: "Confirmed", tone: "good" };
  return null;
}

export function Spinner() {
  return <span className="nl-diary-spin" aria-hidden />;
}

/**
 * What a row drops down to show (James, 25 Oct 2026: "rather than it being a
 * pop-out, it should drop down to show us what they've got"). Given, a row
 * opens and closes in place; without it, a row opens its drawer as before.
 */
export type RowDrop = { openId: string | null; onToggle: (a: Appt) => void; render: (a: Appt) => React.ReactNode };

/** One appointment on the agenda: time, dot, who and what, its state, the way in. */
export function DiaryRow({ a, showDay, sentExtra, onOpen, drop }: { a: Appt; showDay?: boolean; sentExtra?: Set<string>; onOpen: (a: Appt) => void; drop?: RowDrop }) {
  const st = statusOf(a, sentExtra);
  const past = a.day < 0;
  const time = showDay ? fmtShort(dateOfOffset(a.day)).split(" ").slice(0, 2).join(" ") : a.allDay ? "All day" : a.start;
  const open = Boolean(drop && drop.openId === a.id);
  return (
    <li className={open ? "is-open" : undefined}>
      <button
        type="button"
        data-steve-row=""
        className={`nl-diary-row${past ? " is-past" : ""}${open ? " is-open" : ""}`}
        aria-expanded={drop ? open : undefined}
        onClick={() => (drop ? drop.onToggle(a) : onOpen(a))}
      >
        <span className="nl-diary-time">{time}</span>
        <span className={`nl-diary-dot is-${dotTone(a)}`} aria-hidden />
        <span className="min-w-0">
          <span className="nl-strong block truncate">{titleOf(a)}</span>
          <span className="nl-meta block truncate">
            {showDay && !a.allDay ? `${a.start} · ` : ""}
            {subOf(a)}
          </span>
        </span>
        <span className="nl-diary-row-end">
          {st && <Badge tone={st.tone}>{st.label}</Badge>}
          <span className="nl-diary-kind">{kindWord(a)}</span>
        </span>
        <svg className="nl-diary-caret" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {open && drop && <div className="nl-diary-drop">{drop.render(a)}</div>}
    </li>
  );
}

/** Rows, a page at a time: a real Thursday came back with 32 entries on it. */
export function DiaryRows({ list, showDay, sentExtra, onOpen, page = 12, resetKey, drop }: { list: Appt[]; showDay?: boolean; sentExtra?: Set<string>; onOpen: (a: Appt) => void; page?: number; resetKey: string; drop?: RowDrop }) {
  const [shown, setShown] = useState<{ key: string; n: number }>({ key: resetKey, n: page });
  /* An entry opened from elsewhere (the week) is never hidden behind See more. */
  const at = drop?.openId ? list.findIndex((a) => a.id === drop.openId) : -1;
  const n = Math.max(shown.key === resetKey ? shown.n : page, at + 1);
  return (
    <>
      <ol className="nl-diary-agenda">
        {list.slice(0, n).map((a) => (
          <DiaryRow key={a.id} a={a} showDay={showDay} sentExtra={sentExtra} onOpen={onOpen} drop={drop} />
        ))}
      </ol>
      {list.length > n ? (
        <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm mt-4" onClick={() => setShown({ key: resetKey, n: n + page })}>
          See more · {list.length - n} to go
        </button>
      ) : n > page ? (
        <button type="button" className="nl-link mt-4" onClick={() => setShown({ key: resetKey, n: page })}>
          Show less
        </button>
      ) : null}
    </>
  );
}

const STEP = 104;
/** The diary is read from a fortnight back to three months ahead (app/api/diary). */
export const DIAL_BACK = 14;
export const DIAL_AHEAD = 90;

/**
 * The dial: days on a strip, the chosen one in the middle and the rest
 * shrinking away either side. The arrows and the arrow keys step a day.
 */
export function DayDial({ selected, byDay, onSelect }: { selected: number; byDay: Map<number, Appt[]>; onSelect: (offset: number) => void }) {
  const from = Math.min(-DIAL_BACK, selected - 7);
  const to = Math.max(DIAL_AHEAD, selected + 7);
  const days = useMemo(() => Array.from({ length: to - from + 1 }, (_, i) => from + i), [from, to]);
  const idx = selected - from;
  /* The strip glides only once it has been drawn where it belongs. */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(t);
  }, []);
  return (
    <div className="nl-diary-dialwrap">
      <button type="button" className="nl-diary-arrow" aria-label="Earlier day" onClick={() => onSelect(selected - 1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      </button>
      <div
        className="nl-diary-dial"
        role="tablist"
        aria-label="Choose a day"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); onSelect(selected - 1); }
          if (e.key === "ArrowRight") { e.preventDefault(); onSelect(selected + 1); }
        }}
      >
        <div className={`nl-diary-track${ready ? " is-ready" : ""}`} style={{ transform: `translateX(${-(idx * STEP + STEP / 2)}px)` }}>
          {days.map((off) => {
            const d = dateOfOffset(off);
            const dist = Math.min(Math.abs(off - selected), 4);
            const list = byDay.get(off) ?? [];
            const on = off === selected;
            return (
              <button
                key={off}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${fmtFull(d)}${list.length ? `, ${list.length} in the diary` : ""}`}
                tabIndex={on ? 0 : -1}
                className={`nl-diary-day${on ? " is-on" : ""}${off === 0 ? " is-today" : ""}${d.getDay() === 0 ? " is-sun" : ""}`}
                style={{ ["--dist" as string]: dist } as React.CSSProperties}
                onClick={() => onSelect(off)}
              >
                <span className="nl-diary-dname">{off === 0 ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                <span className="nl-diary-dnum">{d.getDate()}</span>
                <span className="nl-diary-dmonth">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
                <span className="nl-diary-ddots">
                  {list.slice(0, 4).map((a) => (
                    <i key={a.id} className={`nl-diary-dot is-${dotTone(a)}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="nl-diary-arrow" aria-label="Later day" onClick={() => onSelect(selected + 1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

/** The heading over a day: "Today", "Tomorrow", or the date in words. */
export function dayLabel(offset: number): string {
  return nearLabel(offset) ?? fmtFull(dateOfOffset(offset));
}

/**
 * The month: whole weeks, Monday first, the first two entries written in
 * each day and a count of the rest. A day opens underneath it.
 */
export function MonthGrid({
  byDay,
  selected,
  monthShift,
  onMonthShift,
  onPick,
}: {
  byDay: Map<number, Appt[]>;
  selected: number;
  monthShift: number;
  onMonthShift: (n: number) => void;
  onPick: (offset: number) => void;
}) {
  const { cells, label } = useMemo(() => {
    const anchor = todayStart();
    // Day 1 of the shown month - the date before the month, or the 31st of a
    // long month rolls the short one it lands in forward a month.
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + monthShift, 1);
    const lead = (first.getDay() + 6) % 7;
    const out: { date: Date; offset: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), 1 - lead + i);
      out.push({ date: d, offset: offsetOf(d), inMonth: d.getMonth() === first.getMonth() });
    }
    const rows = out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out;
    return { cells: rows, label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }, [monthShift]);

  return (
    <div className="nl-diary-month">
      <div className="nl-diary-month-head">
        <button type="button" className="nl-diary-arrow is-sm" aria-label="Previous month" onClick={() => onMonthShift(monthShift - 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h2 className="nl-section-title nl-diary-month-title">{label}</h2>
        <button type="button" className="nl-diary-arrow is-sm" aria-label="Next month" onClick={() => onMonthShift(monthShift + 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
        {monthShift !== 0 && (
          <button type="button" className="nl-link ml-auto" onClick={() => onMonthShift(0)}>
            This month
          </button>
        )}
      </div>
      <div className="nl-diary-mgrid">
        {DAY_NAMES.map((n) => (
          <div key={n} className="nl-diary-mdow">{n}</div>
        ))}
        {cells.map((c) => {
          const list = byDay.get(c.offset) ?? [];
          return (
            <button
              key={c.offset}
              type="button"
              aria-current={c.offset === 0 ? "date" : undefined}
              aria-label={`${fmtFull(c.date)}${list.length ? `, ${list.length} in the diary` : ""}`}
              className={`nl-diary-mcell${c.inMonth ? "" : " is-out"}${c.offset === 0 ? " is-today" : ""}${c.offset === selected ? " is-sel" : ""}`}
              onClick={() => onPick(c.offset)}
            >
              <span className="nl-diary-mnum">{c.date.getDate()}</span>
              {list.length > 0 && (
                <>
                  <span className="nl-diary-mitems">
                    {list.slice(0, 2).map((a) => (
                      <span key={a.id} className="nl-diary-mitem">
                        <i className={`nl-diary-dot is-${dotTone(a)}`} />
                        <span className="min-w-0 truncate">{a.allDay ? "All day" : a.start} {kindWord(a)}</span>
                      </span>
                    ))}
                    {list.length > 2 && <span className="nl-diary-mmore">+{list.length - 2} more</span>}
                  </span>
                  <span className="nl-diary-mdots" aria-hidden>
                    {list.length > 3 ? <b>{list.length}</b> : list.map((a) => <i key={a.id} className={`nl-diary-dot is-${dotTone(a)}`} />)}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
