"use client";

import { useRef, useState } from "react";
import { toast } from "@/lib/toast";

/**
 * The pieces an offer is made of, shared by the tenant's Make an offer sheet
 * and the agent's recorder so the two never ask differently (1 Oct 2026,
 * James's walk-through of the offer harness).
 */

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/**
 * The rent, starting at the asking rent and never above it.
 *
 * Since the new renting rules, a landlord or agent may not invite or accept an
 * offer above the advertised rent. So typing more does not leave an error
 * sitting under the box: the figure goes back to the asking rent and a toast
 * says why, once.
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
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-[calc(50%+3px)] -translate-y-1/2 text-[15px] leading-none text-muted">£</span>
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
        className={`${className} pl-7`}
      />
    </div>
  );
}

/**
 * A day, chosen from the phone's own calendar, shown the way we write dates.
 *
 * The native date box draws its text where each browser likes (off-centre on
 * a phone, "dd/mm/yyyy" on a desktop), so it sits underneath, invisible, and
 * this button opens it. What shows is ours: "Saturday 24 October 2026".
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
  const ref = useRef<HTMLInputElement | null>(null);
  const shown = value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : placeholder;
  const open = () => {
    const el = ref.current;
    if (!el) return;
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      el.focus();
    }
  };
  return (
    <div className="relative">
      <button type="button" onClick={open} className={`${className} flex items-center justify-between gap-3 text-left`}>
        <span className={value ? "text-ink" : "text-muted"}>{shown}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-muted">
          <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={ref}
        type="date"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
      />
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
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (!items.includes(t)) onChange([...items, t].slice(0, 12));
    setDraft("");
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
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={items.length ? "Anything else?" : "For example: fix the shower, a new oven door"}
          className={`${className} flex-1`}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className="shrink-0 rounded-[12px] border border-line/80 bg-white px-4 text-[13.5px] font-semibold disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}
