"use client";

import { useEffect, useRef, useState } from "react";
import { DateField, RentField } from "@/components/offers/OfferParts";
import type { OfferCounter } from "@/lib/offer-counters";

/**
 * THE BACK-AND-FORTH ON AN OFFER (James, 16 Oct 2026).
 *
 * "If the tenant offers 1,000 and the landlord counters at 1,050, then they
 * agree on 1,050, and that's the deal." The opened offer shows every round,
 * oldest first, and the agent keys in the next one for whichever side made
 * it. The newest figure is the one on the table; Accept agrees it, and the
 * application and the push to Propoly carry that rent (lib/offer-counters).
 *
 * The rent can never go above the advertised rent - the same cap as the
 * offer itself - and nothing here is sent to the tenant or the landlord.
 */

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const short = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const inp = "mt-1.5 block h-11 w-full min-w-0 rounded-[12px] border border-line/80 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark";
const area = "mt-1.5 block w-full rounded-[12px] border border-line/80 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-accent-dark";
const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export type NegotiatedOffer = {
  ref: string;
  name: string;
  status: "open" | "accepted" | "declined";
  /** The figure on the table (open) or agreed (accepted). */
  amount: number | null;
  /** What was first offered. */
  offered?: number | null;
  at: string | null;
  counters?: OfferCounter[];
};

/** The rounds so far: the first offer, each counter, and the agreed figure once accepted. */
export function NegotiationHistory({
  o,
  canTakeBack,
  onChanged,
}: {
  o: NegotiatedOffer;
  canTakeBack: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const counters = o.counters ?? [];
  if (!counters.length) return null;
  const last = counters[counters.length - 1];
  const first = o.offered ?? null;

  async function takeBack() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/offers/counter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: o.ref, remove: last.id }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr(j.error ?? "That didn't save. Try again.");
      else onChanged();
    } catch {
      setErr("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-line/50 bg-white px-3.5 py-3 text-[12.5px]">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Negotiation</p>
      <ol className="mt-2 space-y-2.5">
        <Round
          who={o.name.split(/\s+/)[0] || "The tenant"}
          verb="offered"
          amount={first}
          when={o.at}
        />
        {counters.map((c) => (
          <Round
            key={c.id}
            who={c.side === "landlord" ? "The landlord" : "The tenant"}
            verb="countered at"
            amount={c.amount}
            when={c.at}
            moveIn={c.moveIn}
            note={c.note}
            by={c.by}
            action={
              canTakeBack && c.id === last.id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void takeBack()}
                  className="shrink-0 text-[11px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                >
                  {busy ? "Taking back…" : "Take back"}
                </button>
              ) : null
            }
          />
        ))}
        {o.status === "accepted" && o.amount != null && (
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#56634a] text-[9px] text-white">✓</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">Agreed at {gbp(o.amount)} a month</span>
            </span>
          </li>
        )}
      </ol>
      {err && <p className="mt-2 text-[11.5px] text-accent-dark">{err}</p>}
    </div>
  );
}

function Round({
  who,
  verb,
  amount,
  when,
  moveIn,
  note,
  by,
  action,
}: {
  who: string;
  verb: string;
  amount: number | null;
  when: string | null;
  moveIn?: string | null;
  note?: string | null;
  by?: string;
  action?: React.ReactNode;
}) {
  const sub = [moveIn ? `moving in ${short(moveIn)}` : "", when ? short(when) : "", by ? `keyed in by ${by}` : ""].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-[5px] block h-2 w-2 shrink-0 rounded-full border-[1.5px] border-accent-dark" />
      <span className="min-w-0 flex-1">
        <span className="block">
          {who} {verb} <span className="figures font-semibold">{amount != null ? gbp(amount) : "-"}</span>
        </span>
        {sub && <span className="block text-[10.5px] text-muted">{sub}</span>}
        {note && <span className="mt-0.5 block whitespace-pre-line text-[11.5px] leading-snug">{note}</span>}
      </span>
      {action}
    </li>
  );
}

/** Keying in the next counter. Defaults to the other side from the last round: the landlord first. */
export function CounterForm({
  o,
  asking,
  onCancel,
  onSaved,
}: {
  o: NegotiatedOffer;
  asking: number | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const last = o.counters?.[o.counters.length - 1] ?? null;
  const [side, setSide] = useState<"landlord" | "tenant">(last?.side === "landlord" ? "tenant" : "landlord");
  const [amount, setAmount] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* Opened from the Counter button under the offer: bring it into view. */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    return () => clearTimeout(t);
  }, []);

  async function save() {
    if (busy) return;
    const n = Number(amount);
    if (!n) {
      setErr("Put in the rent for the counter.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/offers/counter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: o.ref, side, amount: n, moveIn: moveIn || null, note: note.trim() || null }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr(j.error ?? "That didn't save. Try again.");
      else onSaved();
    } catch {
      setErr("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const onTable = o.amount;
  return (
    <div ref={box} className="fade-up mt-3 scroll-mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/30 px-3.5 py-3.5 text-[12.5px]">
      <p className="text-[15px] leading-tight">Make a Counter-Offer</p>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {onTable != null ? `${gbp(onTable)} a month is on the table now. ` : ""}Key in what was said; nothing is sent to anyone.
      </p>

      <p className="mt-3 text-[11.5px] font-semibold text-ink">Who is countering?</p>
      <div className="mt-1.5 inline-flex rounded-full border border-line/80 bg-white p-0.5" role="radiogroup" aria-label="Who is countering">
        {(["landlord", "tenant"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => setSide(s)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${side === s ? "bg-[var(--brown)] text-white" : "text-muted hover:text-ink"}`}
          >
            {s === "landlord" ? "The landlord" : "The tenant"}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-[11.5px] font-semibold text-ink">Rent a month</span>
          <RentField value={amount} onChange={setAmount} askingPcm={asking} className={inp} />
          {asking ? <span className="mt-1 block text-[11px] text-muted">Up to the advertised {gbp(asking)}.</span> : null}
        </label>
        <div className="min-w-0">
          <span className="text-[11.5px] font-semibold text-ink">Moving in</span>
          <DateField value={moveIn} onChange={setMoveIn} min={londonToday()} className={inp} placeholder="Only if it changes" />
          {moveIn && (
            <button type="button" onClick={() => setMoveIn("")} className="mt-1 text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline">
              Keep the date as it was
            </button>
          )}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-[11.5px] font-semibold text-ink">Details</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Anything that comes with it - a later move-in, works before moving in, a condition"
          className={area}
        />
      </label>

      {err && <p className="mt-2 text-[11.5px] text-accent-dark">{err}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-3.5 py-2 text-[12px] font-semibold text-muted hover:text-ink">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save the counter"}
        </button>
      </div>
    </div>
  );
}
