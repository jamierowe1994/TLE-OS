"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { DiaryRows } from "@/components/new-look/diary/DiaryParts";
import type { BlockAnchor } from "@/components/viewings/AddToBlock";
import { useMyDiary } from "@/lib/diary-store";
import { KIND_META, minutesOf, type Appt } from "@/lib/diary";
import { useSlideOver } from "@/lib/use-slide-over";

/**
 * Today, in the new look: the signed-in person's OWN diary (useMyDiary), the
 * same rule as the old Today tile. Everything in it shows, in time order,
 * all-day first; personal busy times and private entries ("Busy") stay off,
 * exactly as TodayWidget in components/widgets decides.
 *
 * A line opens that appointment's overview without leaving the dashboard
 * (James, 25 Oct 2026: "it should pop up and give me an overview rather than
 * taking me to the other calendar"), now dropped down under its row as the
 * Diary does. Tomorrow is still read for Steve's line over the page; the
 * panel shows today only.
 */

/* The Diary's drawers, fetched the first time one opens rather than with the
   dashboard: the viewing file in particular is a large piece of code, and the
   dashboard should not wait for it (25 Oct 2026, speed). */
const AppointmentDrawer = dynamic(() => import("@/components/viewings/AppointmentDrawer"), { ssr: false });
const ViewingDrawer = dynamic(() => import("@/components/ViewingDrawer"), { ssr: false });
const ChangeViewing = dynamic(() => import("@/components/viewings/ChangeViewing"), { ssr: false });
const AddToBlock = dynamic(() => import("@/components/viewings/AddToBlock"), { ssr: false });


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

/**
 * Today across the page, on white, as the new Diary draws a day (James,
 * 25 Oct 2026: "it should show today's calendar, not the whole week... using
 * the new style of calendar", "much wider and on a white background"). The
 * Diary's own rows; each drops down in place with its details,
 * confirmations, Cancel, Change time and Open, and the viewing file opens over
 * the dashboard. An entry the Diary has no card for gets the plain overview.
 */
export default function Agenda() {
  const { today, loading, error, whose } = useMyDay();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [plain, setPlain] = useState<Appt | null>(null);
  const [full, setFull] = useState<Appt | null>(null);
  const [changing, setChanging] = useState<Appt | null>(null);
  const [blockAnchor, setBlockAnchor] = useState<BlockAnchor | null>(null);
  const [sentExtra, setSentExtra] = useState<Set<string>>(new Set());
  const onSend = (id: string, label: string) => setSentExtra((cur) => new Set(cur).add(`${id}:${label}`));
  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const n = today.length;

  const drop = {
    openId: openRow,
    onToggle: (a: Appt) => {
      if (!KIND_META[a.kind]) return setPlain(a);
      setOpenRow((cur) => (cur === a.id ? null : a.id));
    },
    render: (a: Appt) => (
      <AppointmentDrawer
        newLook
        inline
        appt={a}
        onClose={() => setOpenRow(null)}
        onOpenViewing={(x) => setFull(x)}
        onChangeTime={(x) => setChanging(x)}
        onAddToBlock={(anchor) => setBlockAnchor(anchor)}
        sentExtra={sentExtra}
        onSend={onSend}
      />
    ),
  };

  return (
    <section className="nl-dash-today" aria-labelledby="nl-dash-today">
      <div className="nl-dash-card-h">
        <h3 id="nl-dash-today">Today</h3>
        <span className="nl-meta" title={whose?.email ? `Matched on ${whose.email}` : undefined}>
          {date}
          {!loading && !error && n > 0 ? ` · ${n} ${n === 1 ? "appointment" : "appointments"}` : ""}
          {whose?.name ? ` · ${whose.name.trim().split(/\s+/)[0]}\u2019s own diary` : ""}
        </span>
        <Link href="/viewings" className="nl-link ml-auto">
          Open the Diary
        </Link>
      </div>

      {loading ? (
        <p className="nl-dash-wait">
          <span className="nl-dash-spin" aria-hidden />
          Reading your diary…
        </p>
      ) : error && n === 0 ? (
        /* An honest blank, never a sample day - and in words that never name the
           system behind the diary (agent screens never say it). */
        <p className="nl-dash-note nl-dash-warn">Your diary couldn&rsquo;t be read just now. Try again in a moment.</p>
      ) : n === 0 ? (
        <p className="nl-dash-note">Nothing in the diary today.</p>
      ) : (
        <DiaryRows list={today} resetKey="dash-today" sentExtra={sentExtra} onOpen={drop.onToggle} drop={drop} />
      )}

      <PlainOverview appt={plain} onClose={() => setPlain(null)} />
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
