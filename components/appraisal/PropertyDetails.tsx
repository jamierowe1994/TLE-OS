"use client";

import { useState } from "react";
import { NO_FACTS, PROPERTY_TYPES, hasFacts, type PropertyFacts } from "@/lib/agent-property-facts";

/**
 * "Property details" on the Property step: what the deck will say the home is,
 * and the agent's way to correct it (James, 6 Oct 2026 - a six-bed HMO came
 * back from the lookup as a two-bed flat and there was no way to change it).
 *
 * Reads as a sentence until opened, so a lookup that is right costs nobody a
 * click. Every change saves on its own (case-state, Auto save chip).
 */
export default function PropertyDetails({
  found,
  facts,
  onChange,
  onWrongProperty,
}: {
  /** What the lookup says, for the "found" line and as the starting values. */
  found: { type: string | null; beds: number | null; baths: number | null };
  facts: PropertyFacts;
  onChange: (next: PropertyFacts) => void;
  /** Opens the address picker to match a different property. */
  onWrongProperty: () => void;
}) {
  const [open, setOpen] = useState(false);
  const corrected = hasFacts(facts);
  const type = facts.type ?? (facts.ignoreLookup ? null : found.type);
  const beds = facts.beds ?? (facts.ignoreLookup ? null : found.beds);
  const baths = facts.baths ?? (facts.ignoreLookup ? null : found.baths);
  const summary =
    [type, beds != null ? `${beds} bedroom${beds === 1 ? "" : "s"}` : null, baths != null ? `${baths} bathroom${baths === 1 ? "" : "s"}` : null]
      .filter(Boolean)
      .join(" · ") || "Not known yet";

  const set = (patch: Partial<PropertyFacts>) => onChange({ ...facts, ...patch });
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.min(30, Math.round(Number(v)))));

  return (
    <div className="rounded-xl border border-line/70 bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Property details</p>
          <p className="mt-0.5 text-[14px] font-semibold">{summary}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {facts.ignoreLookup
              ? "The lookup found the wrong property, so none of its facts or its sale estimate go on the deck."
              : corrected
                ? "Corrected by you. This is what the deck says."
                : "From the property lookup. Correct it if anything is wrong - the deck uses what is here."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40"
        >
          {open ? "Done" : "Edit details"}
        </button>
      </div>

      {open && (
        <div className="mt-3.5 space-y-3 border-t border-line/60 pt-3.5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-[11.5px] text-muted">
              Property type
              <select
                value={type ?? ""}
                onChange={(e) => set({ type: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[13px] text-ink"
              >
                <option value="">Not known</option>
                {[...new Set([...(found.type && !PROPERTY_TYPES.includes(found.type) ? [found.type] : []), ...PROPERTY_TYPES])].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11.5px] text-muted">
              Bedrooms
              <input
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                value={beds ?? ""}
                onChange={(e) => set({ beds: num(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="block text-[11.5px] text-muted">
              Bathrooms
              <input
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                value={baths ?? ""}
                onChange={(e) => set({ baths: num(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[13px] text-ink"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
            <button type="button" onClick={onWrongProperty} className="font-semibold text-accent-dark hover:underline">
              Wrong property? Choose another
            </button>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={facts.ignoreLookup}
                onChange={(e) => set({ ignoreLookup: e.target.checked })}
              />
              None of these match - don&apos;t use the lookup at all
            </label>
            {corrected && (
              <button type="button" onClick={() => onChange(NO_FACTS)} className="ml-auto text-muted hover:text-ink">
                Go back to the lookup
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
