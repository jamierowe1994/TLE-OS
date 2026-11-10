"use client";

import Link from "next/link";
import { Mast } from "@/components/new-look/Parts";

/**
 * The shared furniture of the day-to-day tools (Notice Dates, Calculators,
 * Route Planner; 10 Nov 2026). Like Forecast, these pages are drawn in the
 * new look whichever look the rest of the OS is wearing: `nl-fc` carries the
 * brand colours, `nl-at` the pieces these tools add.
 */
export function ToolShell({ eyebrow, title, blurb, children }: { eyebrow: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-edge nl-fc nl-at">
      <Link href="/tools" className="nl-fc-back">
        <span aria-hidden>‹</span> Tools
      </Link>
      <Mast eyebrow={eyebrow} title={title} blurb={blurb} />
      {children}
    </div>
  );
}

/** One choice out of a few, as a square segmented bar. */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="nl-fc-seg nl-at-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? "is-on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled box. `hint` sits under it in small grey type. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="nl-at-field">
      <span className="nl-fc-k">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Pounds, typed freely: commas and a pound sign are forgiven. */
export function MoneyField({ label, hint, value, onChange, placeholder = "0" }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      <span className="nl-at-money">
        <i aria-hidden>£</i>
        <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </span>
    </Field>
  );
}

export const num = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const GBP0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const GBP2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Whole pounds where the pence are nothing, pence where they are something. */
export const pounds = (n: number) => (Math.abs(n - Math.round(n)) < 0.005 ? GBP0.format(Math.round(n)) : GBP2.format(n));

/** The line every one of these tools ends on. */
export function Guide({ children }: { children: React.ReactNode }) {
  return (
    <p className="nl-at-guide" role="note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 11v5M12 7.8h.01" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
