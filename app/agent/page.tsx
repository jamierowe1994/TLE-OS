"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Appt } from "@/lib/diary";
import DoodleIcon from "@/components/DoodleIcon";
import { useAlerts } from "@/components/app/alerts";
import { ErrorLine, PhoneTop, Spinner } from "./bits";
import { KIND_ART, KIND_LABEL, endOf, loadDiary, nowHm } from "./diary-bits";

/**
 * TODAY: the first tab.
 *
 * James, 18 Sep 2026: "when we log in on mobile view only, we should just show
 * them what their diary looks like today ... click into it, and it will then
 * launch into the event." Drawn on 2 Oct in the Notion look he settled on: a
 * greeting, the week as a strip of days, the day's appointments as drawn
 * cards to swipe through, two figures, and the finders as chips.
 *
 * Every figure is the diary's own, read live. Each appointment opens
 * /m/event/<id>, which reads the day from the copy loadDiary keeps.
 */

const isBusy = (a: Appt) => a.what === "Busy" && !a.where;

const mins = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/** "In 25 min", "In 1 hr 10", or "On now" once it has started. */
function whenLine(a: Appt, now: string): string {
  if (a.start <= now) return "On now";
  const d = mins(a.start) - mins(now);
  if (d < 60) return `In ${d} min`;
  const h = Math.floor(d / 60);
  return `In ${h} hr${d % 60 ? ` ${d % 60}` : ""}`;
}

function greeting(first: string): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  const part = h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
  return first ? `${part}, ${first}` : part;
}

const dayDate = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

export default function PhoneToday() {
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(0);
  const [first, setFirst] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setAppts(null);
    try {
      const got = await loadDiary();
      setNote(got.note);
      setAppts(got.appts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your calendar did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user?: { name?: string } | null }) => setFirst((j.user?.name ?? "").split(/\s+/)[0] ?? ""))
      .catch(() => null);
  }, [load]);

  const now = nowHm();
  const { ahead, earlier, allDay } = useMemo(() => {
    const onDay = (appts ?? []).filter((a) => a.day === day && a.kind !== "travel").sort((a, b) => a.start.localeCompare(b.start));
    const timed = onDay.filter((a) => !a.allDay && !isBusy(a));
    const done = day === 0 ? timed.filter((a) => endOf(a) <= now) : [];
    return { ahead: timed.filter((a) => !done.includes(a)), earlier: done, allDay: onDay.filter((a) => a.allDay) };
  }, [appts, day, now]);

  const viewings = [...ahead, ...earlier].filter((a) => a.kind === "viewing").length;

  return (
    <main>
      <PhoneTop
        eyebrow={dayDate(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        title={day === 0 ? greeting(first) : dayDate(day).toLocaleDateString("en-GB", { weekday: "long" })}
      >
        <Week day={day} onPick={setDay} />
      </PhoneTop>

      {error ? (
        <ErrorLine text={error} onRetry={load} />
      ) : !appts ? (
        <Spinner label="Loading your calendar" className="py-8" />
      ) : (
        <>
          <AlertsCard />
          {note && <p className="mb-3 text-[12.5px] text-muted">{note}</p>}
          {allDay.map((a, i) => (
            <p key={`${a.id}-${i}`} className="mb-2.5 rounded-[14px] px-4 py-2.5 text-[14px]" style={{ background: "var(--m-green-wash)" }}>
              <span className="font-medium">All day</span> - {a.what}
            </p>
          ))}

          {ahead.length > 0 ? (
            <div className="m-rail">
              {ahead.map((a, i) => (
                <DrawnCard key={`${a.id}-${i}`} a={a} now={now} first={day === 0 && i === 0} only={ahead.length === 1} />
              ))}
            </div>
          ) : (
            <div className="m-group flex flex-col items-center px-6 pb-7 pt-5 text-center">
              <img src="/illustrations/notioly/looking-out-the-window.svg" alt="" className="m-ill h-[150px] w-auto" />
              <p className="mt-2 text-[17px] font-medium">{day === 0 && earlier.length ? "That's Everything for Today" : "Nothing Booked"}</p>
              <p className="mt-1 text-[14px] text-muted">{day === 0 ? (earlier.length ? "Nothing else in your calendar today." : "Nothing in your calendar today.") : "Nothing in your calendar on this day."}</p>
            </div>
          )}

          <h2 className="mt-7 text-[19px]">At a Glance</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Figure value={ahead.length} label={day === 0 ? "Still to Go" : ahead.length === 1 ? "Appointment" : "Appointments"} />
            <Figure value={viewings} label={viewings === 1 ? "Viewing" : "Viewings"} dot={viewings ? "var(--m-pink)" : undefined} />
          </div>

          <h2 className="mt-7 text-[19px]">Quick Find</h2>
          <p className="mt-0.5 text-[14px] text-muted">Look someone or somewhere up</p>
          <div className="m-rail mt-3">
            {[
              { href: "/agent/people?who=tenant", label: "Tenant" },
              { href: "/agent/people?who=landlord", label: "Landlord" },
              { href: "/agent/properties", label: "Property" },
              { href: "/agent/id-check", label: "Scan an ID" },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="m-press flex h-11 items-center rounded-full border px-5 text-[14.5px] font-medium" style={{ borderColor: "var(--m-line)", background: "var(--m-card)" }}>
                {c.label}
              </Link>
            ))}
          </div>

          {earlier.length > 0 && (
            <>
              <h2 className="mt-7 text-[19px]">Earlier Today</h2>
              <ul className="m-group mt-3">
                {earlier.map((a, i) => (
                  <li key={`${a.id}-${i}`} className="m-row">
                    <Link href={`/agent/event/${encodeURIComponent(a.id)}`} className="flex items-center gap-3 px-4 py-3 active:bg-panel">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-green-wash)", color: "var(--m-green)" }}>
                        <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L19 7" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{a.where || a.what}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {KIND_LABEL[a.kind] ?? "Appointment"} · {a.start}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Asked once, on Today, while alerts are off on this phone (2 Oct 2026). The
 * phone itself only lets a page ask from a tap, so this is a card with a
 * button, never a pop-up on arrival. "Not now" puts it away on this phone;
 * the switch in the "+" sheet is always there.
 */
const ALERTS_LATER = "app-alerts-later";

function AlertsCard() {
  const alerts = useAlerts();
  const [later, setLater] = useState(true);
  useEffect(() => {
    try {
      setLater(localStorage.getItem(ALERTS_LATER) === "1");
    } catch {
      setLater(false);
    }
  }, []);
  if (later || (alerts.state !== "off" && alerts.state !== "busy")) return null;
  return (
    <section className="m-group mb-3 flex items-start gap-3 p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-pink-wash)" }}>
        <DoodleIcon name="bell" size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-medium">Turn On Alerts</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">A buzz on this phone when a lead, a viewing or a deal moves.</span>
        {alerts.error && <span className="mt-1 block text-[13px] text-muted">{alerts.error}</span>}
        <span className="mt-3 flex gap-2">
          <button type="button" onClick={alerts.turnOn} disabled={alerts.state === "busy"} className="m-btn m-btn-primary m-press !h-10 !text-[14px]">
            {alerts.state === "busy" ? "Turning On..." : "Turn On"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(ALERTS_LATER, "1");
              } catch {
                /* It just asks again next time. */
              }
              setLater(true);
            }}
            className="m-btn m-press !h-10 !border-transparent !bg-transparent !text-[14px] text-muted"
          >
            Not Now
          </button>
        </span>
      </span>
    </section>
  );
}

/** Seven days, Monday first, the chosen one filled and today marked in pink. */
function Week({ day, onPick }: { day: number; onPick: (d: number) => void }) {
  const today = dayDate(0);
  const monday = -((today.getDay() + 6) % 7);
  /* The week the chosen day sits in, kept to the diary's reach (a week back, a fortnight on). */
  const start = monday + Math.floor((day - monday) / 7) * 7;
  const days = Array.from({ length: 7 }, (_, i) => start + i);
  const reach = (d: number) => d >= -7 && d <= 14;
  return (
    <div className="mt-4 flex items-center gap-1">
      <WeekStep dir={-1} disabled={!reach(start - 1)} onClick={() => onPick(Math.max(start - 7, -7))} />
      <div className="grid flex-1 grid-cols-7">
        {days.map((d) => {
          const date = dayDate(d);
          const on = d === day;
          return (
            <button key={d} type="button" disabled={!reach(d)} onClick={() => onPick(d)} className="flex flex-col items-center gap-1.5 py-1 disabled:opacity-30">
              <span className="text-[12px] text-muted">{date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)}</span>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-medium"
                style={on ? { background: "var(--m-ink)", color: "var(--m-bg)" } : undefined}
              >
                {date.getDate()}
              </span>
              <span className="h-1 w-1 rounded-full" style={{ background: d === 0 ? "var(--m-pink)" : "transparent" }} />
            </button>
          );
        })}
      </div>
      <WeekStep dir={1} disabled={!reach(start + 7)} onClick={() => onPick(Math.min(start + 7, 14))} />
    </div>
  );
}

function WeekStep({ dir, disabled, onClick }: { dir: 1 | -1; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={dir < 0 ? "Previous week" : "Next week"} className="flex h-9 w-6 items-center justify-center text-muted disabled:opacity-25">
      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
        <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** One appointment as a drawn card, the reference's "Driving home" card. */
function DrawnCard({ a, now, first, only }: { a: Appt; now: string; first: boolean; only: boolean }) {
  return (
    <Link
      href={`/agent/event/${encodeURIComponent(a.id)}`}
      className="m-group m-press block p-2"
      style={{ width: only ? "100%" : "84%" }}
    >
      <span className="relative flex h-[190px] items-center justify-center">
        {first && (
          <span className="m-chip absolute left-1.5 top-1.5" style={{ background: "var(--m-pink-wash)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--m-pink)" }} />
            {whenLine(a, now)}
          </span>
        )}
        <img src={KIND_ART[a.kind] ?? KIND_ART.other} alt="" className="m-ill h-[180px] w-auto" />
      </span>
      <span className="block rounded-[14px] border px-3.5 py-3" style={{ borderColor: "var(--m-line)", background: "var(--m-bg)" }}>
        <span className="block truncate text-[16px] font-medium">{a.where || a.what}</span>
        <span className="mt-0.5 block truncate text-[13.5px] text-muted">
          {KIND_LABEL[a.kind] ?? "Appointment"} · {a.start} - {endOf(a)}
          {a.who ? ` · ${a.who}` : ""}
        </span>
      </span>
    </Link>
  );
}

function Figure({ value, label, dot }: { value: number; label: string; dot?: string }) {
  return (
    <div className="m-group px-4 py-5 text-center">
      <p className="m-figure text-[30px]">{value}</p>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[13.5px] text-muted">
        {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
        {label}
      </p>
    </div>
  );
}
