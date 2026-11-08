"use client";

import { useEffect, useState } from "react";
import { CountUp } from "@/components/new-look/dashboard/Charts";

/**
 * The PM Dashboard's pictures (James, 8 Nov 2026: "graphics like the homepage
 * dashboard using the different brand colours, giving it some life").
 *
 * Three cards, every figure from the same /api/overview read as the tiles:
 *   - The Book: a ring of tenanted, becoming vacant and vacant homes.
 *   - The Work: each part of the job as a bar, on time in sage, late in
 *     terracotta, longest bar the biggest pile.
 *   - On the Way to a Tenant: drafts to moving in, a bar each in the palette.
 * Every row opens what is behind it, as the tiles do. A part that wasn't read
 * says so in its place; nothing is drawn from an old or made-up figure.
 */

/** Bars grow from nothing a beat after the card lands. */
function useGrow() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 90);
    return () => window.clearTimeout(t);
  }, []);
  return on;
}

export function PmCard({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`nl-pmc ${className}`}>
      <header className="nl-pmc-h">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function PmWait({ children }: { children: React.ReactNode }) {
  return (
    <p className="nl-pmc-wait">
      <span className="nl-dash-spin" aria-hidden />
      {children}
    </p>
  );
}

/* ── The Book: a ring ─────────────────────────────────────────────────────── */

export function BookRing({
  managed, occupied, vacant, upcoming, onOpen,
}: { managed: number; occupied: number; vacant: number; upcoming: number; onOpen: () => void }) {
  const on = useGrow();
  /* Becoming vacant homes are still tenanted today, so they come out of the
     tenanted share rather than adding to the ring. */
  const staying = Math.max(0, occupied - upcoming);
  const parts = [
    { key: "Tenanted", n: staying, cls: "is-sage" },
    { key: "Becoming vacant", n: Math.min(upcoming, occupied), cls: "is-clay" },
    { key: "Vacant", n: vacant, cls: "is-terra" },
  ];
  const total = Math.max(1, parts.reduce((s, p) => s + p.n, 0));
  const R = 64;
  const C = 2 * Math.PI * R;
  let run = 0;
  const pct = managed > 0 ? Math.round((occupied / managed) * 100) : 0;
  return (
    <div className="nl-pm-ring">
      <button type="button" className="nl-pm-ring-art" onClick={onOpen} aria-label={`${pct}% of homes tenanted. Show the move-outs.`}>
        <svg viewBox="0 0 160 160" width="160" height="160" aria-hidden>
          <circle cx="80" cy="80" r={R} className="nl-pm-ring-track" />
          {parts.map((p) => {
            const len = (p.n / total) * C;
            const seg = (
              <circle
                key={p.key}
                cx="80"
                cy="80"
                r={R}
                className={`nl-pm-ring-seg ${p.cls}`}
                strokeDasharray={`${on ? Math.max(0, len - (p.n > 0 ? 2 : 0)) : 0} ${C}`}
                strokeDashoffset={-run}
              />
            );
            run += len;
            return seg;
          })}
        </svg>
        <span className="nl-pm-ring-mid">
          <b><CountUp value={pct} format={(n) => `${Math.round(n)}%`} /></b>
          <span>tenanted</span>
        </span>
      </button>
      <ul className="nl-pm-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <button type="button" onClick={onOpen}>
              <i className={p.cls} aria-hidden />
              <span>{p.key}</span>
              <b>{p.n.toLocaleString("en-GB")}</b>
            </button>
          </li>
        ))}
        <li className="is-total">
          <span>Managed homes</span>
          <b>{managed.toLocaleString("en-GB")}</b>
        </li>
      </ul>
    </div>
  );
}

/* ── The Work: on time against late ───────────────────────────────────────── */

export type WorkRow = {
  label: string;
  /** All of them, the late ones included. Null when the part wasn't read. */
  total: number | null;
  late: number;
  /** What "late" is called for this part ("overdue", "expired"). */
  lateWord?: string;
  /** Why it wasn't read. */
  note?: string | null;
  onOpen?: () => void;
};

export function WorkBars({ rows }: { rows: WorkRow[] }) {
  const on = useGrow();
  const max = Math.max(1, ...rows.map((r) => r.total ?? 0));
  return (
    <>
      <ol className="nl-pm-work">
        {rows.map((r, i) => {
          const ok = r.total == null ? 0 : Math.max(0, r.total - r.late);
          const body = (
            <>
              <span className="nl-pm-work-name">{r.label}</span>
              {r.total == null ? (
                <span className="nl-pm-work-off">{r.note ?? "Not read just now"}</span>
              ) : (
                <>
                  <span className="nl-pm-work-n">
                    <b>{r.total.toLocaleString("en-GB")}</b>
                    {r.late > 0 && <em>{r.late.toLocaleString("en-GB")} {r.lateWord ?? "late"}</em>}
                  </span>
                  <span className="nl-pm-work-tr" aria-hidden>
                    <i className="is-ok" style={{ width: on ? `${(ok / max) * 100}%` : 0, transitionDelay: `${i * 70}ms` }} />
                    <i className="is-late" style={{ width: on ? `${(r.late / max) * 100}%` : 0, transitionDelay: `${i * 70 + 120}ms` }} />
                  </span>
                </>
              )}
            </>
          );
          return (
            <li key={r.label}>
              {r.onOpen && r.total != null ? (
                <button type="button" className="nl-pm-work-row" onClick={r.onOpen}>{body}</button>
              ) : (
                <div className="nl-pm-work-row is-still">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="nl-pm-key">
        <span><i className="is-sage" aria-hidden />On time</span>
        <span><i className="is-terra" aria-hidden />Late</span>
      </p>
    </>
  );
}

/* ── On the way to a tenant ───────────────────────────────────────────────── */

export type FlowStep = { label: string; value: number | null; note?: string | null; tone: "clay" | "terra" | "olive" | "sage" | "brown"; onOpen?: () => void };

export function TenantFlow({ steps }: { steps: FlowStep[] }) {
  const on = useGrow();
  const max = Math.max(1, ...steps.map((s) => s.value ?? 0));
  return (
    <ol className="nl-pm-flow">
      {steps.map((s, i) => {
        const body = (
          <>
            <span className="nl-pm-flow-i">{String(i + 1).padStart(2, "0")}</span>
            <span className="nl-pm-flow-name">{s.label}</span>
            <b className="nl-pm-flow-n">{s.value == null ? <span className="nl-pm-work-off">{s.note ?? "Not read"}</span> : s.value.toLocaleString("en-GB")}</b>
            <span className="nl-pm-flow-tr" aria-hidden>
              <i className={`is-${s.tone}`} style={{ width: on && s.value != null ? `${Math.max(2, (s.value / max) * 100)}%` : 0, transitionDelay: `${i * 80}ms` }} />
            </span>
          </>
        );
        return (
          <li key={s.label}>
            {s.onOpen && s.value != null ? (
              <button type="button" className="nl-pm-flow-row" onClick={s.onOpen}>{body}</button>
            ) : (
              <div className="nl-pm-flow-row is-still">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
