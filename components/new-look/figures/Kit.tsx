"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CountUp } from "@/components/new-look/dashboard/Charts";
import { useNewLook } from "@/lib/use-new-look";

/**
 * My Business and Admin in the house style (lib/new-look "figures", James,
 * 25 Nov 2026). The PM Dashboard's pieces for the business figures: a section
 * with a head in the capitals, a ruled strip of figures, columns for a run of
 * months and a funnel. Styled from app/new-look/figures.css under `.nl-fx`.
 *
 * Every figure handed to these is the tab's own live figure; a piece given
 * nothing draws a dash with the reason, never a number of its own.
 */

/**
 * Inside a screen that carries the house style's root (`.nl-fx`): the My
 * Business frame and the admin layout. The same tab drawn somewhere else (the
 * Compliance tab on Michael's desk, Move-ins on Kirstie's) stays as it is.
 */
const FxRoot = createContext(false);
export function FxOn({ children }: { children: ReactNode }) {
  return <FxRoot.Provider value>{children}</FxRoot.Provider>;
}
/** The switch covers this person and the screen has the root. */
export function useFx(): boolean {
  const root = useContext(FxRoot);
  return useNewLook("figures") === true && root;
}

/** Bars and columns grow from nothing a beat after they land. */
export function useGrow() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 90);
    return () => window.clearTimeout(t);
  }, []);
  return on;
}

/** A section as the PM Dashboard draws one: title, a line under it, the source on the right. */
export function FxSection({ title, sub, source, aside, children, className = "" }: { title: ReactNode; sub?: ReactNode; source?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`nl-fx-sec ${className}`}>
      <div className="nl-fx-sec-h">
        <div className="min-w-0">
          <h2 className="nl-fx-sec-t">{title}</h2>
          {sub ? <p className="nl-fx-sec-sub">{sub}</p> : null}
        </div>
        {aside}
      </div>
      {source ? <p className="nl-fx-sec-src">{source}</p> : null}
      {children}
    </section>
  );
}

/** Figures side by side on hairlines. `cols` fixes the count across; otherwise they fit. */
export function FxStrip({ children, cols, className = "" }: { children: ReactNode; cols?: number; className?: string }) {
  return (
    <div className={`nl-fx-strip ${className}`} style={cols ? ({ "--fx-cols": cols } as React.CSSProperties) : undefined} data-cols={cols ?? undefined}>
      {children}
    </div>
  );
}

export type FxState = "live" | "manual" | "derived" | "none";

/** One figure in a strip: the label, the figure, what it means. */
export function FxCell({
  label, value, sub, state = "live", flag, hover, loading = false, big = false, tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  state?: FxState;
  /** A red word on the right of the label ("6 late"). */
  flag?: ReactNode;
  hover?: string;
  loading?: boolean;
  big?: boolean;
  tone?: "terra" | "olive";
}) {
  const label2 = state === "none" ? "No source yet" : state === "manual" ? "Typed in" : state === "derived" ? "Worked out here" : "Live";
  return (
    <div className={`nl-fx-cell${big ? " is-big" : ""}${state === "none" ? " is-none" : ""}`} title={hover || undefined}>
      <span className="nl-fx-cell-top">
        <span className="nl-fx-cell-l">{label}</span>
        {flag ? <em className="nl-fx-cell-flag">{flag}</em> : <i className={`nl-fx-src is-${state}`} aria-label={label2} title={label2} />}
      </span>
      {loading ? (
        <span className="nl-fx-cell-n is-reading"><span className="nl-dash-spin" aria-label="Reading" /></span>
      ) : (
        <b className={`nl-fx-cell-n${tone ? ` is-${tone}` : ""}`}>{value}</b>
      )}
      {sub ? <span className="nl-fx-cell-sub">{sub}</span> : null}
    </div>
  );
}

/** A figure that counts up when it is a plain number. */
export function Count({ n, format }: { n: number; format?: (n: number) => string }) {
  return <CountUp value={n} format={format} />;
}

export type FxTone = "clay" | "olive" | "terra" | "sage" | "brown" | "linen";

/**
 * Columns for a run of months: one or two series side by side, the month we
 * are in marked in terracotta, a dotted line at the average of the closed
 * months, the value over each column and its make-up on hover.
 */
export function FxColumns({
  labels, series, format, nowIndex = -1, details, height = 260, average = true, negatives = false,
}: {
  labels: string[];
  series: { name: string; tone: FxTone; values: (number | null)[] }[];
  format: (n: number) => string;
  nowIndex?: number;
  details?: Array<Array<[string, string]>>;
  height?: number;
  average?: boolean;
  /** Draw below a zero line too (profit and loss). */
  negatives?: boolean;
}) {
  const on = useGrow();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = Math.max(1, ...all.map((v) => Math.max(0, v)));
  const min = negatives ? Math.min(0, ...all) : 0;
  const span = max - min || 1;
  const zeroPct = ((max - 0) / span) * 100;
  const first = series[0];
  const closed = first.values.filter((v, i): v is number => v != null && i !== nowIndex);
  const avg = average && closed.length > 1 ? closed.reduce((a, b) => a + b, 0) / closed.length : null;
  const avgPct = avg != null ? ((max - avg) / span) * 100 : null;
  /* A line across the plot sits in its padding box; the bars sit in its content box. */
  const at = (pct: number) => `calc(var(--fx-pt) + (100% - var(--fx-pt) - var(--fx-pb)) * ${(pct / 100).toFixed(4)})`;
  return (
    <div className={`nl-fx-cols${negatives && min < 0 ? " is-neg" : ""}`} style={{ "--fx-h": `${height}px` } as React.CSSProperties}>
      <div className="nl-fx-cols-plot" onMouseLeave={() => setHover(null)}>
        {negatives && min < 0 ? <span className="nl-fx-cols-zero" style={{ top: at(zeroPct) }} aria-hidden /> : null}
        {avgPct != null ? (
          <span className="nl-fx-cols-avg" style={{ top: at(avgPct) }}>
            <em>Average {format(avg!)}</em>
          </span>
        ) : null}
        {labels.map((lab, i) => (
          <div
            key={lab + i}
            className={`nl-fx-col${i === nowIndex ? " is-now" : ""}${hover === i ? " is-hover" : ""}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={details?.[i]?.length ? 0 : -1}
          >
            {series.map((s, si) => {
              const v = s.values[i];
              if (v == null) return <span key={si} className="nl-fx-col-bar is-empty" />;
              const up = v >= 0;
              const h = (Math.abs(v) / span) * 100;
              return (
                <span
                  key={si}
                  className={`nl-fx-col-bar is-${i === nowIndex && si === 0 ? "terra" : s.tone}${up ? "" : " is-neg"}`}
                  style={{
                    height: on ? `${Math.max(0.6, h)}%` : 0,
                    ...(up ? { bottom: `${100 - zeroPct}%` } : { top: `${zeroPct}%` }),
                    transitionDelay: `${i * 40}ms`,
                  }}
                >
                  {si === 0 && series.length === 1 ? <em className="nl-fx-col-v">{format(v)}</em> : null}
                </span>
              );
            })}
            {hover === i && details?.[i]?.length ? (
              <span className="nl-fx-col-tip" role="tooltip">
                <b>{lab}</b>
                {details[i].map(([k, val]) => (
                  <span key={k}>
                    <span>{k}</span>
                    <span>{val}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="nl-fx-cols-x" aria-hidden>
        {labels.map((lab, i) => (
          <span key={lab + i} className={i === nowIndex ? "is-now" : undefined}>{lab}</span>
        ))}
      </div>
      {series.length > 1 ? (
        <div className="nl-fx-key">
          {series.map((s) => (
            <span key={s.name}>
              <i className={`is-${s.tone}`} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The funnel: each stage a bar against the first, and the share that made it
 * from the stage before written between them.
 */
export function FxFunnel({ steps, format = (n) => n.toLocaleString("en-GB"), rates = false }: { steps: { label: string; value: number | null; note?: string; tone?: FxTone; loading?: boolean }[]; format?: (n: number) => string; /** The share of the stage before, for a true funnel only. */ rates?: boolean }) {
  const on = useGrow();
  const top = Math.max(1, ...steps.map((s) => s.value ?? 0));
  const tones: FxTone[] = ["clay", "clay", "clay", "clay", "olive"];
  return (
    <ol className={`nl-fx-funnel${rates ? " has-rates" : ""}`}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev && s.value != null && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <li key={s.label} title={s.note}>
            <span className="nl-fx-funnel-l">{s.label}</span>
            <span className="nl-fx-funnel-tr">
              <i className={`is-${s.tone ?? tones[i % tones.length]}`} style={{ width: on && s.value != null ? `${Math.max(1.5, (s.value / top) * 100)}%` : 0, transitionDelay: `${i * 90}ms` }} />
            </span>
            <b className="nl-fx-funnel-n">{s.loading ? <span className="nl-dash-spin" aria-label="Reading" /> : s.value == null ? "-" : format(s.value)}</b>
            {rates ? <span className="nl-fx-funnel-r">{rate != null ? `${rate}%` : ""}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A long bar cut into parts, with the key under it. */
export function FxSplit({ parts, format = (n) => n.toLocaleString("en-GB") }: { parts: { label: string; value: number; tone: FxTone }[]; format?: (n: number) => string }) {
  const on = useGrow();
  const sum = Math.max(1, parts.reduce((a, p) => a + Math.max(0, p.value), 0));
  return (
    <div className="nl-fx-split">
      <div className="nl-fx-split-bar" aria-hidden>
        {parts.map((p) => (
          <i key={p.label} className={`is-${p.tone}`} style={{ flexGrow: on ? Math.max(0, p.value) : 0.0001, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="nl-fx-split-key">
        {parts.map((p) => (
          <li key={p.label}>
            <i className={`is-${p.tone}`} />
            <span>{p.label}</span>
            <b>{format(p.value)}</b>
            <em>{Math.round((Math.max(0, p.value) / sum) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for a list (fee types, regions, agents), longest first as given. */
export function FxBars({ rows, format = (n) => n.toLocaleString("en-GB"), tone = "clay", max: maxIn }: { rows: { label: ReactNode; value: number; sub?: ReactNode; tone?: FxTone; key?: string }[]; format?: (n: number) => string; tone?: FxTone; max?: number }) {
  const on = useGrow();
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="nl-fx-bars">
      {rows.map((r, i) => (
        <li key={r.key ?? (typeof r.label === "string" ? r.label : i)}>
          <span className="nl-fx-bars-l">
            {r.label}
            {r.sub ? <small>{r.sub}</small> : null}
          </span>
          <b className="nl-fx-bars-n">{format(r.value)}</b>
          <span className="nl-fx-bars-tr" aria-hidden>
            <i className={`is-${r.tone ?? tone}`} style={{ width: on ? `${Math.max(0.8, (Math.max(0, r.value) / max) * 100)}%` : 0, transitionDelay: `${i * 50}ms` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A ring for one share ("92% compliant"). */
export function FxGauge({ pct, label, tone = "olive", size = 132 }: { pct: number | null; label: string; tone?: FxTone; size?: number }) {
  const on = useGrow();
  const R = 52;
  const C = 2 * Math.PI * R;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="nl-fx-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 132 132" width={size} height={size} aria-hidden>
        <circle cx="66" cy="66" r={R} className="nl-fx-gauge-track" />
        <circle cx="66" cy="66" r={R} className={`nl-fx-gauge-arc is-${tone}`} strokeDasharray={`${on ? (p / 100) * C : 0} ${C}`} />
      </svg>
      <span className="nl-fx-gauge-mid">
        <b>{pct == null ? "-" : `${Math.round(p * 10) / 10}%`}</b>
        <span>{label}</span>
      </span>
    </div>
  );
}

/** Two or three pictures side by side, the PM Dashboard's card row. */
export function FxCards({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`nl-fx-cards is-${cols}`}>{children}</div>;
}
