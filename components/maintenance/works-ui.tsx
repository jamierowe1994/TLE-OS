"use client";

import { useEffect, useState } from "react";
import type { Contractor, WorksOrder, Status, PaidHow } from "@/lib/works-orders";
import { stepOf } from "@/lib/works-steps";
import { ContractorForm } from "@/components/WorksNow";
import FieldSelect from "@/components/FieldSelect";

/**
 * The words and small pieces every maintenance screen shares: the board on
 * /maintenance, the job sheet, the report form, and the property's own page
 * (James, 7 Oct 2026: report a repair from the property, where you would go
 * to look for it). One copy, so the two screens never say a job differently.
 */

export const REPORTED_BY = ["Tenant", "Landlord", "Agent", "Inspection", "Compliance tracker", "Contractor"];
export const STATUS_LABEL: Record<Status, string> = { reported: "Reported", approval: "Awaiting landlord", approved: "Approved", scheduled: "Booked", done: "Done", invoiced: "Invoiced", paid: "Paid", cancelled: "Cancelled" };
export const STATUS_ORDER: Status[] = ["reported", "approval", "approved", "scheduled", "done", "invoiced", "paid", "cancelled"];
export const OPEN: Status[] = ["reported", "approval", "approved", "scheduled"];
export const PAID_HOW: { id: PaidHow; label: string }[] = [
  { id: "payprop", label: "Charged to the landlord through PayProp" },
  { id: "landlord", label: "Paid by the landlord direct" },
  { id: "tle", label: "Paid by TLE" },
  { id: "tenant", label: "Recharged to the tenant" },
];

export const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
export const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const toPence = (s: string) => Math.round(Number(String(s).replace(/[£,\s]/g, "")) * 100);

/** What the row says to do next. The job's next thing, not its status. */
export function nextFor(o: WorksOrder, ringForApproval = false): { text: string; hot: boolean } {
  const late = o.dueAt ? new Date(o.dueAt).getTime() < Date.now() : false;
  const clock = o.kind === "repair" ? ` · attend by ${stamp(o.dueAt)}` : ` · due ${day(o.dueAt)}`;
  /* A landlord who asked not to be emailed was not sent the approval
     request, so nobody is "waiting" - somebody has to ring (6 Oct 2026). */
  if (ringForApproval && o.status === "approval") return { text: `Ring ${o.landlord || "the landlord"} for approval of ${pounds(o.quotePence)}`, hot: true };
  switch (stepOf(o)) {
    case "tell_landlord": return { text: `Tell the landlord${clock}`, hot: late || o.urgency === "emergency" };
    case "arranging": return { text: "Who's arranging it?", hot: late || o.urgency === "emergency" };
    case "landlord_follow_up": return { text: `Landlord organising · follow up ${day(o.landlordFollowUpAt)}`, hot: !!o.landlordFollowUpAt && new Date(o.landlordFollowUpAt).getTime() < Date.now() };
    case "pick_contractor": return { text: o.status === "approval" ? `Waiting on the landlord to approve ${pounds(o.quotePence)}` : `Pick a contractor${clock}`, hot: late };
    case "contractor_confirm": return { text: `${o.contractorName} contacted - confirmed?`, hot: late };
    case "booking": return { text: `${o.contractorName} confirmed - waiting on a date`, hot: late };
    case "visit": return { text: `${o.contractorName || "Contractor"} booked for ${stamp(o.scheduledAt)}`, hot: false };
    case "aftercare": return { text: o.tenantHappy === "no" ? "Tenant not happy" : "Done - is the tenant happy?", hot: o.tenantHappy === "no" };
    case "payment": return { text: "Who's being paid?", hot: false };
    case "invoice": return { text: o.invoicePence != null ? `${pounds(o.invoicePence)} in - invoice the landlord` : "Waiting on the invoice", hot: false };
    case "closed": return { text: o.status === "paid" ? `Paid ${day(o.paidAt)}` : o.status === "cancelled" ? (o.cancelledReason || "Cancelled") : `Landlord sorted it · ${day(o.landlordResolvedAt)}`, hot: false };
  }
}

export type Property = { id: string; name: string; locality: string; landlord?: string; tenant?: string | null; certs?: Record<string, { expires: number | null }> };

/** Which certificate on the compliance book a planned category is about. */
export const CATEGORY_CERT: Record<string, string> = {
  "Gas safety (CP12)": "gas",
  "EICR": "eicr",
  "EPC": "epc",
  "HMO licence inspection": "licence",
};

/** `wrap` for a value that must be read whole - a planned job's several categories. */
export function Fact({ k, v, wrap = false }: { k: string; v: string; wrap?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</dt>
      <dd className={`mt-0.5 ${wrap ? "break-words" : "truncate"}`} title={v}>{v}</dd>
    </div>
  );
}

/* ── Picking a contractor, or adding one without leaving the job ────────── */

export function ContractorPick({ contractors, value, onChange, className, styled = false }: { contractors: Contractor[]; value: string; onChange: (id: string) => void; className: string; styled?: boolean }) {
  const [list, setList] = useState(contractors);
  const [adding, setAdding] = useState(false);
  useEffect(() => setList(contractors), [contractors]);
  const mine = list.filter((c) => c.active && c.ownerId);
  const corp = list.filter((c) => c.active && !c.ownerId);
  return (
    <div>
      {styled ? (
        <FieldSelect
          className="mt-1"
          value={value}
          onChange={onChange}
          placeholder="Not yet"
          options={[
            { value: "", label: "Not yet" },
            ...mine.map((c) => ({ value: c.id, label: c.name, sub: c.trade, group: "Your contractors" })),
            ...corp.map((c) => ({ value: c.id, label: c.name, sub: c.trade, group: "The company's" })),
          ]}
          extra={{ label: "+ Add a contractor", onPick: () => setAdding(true) }}
        />
      ) : (
      <select value={adding ? "__add" : value} onChange={(e) => { if (e.target.value === "__add") setAdding(true); else onChange(e.target.value); }} className={className}>
        <option value="">Not yet</option>
        {mine.length > 0 && <optgroup label="Your contractors">{mine.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.trade}</option>)}</optgroup>}
        {corp.length > 0 && <optgroup label="The company's">{corp.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.trade}</option>)}</optgroup>}
        <option value="__add">+ Add a contractor…</option>
      </select>
      )}
      {adding && (
        <div className="mt-2 rounded-xl border border-line/80 bg-card p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">New contractor, in your book</p>
          <ContractorForm
            compact
            initial={{}}
            canCorporate={false}
            onClose={() => setAdding(false)}
            onSaved={(c) => { setList((cur) => [c, ...cur]); onChange(c.id); setAdding(false); }}
          />
        </div>
      )}
    </div>
  );
}
