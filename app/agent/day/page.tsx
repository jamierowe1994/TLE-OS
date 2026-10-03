"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Appt } from "@/lib/diary";
import { ErrorLine, HomeHero, Spinner, TopBar } from "../bits";
import { KIND_LABEL, endOf, loadDiary, nowHm } from "../diary-bits";

/**
 * THE DIARY (James, 3 Oct 2026, from his three-phone mockup): Day, Week and
 * Month, the same brick cottage on all three. Replaces "Your Day" and its
 * drawn cards.
 *
 *   Day    a stepper (back, today, forward) and the day as a timeline - time,
 *          a coloured dot, a card with what, who and where
 *   Week   the week as a strip with dots under busy days; the chosen day as
 *          blocks on an hour grid
 *   Month  the month as a grid with dots; the chosen day's first few below,
 *          with View All into Day
 *
 * The diary is the same read as everywhere (loadDiary: two weeks back, ninety
 * days ahead, the agent's own). A day outside that says so rather than
 * looking empty. Each appointment opens /agent/event/<id>. Read only - the
 * phone does not book yet.
 */

type View = "day" | "week" | "month";
const BACK = 14;
const AHEAD = 90;

const isBusy = (a: Appt) => a.what === "Busy" && !a.where;
const dateOf = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
/** Monday = 0. */
const dow = (d: Date) => (d.getDay() + 6) % 7;
const mins = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/* What each kind looks like: pink for the customer-facing, sage for the
   handover side, grey for valuations - the mockup's three tones. */
const KIND: Record<string, { icon: string; tone: "pink" | "sage" | "grey" }> = {
  viewing: { icon: "home", tone: "pink" },
  appraisal: { icon: "key", tone: "grey" },
  takeon: { icon: "checklist", tone: "sage" },
  movein: { icon: "key", tone: "sage" },
  inspection: { icon: "checklist", tone: "sage" },
  other: { icon: "calendar", tone: "pink" },
};
const kindOf = (a: Appt) => KIND[a.kind] ?? KIND.other!;
const TONE = {
  pink: { wash: "var(--m-pink-wash)", ink: "var(--m-coral)", dot: "var(--m-coral)" },
  sage: { wash: "var(--m-green-wash)", ink: "var(--m-sage-ink)", dot: "var(--m-green)" },
  grey: { wash: "var(--m-fill)", ink: "var(--m-ink)", dot: "var(--m-muted)" },
};

const LINE: Record<View, string> = { day: "Your day at a glance.", week: "Your week at a glance.", month: "Your month at a glance." };

export default function PhoneDiary() {
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("day");
  const [sel, setSel] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const got = await loadDiary();
      setNote(got.note);
      setAppts(got.appts.filter((a) => a.kind !== "travel" && !isBusy(a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your diary did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "week" || v === "month") setView(v);
  }, [load]);

  const pick = (v: View) => {
    setView(v);
    window.history.replaceState(null, "", v === "day" ? "/agent/day" : `/agent/day?view=${v}`);
  };

  const byDay = useMemo(() => {
    const m = new Map<number, Appt[]>();
    for (const a of appts ?? []) {
      const list = m.get(a.day) ?? [];
      list.push(a);
      m.set(a.day, list);
    }
    for (const list of m.values()) list.sort((x, y) => Number(Boolean(y.allDay)) - Number(Boolean(x.allDay)) || x.start.localeCompare(y.start));
    return m;
  }, [appts]);

  return (
    <main>
      <TopBar />
      <HomeHero title="Diary" line={LINE[view]} src="/illustrations/app/diary-cottage.webp" height={170} right={-14} bottom={14} />

      <div className="relative z-[1] -mt-5 grid grid-cols-3 gap-1 rounded-full p-1 shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]" style={{ background: "var(--m-card)" }}>
        {(["day", "week", "month"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => pick(v)}
            aria-pressed={view === v}
            className="h-11 rounded-full text-[15px] font-medium transition-colors"
            style={view === v ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : undefined}
          >
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {note && <p className="mt-3 px-1 text-[12.5px] text-muted">{note}</p>}

      {error ? (
        <div className="mt-4">
          <ErrorLine text={error} onRetry={load} />
        </div>
      ) : !appts ? (
        <Spinner label="Loading your diary" className="py-8" />
      ) : view === "day" ? (
        <DayView sel={sel} setSel={setSel} list={byDay.get(sel) ?? []} />
      ) : view === "week" ? (
        <WeekView sel={sel} setSel={setSel} byDay={byDay} />
      ) : (
        <MonthView
          sel={sel}
          setSel={setSel}
          byDay={byDay}
          onViewAll={() => pick("day")}
        />
      )}
    </main>
  );
}

/* ─────────────────────────────── shared ─────────────────────────────── */

function Stepper({ title, line, onPrev, onNext, prevOff, nextOff }: { title: string; line?: string; onPrev: () => void; onNext: () => void; prevOff?: boolean; nextOff?: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-full p-1.5" style={{ background: "var(--m-card)" }}>
      <Arrow dir="back" onClick={onPrev} disabled={prevOff} />
      <span className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
        <DoodleIcon name="calendar" size={20} />
        <span className="min-w-0 text-center">
          <span className="block truncate text-[15.5px] font-semibold leading-tight">{title}</span>
          {line && <span className="block truncate text-[12.5px] text-muted">{line}</span>}
        </span>
      </span>
      <Arrow dir="next" onClick={onNext} disabled={nextOff} />
    </div>
  );
}

function Arrow({ dir, onClick, disabled }: { dir: "back" | "next"; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={dir === "back" ? "Back" : "Forward"} className="m-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-30" style={{ background: "var(--m-bg)" }}>
      <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
        <path d={dir === "back" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Outside({ offset }: { offset: number }) {
  return (
    <p className="mt-4 rounded-[22px] px-4 py-5 text-center text-[14px] text-muted" style={{ background: "var(--m-card)" }}>
      {offset < -BACK ? "The phone keeps the last two weeks. Older appointments are on the desk." : "That's further ahead than the phone looks - 90 days."}
    </p>
  );
}

/** One appointment as a timeline row: time, dot, card. */
function Row({ a, done }: { a: Appt; done: boolean }) {
  const k = kindOf(a);
  const t = TONE[k.tone];
  const title = a.kind === "other" ? a.what : KIND_LABEL[a.kind] ?? a.what;
  return (
    <li className={`relative flex gap-3 ${done ? "opacity-55" : ""}`}>
      <span className="w-[46px] shrink-0 pt-4 text-right text-[13.5px] font-medium">{a.allDay ? "All day" : a.start}</span>
      <span className="relative flex w-3 shrink-0 justify-center">
        <span aria-hidden className="absolute bottom-[-10px] top-0 w-[1.5px]" style={{ background: "var(--m-line)" }} />
        <span aria-hidden className="relative mt-[21px] h-2.5 w-2.5 rounded-full" style={{ background: t.dot, boxShadow: "0 0 0 3px var(--m-bg)" }} />
      </span>
      <Link href={`/agent/event/${encodeURIComponent(a.id)}`} className="m-press mb-2.5 flex min-w-0 flex-1 items-center gap-3 rounded-[20px] p-3" style={{ background: "var(--m-card)" }}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: t.wash, color: t.ink }}>
          <DoodleIcon name={k.icon} size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold">{title}</span>
          {a.who && <span className="block truncate text-[13.5px] text-muted">{a.who}</span>}
          {a.where && <span className="block truncate text-[13px] text-muted">{a.where}</span>}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Link>
    </li>
  );
}

function Timeline({ list, offset, max }: { list: Appt[]; offset: number; max?: number }) {
  const now = nowHm();
  if (offset < -BACK || offset > AHEAD) return <Outside offset={offset} />;
  if (!list.length) {
    return (
      <div className="mt-4 flex flex-col items-center rounded-[22px] px-6 py-7 text-center" style={{ background: "var(--m-card)" }}>
        <img src="/illustrations/app/empty-armchair.webp" alt="" className="h-[120px] w-auto" />
        <p className="mt-2 text-[16px] font-medium">Nothing Booked</p>
        <p className="mt-1 text-[14px] text-muted">{offset === 0 ? "Nothing in your diary today." : "Nothing in your diary on this day."}</p>
      </div>
    );
  }
  return (
    <ol className="mt-4">
      {list.slice(0, max ?? list.length).map((a, i) => (
        <Row key={`${a.id}-${i}`} a={a} done={offset < 0 || (offset === 0 && !a.allDay && endOf(a) <= now)} />
      ))}
    </ol>
  );
}

/* ─────────────────────────────── DAY ─────────────────────────────── */

function DayView({ sel, setSel, list }: { sel: number; setSel: (n: number) => void; list: Appt[] }) {
  const d = dateOf(sel);
  const word = sel === 0 ? "Today" : sel === 1 ? "Tomorrow" : sel === -1 ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "long" });
  return (
    <>
      <Stepper title={word} line={d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} onPrev={() => setSel(sel - 1)} onNext={() => setSel(sel + 1)} />
      {sel !== 0 && (
        <button type="button" onClick={() => setSel(0)} className="mx-auto mt-2 block text-[13.5px] font-semibold" style={{ color: "var(--m-coral)" }}>
          Back to Today
        </button>
      )}
      <Timeline list={list} offset={sel} />
    </>
  );
}

/* ─────────────────────────────── WEEK ─────────────────────────────── */

function Dots({ list }: { list: Appt[] }) {
  const tones = [...new Set(list.map((a) => kindOf(a).tone))].slice(0, 3);
  return (
    <span className="mt-1 flex h-1.5 justify-center gap-[3px]">
      {tones.map((t) => (
        <span key={t} className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[t].dot }} />
      ))}
    </span>
  );
}

const HOUR = 46;

function WeekView({ sel, setSel, byDay }: { sel: number; setSel: (n: number) => void; byDay: Map<number, Appt[]> }) {
  const start = sel - dow(dateOf(sel));
  const days = Array.from({ length: 7 }, (_, i) => start + i);
  const a = dateOf(start);
  const b = dateOf(start + 6);
  const range =
    a.getMonth() === b.getMonth()
      ? `${a.getDate()} - ${b.getDate()} ${b.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`
      : `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const list = byDay.get(sel) ?? [];
  const timed = list.filter((x) => !x.allDay);
  const allDay = list.filter((x) => x.allDay);
  /* The working day, stretched to whatever is booked outside it. */
  const from = Math.min(8, ...timed.map((x) => Math.floor(mins(x.start) / 60)));
  const to = Math.max(18, ...timed.map((x) => Math.ceil(mins(endOf(x)) / 60)));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const inRange = sel >= -BACK && sel <= AHEAD;

  return (
    <>
      <Stepper title={range} onPrev={() => setSel(sel - 7)} onNext={() => setSel(sel + 7)} />
      <div className="mt-3 grid grid-cols-7 rounded-[22px] px-1 py-2.5" style={{ background: "var(--m-card)" }}>
        {days.map((o) => {
          const d = dateOf(o);
          const on = o === sel;
          return (
            <button key={o} type="button" onClick={() => setSel(o)} className="flex flex-col items-center">
              <span className="text-[12px] text-muted">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span
                className="mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold"
                style={on ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : o === 0 ? { boxShadow: "inset 0 0 0 1.5px var(--m-coral)" } : undefined}
              >
                {d.getDate()}
              </span>
              <Dots list={byDay.get(o) ?? []} />
            </button>
          );
        })}
      </div>

      {!inRange ? (
        <Outside offset={sel} />
      ) : (
        <>
          {allDay.map((x, i) => (
            <p key={`${x.id}-${i}`} className="mt-3 rounded-[16px] px-4 py-2.5 text-[14px]" style={{ background: "var(--m-green-wash)" }}>
              <span className="font-semibold">All day</span> - {x.what}
            </p>
          ))}
          <div className="relative mt-3 rounded-[22px] py-3 pr-3" style={{ background: "var(--m-card)", height: hours.length * HOUR + 24 }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute left-0 right-3 flex items-start" style={{ top: 12 + i * HOUR }}>
                <span className="-mt-2 w-[54px] shrink-0 pr-2 text-right text-[12px] text-muted">{String(h).padStart(2, "0")}:00</span>
                <span className="mt-0 h-px flex-1" style={{ background: "var(--m-line)" }} />
              </div>
            ))}
            {timed.map((x, i) => {
              const k = kindOf(x);
              const t = TONE[k.tone];
              const top = 12 + ((mins(x.start) - from * 60) / 60) * HOUR;
              const height = Math.max(34, (x.mins / 60) * HOUR - 4);
              return (
                <Link
                  key={`${x.id}-${i}`}
                  href={`/agent/event/${encodeURIComponent(x.id)}`}
                  className="m-press absolute left-[62px] right-3 flex items-center gap-2.5 overflow-hidden rounded-[14px] px-3"
                  style={{ top: top + 2, height, background: t.wash }}
                >
                  <span className="shrink-0" style={{ color: t.ink }}>
                    <DoodleIcon name={k.icon} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold leading-tight">{x.kind === "other" ? x.what : KIND_LABEL[x.kind] ?? x.what}</span>
                    {height > 40 && <span className="block truncate text-[12.5px] text-muted">{[x.start, x.who || x.where].filter(Boolean).join(" · ")}</span>}
                  </span>
                </Link>
              );
            })}
            {!timed.length && !allDay.length && (
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[14px] text-muted">Nothing booked on this day.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ─────────────────────────────── MONTH ─────────────────────────────── */

function MonthView({ sel, setSel, byDay, onViewAll }: { sel: number; setSel: (n: number) => void; byDay: Map<number, Appt[]>; onViewAll: () => void }) {
  const d = dateOf(sel);
  const first = sel - (d.getDate() - 1);
  const lead = dow(dateOf(first));
  const length = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length }, (_, i) => first + i)];
  const list = byDay.get(sel) ?? [];

  /* A month back or on: the same day of that month, or its last day. */
  const shift = (by: number) => {
    const t = new Date(d.getFullYear(), d.getMonth() + by, 1, 12);
    const day = Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate());
    t.setDate(day);
    setSel(Math.round((t.getTime() - dateOf(0).getTime()) / 864e5));
  };

  return (
    <>
      <Stepper title={d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} onPrev={() => shift(-1)} onNext={() => shift(1)} />
      <div className="mt-3 rounded-[22px] p-2" style={{ background: "var(--m-card)" }}>
        <div className="grid grid-cols-7 pb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <span key={w} className="text-center text-[12px] text-muted">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((o, i) =>
            o === null ? (
              <span key={`x${i}`} className="h-[52px] border-t" style={{ borderColor: "var(--m-line)" }} />
            ) : (
              <button key={o} type="button" onClick={() => setSel(o)} className="flex h-[52px] flex-col items-center justify-center border-t" style={{ borderColor: "var(--m-line)" }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[14.5px] font-medium"
                  style={
                    o === sel
                      ? { background: "var(--m-pink-wash)", color: "var(--m-coral)", fontWeight: 700 }
                      : o === 0
                        ? { boxShadow: "inset 0 0 0 1.5px var(--m-coral)" }
                        : o < -BACK || o > AHEAD || dow(dateOf(o)) > 4
                          ? { color: "var(--m-muted)" }
                          : undefined
                  }
                >
                  {dateOf(o).getDate()}
                </span>
                <Dots list={byDay.get(o) ?? []} />
              </button>
            )
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between px-1">
        <h2 className="m-title text-[19px]">{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</h2>
        {list.length > 3 && (
          <button type="button" onClick={onViewAll} className="rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold" style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}>
            View All
          </button>
        )}
      </div>
      <Timeline list={list} offset={sel} max={3} />
      {list.length > 3 && (
        <button type="button" onClick={onViewAll} className="m-btn m-press mt-1 w-full">
          See all {list.length} on {d.toLocaleDateString("en-GB", { weekday: "long" })}
        </button>
      )}
    </>
  );
}
