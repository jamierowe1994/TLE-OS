"use client";

import { useState } from "react";
import { SERVICE_LEVELS, type MarketAppraisal, type ServiceLevel } from "@/lib/market-appraisal";

/**
 * RECORD THE VALUATION, ONE QUESTION AT A TIME (James, 11 Sep 2026).
 *
 * The full form (components/ValuationForm) put five fields and their hints
 * in the Next up box and made it three times the height of the cards beside
 * it. An agent recording a figure knows what they are doing, so this asks
 * one thing per step - rent, service level, management fee, set-up fee,
 * anything else - and saves at the end. Same PATCH, same rule that blank
 * answers are simply not sent; a figure with nothing else still moves the
 * file on.
 */

type Step = "rent" | "level" | "fee" | "setup" | "note";
const STEPS: { id: Step; label: string }[] = [
  { id: "rent", label: "Rent agreed" },
  { id: "level", label: "Service level" },
  { id: "fee", label: "Management fee" },
  { id: "setup", label: "Set-up fee" },
  { id: "note", label: "Anything else" },
];

const INPUT =
  "h-11 w-full min-w-0 rounded-xl border border-line/70 bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-ink";

export default function ValuationSteps({
  appraisal: a,
  onSaved,
}: {
  appraisal: MarketAppraisal;
  onSaved: (next: MarketAppraisal) => void;
}) {
  const [i, setI] = useState(0);
  const [rent, setRent] = useState(a.valuation != null ? String(a.valuation) : "");
  const [level, setLevel] = useState<ServiceLevel | "">(a.serviceLevel ?? "");
  const [fee, setFee] = useState(a.feePct != null ? String(a.feePct) : "");
  const [setup, setSetup] = useState(a.setupFee != null ? String(a.setupFee) : "");
  const [note, setNote] = useState(a.valuationNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/appraisals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: a.id, valuation: rent, serviceLevel: level, feePct: fee, setupFee: setup, valuationNote: note }),
      });
      const j = (await r.json()) as { appraisal?: MarketAppraisal; error?: string };
      if (j.error || !j.appraisal) setError(j.error ?? "Couldn't save that.");
      else onSaved(j.appraisal);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const next = () => (last ? void save() : setI(i + 1));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      next();
    }
  };

  return (
    <div onKeyDown={onKey}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold">{step.label}</p>
        <p className="text-[11px] text-muted">
          {i + 1} of {STEPS.length}
        </p>
      </div>

      <div className="mt-2.5">
        {step.id === "rent" && (
          <Money value={rent} onChange={setRent} placeholder="1,300" suffix="pcm" autoFocus />
        )}
        {step.id === "level" && (
          <div className="flex flex-wrap gap-2">
            {SERVICE_LEVELS.map((s) => {
              const on = level === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setLevel(on ? "" : s.id)}
                  className={`rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                    on ? "border-accent-dark bg-accent-dark text-white" : "border-line/70 bg-white hover:border-ink/40"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        {step.id === "fee" && <Money value={fee} onChange={setFee} placeholder="10" suffix="% of rent" autoFocus prefix="" />}
        {step.id === "setup" && <Money value={setup} onChange={setSetup} placeholder="600" suffix="one-off" autoFocus />}
        {step.id === "note" && (
          <textarea
            autoFocus
            rows={2}
            className="w-full resize-none rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ink"
            placeholder="Conditions, a range, what they said"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </div>

      {error && <p className="mt-2 text-[11.5px] text-accent-dark">{error}</p>}

      <div className="mt-3.5 flex items-center gap-2">
        {i > 0 && (
          <button
            type="button"
            onClick={() => setI(i - 1)}
            className="rounded-full border border-line/70 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={next}
          disabled={saving}
          className="rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {last ? (saving ? "Saving…" : "Save the valuation") : "Next"}
        </button>
        <span className="ml-auto flex items-center gap-1" aria-hidden>
          {STEPS.map((s, k) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-accent-dark" : "w-1.5 bg-line/70"}`} />
          ))}
        </span>
      </div>
    </div>
  );
}

function Money({
  value,
  onChange,
  placeholder,
  prefix = "£",
  suffix,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  prefix?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="relative block">
      {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">{prefix}</span>}
      <input
        autoFocus={autoFocus}
        className={`${INPUT} ${prefix ? "pl-8" : ""} ${suffix ? "pr-20" : ""}`}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-muted">{suffix}</span>}
    </label>
  );
}
