"use client";

import { useEffect, useState } from "react";
import DiaryCalendar from "@/components/DiaryCalendar";
import ListPopout, { ViewAllButton } from "@/components/ListPopout";
import { useMyDiary } from "@/lib/diary-store";
import { minutesOf, type Appt, type ApptKind } from "@/lib/diary";

/**
 * Today, in the new look: the signed-in person's OWN diary (useMyDiary), the
 * same rule as the old Today tile. Everything in it shows, in time order,
 * all-day first; personal busy times and private entries ("Busy") stay off,
 * exactly as TodayWidget in components/widgets decides.
 *
 * A line opens the full calendar, as a press on the old tile did. "View full
 * calendar" and "View all" (today and tomorrow in full) are the old tile's two
 * buttons. Tomorrow is shown under today, a few lines of it, as the wide tile
 * did.
 */

const DOT: Partial<Record<ApptKind, string>> = {
  viewing: "info",
  appraisal: "accent",
  takeon: "accent",
  inspection: "sage",
  movein: "warning",
};

const personal = (a: Appt) => Boolean(a.fromPersonal) || (a.kind === "other" && a.what === "Busy");
const inOrder = (list: Appt[]) =>
  [...list].sort((a, b) => Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) || minutesOf(a.start) - minutesOf(b.start));

export function useMyDay() {
  const { appts, loading, error, whose } = useMyDiary();
  const mine = appts.filter((a) => !personal(a));
  return {
    today: inOrder(mine.filter((a) => a.day === 0)),
    tomorrow: inOrder(mine.filter((a) => a.day === 1)),
    loading,
    error,
    whose,
  };
}

function Line({ a, muted = false, onOpen }: { a: Appt; muted?: boolean; onOpen?: () => void }) {
  const inner = (
    <>
      <span className={`nl-dash-time${a.allDay ? " is-allday" : ""}`}>{a.allDay ? "All day" : a.start}</span>
      <span className={`nl-dash-dot ${muted ? "grey" : (DOT[a.kind] ?? "grey")}`} aria-hidden />
      <span className="nl-dash-line-text">
        <span className="nl-dash-strong">{a.what}</span>
        {(a.who || a.where) && <span className="nl-meta">{[a.who, a.where].filter(Boolean).join(" · ")}</span>}
      </span>
    </>
  );
  return (
    <li className={muted ? "is-muted" : undefined}>
      {onOpen ? (
        <button type="button" className="nl-dash-agenda-row" onClick={onOpen}>
          {inner}
        </button>
      ) : (
        <div className="nl-dash-agenda-row">{inner}</div>
      )}
    </li>
  );
}

/** Now, in London minutes past midnight, ticking over each minute. */
function useLondonNow(): { min: number; label: string } {
  const read = () => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return { min: h * 60 + m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = window.setInterval(() => setNow(read()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const until = (mins: number) => {
  if (mins < 1) return "Now";
  if (mins < 60) return `In ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `In ${h} h ${m} min` : `In ${h} h`;
};

/**
 * Today as the design's timeline: the time, the entry in a box, a coral line
 * at now, what has passed faded, and the next one picked out with how long
 * until it starts. All-day entries sit at the top. Every row opens the full
 * calendar, as the old tile did.
 */
function Timeline({ list, onOpen, max }: { list: Appt[]; onOpen: () => void; max: number }) {
  const now = useLondonNow();
  const endOf = (a: Appt) => minutesOf(a.start) + Math.max(0, a.mins || 0);
  const allDay = list.filter((a) => a.allDay);
  let timed = list.filter((a) => !a.allDay);
  /* A full day keeps what is still to come: the earliest of what has passed
     makes way first, never the next one. View all has the lot. */
  const room = Math.max(1, max - allDay.length);
  while (timed.length > room && endOf(timed[0]) <= now.min) timed = timed.slice(1);
  timed = timed.slice(0, room);
  const nextIdx = timed.findIndex((a) => endOf(a) > now.min);
  /* The line goes before the first entry still to start (or under way). */
  const lineAt = timed.findIndex((a) => minutesOf(a.start) > now.min);
  const rows: React.ReactNode[] = [];
  const ev = (a: Appt, state: "past" | "next" | "later" | "allday", note: string) => (
    <li key={a.id} className={`nl-dash-ev is-${state}`}>
      <button type="button" className="nl-dash-ev-row" onClick={onOpen}>
        <time className={a.allDay ? "is-allday" : undefined}>{a.allDay ? "All day" : a.start}</time>
        <span className="nl-dash-ev-box">
          <span className="nl-dash-ev-what">
            <i className={`nl-dash-dot ${DOT[a.kind] ?? "grey"}`} aria-hidden />
            {a.what}
          </span>
          {(a.who || a.where) && <span className="nl-meta">{[a.who, a.where].filter(Boolean).join(" · ")}</span>}
        </span>
        <em>{note}</em>
      </button>
    </li>
  );
  for (const a of allDay) rows.push(ev(a, "allday", ""));
  timed.forEach((a, i) => {
    if (i === lineAt) rows.push(<li key="now" className="nl-dash-now" aria-label={`Now, ${now.label}`}>{now.label} now</li>);
    const start = minutesOf(a.start);
    const past = endOf(a) <= now.min;
    const state = past ? "past" : i === nextIdx ? "next" : "later";
    const note = past ? "" : i === nextIdx ? (start <= now.min ? "Under way" : until(start - now.min)) : "";
    rows.push(ev(a, state, note));
  });
  if (lineAt === -1 && timed.length) rows.push(<li key="now" className="nl-dash-now" aria-label={`Now, ${now.label}`}>{now.label} now</li>);
  return <ol className="nl-dash-tl">{rows}</ol>;
}

export default function Agenda() {
  const { today, tomorrow, loading, error, whose } = useMyDay();
  const [calendar, setCalendar] = useState(false);
  const [all, setAll] = useState(false);
  const SHOW = 6;
  const open = () => setCalendar(true);

  return (
    <section className="nl-dash-card nl-dash-col" aria-labelledby="nl-dash-today">
      <div className="nl-dash-card-h">
        <h3 id="nl-dash-today">Today</h3>
        {whose?.name ? (
          <span className="nl-meta" title={whose.email ? `Matched on ${whose.email}` : undefined}>
            {whose.name.trim().split(/\s+/)[0]}&rsquo;s own diary
          </span>
        ) : (
          <span className="nl-meta">Your diary</span>
        )}
      </div>

      {loading ? (
        <p className="nl-dash-wait">
          <span className="nl-dash-spin" aria-hidden />
          Reading your diary…
        </p>
      ) : error && today.length === 0 ? (
        /* An honest blank, never a sample day - and in words that never name the
           system behind the diary (agent screens never say it). */
        <p className="nl-dash-note nl-dash-warn">Your diary couldn&rsquo;t be read just now. Try again in a moment.</p>
      ) : (
        <>
          {today.length === 0 ? <p className="nl-dash-note">Nothing in the diary today.</p> : <Timeline list={today} onOpen={open} max={SHOW} />}
          {tomorrow.length > 0 && (
            <>
              <p className="nl-dash-sub">Tomorrow</p>
              <ol className="nl-dash-agenda is-small">
                {tomorrow.slice(0, 3).map((a) => (
                  <Line key={a.id} a={a} muted onOpen={open} />
                ))}
              </ol>
            </>
          )}
          <div className="nl-dash-acts">
            <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={open}>
              View full calendar
            </button>
            <button type="button" className="nl-link" onClick={() => setAll(true)}>
              View all{today.length + tomorrow.length > 0 ? ` (${today.length + tomorrow.length})` : ""}
            </button>
          </div>
        </>
      )}

      <ListPopout
        open={all}
        onClose={() => setAll(false)}
        icon="calendar"
        title="Today"
        sub={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}
        footer={
          <ViewAllButton
            label="View full calendar"
            onClick={() => {
              setAll(false);
              setCalendar(true);
            }}
          />
        }
      >
        <div data-look="new" className="nl-dash-pop">
          {today.length === 0 ? <p className="nl-dash-note">Nothing in the diary today.</p> : (
            <ol className="nl-dash-agenda">{today.map((a) => <Line key={a.id} a={a} />)}</ol>
          )}
          <p className="nl-dash-sub">Tomorrow</p>
          {tomorrow.length === 0 ? <p className="nl-dash-note">Nothing in the diary tomorrow.</p> : (
            <ol className="nl-dash-agenda">{tomorrow.map((a) => <Line key={a.id} a={a} muted />)}</ol>
          )}
        </div>
      </ListPopout>
      <DiaryCalendar open={calendar} onClose={() => setCalendar(false)} />
    </section>
  );
}
