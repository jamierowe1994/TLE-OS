"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * A date, or a date and a time, that looks like the rest of the form.
 *
 * James, 8 Oct 2026: "all of the drop-down boxes need to be styled the same as
 * the categories box... same thing with the date and time". The browser's own
 * date box showed "dd/mm/yyyy" half cut off in a narrow column and opened a
 * picker from another product. This is FieldSelect's field with our own month
 * under it, and for a time, the quarter hours of a working day beside it.
 *
 * The value is the same string the browser's inputs use - "2026-10-08" for a
 * date, "2026-10-08T09:30" for a date and time - so it drops in where an
 * <input type="date"> or "datetime-local" was, with no change to what is saved.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/* 07:00 to 20:00 by the quarter hour: when a contractor or a tenant is about. */
const TIMES = Array.from({ length: (20 - 7) * 4 + 1 }, (_, i) => `${pad(7 + Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

function parse(value: string): { day: string; time: string } {
  const [day = "", time = ""] = value.split("T");
  return { day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "", time: /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "" };
}

export function sayDate(value: string, withTime = false): string {
  const { day, time } = parse(value);
  if (!day) return "";
  const d = new Date(`${day}T12:00:00`);
  const said = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return withTime && time ? `${said.replace(",", "")}, ${time}` : said.replace(",", "");
}

export default function FieldDate({
  value,
  onChange,
  withTime = false,
  placeholder = "Choose a date",
  className = "",
  clearable = false,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  /** A date and a time ("datetime-local"), not just a date. */
  withTime?: boolean;
  placeholder?: string;
  className?: string;
  /** An optional answer can be emptied again. */
  clearable?: boolean;
  /** "YYYY-MM-DD": days before it are greyed out and cannot be picked. */
  min?: string;
}) {
  const { day, time } = parse(value);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(() => {
    const d = day ? new Date(`${day}T12:00:00`) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const holder = useRef<HTMLDivElement | null>(null);
  const times = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const today = ymd(new Date());

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (holder.current && !holder.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  /* Opening goes to the month of the date already chosen, and the time list
     to the time chosen (or nine o'clock), rather than the top of the list. */
  useEffect(() => {
    if (!open) return;
    const d = day ? new Date(`${day}T12:00:00`) : new Date();
    setShown({ y: d.getFullYear(), m: d.getMonth() });
    requestAnimationFrame(() => times.current?.querySelector<HTMLElement>(`[data-t="${time || "09:00"}"]`)?.scrollIntoView({ block: "center" }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const first = new Date(shown.y, shown.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(shown.y, shown.m + 1, 0).getDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => ymd(new Date(shown.y, shown.m, i + 1)))];
  }, [shown]);

  const pickDay = (d: string) => {
    if (!withTime) { onChange(d); setOpen(false); return; }
    onChange(`${d}T${time || "09:00"}`);
  };
  const pickTime = (t: string) => { onChange(`${day || today}T${t}`); setOpen(false); };
  const step = (n: number) => setShown(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const said = sayDate(value, withTime);
  return (
    <div ref={holder} className={`relative ${className}`} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-box px-3 py-2.5 text-left text-[13px] outline-none transition-colors ${open ? "border-ink" : "border-line/80 hover:border-ink/40"} focus-visible:border-ink`}
      >
        <span className={`min-w-0 truncate ${said ? "" : "text-muted"}`}>{said || placeholder}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted">
          {clearable && said && (
            <span role="button" tabIndex={-1} aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-ink/10">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </span>
          )}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={withTime ? "Choose a date and time" : "Choose a date"}
          className={`fade-up absolute left-0 top-full z-30 mt-1.5 rounded-xl border border-line/80 bg-white p-3 shadow-[0_14px_34px_-14px_rgba(0,0,0,0.3)] ${withTime ? "w-[min(100%,420px)] min-w-[300px] sm:w-[420px]" : "w-[292px]"}`}
        >
          <div className={withTime ? "grid gap-3 sm:grid-cols-[1fr_96px]" : ""}>
            <div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-panel hover:text-ink">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                <p className="text-[13px] font-semibold">{MONTHS[shown.m]} {shown.y}</p>
                <button type="button" onClick={() => step(1)} aria-label="Next month" className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-panel hover:text-ink">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
              <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-muted">
                {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={i} className="py-1">{w}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (!d) return <span key={`b${i}`} />;
                  const on = d === day;
                  const off = !!min && d < min;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={off}
                      onClick={() => pickDay(d)}
                      className={`h-8 rounded-lg text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${on ? "bg-accent-dark font-semibold text-white" : d === today ? "font-semibold text-accent-dark ring-1 ring-inset ring-accent-dark/40 hover:bg-accent-soft/60" : "hover:bg-accent-soft/60"}`}
                    >
                      {Number(d.slice(8))}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11.5px]">
                <button type="button" onClick={() => pickDay(today)} className="text-muted underline underline-offset-2 hover:text-ink">Today</button>
                {clearable && <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-muted underline underline-offset-2 hover:text-ink">Clear</button>}
              </div>
            </div>
            {withTime && (
              <div className="border-t border-line/50 pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Time</p>
                <div ref={times} className="mt-1.5 flex max-h-[232px] gap-1 overflow-auto sm:flex-col">
                  {TIMES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      data-t={t}
                      onClick={() => pickTime(t)}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] tabular-nums transition-colors ${t === time ? "bg-accent-dark font-semibold text-white" : "hover:bg-accent-soft/60"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
