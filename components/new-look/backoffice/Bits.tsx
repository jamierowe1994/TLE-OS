"use client";

import Link from "next/link";

/**
 * The back office's new-look parts (Overview, Maintenance, Contractors,
 * Finances), styled from app/new-look/backoffice.css under [data-look="new"].
 * Every figure handed to these is live; a part that has nothing yet draws its
 * loading or its error, never a number of its own.
 */

/** The small spinner the new look uses while a figure is being read. */
export function Spin() {
  return <span className="nl-bo-spin" aria-hidden />;
}

/** "Reading…" with the spinner, for a section that has not answered yet. */
export function Loading({ children }: { children: React.ReactNode }) {
  return (
    <p className="nl-bo-loading" role="status">
      <Spin />
      {children}
    </p>
  );
}

/** A source that failed: said plainly, with a way to ask again. */
export function Failed({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div className="nl-bo-failed" role="alert">
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export type DeltaTone = "good" | "bad" | "quiet";

/**
 * The design's StatCard: a label, one figure, a line under it. Clickable when
 * it has somewhere to go. `value` null means still reading.
 */
export function Stat({
  label,
  value,
  delta,
  deltaTone = "quiet",
  note,
  trend,
  warm = false,
  href,
  onClick,
  error,
}: {
  label: string;
  value: React.ReactNode | null;
  delta?: React.ReactNode;
  deltaTone?: DeltaTone;
  note?: React.ReactNode;
  trend?: number[] | null;
  warm?: boolean;
  href?: string;
  onClick?: () => void;
  error?: string | null;
}) {
  const body = (
    <>
      {trend && trend.length > 1 && value != null && !error && <Sparkline data={trend} />}
      <span className="nl-bo-stat-label">{label}</span>
      {error ? (
        <span className="nl-bo-stat-err">{error}</span>
      ) : value == null ? (
        <span className="nl-bo-stat-value is-reading">
          <Spin />
        </span>
      ) : (
        <span className="nl-bo-stat-value">{value}</span>
      )}
      {!error && value != null && (delta || note) ? (
        <span className="nl-bo-stat-delta">
          {delta ? <b className={`is-${deltaTone}`}>{delta}</b> : null}
          {delta && note ? " " : null}
          {note}
        </span>
      ) : null}
      {!error && value == null && <span className="nl-bo-stat-delta">reading…</span>}
    </>
  );
  const cls = `nl-bo-stat${warm ? " is-warm" : ""}${trend && trend.length > 1 ? " has-spark" : ""}${href || onClick ? " is-link" : ""}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** A small line under a stat, the last point marked. Draws only real points. */
export function Sparkline({ data }: { data: number[] }) {
  const w = 84;
  const h = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [(i * w) / (data.length - 1), h - 3 - ((v - min) / r) * (h - 8)]);
  const line = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="nl-bo-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path className="area" d={`${line} L${w} ${h} L0 ${h}Z`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" />
    </svg>
  );
}

/** A labelled meter: "Let · 61 of 64" and a bar. */
export function Meter({ label, n, of, quiet = false, hot = false }: { label: string; n: number; of: number; quiet?: boolean; hot?: boolean }) {
  const pct = of > 0 ? Math.max(0, Math.min(100, (n / of) * 100)) : 0;
  return (
    <div className="nl-bo-meter">
      <div className="nl-bo-meter-head">
        <span>{label}</span>
        <span className="nl-meta">
          {n.toLocaleString("en-GB")} of {of.toLocaleString("en-GB")}
        </span>
      </div>
      <div className={`nl-bo-meter-bar${quiet ? " is-quiet" : ""}${hot ? " is-hot" : ""}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Columns for a run of months, the last one lit. Labels come with the data. */
export function Bars({ items }: { items: { key: string; label: string; value: number; shown: string; now?: boolean }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="nl-bo-bars">
      {items.map((m, i) => (
        <div key={m.key} className={`nl-bo-bar${m.now ? " is-now" : ""}`}>
          <span>{m.shown}</span>
          <i style={{ height: `${Math.max(2, (m.value / max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
          <span>{m.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A card with a title and an optional thing on the right of it. */
export function Card({ title, aside, children, className = "", onClick }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <section className={`nl-bo-card ${onClick ? "is-click" : ""} ${className}`} onClick={onClick}>
      <div className="nl-bo-card-head">
        <h2 className="nl-bo-card-title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The design's empty card: an icon, a line in bold, a line under it, and what to do. */
export function EmptyCard({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="nl-bo-empty">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <b>{title}</b>
      {children && <span className="nl-meta">{children}</span>}
      {action}
    </div>
  );
}

/** Initials in a soft circle, for anyone without a logo. */
export function Initials({ name, size = 28 }: { name: string; size?: number }) {
  const ini = name.split(/[^A-Za-z]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span className="nl-bo-ini" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {ini}
    </span>
  );
}
