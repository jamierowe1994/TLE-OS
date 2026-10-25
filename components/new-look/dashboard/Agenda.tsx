"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DiaryCalendar from "@/components/DiaryCalendar";
import ListPopout, { ViewAllButton } from "@/components/ListPopout";
import type { BlockAnchor } from "@/components/viewings/AddToBlock";
import { useMyDiary } from "@/lib/diary-store";
import { KIND_META, minutesOf, type Appt, type ApptKind } from "@/lib/diary";
import { useSlideOver } from "@/lib/use-slide-over";

/**
 * Today, in the new look: the signed-in person's OWN diary (useMyDiary), the
 * same rule as the old Today tile. Everything in it shows, in time order,
 * all-day first; personal busy times and private entries ("Busy") stay off,
 * exactly as TodayWidget in components/widgets decides.
 *
 * A line opens that appointment's overview over the dashboard (James, 25 Oct
 * 2026: "if I was to click on morning clinic... it should pop up and give me
 * an overview rather than taking me to the other calendar"): the Diary's own
 * quick look (components/viewings/AppointmentDrawer, in its new-look dress),
 * with the viewing file, Change time and Add another viewing behind it exactly
 * as on the Diary. "View full calendar" still opens the full calendar, and
 * "View all" is today and tomorrow in full. Tomorrow is shown under today, a
 * few lines of it, as the wide tile did.
 */

/* The Diary's drawers, fetched the first time one opens rather than with the
   dashboard: the viewing file in particular is a large piece of code, and the
   dashboard should not wait for it (25 Oct 2026, speed). */
const AppointmentDrawer = dynamic(() => import("@/components/viewings/AppointmentDrawer"), { ssr: false });
const ViewingDrawer = dynamic(() => import("@/components/ViewingDrawer"), { ssr: false });
const ChangeViewing = dynamic(() => import("@/components/viewings/ChangeViewing"), { ssr: false });
const AddToBlock = dynamic(() => import("@/components/viewings/AddToBlock"), { ssr: false });

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

function Line({ a, muted = false, onOpen }: { a: Appt; muted?: boolean; onOpen?: (a: Appt) => void }) {
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
        <button type="button" className="nl-dash-agenda-row" onClick={() => onOpen(a)}>
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
 * until it starts. All-day entries sit at the top. Every row opens that
 * appointment's overview.
 */
function Timeline({ list, onOpen, max }: { list: Appt[]; onOpen: (a: Appt) => void; max: number }) {
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
      <button type="button" className="nl-dash-ev-row" onClick={() => onOpen(a)}>
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
  const openCalendar = () => setCalendar(true);
  /* The appointment open over the dashboard, and what it can lead on to. */
  const [quick, setQuick] = useState<Appt | null>(null);
  const [full, setFull] = useState<Appt | null>(null);
  const [changing, setChanging] = useState<Appt | null>(null);
  const [blockAnchor, setBlockAnchor] = useState<BlockAnchor | null>(null);
  const [sentExtra, setSentExtra] = useState<Set<string>>(new Set());
  const onSend = (id: string, label: string) => setSentExtra((cur) => new Set(cur).add(`${id}:${label}`));
  const open = (a: Appt) => {
    setAll(false);
    setQuick(a);
  };
  /* The Diary's quick look draws every kind the diary knows; anything else
     gets the plain overview below rather than a broken card. */
  const known = Boolean(quick && KIND_META[quick.kind]);

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
            <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={openCalendar}>
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
            <ol className="nl-dash-agenda">{today.map((a) => <Line key={a.id} a={a} onOpen={open} />)}</ol>
          )}
          <p className="nl-dash-sub">Tomorrow</p>
          {tomorrow.length === 0 ? <p className="nl-dash-note">Nothing in the diary tomorrow.</p> : (
            <ol className="nl-dash-agenda">{tomorrow.map((a) => <Line key={a.id} a={a} muted onOpen={open} />)}</ol>
          )}
        </div>
      </ListPopout>
      <DiaryCalendar open={calendar} onClose={() => setCalendar(false)} />

      {quick && known && <AppointmentDrawer
        newLook
        appt={quick}
        onClose={() => setQuick(null)}
        onOpenViewing={(a) => {
          setQuick(null);
          setFull(a);
        }}
        onChangeTime={(a) => {
          setQuick(null);
          setChanging(a);
        }}
        onAddToBlock={(anchor) => {
          setQuick(null);
          setBlockAnchor(anchor);
        }}
        sentExtra={sentExtra}
        onSend={onSend}
      />}
      <PlainOverview appt={known ? null : quick} onClose={() => setQuick(null)} />
      {full && <ViewingDrawer
        appt={full}
        onClose={() => setFull(null)}
        onChangeTime={(a) => {
          setFull(null);
          setChanging(a);
        }}
        onAddToBlock={(anchor) => {
          setFull(null);
          setBlockAnchor(anchor);
        }}
        sentExtra={sentExtra}
        onSend={onSend}
      />}
      {changing && <ChangeViewing appt={changing} onClose={() => setChanging(null)} />}
      {blockAnchor && <AddToBlock anchor={blockAnchor} onClose={() => setBlockAnchor(null)} />}
    </section>
  );
}

/**
 * The plain overview, for an entry the Diary's quick look has no card for:
 * what, when, where and who, as the diary has them, and the full calendar.
 */
function PlainOverview({ appt, onClose: closeNow }: { appt: Appt | null; onClose: () => void }) {
  const { shown, close } = useSlideOver(Boolean(appt), closeNow, appt?.id);
  useEffect(() => {
    if (!appt) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appt, close]);
  if (!appt || typeof document === "undefined") return null;
  const day = appt.day === 0 ? "Today" : appt.day === 1 ? "Tomorrow" : appt.day === -1 ? "Yesterday" : null;
  const time = appt.allDay ? "All day" : `${appt.start}${appt.mins ? `, ${appt.mins} min` : ""}`;
  return createPortal(
    <div data-look="new" className="nl-drawer-wrap nl-dash-drawer" data-shown={shown} role="dialog" aria-modal="true" aria-label={appt.what}>
      <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={close} />
      <div className="nl-drawer">
        <div className="nl-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">In the diary{day ? ` · ${day}` : ""} · {time}</p>
            <h2 className="nl-dash-drawer-title">{appt.what}</h2>
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="nl-drawer-body">
          <dl className="nl-dash-dl">
            <div><dt>When</dt><dd>{day ?? "In the diary"}, {time}</dd></div>
            <div><dt>Where</dt><dd>{appt.where || <span className="nl-meta">No address on this entry.</span>}</dd></div>
            <div><dt>Who</dt><dd>{appt.who || <span className="nl-meta">Nobody named on this entry.</span>}</dd></div>
          </dl>
        </div>
      </div>
    </div>,
    document.body
  );
}
