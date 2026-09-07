"use client";

import { useEffect, useState } from "react";
import type { Contractor, Move, RankedContractor, WorksOrder, PaidHow } from "@/lib/works-orders";
import { STEPS, stepOf, type StepId } from "@/lib/works-steps";

/**
 * The Now card on a job: one thing at a time, in the order James and
 * Michael set out on 7 Sep 2026. Tell the landlord, who's arranging it,
 * pick a contractor, are they confirmed, the date, the visit, is the tenant
 * happy, who's being paid, the money. Each step is its own small form and
 * nothing else is on offer until it is done - the rest of the sheet is
 * underneath for reference.
 */

const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—");
const toPence = (s: string) => Math.round(Number(String(s).replace(/[£,\s]/g, "")) * 100);
const localDate = (daysOn: number) => { const d = new Date(Date.now() + daysOn * 86400000); return d.toISOString().slice(0, 10); };
const tel = (s: string) => s.replace(/[^\d+]/g, "");

const PAID_HOW: { id: PaidHow; label: string }[] = [
  { id: "payprop", label: "Charged to the landlord through PayProp" },
  { id: "landlord", label: "Paid by the landlord direct" },
  { id: "tle", label: "Paid by TLE" },
  { id: "tenant", label: "Recharged to the tenant" },
];

/** The main line of steps, for the progress row. The landlord-organising branch sits off it. */
const LINE: StepId[] = ["tell_landlord", "arranging", "pick_contractor", "contractor_confirm", "booking", "visit", "aftercare", "payment", "invoice"];

const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";
const btn = "rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40";
const primary = "rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50";
const tile = "flex-1 rounded-xl border px-4 py-3 text-left transition-colors";

export function WorksNow({ o, move, busy, err, canCorporate, onInvoiceLandlord, ranked, canAdd = true }: {
  o: WorksOrder;
  move: (m: Move) => Promise<void>;
  busy: boolean;
  err: string | null;
  canCorporate: boolean;
  onInvoiceLandlord: () => void;
  /** Given, the trades come from the caller rather than the book's own API.
   *  The rehearsal passes its own shelf so a shared link never shows the
   *  real contractors or their numbers. */
  ranked?: RankedContractor[] | null;
  canAdd?: boolean;
}) {
  const step = stepOf(o);
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => setF({}), [step, o.id]);
  const at = LINE.indexOf(step);
  const meta = STEPS.find((s) => s.id === step)!;
  const hot = o.urgency === "emergency" && step !== "closed";

  return (
    <div className={`rounded-2xl border p-4 ${hot ? "border-accent-dark/50 bg-accent-soft/30" : "border-line/80 bg-panel"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Now</p>
        {step !== "closed" && (
          <ol className="flex items-center gap-1" aria-label="Progress">
            {LINE.filter((s) => o.kind === "repair" || s !== "aftercare").map((s) => {
              const idx = LINE.indexOf(s);
              const done = at > idx || (step === "landlord_follow_up" && idx < 2);
              const here = s === step || (step === "landlord_follow_up" && s === "arranging");
              return <li key={s} title={STEPS.find((x) => x.id === s)?.label} className={`h-1.5 rounded-full transition-all ${here ? "w-5 bg-accent-dark" : done ? "w-2.5 bg-ink/60" : "w-2.5 bg-line"}`}></li>;
            })}
          </ol>
        )}
      </div>
      <h3 className={`mt-1 text-[16px] ${hot ? "font-semibold text-accent-dark" : ""}`}>{meta.label}</h3>
      {meta.blurb && <p className="mt-0.5 text-[12px] text-muted">{meta.blurb}</p>}

      <div className="mt-3">
        {step === "tell_landlord" && <TellLandlord o={o} f={f} setF={setF} move={move} busy={busy} />}
        {step === "arranging" && <Arranging o={o} f={f} setF={setF} move={move} busy={busy} />}
        {step === "landlord_follow_up" && <LandlordFollowUp o={o} f={f} setF={setF} move={move} busy={busy} />}
        {step === "pick_contractor" && <PickContractor o={o} move={move} busy={busy} canCorporate={canCorporate} given={ranked} canAdd={canAdd} />}
        {step === "contractor_confirm" && <ContractorConfirm o={o} move={move} busy={busy} canCorporate={canCorporate} given={ranked} canAdd={canAdd} />}
        {step === "booking" && <Booking o={o} f={f} setF={setF} move={move} busy={busy} />}
        {step === "visit" && <Visit o={o} f={f} setF={setF} move={move} busy={busy} />}
        {step === "aftercare" && <Aftercare o={o} f={f} setF={setF} move={move} busy={busy} />}
        {step === "payment" && <Payment o={o} move={move} busy={busy} />}
        {step === "invoice" && <Money o={o} f={f} setF={setF} move={move} busy={busy} onInvoiceLandlord={onInvoiceLandlord} />}
        {step === "closed" && (
          <p className="text-[13px]">
            {o.status === "cancelled" ? `Cancelled. ${o.cancelledReason}` : o.status === "paid" ? `Paid ${dayOf(o.paidAt)}.` : `The landlord sorted it themselves, resolved ${dayOf(o.landlordResolvedAt)}.`}
          </p>
        )}
      </div>
      {err && <p className="mt-2 text-[12px] text-accent-dark">{err}</p>}
    </div>
  );
}

type StepProps = { o: WorksOrder; f: Record<string, string>; setF: (f: Record<string, string>) => void; move: (m: Move) => Promise<void>; busy: boolean };

function ContractorLink({ o }: { o: WorksOrder }) {
  const [copied, setCopied] = useState(false);
  if (!o.contractorToken) return null;
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/contractor/${o.contractorToken}`;
  return (
    <p className="mt-2 text-[11.5px] text-muted">
      The contractor's page for this job is in their works order.{" "}
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="underline">{copied ? "Copied" : "Copy the link"}</button>
      {" "}to send it again.
    </p>
  );
}

function TellLandlord({ o, f, setF, move, busy }: StepProps) {
  const mobile = f.mobile ?? o.landlordMobile;
  const email = f.email ?? o.landlordEmail;
  const saveDetails = async () => {
    const fields: Move & { action: "edit" } = { action: "edit", fields: {} };
    if (f.mobile !== undefined && f.mobile !== o.landlordMobile) fields.fields.landlordMobile = f.mobile;
    if (f.email !== undefined && f.email !== o.landlordEmail) fields.fields.landlordEmail = f.email;
    if (Object.keys(fields.fields).length) await move(fields);
  };
  const tell = async (how: "rang" | "emailed" | "both") => {
    await saveDetails();
    await move({ action: "tell_landlord", how, note: f.note });
  };
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/80 bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{o.landlord || "The landlord"}</p>
          {o.landlordMobile ? (
            <a href={`tel:${tel(o.landlordMobile)}`} className="figures mt-1 block text-[22px] leading-none hover:underline">{o.landlordMobile}</a>
          ) : (
            <input value={mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} placeholder="Their mobile - none on the property" className={`mt-1 ${field}`} />
          )}
          {o.landlordEmail ? (
            <p className="mt-1.5 truncate text-[12px] text-muted">{o.landlordEmail}</p>
          ) : (
            <input type="email" value={email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Their email - none on the property" className={`mt-2 ${field}`} />
          )}
        </div>
        <div className="rounded-xl border border-line/80 bg-card p-3 text-[12.5px] leading-relaxed">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">What to say</p>
          <p className="mt-1">{o.title}{o.description ? `: ${o.description}` : ""}.</p>
          <p className="mt-1 text-muted">Do they want to sort it with their own people, or shall we? The email report says the same and asks the same.</p>
        </div>
      </div>
      <input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What they said (optional)" className={`mt-3 ${field}`} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void tell("rang")} className={primary}>Rang them</button>
        <button type="button" disabled={busy || !email.includes("@")} onClick={() => void tell("emailed")} className={btn} title={email.includes("@") ? "Sends the report from your own mailbox when it is connected" : "No email address"}>Email the report</button>
        <button type="button" disabled={busy || !email.includes("@")} onClick={() => void tell("both")} className={btn}>Rang and emailed</button>
      </div>
    </div>
  );
}

function Arranging({ o, f, setF, move, busy }: StepProps) {
  const [who, setWho] = useState<"landlord" | "us" | null>(null);
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => setWho("landlord")} className={`${tile} ${who === "landlord" ? "border-accent-dark bg-accent-soft/40" : "border-line/80 bg-card hover:border-ink/40"}`}>
          <span className="block text-[14px] font-semibold">{o.landlord ? `${o.landlord.split(" ")[0]} is organising it` : "The landlord is organising it"}</span>
          <span className="mt-0.5 block text-[11.5px] text-muted">Their contractor. We follow up on a date until it's resolved.</span>
        </button>
        <button type="button" disabled={busy} onClick={() => void move({ action: "arranging", who: "us" })} className={`${tile} border-line/80 bg-card hover:border-ink/40`}>
          <span className="block text-[14px] font-semibold">We're organising it</span>
          <span className="mt-0.5 block text-[11.5px] text-muted">Pick a contractor next, nearest first.</span>
        </button>
      </div>
      {who === "landlord" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted">Follow up on</label>
            <input type="date" value={f.followUp ?? localDate(3)} onChange={(e) => setF({ ...f, followUp: e.target.value })} className={`mt-1 ${field}`} />
          </div>
          <button type="button" disabled={busy} onClick={() => void move({ action: "arranging", who: "landlord", followUpAt: new Date(f.followUp ?? localDate(3)).toISOString() })} className={primary}>Leave it with them</button>
        </div>
      )}
    </div>
  );
}

function LandlordFollowUp({ o, f, setF, move, busy }: StepProps) {
  const due = o.landlordFollowUpAt ? new Date(o.landlordFollowUpAt).getTime() <= Date.now() : true;
  return (
    <div>
      <p className={`text-[13px] ${due ? "font-semibold text-accent-dark" : ""}`}>
        {due ? `Follow-up due: ring ${o.landlord || "the landlord"}${o.landlordMobile ? ` on ${o.landlordMobile}` : ""}. Is it sorted?` : `Follow up ${dayOf(o.landlordFollowUpAt)}.`}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <button type="button" disabled={busy} onClick={() => void move({ action: "landlord_resolved", note: f.note })} className={primary}>Resolved</button>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted">Not yet - follow up again on</label>
          <div className="mt-1 flex gap-2">
            <input type="date" value={f.followUp ?? localDate(3)} onChange={(e) => setF({ ...f, followUp: e.target.value })} className={field} />
            <button type="button" disabled={busy} onClick={() => void move({ action: "arranging", who: "landlord", followUpAt: new Date(f.followUp ?? localDate(3)).toISOString(), note: f.note })} className={`${btn} whitespace-nowrap`}>Push it</button>
          </div>
        </div>
        <button type="button" disabled={busy} onClick={() => void move({ action: "arranging", who: "us", note: "The landlord asked us to organise it after all." })} className={btn}>We'll organise it after all</button>
      </div>
    </div>
  );
}

/** Ranked by trade and distance, off the API. Adding one refreshes the list. */
function RankedList({ o, move, busy, canCorporate, onPicked, given, canAdd = true }: { o: WorksOrder; move: (m: Move) => Promise<void>; busy: boolean; canCorporate: boolean; onPicked?: () => void; given?: RankedContractor[] | null; canAdd?: boolean }) {
  const [ranked, setRanked] = useState<RankedContractor[] | null>(given ?? null);
  const [placed, setPlaced] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    if (given) { setRanked(given); return; }
    fetch(`/api/contractors?for=${encodeURIComponent(o.id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) { setRanked(j.ranked); setPlaced(j.placed); } else setErr(j.error ?? "Could not read the book."); }).catch(() => setErr("Could not read the book."));
  };
  useEffect(load, [o.id, given]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      {err && <p className="text-[12px] text-accent-dark">{err}</p>}
      {ranked === null && !err && <p className="text-[12px] text-muted">Finding the nearest {o.category.toLowerCase()} people…</p>}
      {ranked && ranked.length === 0 && <p className="text-[12.5px] text-muted">Nobody in your book or the company's yet. Add the first one below.</p>}
      {ranked && ranked.length > 0 && (
        <ul className="divide-y divide-line/50 rounded-xl border border-line/80 bg-card">
          {ranked.slice(0, 8).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{c.name}{c.contact ? <span className="text-muted"> · {c.contact}</span> : null}</span>
                <span className="block truncate text-[11px] text-muted">
                  {c.trade}{c.fits ? "" : " · different trade"}{c.miles != null ? ` · ${c.miles < 10 ? c.miles.toFixed(1) : Math.round(c.miles)} miles` : c.address ? "" : " · no address"}{c.ownerId ? "" : " · company"}
                </span>
              </span>
              {c.phone && <a href={`tel:${tel(c.phone)}`} className="figures text-[14px] hover:underline">{c.phone}</a>}
              <button type="button" disabled={busy} onClick={() => { onPicked?.(); void move({ action: "contact_contractor", contractorId: c.id }); }} className={primary} title={c.email ? "Marks them contacted and emails them the report" : "Marks them contacted. No email on file, so nothing is sent."}>
                Contacted
              </button>
            </li>
          ))}
        </ul>
      )}
      {!placed && ranked && ranked.length > 0 && <p className="mt-1.5 text-[11px] text-muted">The property has no map position, so this is by trade only.</p>}
      {!canAdd ? null : adding ? (
        <div className="mt-3 rounded-xl border border-line/80 bg-card p-3">
          <ContractorForm initial={{ trade: o.category }} canCorporate={canCorporate} compact onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`mt-2 ${btn}`}>+ Add a contractor</button>
      )}
    </div>
  );
}

function PickContractor({ o, move, busy, canCorporate, given, canAdd }: { o: WorksOrder; move: (m: Move) => Promise<void>; busy: boolean; canCorporate: boolean; given?: RankedContractor[] | null; canAdd?: boolean }) {
  return <RankedList o={o} move={move} busy={busy} canCorporate={canCorporate} given={given} canAdd={canAdd} />;
}

function ContractorConfirm({ o, move, busy, canCorporate, given, canAdd }: { o: WorksOrder; move: (m: Move) => Promise<void>; busy: boolean; canCorporate: boolean; given?: RankedContractor[] | null; canAdd?: boolean }) {
  const [other, setOther] = useState(false);
  if (other) return (
    <div>
      <p className="mb-2 text-[12.5px] text-muted">{o.contractorName} is off the job once you mark somebody else contacted.</p>
      <RankedList o={o} move={move} busy={busy} canCorporate={canCorporate} given={given} canAdd={canAdd} />
      <button type="button" onClick={() => setOther(false)} className={`mt-2 ${btn}`}>Back</button>
    </div>
  );
  return (
    <div>
      <p className="text-[13px]">{o.contractorName} was contacted {stamp(o.contractorContactedAt)}. Have they said yes?</p>
      <p className="mt-1 text-[11.5px] text-muted">Confirming sends them the works order with their page to book the date, and tells the tenant somebody's been found.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void move({ action: "contractor_confirmed" })} className={primary}>They've confirmed</button>
        <button type="button" onClick={() => setOther(true)} className={btn}>Try somebody else</button>
      </div>
    </div>
  );
}

function Booking({ o, f, setF, move, busy }: StepProps) {
  return (
    <div>
      <p className="text-[13px]">{o.contractorName} has the works order and can set the date from their page. Or type it in when they tell you.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted">Arranged for</label>
          <input type="datetime-local" value={f.at ?? ""} onChange={(e) => setF({ ...f, at: e.target.value })} className={`mt-1 ${field}`} />
        </div>
        <button type="button" disabled={busy || !f.at} onClick={() => void move({ action: "schedule", scheduledAt: new Date(f.at).toISOString() })} className={primary}>That's the date</button>
      </div>
      <p className="mt-2 text-[11.5px] text-muted">Setting it tells the tenant and the contractor, and lets the landlord know it's arranged.</p>
      <ContractorLink o={o} />
    </div>
  );
}

function Visit({ o, f, setF, move, busy }: StepProps) {
  const past = o.scheduledAt ? new Date(o.scheduledAt).getTime() < Date.now() : false;
  return (
    <div>
      <p className="text-[13px]">{o.contractorName} booked for {stamp(o.scheduledAt)}.{past ? " That's passed - has it been done?" : ""}</p>
      <p className="mt-1 text-[11.5px] text-muted">The contractor can mark it done from their page with photos and their invoice, and gets asked the morning after. Or mark it here.</p>
      <textarea value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="What was done" className={`mt-3 ${field}`} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <button type="button" disabled={busy} onClick={() => void move({ action: "done", note: f.note ?? "" })} className={primary}>Mark it done</button>
        <div className="flex items-center gap-2">
          <input type="datetime-local" value={f.at ?? ""} onChange={(e) => setF({ ...f, at: e.target.value })} className={field} />
          <button type="button" disabled={busy || !f.at} onClick={() => void move({ action: "schedule", scheduledAt: new Date(f.at).toISOString() })} className={`${btn} whitespace-nowrap`}>Move the date</button>
        </div>
      </div>
      <ContractorLink o={o} />
    </div>
  );
}

function Aftercare({ o, f, setF, move, busy }: StepProps) {
  return (
    <div>
      <p className="text-[13px]">Done {stamp(o.completedAt)}. The tenant has been asked whether they're happy, with a yes and a no in the email.</p>
      <p className="mt-1 text-[11.5px] text-muted">If they tell you on the phone instead, record it here. A no comes back to you either way.</p>
      <input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What they said (optional)" className={`mt-3 ${field}`} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void move({ action: "tenant_happy", happy: "yes", note: f.note })} className={primary}>They're happy</button>
        <button type="button" disabled={busy} onClick={() => void move({ action: "tenant_happy", happy: "no", note: f.note })} className={btn}>Not happy</button>
      </div>
    </div>
  );
}

function Payment({ o, move, busy }: { o: WorksOrder; move: (m: Move) => Promise<void>; busy: boolean }) {
  return (
    <div>
      {o.tenantHappy === "no" && <p className="mb-2 rounded-lg border border-accent-dark/40 bg-accent-soft/40 px-3 py-2 text-[12.5px]">The tenant said it isn't right{o.tenantHappyNote ? `: "${o.tenantHappyNote}"` : ""}. Sort that before the money.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} onClick={() => void move({ action: "payee", payee: "contractor" })} className={`${tile} border-line/80 bg-card hover:border-ink/40`}>
          <span className="block text-[14px] font-semibold">{o.contractorName || "The contractor"} is paid</span>
          <span className="mt-0.5 block text-[11.5px] text-muted">Their invoice goes on the job and to accounts.</span>
        </button>
        <button type="button" disabled={busy} onClick={() => void move({ action: "payee", payee: "agent" })} className={`${tile} border-line/80 bg-card hover:border-ink/40`}>
          <span className="block text-[14px] font-semibold">I paid it myself</span>
          <span className="mt-0.5 block text-[11.5px] text-muted">You're the payee; accounts reimburse you.</span>
        </button>
      </div>
    </div>
  );
}

function Money({ o, f, setF, move, busy, onInvoiceLandlord }: StepProps & { onInvoiceLandlord: () => void }) {
  const [paying, setPaying] = useState(false);
  const payee = o.payee === "agent" ? `${o.raisedBy || "the agent"} (paid it themselves)` : o.contractorName || "the contractor";
  return (
    <div className="space-y-3">
      {o.invoicePence == null ? (
        <div className="rounded-xl border border-line/80 bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{o.payee === "agent" ? "What you paid" : "The contractor's invoice"}</p>
          <p className="mt-1 text-[11.5px] text-muted">{o.payee === "agent" ? "The receipt goes on as a file." : "They can upload it from their page, or key it here off the email."}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={f.amount ?? ""} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="£ total" className={field} />
            <input value={f.ref ?? ""} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="Invoice number" className={field} />
            <button type="button" disabled={busy || !f.amount} onClick={() => void move({ action: "invoice", invoicePence: toPence(f.amount ?? ""), invoiceRef: f.ref })} className={primary}>On the job</button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line/80 bg-card p-3 text-[13px]">
          <p><strong>{pounds(o.invoicePence)}</strong> to {payee}{o.invoiceRef ? ` · invoice ${o.invoiceRef}` : ""}.</p>
          <p className="mt-0.5 text-[11.5px] text-muted">{o.accountsToldAt ? `Accounts told ${stamp(o.accountsToldAt)}; it's on their list with the PayProp details.` : "Accounts have not been told - no accounts inbox is set under Invoices."}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onInvoiceLandlord} className={o.invoicePence != null && o.status !== "paid" ? primary : btn} title="Drafts our invoice to the landlord: their name, the job as the reference, the cost as the first line">Invoice the landlord</button>
        {o.invoicePence != null && !paying && <button type="button" onClick={() => setPaying(true)} className={btn}>Mark paid</button>}
      </div>
      {paying && (
        <div className="rounded-xl border border-line/80 bg-card p-3">
          <div className="grid gap-1.5">
            {PAID_HOW.map((h) => (
              <label key={h.id} className="flex items-center gap-2 text-[12.5px]"><input type="radio" name="how" checked={f.how === h.id} onChange={() => setF({ ...f, how: h.id })} />{h.label}</label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">PayProp is read-only to the OS: the payment is keyed there by accounts, and marking it here closes the job.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setPaying(false)} className={btn}>Back</button>
            <button type="button" disabled={busy || !f.how} onClick={() => void move({ action: "paid", paidHow: f.how as PaidHow })} className={primary}>Paid</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── The trades book's form, used from the book and from inside a job ───── */

export const BLANK_CONTRACTOR: Partial<Contractor> = { name: "", contact: "", trade: "", phone: "", email: "", website: "", address: "", registration: "", notes: "", active: true };

/** The form, used from the book and from inside a job. */
export function ContractorForm({ initial, canCorporate, onSaved, onClose, compact = false }: { initial: Partial<Contractor>; canCorporate: boolean; onSaved: (c: Contractor) => void; onClose: () => void; compact?: boolean }) {
  const [c, setC] = useState<Partial<Contractor> & { scope?: "mine" | "corporate" }>({ ...BLANK_CONTRACTOR, ...initial, scope: initial.id ? (initial.ownerId ? "mine" : "corporate") : "mine" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[12.5px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";
  async function save() {
    if (!c.name?.trim() || !c.trade?.trim()) return setErr("A name and a trade, at least.");
    setBusy(true);
    const r = await fetch("/api/contractors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not save.");
    onSaved(r.contractor);
  }
  return (
    <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
      <div><label className={label}>Company or name</label><input value={c.name ?? ""} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="JD Plumbing & Heating" className={`mt-1 ${field}`} /></div>
      <div><label className={label}>Trade</label><input value={c.trade ?? ""} onChange={(e) => setC({ ...c, trade: e.target.value })} placeholder="Gas Safe engineer, electrician, handyman…" className={`mt-1 ${field}`} /></div>
      <div><label className={label}>Who you ring</label><input value={c.contact ?? ""} onChange={(e) => setC({ ...c, contact: e.target.value })} placeholder="Contact name" className={`mt-1 ${field}`} /></div>
      <div><label className={label}>Phone</label><input value={c.phone ?? ""} onChange={(e) => setC({ ...c, phone: e.target.value })} className={`mt-1 ${field}`} /></div>
      <div><label className={label}>Email</label><input type="email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} placeholder="Where the works orders go" className={`mt-1 ${field}`} /></div>
      {!compact && (
        <>
          <div><label className={label}>Website</label><input value={c.website ?? ""} onChange={(e) => setC({ ...c, website: e.target.value })} placeholder="https://" className={`mt-1 ${field}`} /></div>
          <div className="sm:col-span-2"><label className={label}>Address</label><input value={c.address ?? ""} onChange={(e) => setC({ ...c, address: e.target.value })} className={`mt-1 ${field}`} /></div>
          <div><label className={label}>Registration</label><input value={c.registration ?? ""} onChange={(e) => setC({ ...c, registration: e.target.value })} placeholder="Gas Safe / NICEIC / NAPIT number" className={`mt-1 ${field}`} /></div>
          <div className="sm:col-span-2 lg:col-span-3"><label className={label}>Notes</label><textarea value={c.notes ?? ""} onChange={(e) => setC({ ...c, notes: e.target.value })} rows={2} placeholder="Areas they cover, rates, hours, how they like to be booked" className={`mt-1 ${field}`} /></div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
        {canCorporate ? (
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={c.scope === "corporate"} onChange={(e) => setC({ ...c, scope: e.target.checked ? "corporate" : "mine" })} />
            On the company shelf, for everyone
          </label>
        ) : (
          <span className="text-[11.5px] text-muted">Goes in your own book.</span>
        )}
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={c.active !== false} onChange={(e) => setC({ ...c, active: e.target.checked })} /> Active</label>
        {err && <span className="text-[12px] text-accent-dark">{err}</span>}
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-1.5 text-[12px] text-muted">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">{busy ? "Saving…" : "Save"}</button>
        </span>
      </div>
    </div>
  );
}

