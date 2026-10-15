"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PERIODS, londonDate, periodQuery, periodRange, type PeriodKey } from "@/lib/tracking/period";

/**
 * The pieces every Tracking screen shares (15 Oct 2026): the period, who is
 * counted, the loading and error states, and the two small charts.
 *
 * The period lives in the address (?period=month, ?period=custom&from=&to=),
 * so a drill-down keeps it, a refresh keeps it, and a link can be sent. It is
 * worked out from the clock each time (lib/tracking/period): "This month" is
 * whichever month it is.
 */

export const card = "rounded-[22px] border border-line/50 bg-white";
export const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";

export const n = (v: number) => v.toLocaleString("en-GB");

/** 95 -> "1m 35s", 4000 -> "1h 7m". */
export function duration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ""}`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export interface TrackingQuery {
  key: PeriodKey;
  from: string;
  to: string;
  owners: boolean;
  person: string | null;
}

function readQuery(): TrackingQuery {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const key = (PERIODS.some((x) => x.key === p.get("period")) ? p.get("period") : "month") as PeriodKey;
  return { key, from: p.get("from") ?? "", to: p.get("to") ?? "", owners: p.get("owners") === "1", person: p.get("person") };
}

/** The address's own query string for a TrackingQuery, for links between the screens. */
export function queryString(t: TrackingQuery, extra?: Partial<TrackingQuery>): string {
  const v = { ...t, ...extra };
  const p = new URLSearchParams();
  p.set("period", v.key);
  if (v.key === "custom") {
    p.set("from", v.from);
    p.set("to", v.to);
  }
  if (v.owners) p.set("owners", "1");
  if (v.person) p.set("person", v.person);
  return p.toString();
}

export function useTrackingQuery() {
  const router = useRouter();
  const path = usePathname();
  /* Null until the address has been read, so the first fetch is the right one. */
  const [t, setT] = useState<TrackingQuery | null>(null);
  useEffect(() => setT(readQuery()), []);
  const set = useCallback(
    (change: Partial<TrackingQuery>) => {
      if (!t) return;
      const next = { ...t, ...change };
      setT(next);
      router.replace(`${path}?${queryString(next)}`, { scroll: false });
    },
    [router, path, t]
  );
  const period = useMemo(() => (t ? periodRange(t.key, new Date(), { from: t.from, to: t.to }) : null), [t]);
  return { t, set, period };
}

export interface Fetched<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** The figures for a query: loading, the answer, or what went wrong - never a stale number. */
export function useTracking<T>(t: TrackingQuery | null, extra: string): Fetched<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const url = useMemo(() => {
    if (!t) return null;
    const p = periodRange(t.key, new Date(), { from: t.from, to: t.to });
    return `/api/admin/tracking?${periodQuery(p)}${t.owners ? "&owners=1" : ""}${t.person ? `&person=${encodeURIComponent(t.person)}` : ""}${extra}`;
  }, [t, extra]);
  useEffect(() => {
    if (!url) return;
    let gone = false;
    /* The old figures go the moment the question changes: a number from the
       previous period on screen beside the new period's name would be a lie. */
    setState({ data: null, error: null, loading: true });
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) throw new Error("Tracking is for owners.");
        const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "The figures couldn't be read just now.");
        return j as T;
      })
      .then((data) => !gone && setState({ data, error: null, loading: false }))
      .catch((e: Error) => !gone && setState({ data: null, error: e.message, loading: false }));
    return () => {
      gone = true;
    };
    /* `tick` so Try again asks afresh even when the address is the same. */
  }, [url, tick]);
  return { ...state, reload: () => setTick((x) => x + 1) };
}

/* ── the period bar ─────────────────────────────────────────────────────── */

export function PeriodBar({ t, set, label, personName }: { t: TrackingQuery; set: (c: Partial<TrackingQuery>) => void; label: string; personName?: string | null }) {
  const today = londonDate(new Date());
  const [from, setFrom] = useState(t.from || today.slice(0, 8) + "01");
  const [to, setTo] = useState(t.to || today);
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div role="radiogroup" aria-label="Period" className="flex overflow-hidden rounded-lg border border-line/80">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={t.key === p.key}
              onClick={() => set(p.key === "custom" ? { key: "custom", from, to } : { key: p.key })}
              className={`border-l border-line/80 px-3 py-1.5 text-[12px] first:border-l-0 ${t.key === p.key ? "bg-ink text-page" : "bg-white text-muted hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {t.key === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line/80 bg-white px-2 py-1" />
            <span className="text-muted">to</span>
            <input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line/80 bg-white px-2 py-1" />
            <button type="button" onClick={() => set({ key: "custom", from, to })} disabled={!from || !to} className="rounded-lg border border-line/80 px-3 py-1 hover:border-ink/40 disabled:opacity-40">
              Show
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={t.owners} onChange={(e) => set({ owners: e.target.checked })} />
          Count the owners too
        </label>
      </div>
      <p className="text-[12px] text-muted">
        <span className="font-semibold text-ink">{label}</span>
        {personName ? (
          <>
            {" "}· only <span className="font-semibold text-ink">{personName}</span>{" "}
            <button type="button" onClick={() => set({ person: null })} className="ml-1 underline decoration-line hover:decoration-ink">
              Everyone
            </button>
          </>
        ) : null}
        {!t.owners && " · James, Susan, Howard and Sean left out"} · test files never counted
      </p>
    </div>
  );
}

/* ── states ─────────────────────────────────────────────────────────────── */

export function Loading({ what = "Reading the figures" }: { what?: string }) {
  return (
    <div className="mt-8 flex items-center gap-2.5 text-[12.5px] text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden />
      {what}…
    </div>
  );
}

export function Failed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className={`${card} mt-8 p-5`} role="alert">
      <p className="text-[13px] text-accent-dark">{error}</p>
      <p className="mt-1 text-[12px] text-muted">Nothing is shown rather than an old figure.</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] hover:border-ink/40">
        Try again
      </button>
    </div>
  );
}

export function SourceErrors({ sources }: { sources: Record<string, string | null> | undefined }) {
  const errs = Object.values(sources ?? {}).filter(Boolean) as string[];
  if (!errs.length) return null;
  return (
    <p role="alert" className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-3.5 py-2.5 text-[12px] text-accent-dark">
      {errs.join(" ")} The figures that depend on it are left blank rather than shown as nought.
    </p>
  );
}

/* ── charts ─────────────────────────────────────────────────────────────── */

/**
 * One bar per day. A single series, so one colour and no legend: the title
 * says what it counts. Hover (or tap) a day for its figures.
 */
export function DayBars({ days, title }: { days: Array<{ day: string; opens: number; actions: number; outcomes: number }>; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const value = (d: (typeof days)[number]) => d.opens + d.actions;
  const max = Math.max(1, ...days.map(value));
  const h = days[hover ?? -1];
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-semibold">{title}</p>
        <p className="text-[11.5px] text-muted" aria-live="polite">
          {h ? (
            <>
              {dayLabel(h.day)}: <span className="figures text-ink">{n(h.opens)}</span> opened · <span className="figures text-ink">{n(h.actions)}</span> done · <span className="figures text-ink">{n(h.outcomes)}</span> results
            </>
          ) : (
            "Hover a day for its figures"
          )}
        </p>
      </div>
      <div className="relative mt-3 h-36" onMouseLeave={() => setHover(null)}>
        <span className="absolute left-0 top-0 text-[10px] text-muted">{n(max)}</span>
        <div className="absolute inset-x-0 top-[7px] border-t border-dashed border-line/60" aria-hidden />
        <div className="absolute inset-x-0 bottom-5 border-t border-line" aria-hidden />
        <div className="absolute inset-x-0 bottom-5 top-3 flex items-end gap-[2px] pl-7">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              aria-label={`${dayLabel(d.day)}: ${d.opens} opened, ${d.actions} done, ${d.outcomes} results`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              className="group flex h-full flex-1 items-end"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-ink" : "bg-accent-dark"}`}
                style={{ height: value(d) ? `${Math.max(2, (value(d) / max) * 100)}%` : "0%" }}
              />
            </button>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex gap-[2px] pl-7">
          {days.map((d, i) => (
            <span key={d.day} className="flex-1 truncate text-center text-[9.5px] text-muted">
              {i % labelEvery === 0 ? new Date(`${d.day}T12:00:00Z`).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }) : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars against a whole: a funnel's steps, or where people stopped. */
export function HBars({ rows, of, unit = "" }: { rows: Array<{ label: string; value: number; note?: string }>; of: number; unit?: string }) {
  const max = Math.max(1, of);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${n(r.value)}${unit}`}>
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 text-muted">
              <span className="figures text-ink">{n(r.value)}</span>
              {r.note ? ` · ${r.note}` : ""}
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-[4px] bg-line/30">
            <div className="h-full rounded-[4px] bg-accent-dark" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

/* ── where the numbers come from ────────────────────────────────────────── */

/** The first day each newer record holds anything: null until it has. */
export type Since = { time: string | null; passportOpens: string | null; phone: string | null };

const sinceDay = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : null);

/** Where the numbers come from, in a sentence each - and what only counts from when. */
export function Sources({ since }: { since?: Since }) {
  const s = since ?? { time: null, passportOpens: null, phone: null };
  const from = (d: string | null) => (sinceDay(d) ? `since ${sinceDay(d)}` : "from this update on - nothing yet");
  return (
    <section className="mt-6 px-1 pb-6 text-[11.5px] leading-relaxed text-muted">
      <p className="font-semibold text-ink">Where These Come From</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Opens: every screen opened while signed in, per person per day, kept since 28 Aug 2026. The phone app and phone screens are counted {from(s.phone)}.</li>
        <li>Done: every save, send or change made while signed in, from the read log, kept since 10 Oct 2026.</li>
        <li>Results: each part&apos;s own records - valuations, listings, repairs and the rest. Each figure says which on its own page.</li>
        <li>Time on a page: counted {from(s.time)}. Tenants opening their passport: counted {from(s.passportOpens)}; before that an open is only known if they filled something in.</li>
        <li>Never counted: test files, anything sent to one of our own addresses, and an owner viewing as somebody else.</li>
      </ul>
    </section>
  );
}
