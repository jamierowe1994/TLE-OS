"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * RENT, WHERE THE MAP WAS (James, 8 Oct 2026).
 *
 * "The bottom right-hand side should say whether they're up to date on rent
 * or not ... if they're not, we need to show the amount that they're behind
 * by ... a payment in and out box." Live from PayProp through
 * /api/portfolio/rent; while it reads it says so, and when PayProp can't be
 * read or the home can't be matched it says that - never an old figure.
 * PayProp is read at 10am and 4pm, so the box says when (lib/rent-status).
 */

type Status =
  | { state: "unreachable" | "unmatched"; detail: string }
  | {
      state: "ok";
      checkedAt: string;
      upToDate: boolean;
      owed: number;
      tenants: Array<{ name: string; owed: number; lastPayment: string | null; dueOn: string | null; rent: number | null }>;
      history: Array<{ month: string; in: string | null; amountToLandlord: number | null; paidOut: boolean | null }>;
    };

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) : null);
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-GB", { month: "long" });
const londonDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const thisMonth = () => londonDay(new Date()).slice(0, 7);
function checked(iso: string) {
  const at = new Date(iso);
  const t = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  if (londonDay(at) === londonDay(new Date())) return `today at ${t}`;
  if (londonDay(at) === londonDay(new Date(Date.now() - 86_400_000))) return `yesterday at ${t}`;
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })} at ${t}`;
}

/**
 * HOW THE HOME EARNS (James, 9 Oct 2026): "show the total amount of income
 * that the property produces and then the breakdown ... what it costs per
 * room, unless it's just a total cost ... we need to be able to distinguish
 * between the two." Read from the data, never set by hand: a house whose
 * rooms carry their own rents is let by the room; a home PayProp bills each
 * tenant on separately is rent per tenant; several tenants on one invoice is
 * one rent for the house.
 */
export type RentShape =
  | { kind: "rooms"; rooms: Array<{ id: string; label: string; tenant: string | null; rent: number | null; period: "week" | "month" | null; monthly: number | null }> }
  | { kind: "home"; rent: number | null; tenants: string[] };

/** `who` and `rent` columns show only when the basis has them: a room has a
 *  tenant (or is empty); a shared rent has no per-line figure. */
type Income = { total: number | null; basis: string; who: boolean; rent: boolean; lines: Array<{ id: string; label: string; who: string | null; rent: string | null }> };

function incomeOf(shape: RentShape | undefined, s: Status | null): Income | null {
  if (!shape) return null;
  if (shape.kind === "rooms") {
    const priced = shape.rooms.filter((r) => r.monthly);
    if (priced.length) {
      return {
        total: priced.reduce((a, r) => a + (r.monthly ?? 0), 0),
        basis: `Rent per room${priced.length < shape.rooms.length ? ` · ${shape.rooms.length - priced.length} with no rent set` : ""}`,
        who: true,
        rent: true,
        lines: shape.rooms.map((r) => ({ id: r.id, label: r.label, who: r.tenant, rent: r.rent ? `${gbp(r.rent)}${r.period === "week" ? " pw" : ""}` : null })),
      };
    }
    /* No room carries a rent. A figure on the house's own record is not the
       house's rent: 166 Gloucester Road North holds £795 there, which is one
       room's rent, and 2 Norwich Street £550 across five rooms. So no total. */
    return {
      total: null,
      basis: "Rent per room · no room rents recorded yet",
      who: true,
      rent: true,
      lines: shape.rooms.map((r) => ({ id: r.id, label: r.label, who: r.tenant, rent: null })),
    };
  }
  const billed = s?.state === "ok" ? s.tenants.filter((t) => t.rent) : [];
  if (billed.length > 1) {
    return {
      total: billed.reduce((a, t) => a + (t.rent ?? 0), 0),
      basis: "Rent per tenant",
      who: false,
      rent: true,
      lines: billed.map((t) => ({ id: t.name, label: t.name, who: null, rent: gbp(t.rent ?? 0) })),
    };
  }
  if (shape.tenants.length < 2) return null;
  const total = billed[0]?.rent ?? shape.rent;
  if (!total) return null;
  return {
    total,
    basis: `One rent for the house · shared by ${shape.tenants.length} tenants`,
    who: false,
    rent: false,
    lines: shape.tenants.map((t) => ({ id: t, label: t, who: null, rent: null })),
  };
}

function IncomeBlock({ income }: { income: Income }) {
  return (
    <div className="mt-2 border-b border-line/50 pb-4">
      {income.total != null && (
        <p className="figures text-[22px] font-semibold">
          {gbp(Math.round(income.total * 100) / 100)}
          <span className="text-[12px] font-normal text-muted"> pcm</span>
        </p>
      )}
      <p className="text-[12px] text-muted">{income.basis}</p>
      <ul className="mt-2 divide-y divide-line/40 rounded-xl border border-line/50 bg-white">
        {income.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
            <span className={`truncate font-semibold ${income.who ? "w-[72px] shrink-0" : "min-w-0 flex-1"}`}>{l.label}</span>
            {income.who && <span className="min-w-0 flex-1 truncate">{l.who ?? <span className="text-muted">Empty</span>}</span>}
            {income.rent && (l.rent ? <span className="figures shrink-0">{l.rent}</span> : <span className="shrink-0 text-muted">Not set</span>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RentBox({ listingId, className, shape }: { listingId: string; className: string; shape?: RentShape }) {
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setS(null);
    setFailed(null);
    fetch(`/api/portfolio/rent?listing=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; status?: Status; error?: string }) => {
        if (!live) return;
        if (j.ok && j.status) setS(j.status);
        else setFailed(j.error ?? "The rent couldn't be read.");
      })
      .catch(() => live && setFailed("The rent couldn't be read."));
    return () => {
      live = false;
    };
  }, [listingId]);

  return (
    <section className={`${className} p-5`} data-steve="property.rent">
      <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
        <DoodleIcon name="coin" size={13} className="text-accent-dark" />
        Rent
      </p>

      {/* What the home brings in. A house let by the room is read from the
          book and shows at once; a home's split needs PayProp's answer. */}
      {(() => {
        const income = incomeOf(shape, s);
        return income ? <IncomeBlock income={income} /> : null;
      })()}

      {failed ? (
        <p className="mt-3 text-[12.5px] text-muted">{failed}</p>
      ) : s === null ? (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Loading the rent…
        </p>
      ) : s.state !== "ok" ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{s.detail}</p>
      ) : (
        <>
          {s.upToDate ? (
            <p className="mt-2 flex items-center gap-2 text-[18px] font-semibold text-[#56634a]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#56634a] text-[12px] text-white">✓</span>
              Up to date
            </p>
          ) : (
            <p className="mt-2 text-[18px] font-semibold text-accent-dark">Behind by {gbp(s.owed)}</p>
          )}

          {s.tenants.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px]">
              {s.tenants.map((t) => (
                <li key={t.name} className="leading-snug">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-muted">
                    {t.owed >= 1 ? ` owes ${gbp(t.owed)}` : " is up to date"}
                    {t.rent ? ` · rent ${gbp(t.rent)}` : ""}
                    {t.dueOn ? ` · last due ${day(t.dueOn)}` : ""}
                    {t.lastPayment ? ` · last paid ${day(t.lastPayment)}` : " · no payment yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Money in from the tenant, and out to the landlord, month by month. */}
          <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Payments in and out</p>
          <ul className="mt-1.5 divide-y divide-line/40 rounded-xl border border-line/50 bg-white">
            {s.history.map((h) => (
              <li key={h.month} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                <span className="w-[72px] shrink-0 font-semibold">{monthName(h.month)}</span>
                {h.amountToLandlord === null ? (
                  <span className="text-muted">Not read at the last check</span>
                ) : h.in ? (
                  <span className="min-w-0 flex-1">
                    <span>In {day(h.in)}</span>
                    <span className="text-muted"> · {gbp(h.amountToLandlord)} to the landlord</span>
                    <span className={`ml-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${h.paidOut ? "bg-[#f1f4ec] text-[#56634a]" : "bg-accent-soft text-accent-dark"}`}>
                      {h.paidOut ? "Paid out" : "Waiting to go out"}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted">{h.month === thisMonth() ? "Nothing in yet this month" : "No rent in"}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10.5px] text-muted">From PayProp, checked {checked(s.checkedAt)}. Checked each day at 10am and 4pm.</p>
        </>
      )}
    </section>
  );
}
