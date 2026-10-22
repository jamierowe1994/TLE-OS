"use client";

import { useState } from "react";
import type { Contractor, Move, PaidHow, Urgency, WorksOrder } from "@/lib/works-orders";
import { URGENCIES } from "@/lib/works-catalogue";
import FieldDate from "@/components/FieldDate";
import FieldSelect from "@/components/FieldSelect";
import { ContractorPick, PAID_HOW, pounds, toPence } from "@/components/maintenance/works-ui";
import { AskForQuotes } from "@/components/maintenance/QuoteAsks";

/**
 * The job's small forms, one per thing you can do to it: the quote, the
 * approval, the contractor, the date, done, the invoice, paid, cancel, a
 * note, the details. Each builds one Move for PATCH /api/works-orders/<id>
 * and nothing else - the server decides what follows.
 *
 * Lifted out for the job's full page (James, 21 Oct 2026: "log a quote,
 * input a date, all of the different stages so they can jump around in that
 * process a little bit, and raise an invoice"). The Move each one sends is
 * the same as the job sheet's (components/maintenance/JobDrawer).
 */

export type FormId = "quote" | "request_quote" | "approve" | "assign" | "schedule" | "done" | "already_done" | "invoice" | "paid" | "cancel" | "reopen" | "note" | "edit";

export const FORM_TITLE: Record<FormId, (o: WorksOrder) => string> = {
  quote: (o) => (o.quotePence != null ? "Change the Quote" : "Log a Quote"),
  request_quote: () => "Ask for Quotes",
  approve: () => "Approve the Quote",
  assign: (o) => (o.contractorId ? "Change the Contractor" : "Set a Contractor"),
  schedule: (o) => (o.scheduledAt ? "Move the Date" : "Set the Date"),
  done: () => "Mark It Done",
  already_done: () => "It Was Already Done",
  invoice: (o) => (o.invoicePence != null ? "Change the Invoice" : "Log the Invoice"),
  paid: () => "Mark It Paid",
  cancel: () => "Cancel the Job",
  reopen: () => "Reopen the Job",
  note: () => "Add a Note",
  edit: () => "Edit the Details",
};

const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";
const btn = "rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40";
const primary = "rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50";
const label = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted";
const iso = (local: string | undefined) => (local ? new Date(local).toISOString() : null);

export function JobForm({ o, form, contractors, move, busy, err, onBack, uploadFile }: {
  o: WorksOrder;
  form: FormId;
  contractors: Contractor[];
  /** Resolves once the server has answered; the caller closes the form on success. */
  move: (m: Move, label?: string) => Promise<boolean>;
  busy: boolean;
  err: string | null;
  onBack: () => void;
  /** Puts a file on R2 and the job, returning false if it did not land. */
  uploadFile: (file: File, kind?: "invoice" | "quote") => Promise<boolean>;
}) {
  const [f, setF] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setMine(null);
    const m: Move | null =
      form === "quote" ? (f.amount ? { action: "quote", quotePence: toPence(f.amount), note: f.note } : null)
      : form === "request_quote" ? (f.contractorId || o.contractorId ? { action: "request_quote", contractorId: f.contractorId || undefined, note: f.note } : null)
      : form === "approve" ? { action: "approve", approvedBy: f.approvedBy ?? (o.landlord || "The landlord"), note: f.note }
      : form === "assign" ? (f.contractorId || o.contractorId ? { action: "assign", contractorId: f.contractorId || o.contractorId!, scheduledAt: iso(f.scheduledAt), note: f.note, quiet: true } : null)
      : form === "schedule" ? (f.scheduledAt ? { action: "schedule", scheduledAt: iso(f.scheduledAt)!, note: f.note } : null)
      : form === "done" || form === "already_done" ? { action: "done", note: f.note ?? "", completedAt: iso(f.completedAt), ...(form === "already_done" ? { alreadyDone: true } : {}) }
      : form === "invoice" ? (f.amount ? { action: "invoice", invoicePence: toPence(f.amount), invoiceRef: f.ref ?? (o.invoicePence != null ? o.invoiceRef : "") } : null)
      : form === "paid" ? (f.how ? { action: "paid", paidHow: f.how as PaidHow, note: f.note } : null)
      : form === "cancel" ? { action: "cancel", reason: f.note ?? "" }
      : form === "reopen" ? { action: "reopen", note: f.note }
      : form === "note" ? { action: "note", note: f.note ?? "" }
      : form === "edit" ? { action: "edit", fields: {
          title: f.title, description: f.description, tenant: f.tenant, tenantPhone: f.tenantPhone, tenantEmail: f.tenantEmail,
          landlord: f.landlord, landlordEmail: f.landlordEmail, landlordMobile: f.landlordMobile, access: f.access,
          authorityPence: f.authority ? toPence(f.authority) : undefined,
          urgency: f.urgency as Urgency | undefined,
          dueAt: f.dueAt !== undefined ? (f.dueAt ? new Date(f.dueAt).toISOString() : null) : undefined,
        } }
      : null;
    if (!m) {
      setMine(form === "assign" || form === "request_quote" ? "Pick a contractor." : form === "paid" ? "Say how it was paid." : form === "schedule" ? "Choose the date and time." : "Put the figure in first.");
      return;
    }
    if (m.action === "quote" && !Number.isFinite(m.quotePence)) return setMine("That figure doesn't look right.");
    if (m.action === "invoice" && !Number.isFinite(m.invoicePence)) return setMine("That figure doesn't look right.");
    /* The quote or invoice file goes on the job first, so a failed upload saves nothing. */
    if (file && (form === "invoice" || form === "quote")) {
      const ok = await uploadFile(file, form === "invoice" ? "invoice" : "quote");
      if (!ok) return;
    }
    await move(m, FORM_TITLE[form](o));
  }

  const fileBox = (what: string) => (
    <label className={`flex cursor-pointer items-center justify-between gap-2 ${field}`}>
      <span className={`truncate ${file ? "" : "text-muted"}`}>{file ? file.name : what}</span>
      <span className="shrink-0 text-[11.5px] underline">{file ? "Change" : "Choose"}</span>
      <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </label>
  );

  return (
    <div>
      {form === "quote" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Their price</span>
            <input value={f.amount ?? ""} onChange={(e) => set("amount", e.target.value)} inputMode="decimal" placeholder={o.quotePence != null ? `Now ${pounds(o.quotePence)}` : "£ quote"} className={field} />
          </div>
          <div>
            <span className={label}>A line for the timeline</span>
            <input value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="From whom, what it covers" className={field} />
          </div>
          <div className="sm:col-span-2">{fileBox("Attach the quote (PDF or photo, optional)")}</div>
          <p className="text-[11.5px] text-muted sm:col-span-2">The landlord&apos;s authority on this job is {pounds(o.authorityPence)}. Within it, it&apos;s approved straight away. Over it, the job waits on the landlord&apos;s yes.</p>
        </div>
      )}
      {form === "request_quote" && (
        /* One contractor or several, each on their own link (Sean, 21 Oct 2026). It sends itself. */
        <AskForQuotes o={o} busy={busy} send={(m) => move(m, "Ask for Quotes")} onBack={onBack} />
      )}
      {form === "approve" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Who said yes</span>
            <input value={f.approvedBy ?? o.landlord} onChange={(e) => set("approvedBy", e.target.value)} placeholder="Who said yes" className={field} />
          </div>
          <div>
            <span className={label}>How</span>
            <input value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Phone, email, in person" className={field} />
          </div>
          <p className="text-[11.5px] text-muted sm:col-span-2">
            {o.quotePence != null ? `Quote ${pounds(o.quotePence)} against an authority of ${pounds(o.authorityPence)}.` : "No quote on the job yet - this records the landlord's go-ahead on its own."}
          </p>
        </div>
      )}
      {form === "assign" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>The contractor</span>
            <ContractorPick contractors={contractors} value={f.contractorId ?? o.contractorId ?? ""} onChange={(v) => set("contractorId", v)} className={field} styled />
          </div>
          <div>
            <span className={label}>Booked for, if it is</span>
            <FieldDate className="mt-1" withTime clearable value={f.scheduledAt ?? ""} onChange={(v) => set("scheduledAt", v)} placeholder="Not yet" />
          </div>
          <input value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="A line for the timeline (optional)" className={`${field} sm:col-span-2`} />
          <p className="text-[11.5px] text-muted sm:col-span-2">This sets them on the job without emailing them. Send them the works order with Send it on the Engineer card when you&apos;re ready, or use Pick a Contractor and press Contacted to ask them first.</p>
        </div>
      )}
      {form === "schedule" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Date and time</span>
            <FieldDate withTime value={f.scheduledAt ?? ""} onChange={(v) => set("scheduledAt", v)} placeholder="The date and time agreed" />
          </div>
          <div>
            <span className={label}>A line for the timeline</span>
            <input value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Optional" className={field} />
          </div>
          <p className="text-[11.5px] text-muted sm:col-span-2">{o.scheduledAt ? "Moving it tells the tenant and the contractor the new date." : "Setting it tells the tenant and the contractor, and lets the landlord know it's arranged."}</p>
        </div>
      )}
      {(form === "done" || form === "already_done") && (
        <div className="grid gap-3">
          {form === "already_done" && <p className="text-[12px] text-muted">For work finished before it was on the OS. Nobody is emailed and the tenant isn&apos;t asked. The job goes straight to the money.</p>}
          <textarea value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} rows={3} placeholder="What was done. If a certificate was issued, use Add a Certificate as well." className={field} />
          <FieldDate withTime clearable value={f.completedAt ?? ""} onChange={(v) => set("completedAt", v)} placeholder="When it was done (now if left)" />
        </div>
      )}
      {form === "invoice" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>{o.payee === "agent" ? "What you paid" : "Invoice total"}</span>
            <input value={f.amount ?? ""} onChange={(e) => set("amount", e.target.value)} inputMode="decimal" placeholder={o.invoicePence != null ? `Now ${pounds(o.invoicePence)}` : "£ total"} className={field} />
          </div>
          <div>
            <span className={label}>Invoice number</span>
            <input value={f.ref ?? (o.invoicePence != null ? o.invoiceRef : "")} onChange={(e) => set("ref", e.target.value)} placeholder="Their reference" className={field} />
          </div>
          <div className="sm:col-span-2">{fileBox(o.payee === "agent" ? "Attach the receipt (PDF or photo)" : "Attach their invoice (PDF or photo)")}</div>
          <p className="text-[11.5px] text-muted sm:col-span-2">Accounts are emailed the invoice to pay, with the file attached when there is one.</p>
        </div>
      )}
      {form === "paid" && (
        <div className="grid gap-2">
          {PAID_HOW.map((h) => (
            <label key={h.id} className="flex items-center gap-2 text-[12.5px]">
              <input type="radio" name="how" checked={f.how === h.id} onChange={() => set("how", h.id)} />
              {h.label}
            </label>
          ))}
          <input value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="A line for the timeline (optional)" className={`mt-1 ${field}`} />
          <p className="text-[11px] text-muted">PayProp is read-only to the OS: choosing it records the fact here, and the payment is keyed in PayProp by hand. Marking it paid closes the job.</p>
        </div>
      )}
      {(form === "cancel" || form === "note" || form === "reopen") && (
        <textarea value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} rows={3} placeholder={form === "cancel" ? "Why it isn't going ahead" : form === "reopen" ? "Why it's open again (optional)" : "A call, an email, anything worth keeping"} className={field} />
      )}
      {form === "edit" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={f.title ?? o.title} onChange={(e) => set("title", e.target.value)} placeholder="Title" className={`${field} sm:col-span-2`} />
          <textarea value={f.description ?? o.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What's wrong, or what's needed" className={`${field} sm:col-span-2`} />
          <input value={f.tenant ?? o.tenant} onChange={(e) => set("tenant", e.target.value)} placeholder="Tenant's name" className={field} />
          <input value={f.tenantPhone ?? o.tenantPhone} onChange={(e) => set("tenantPhone", e.target.value)} placeholder="Tenant's number" className={field} />
          <input value={f.tenantEmail ?? o.tenantEmail} onChange={(e) => set("tenantEmail", e.target.value)} placeholder="Tenant's email" className={field} />
          <input value={f.landlord ?? o.landlord} onChange={(e) => set("landlord", e.target.value)} placeholder="Landlord" className={field} />
          <input value={f.landlordMobile ?? o.landlordMobile} onChange={(e) => set("landlordMobile", e.target.value)} placeholder="Landlord's mobile" className={field} />
          <input value={f.landlordEmail ?? o.landlordEmail} onChange={(e) => set("landlordEmail", e.target.value)} placeholder="Landlord's email" className={field} />
          <input value={f.access ?? o.access} onChange={(e) => set("access", e.target.value)} placeholder="Access notes" className={`${field} sm:col-span-2`} />
          <div>
            <span className={label}>Landlord&apos;s authority</span>
            <input value={f.authority ?? String(o.authorityPence / 100)} onChange={(e) => set("authority", e.target.value)} placeholder="£ authority" className={field} />
          </div>
          <div>
            <span className={label}>{o.kind === "repair" ? "Urgency" : "Due by"}</span>
            {o.kind === "repair" ? (
              <FieldSelect value={f.urgency ?? o.urgency ?? "routine"} onChange={(v) => set("urgency", v)} options={URGENCIES.map((u) => ({ value: u.id, label: u.label }))} />
            ) : (
              <FieldDate value={f.dueAt ?? (o.dueAt ? o.dueAt.slice(0, 10) : "")} onChange={(v) => set("dueAt", v)} placeholder="Expiry date" />
            )}
          </div>
        </div>
      )}
      {(mine || err) && <p className="mt-3 text-[12px] text-accent-dark">{mine ?? err}</p>}
      {form !== "request_quote" && <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onBack} className={btn}>Back</button>
        <button type="button" disabled={busy} onClick={() => void save()} className={primary}>{busy ? "Saving…" : form === "cancel" ? "Cancel the job" : "Save"}</button>
      </div>}
    </div>
  );
}
