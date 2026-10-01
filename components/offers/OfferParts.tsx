"use client";

import { useRef, useState } from "react";
import { toast } from "@/lib/toast";

/**
 * The pieces an offer is made of, shared by the tenant's Make an offer sheet
 * and the agent's recorder so the two never ask differently (1 Oct 2026,
 * James's walk-through of the offer harness).
 */

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** The box styles, minus what only makes sense on a bare input. */
const frame = (className: string) => className.replace(/\bblock\b/g, "").replace(/focus:border-/g, "focus-within:border-");

/**
 * The rent, starting at the asking rent and never above it.
 *
 * Since the new renting rules, a landlord or agent may not invite or accept an
 * offer above the advertised rent. So typing more does not leave an error
 * sitting under the box: the figure goes back to the asking rent and a toast
 * says why, once.
 *
 * The £ and the figure share one line in a flex row (James, 1 Oct 2026: the
 * pound sign sat lower than the number when it was placed over the input).
 */
export function RentField({
  value,
  onChange,
  askingPcm,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  askingPcm: number | null;
  className: string;
}) {
  return (
    <label className={`${frame(className)} flex cursor-text items-center gap-1.5`}>
      <span className="text-muted">£</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, "");
          const n = Number(raw);
          if (askingPcm && n > askingPcm) {
            onChange(String(askingPcm));
            toast(`${gbp(askingPcm)} is the most you can offer. The law now bans offers above the advertised rent.`, "bad");
            return;
          }
          onChange(raw);
        }}
        className="h-full min-w-0 flex-1 bg-transparent font-[inherit] outline-none"
      />
    </label>
  );
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A day, picked from our own calendar (James, 1 Oct 2026).
 *
 * The phone's built-in picker looked nothing like the OS, drew its text
 * off-centre, and on a phone inside the sheet it flashed open and shut. So
 * the calendar is ours: the box opens it underneath, pushing the page down
 * rather than floating over it, so it works the same in a sheet, a drawer or
 * a page, and choosing a day folds it away again.
 */
export function DateField({
  value,
  onChange,
  min,
  className,
  placeholder = "Choose a day",
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  className: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const start = value ? new Date(`${value}T12:00:00`) : min ? new Date(`${min}T12:00:00`) : new Date();
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const today = ymd(new Date());
  const shown = value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : placeholder;

  /* Monday first, the way a UK calendar runs. */
  const lead = (month.getDay() + 6) % 7;
  const inMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: inMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const minMonth = min ? new Date(`${min}T12:00:00`) : null;
  const canBack = !minMonth || month > new Date(minMonth.getFullYear(), minMonth.getMonth(), 1);
  const step = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${frame(className)} flex w-full items-center justify-between gap-3 text-left ${open ? "!border-accent-dark" : ""}`}
      >
        <span className={value ? "text-ink" : "text-muted"}>{shown}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 ${open ? "text-accent-dark" : "text-muted"}`}>
          <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Opens underneath by animating the row height from nothing, so it
          grows out of the box rather than appearing over the page. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="mt-2 w-full max-w-[380px] rounded-[16px] border border-line/70 bg-white p-3.5 shadow-[0_18px_40px_-28px_rgba(40,25,20,0.45)]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                disabled={!canBack}
                onClick={() => step(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-page disabled:opacity-25"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <p className="text-[14.5px] font-bold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => step(1)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-page"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
              {DAYS.map((d) => (
                <span key={d} className="pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {d}
                </span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={`b${i}`} />;
                const key = ymd(d);
                const off = Boolean(min && key < min);
                const on = key === value;
                return (
                  <span key={key} className="flex justify-center">
                    <button
                      type="button"
                      disabled={off}
                      aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                      aria-pressed={on}
                      onClick={() => {
                        onChange(key);
                        setOpen(false);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-[14px] transition-colors ${
                        on
                          ? "bg-accent-dark font-semibold text-white"
                          : off
                            ? "text-ink/25"
                            : `text-ink hover:bg-accent-soft ${key === today ? "ring-1 ring-inset ring-accent-dark/50" : ""}`
                      }`}
                    >
                      {d.getDate()}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Who is moving in, ticked off the passport (James: "they should always be
 * ticked by standard", and unticked for anybody on the passport who is not
 * coming). Children are counted on the passport, not named.
 */
export function MovingIn({
  people,
  ticked,
  onToggle,
}: {
  people: { id: string; name: string; who: string }[];
  ticked: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {people.map((p) => {
        const on = ticked.has(p.id);
        return (
          <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 transition-colors ${on ? "border-accent-dark/50 bg-white" : "border-line/70 bg-page/60"}`}>
            <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} className="h-4 w-4 accent-[#56423e]" />
            <span className="min-w-0 flex-1">
              <span className={`block text-[14px] font-semibold ${on ? "" : "text-muted line-through"}`}>{p.name}</span>
              <span className="block text-[12px] text-muted">{p.who}{on ? "" : " · not moving in"}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Works they want done before moving day, one line each (James, 1 Oct 2026).
 *
 * The landlord sees them as a checklist with the offer. Accepting the offer
 * accepts these too, and they go on the landlord's portal as jobs to finish
 * before the tenant moves in.
 *
 * It starts as one Add button. Pressing it slides a box out from the left,
 * pushing the button to the far end, so asking for something is a choice
 * rather than an empty box to fill in.
 */
export function WorksList({
  items,
  onChange,
  className,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  className: string;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement | null>(null);
  const add = () => {
    const t = draft.trim();
    if (!open || !t) {
      setOpen(true);
      window.setTimeout(() => box.current?.focus(), 260);
      return;
    }
    if (!items.includes(t)) onChange([...items, t].slice(0, 12));
    setDraft("");
    box.current?.focus();
  };
  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {items.map((w) => (
            <li key={w} className="flex items-center gap-3 rounded-[12px] border border-line/70 bg-white px-3.5 py-2.5 text-[14px]">
              <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-[4px] border border-ink/40" />
              <span className="min-w-0 flex-1">{w}</span>
              <button type="button" aria-label={`Remove ${w}`} onClick={() => onChange(items.filter((x) => x !== w))} className="shrink-0 px-1 text-[16px] leading-none text-muted hover:text-ink">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center">
        <div
          className={`overflow-hidden transition-[flex-grow,margin] duration-300 ease-out motion-reduce:transition-none ${open ? "mr-2 flex-grow basis-0" : "mr-0 w-0 flex-grow-0 basis-0"}`}
        >
          <input
            ref={box}
            value={draft}
            tabIndex={open ? 0 : -1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            onBlur={() => {
              if (!draft.trim()) setOpen(false);
            }}
            placeholder={items.length ? "Anything else?" : "For example: fix the shower"}
            className={`${className} w-full min-w-0`}
          />
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={add}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line/80 bg-white px-4 text-[13.5px] font-semibold transition-colors hover:border-ink/40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          {open && draft.trim() ? "Add" : items.length ? "Add another" : "Add a job"}
        </button>
      </div>
    </div>
  );
}
