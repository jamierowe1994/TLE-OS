"use client";

import { useState } from "react";
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

export default function Agenda() {
  const { today, tomorrow, loading, error, whose } = useMyDay();
  const [calendar, setCalendar] = useState(false);
  const [all, setAll] = useState(false);
  const SHOW = 6;
  const open = () => setCalendar(true);

  return (
    <section className="nl-dash-col" aria-labelledby="nl-dash-today">
      <div className="nl-dash-sec-head">
        <h2 id="nl-dash-today" className="nl-dash-sec-title">
          Today
        </h2>
        {whose?.name && (
          <span className="nl-meta" title={whose.email ? `Matched on ${whose.email}` : undefined}>
            {whose.name.trim().split(/\s+/)[0]}&rsquo;s own diary
          </span>
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
          {today.length === 0 ? (
            <p className="nl-dash-note">Nothing in the diary today.</p>
          ) : (
            <ol className="nl-dash-agenda">
              {today.slice(0, SHOW).map((a) => (
                <Line key={a.id} a={a} onOpen={open} />
              ))}
            </ol>
          )}
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
