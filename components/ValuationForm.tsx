"use client";

import { useState } from "react";
import { SERVICE_LEVELS, type MarketAppraisal, type ServiceLevel } from "@/lib/market-appraisal";

/**
 * WHAT THE VISIT PRODUCED — the figure, and the terms it comes with.
 *
 * ── What was here before ──────────────────────────────────────────────────
 *
 * Nothing. `os_market_appraisals.valuation` shipped with no writer anywhere in
 * the repo, and the button that promised this pointed at `?open=<id>`, which
 * redirected straight back to the page it was pressed on. Every appraisal in
 * the OS was frozen at "booked" and the "awaiting valuation" warning could
 * never be cleared by anybody.
 *
 * ── Why the terms are here and not on a later screen ──────────────────────
 *
 * The post-appraisal deck has to put an offer in writing: this rent, this
 * service, this fee. Collecting the rent now and the fee "later" means later
 * never happens and the deck cannot be built. It is one form because it is one
 * conversation — the one that just finished in the landlord's kitchen.
 *
 * ── Everything is optional ────────────────────────────────────────────────
 *
 * An agent does this in a car. They will have the rent and often not the fee.
 * A form that refuses to save until every box is filled is a form that gets
 * abandoned, and then the figure is lost — which is the exact failure this
 * whole component exists to end. Blank fields are simply not sent.
 */

const INPUT =
  "w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] text-muted">{hint}</span>}
    </label>
  );
}

const money = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function ValuationForm({
  appraisal,
  onSaved,
}: {
  appraisal: MarketAppraisal;
  onSaved: (next: MarketAppraisal) => void;
}) {
  const a = appraisal;
  const [open, setOpen] = useState(a.valuation == null);
  const [rent, setRent] = useState(a.valuation != null ? String(a.valuation) : "");
  const [level, setLevel] = useState<ServiceLevel | "">(a.serviceLevel ?? "");
  const [fee, setFee] = useState(a.feePct != null ? String(a.feePct) : "");
  const [setup, setSetup] = useState(a.setupFee != null ? String(a.setupFee) : "");
  const [note, setNote] = useState(a.valuationNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/appraisals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        /* Every field is sent, including the empty ones, because on THIS form
           an emptied box means "take that back off the deck". The partial-patch
           behaviour in the store is for other callers, not for a full save. */
        body: JSON.stringify({
          id: a.id,
          valuation: rent,
          serviceLevel: level,
          feePct: fee,
          setupFee: setup,
          valuationNote: note,
        }),
      });
      const j = (await r.json()) as { appraisal?: MarketAppraisal; error?: string };
      if (j.error || !j.appraisal) setError(j.error ?? "Couldn't save that.");
      else {
        onSaved(j.appraisal);
        setOpen(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /* Recorded and closed: the summary, with the way back in. An agent reading
     this wants the number, not the form that produced it. */
  if (!open) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
              The valuation
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="figures text-[26px] leading-none">
                {a.valuation != null ? money(a.valuation) : "—"}
              </span>
              <span className="text-[12.5px] text-muted">pcm</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-line/80 px-3.5 py-2 text-[12.5px]"
          >
            Change it
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line/70 pt-3 text-[11.5px] text-muted">
          <span>
            {a.serviceLevel
              ? SERVICE_LEVELS.find((s) => s.id === a.serviceLevel)?.label
              : "No service level"}
          </span>
          <span>{a.feePct != null ? `${a.feePct}% management` : "No fee recorded"}</span>
          <span>{a.setupFee != null ? `${money(a.setupFee)} set-up` : "No set-up fee"}</span>
        </div>
        {a.valuationNote && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{a.valuationNote}</p>
        )}
        {a.valuedBy && (
          <p className="mt-2.5 text-[10.5px] text-muted">
            Recorded by {a.valuedBy}
            {a.valuedAt
              ? ` on ${new Date(a.valuedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                })}`
              : ""}
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
        Record the valuation
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        The rent is what moves this file on. The rest can wait, but the
        post-appraisal deck needs it before it can put an offer in writing.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Rent agreed" hint="Per calendar month.">
          <input
            className={INPUT}
            inputMode="numeric"
            placeholder="1,300"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
          />
        </Field>
        <Field label="Service level">
          <select
            className={INPUT}
            value={level}
            onChange={(e) => setLevel(e.target.value as ServiceLevel | "")}
          >
            <option value="">Not agreed yet</option>
            {SERVICE_LEVELS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Management fee" hint="Percent of rent.">
          <input
            className={INPUT}
            inputMode="decimal"
            placeholder="10"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </Field>
        <Field label="Set-up fee" hint="One-off, £.">
          <input
            className={INPUT}
            inputMode="numeric"
            placeholder="600"
            value={setup}
            onChange={(e) => setSetup(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Anything worth writing down" hint="Conditions, a range, what they said.">
          <textarea
            className={`${INPUT} min-h-[64px] resize-y`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-2.5 text-[11.5px]">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save the valuation"}
        </button>
        {a.valuation != null && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-line/80 px-4 py-2.5 text-[12.5px]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
