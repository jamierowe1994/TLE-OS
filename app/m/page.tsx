"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Appt } from "@/lib/diary";
import { ErrorLine, Spinner } from "./bits";
import { DIARY_KEY, KIND_LABEL, endOf } from "./diary-bits";

/**
 * THE PHONE'S HOME: today's calendar, and nothing else.
 *
 * James, 18 Sep 2026: "when we log in on mobile view only, we should just show
 * them what their diary looks like today ... we'll be able to click into it,
 * and it will then launch into the event." The finders and the ID camera
 * moved into the slide-out menu (components/m/PhoneFrame), so the day ahead
 * is the whole screen.
 *
 * Each appointment opens /m/event/<id>, which reads the day from the copy
 * kept in sessionStorage here rather than asking the diary for it again.
 */

function dayTitle(offset: number): string {
  if (offset === 0) return "Today's Calendar";
  if (offset === 1) return "Tomorrow's Calendar";
  if (offset === -1) return "Yesterday's Calendar";
  return "Calendar";
}

function dateOf(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export default function PhoneHome() {
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(0);
  const [showEarlier, setShowEarlier] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setAppts(null);
    try {
      const r = await fetch("/api/diary", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; error?: string; live?: boolean; appts?: Appt[]; mine?: Appt[]; reason?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Your calendar did not load.");
      /* No sample book on a phone. When the full diary is not connected, what
         the OS itself holds is shown and the screen says that is all it is. */
      const list = j.live ? j.appts ?? [] : j.mine ?? [];
      setNote(!j.live && j.reason ? "Only appointments made in the OS are showing." : null);
      setAppts(list);
      try {
        sessionStorage.setItem(DIARY_KEY, JSON.stringify(list));
      } catch {
        /* The event page asks the diary again when there is no copy. */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your calendar did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todays = useMemo(
    () => (appts ?? []).filter((a) => a.day === day && a.kind !== "travel").sort((a, b) => a.start.localeCompare(b.start)),
    [appts, day]
  );
  const timed = todays.filter((a) => !a.allDay);
  const allDay = todays.filter((a) => a.allDay);

  /* "Now" and "Next" only mean something today. What has finished folds away
     under one line, so the rest of the day is what fills the screen. */
  const nowHm = new Date().toTimeString().slice(0, 5);
  const current = day === 0 ? timed.find((a) => endOf(a) > nowHm) : undefined;
  const earlier = day === 0 ? timed.filter((a) => endOf(a) <= nowHm) : [];
  const listed = showEarlier ? timed : timed.filter((a) => !earlier.includes(a));

  return (
    <main>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[27px] leading-tight">
            {dayTitle(day)}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted">{dateOf(day)}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Step dir={-1} onClick={() => setDay((d) => Math.max(d - 1, -7))} />
          {day !== 0 && (
            <button type="button" onClick={() => setDay(0)} className="h-10 px-2 text-[13px] font-semibold text-accent-dark">
              Today
            </button>
          )}
          <Step dir={1} onClick={() => setDay((d) => Math.min(d + 1, 14))} />
        </div>
      </div>

      {error ? (
        <ErrorLine text={error} onRetry={load} />
      ) : !appts ? (
        <Spinner label="Loading your calendar" className="py-8" />
      ) : (
        <>
          {note && <p className="mb-3 text-[12.5px] text-muted">{note}</p>}
          {allDay.map((a, i) => (
            <p key={`${a.id}-${i}`} className="mb-2 rounded-2xl bg-panel px-4 py-2.5 text-[13.5px]">
              <span className="font-semibold">All day</span> - {a.what}
            </p>
          ))}
          {earlier.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEarlier((v) => !v)}
              className="mb-2 flex h-10 w-full items-center justify-center rounded-2xl bg-panel text-[13.5px] font-semibold text-muted"
            >
              {showEarlier ? "Hide Earlier Today" : `Earlier Today (${earlier.length})`}
            </button>
          )}
          {timed.length === 0 ? (
            <p className="rounded-[22px] border border-line/70 bg-card py-10 text-center text-[14.5px] text-muted">
              Nothing in your calendar {day === 0 ? "today" : "on this day"}.
            </p>
          ) : listed.length === 0 ? (
            <p className="rounded-[22px] border border-line/70 bg-card py-10 text-center text-[14.5px] text-muted">Nothing else in your calendar today.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5">
              {listed.map((a, i) => {
                const busy = a.what === "Busy" && !a.where;
                const next = a.id === current?.id;
                const done = earlier.includes(a);
                const inner = (
                  <>
                    <span className="w-[54px] shrink-0">
                      <span className="figures block text-[18px] leading-tight">{a.start}</span>
                      <span className="block text-[12px] text-muted">{endOf(a)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-dark">{KIND_LABEL[a.kind] ?? "Appointment"}</span>
                        {next && (
                          <span className="rounded-full bg-accent-soft px-2 py-[1px] text-[11px] font-semibold text-accent-dark">
                            {a.start <= nowHm ? "Now" : "Next"}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[15.5px] font-semibold leading-snug">{busy ? "Busy" : a.where || a.what}</span>
                      {!busy && a.who && <span className="mt-0.5 block truncate text-[13.5px] text-muted">With {a.who}</span>}
                    </span>
                    {!busy && (
                      <svg viewBox="0 0 24 24" aria-hidden className="mt-1.5 h-4 w-4 shrink-0 text-muted">
                        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </>
                );
                const shell = `flex w-full items-start gap-3 rounded-[20px] border bg-card px-4 py-3.5 text-left ${next ? "border-accent" : "border-line/70"}`;
                return (
                  <li key={`${a.id}-${i}`} style={done ? { opacity: 0.55 } : undefined}>
                    {busy ? (
                      <div className={shell}>{inner}</div>
                    ) : (
                      <Link href={`/m/event/${encodeURIComponent(a.id)}`} className={`${shell} active:bg-panel`}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function Step({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? "Previous day" : "Next day"}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 bg-card active:bg-panel"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
        <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
