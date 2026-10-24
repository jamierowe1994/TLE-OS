"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * The front dashboard's charts, in plain SVG as the design draws them (new
 * look, 24 Oct 2026): a sparkline under each figure, the leads per day bars,
 * and the pipeline's steps. Drawn at the box's real width rather than
 * stretched, so the labels never squash on a phone. Animated in with CSS
 * (app/new-look/dashboard.css, the nl-dash-* rules), still for anyone who
 * asks the system for less motion.
 */

/** The width of a box, kept up to date. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A count that runs up to its figure once, the way the design's does. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-GB") }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      const v = start + (value - start) * (1 - Math.pow(1 - p, 3));
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

/** The thin line under a figure, its last point marked. */
export function Spark({ values, label }: { values: number[]; label: string }) {
  const W = 300;
  const H = 30;
  if (values.length < 2) return <svg className="nl-dash-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden />;
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const x = (k: number) => (k * W) / (values.length - 1);
  const y = (v: number) => H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6);
  const d = values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="nl-dash-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="nl-dash-spark-ln" d={d} pathLength={1} />
      <circle className="nl-dash-spark-dot" cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} />
    </svg>
  );
}

/** A floating label over a chart, placed at the pointer inside its box. */
function Tip({ at, children }: { at: { x: number; y: number } | null; children: ReactNode }) {
  return (
    <div className={`nl-dash-tip${at ? " is-on" : ""}`} style={at ? { left: at.x, top: at.y } : undefined} role="status">
      {children}
    </div>
  );
}

/**
 * Bars, one a day: grey-green, today in coral, the dotted line the average.
 * Hovering (or tapping) a day shows its split.
 */
export function DayBars({
  labels,
  totals,
  split,
  todayIndex,
  avgLabel,
}: {
  labels: string[];
  totals: number[];
  /** Per bar, the lines for its tooltip: [name, count]. */
  split: (k: number) => [string, number][];
  todayIndex: number;
  avgLabel: (avg: number) => string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ k: number; x: number; y: number } | null>(null);
  const W = Math.max(width, 240);
  const H = 220;
  const l = 30;
  const b = 24;
  const t = 10;
  const n = labels.length;
  const mx = Math.max(5, Math.ceil(Math.max(...totals, 1) / 5) * 5);
  const step = (W - l) / Math.max(n, 1);
  const bw = Math.max(2, Math.min(step * 0.56, 26));
  const x = (k: number) => l + (k + 0.5) * step;
  const y = (v: number) => t + (1 - v / mx) * (H - t - b);
  const avg = n ? totals.reduce((a, v) => a + v, 0) / n : 0;
  /* As many day labels as fit without touching: about one per 44px. */
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - l) / 44))));

  const move = (k: number, e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    /* Kept inside the box, so the label never pushes the page sideways on a phone. */
    const x = Math.min(Math.max(e.clientX - r.left, 80), Math.max(80, r.width - 80));
    setHover({ k, x, y: Math.max(e.clientY - r.top, 70) });
  };

  return (
    <div className="nl-dash-bars" ref={box} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bars per day, average ${avgLabel(avg)}`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="nl-dash-gl" x1={l} x2={W} y1={y(mx * f)} y2={y(mx * f)} />
              <text className="nl-dash-axis" x={l - 8} y={y(mx * f) + 4} textAnchor="end">
                {Math.round(mx * f)}
              </text>
            </g>
          ))}
          {totals.map((v, k) => (
            <g key={`${labels[k]}-${k}`} className={`nl-dash-col${hover?.k === k ? " is-hover" : ""}`}>
              {v > 0 && (
                <rect
                  className={`nl-dash-bar${k === todayIndex ? " is-now" : ""}`}
                  x={x(k) - bw / 2}
                  y={y(v)}
                  width={bw}
                  height={y(0) - y(v)}
                  rx={Math.min(4, bw / 3)}
                  style={{ animationDelay: `${Math.min(k * 14, 700)}ms` }}
                />
              )}
              <rect
                className="nl-dash-hit"
                x={x(k) - step / 2}
                y={t}
                width={step}
                height={H - t - b}
                onPointerMove={(e) => move(k, e)}
                onPointerDown={(e) => move(k, e)}
              />
              {/* Today always, and every few days back from it, never two touching. */}
              {(k === n - 1 || ((n - 1 - k) % every === 0 && n - 1 - k >= every)) && (
                <text className="nl-dash-axis" x={x(k)} y={H - 6} textAnchor="middle">
                  {labels[k]}
                </text>
              )}
            </g>
          ))}
          {n > 0 && <line className="nl-dash-avg" x1={l} x2={W} y1={y(avg)} y2={y(avg)} />}
        </svg>
      )}
      <Tip at={hover}>
        {hover && (
          <>
            <b>
              {labels[hover.k]} · {totals[hover.k]}
            </b>
            {split(hover.k)
              .filter(([, c]) => c > 0)
              .map(([name, c]) => (
                <span key={name} className="nl-dash-tip-row">
                  {name} {c}
                </span>
              ))}
          </>
        )}
      </Tip>
    </div>
  );
}

export type StepRow = {
  label: string;
  href: string;
  /** Null when this step couldn't be read; the reason goes in `note`. */
  value: number | null;
  note?: string | null;
  /** What the step counts, on hover. */
  hint?: string;
};

/** The pipeline: each step's count, how many went on from the one before, a bar. */
export function Steps({ steps, Link }: { steps: StepRow[]; Link: (p: { href: string; className: string; title?: string; children: ReactNode }) => ReactNode }) {
  const first = steps[0]?.value ?? null;
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(true), 60);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <ol className="nl-dash-steps">
      {steps.map((s, k) => {
        const prev = k ? steps[k - 1].value : null;
        /* Each step is counted over the same days, not one group followed through, so a
           later step can outnumber the one before it. A "% on" above 100 means nothing,
           so it is only shown where it is a real drop-off. */
        const ratio = k && s.value != null && prev != null && prev > 0 ? s.value / prev : null;
        const cv = ratio != null && ratio <= 1 ? ratio : null;
        const warn = cv != null && cv < 0.4;
        const w = s.value != null && first ? Math.min(100, Math.max(1.5, (s.value / first) * 100)) : 0;
        return (
          <li key={s.label} className={`nl-dash-step${warn ? " is-warn" : ""}`}>
            {Link({
              href: s.href,
              className: "nl-dash-step-link",
              title: s.hint,
              children: (
                <>
                  <span className="nl-dash-step-name">{s.label}</span>
                  <b className="nl-dash-step-n">
                    {s.value == null ? <span className="nl-dash-step-off">{s.note ?? "Not read"}</span> : s.value.toLocaleString("en-GB")}
                    {cv != null && <small>{Math.round(cv * 100)}% on</small>}
                  </b>
                  <span className="nl-dash-step-tr" aria-hidden>
                    <i style={{ width: on ? `${w}%` : 0 }} />
                  </span>
                </>
              ),
            })}
          </li>
        );
      })}
    </ol>
  );
}
