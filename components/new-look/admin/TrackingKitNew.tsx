"use client";

import { useState } from "react";
import { PERIODS, londonDate } from "@/lib/tracking/period";
import { dayLabel, n, type Since, type TrackingQuery } from "@/components/admin/tracking/kit";

/**
 * Tracking's shared pieces in the new look (lib/new-look "admin", 24 Oct
 * 2026): the period, the source warnings, the two charts and where the
 * numbers come from. The state and the reading stay in
 * components/admin/tracking/kit, so both looks ask the same question.
 */

export function PeriodBarNew({ t, set, label, personName }: { t: TrackingQuery; set: (c: Partial<TrackingQuery>) => void; label: string; personName?: string | null }) {
  const today = londonDate(new Date());
  const [from, setFrom] = useState(t.from || today.slice(0, 8) + "01");
  const [to, setTo] = useState(t.to || today);
  return (
    <div className="nl-adm-period">
      <div className="nl-adm-period-row">
        <div className="nl-toggle" role="radiogroup" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={t.key === p.key} className={t.key === p.key ? "is-on" : ""} onClick={() => set(p.key === "custom" ? { key: "custom", from, to } : { key: p.key })}>
              {p.label}
            </button>
          ))}
        </div>
        {t.key === "custom" && (
          <div className="nl-adm-dates">
            <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="nl-input" />
            <span>to</span>
            <input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="nl-input" />
            <button type="button" onClick={() => set({ key: "custom", from, to })} disabled={!from || !to} className="nl-btn nl-btn--secondary nl-btn--sm">
              Show
            </button>
          </div>
        )}
        <label className="nl-adm-p-check">
          <input type="checkbox" checked={t.owners} onChange={(e) => set({ owners: e.target.checked })} />
          Count the owners too
        </label>
      </div>
      <p className="nl-meta">
        <span className="nl-strong">{label}</span>
        {personName ? (
          <>
            {" "}
            · only <span className="nl-strong">{personName}</span>{" "}
            <button type="button" onClick={() => set({ person: null })} className="nl-link">
              Everyone
            </button>
          </>
        ) : null}
        {!t.owners && " · James, Susan, Howard and Sean left out"} · test files never counted
      </p>
    </div>
  );
}

export function SourceErrorsNew({ sources }: { sources: Record<string, string | null> | undefined }) {
  const errs = Object.values(sources ?? {}).filter(Boolean) as string[];
  if (!errs.length) return null;
  return (
    <p role="alert" className="nl-adm-flash is-bad is-first">
      {errs.join(" ")} The figures that depend on it are left blank rather than shown as nought.
    </p>
  );
}

/** One bar per day. A single series, so one colour and no legend: the title says what it counts. */
export function DayBarsNew({ days, title }: { days: Array<{ day: string; opens: number; actions: number; outcomes: number }>; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const value = (d: (typeof days)[number]) => d.opens + d.actions;
  const max = Math.max(1, ...days.map(value));
  const h = days[hover ?? -1];
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  return (
    <div>
      <div className="nl-adm-chart-head">
        <h3 className="nl-block-title">{title}</h3>
        <p className="nl-meta" aria-live="polite">
          {h ? (
            <>
              {dayLabel(h.day)}: <span className="nl-strong">{n(h.opens)}</span> opened · <span className="nl-strong">{n(h.actions)}</span> done · <span className="nl-strong">{n(h.outcomes)}</span> results
            </>
          ) : (
            "Hover a day for its figures"
          )}
        </p>
      </div>
      <div className="nl-adm-days" onMouseLeave={() => setHover(null)}>
        <span className="nl-adm-days-max">{n(max)}</span>
        <div className="nl-adm-days-top" aria-hidden />
        <div className="nl-adm-days-base" aria-hidden />
        <div className="nl-adm-days-bars">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              aria-label={`${dayLabel(d.day)}: ${d.opens} opened, ${d.actions} done, ${d.outcomes} results`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              className={hover === i ? "is-on" : undefined}
            >
              <i style={{ height: value(d) ? `${Math.max(2, (value(d) / max) * 100)}%` : "0%" }} />
            </button>
          ))}
        </div>
        <div className="nl-adm-days-axis" aria-hidden>
          {days.map((d, i) => (
            <span key={d.day}>{i % labelEvery === 0 ? new Date(`${d.day}T12:00:00Z`).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }) : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars against a whole: a funnel's steps, or where people stopped. */
export function HBarsNew({ rows, of, unit = "" }: { rows: Array<{ label: string; value: number; note?: string }>; of: number; unit?: string }) {
  const max = Math.max(1, of);
  return (
    <ul className="nl-adm-hbars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${n(r.value)}${unit}`}>
          <div className="nl-adm-hbars-line">
            <span>{r.label}</span>
            <span>
              <b>{n(r.value)}</b>
              {r.note ? ` · ${r.note}` : ""}
            </span>
          </div>
          <div className="nl-adm-hbars-track">
            <i style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const sinceDay = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : null);

/** Where the numbers come from, in a sentence each - and what only counts from when. */
export function SourcesNew({ since }: { since?: Since }) {
  const s = since ?? { time: null, passportOpens: null, phone: null };
  const from = (d: string | null) => (sinceDay(d) ? `since ${sinceDay(d)}` : "from this update on - nothing yet");
  return (
    <section className="nl-adm-block">
      <h2 className="nl-block-title">Where These Come From</h2>
      <ul className="nl-adm-bullets">
        <li>Opens: every screen opened while signed in, per person per day, kept since 28 Aug 2026. The phone app and phone screens are counted {from(s.phone)}.</li>
        <li>Done: every save, send or change made while signed in, from the read log, kept since 10 Oct 2026.</li>
        <li>Results: each part&apos;s own records - valuations, listings, repairs and the rest. Each figure says which on its own page.</li>
        <li>
          Time on a page: counted {from(s.time)}. Tenants opening their passport: counted {from(s.passportOpens)}; before that an open is only known if they filled something in.
        </li>
        <li>Never counted: test files, anything sent to one of our own addresses, and an owner viewing as somebody else.</li>
      </ul>
    </section>
  );
}
