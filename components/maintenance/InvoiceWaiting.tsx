"use client";

import { useState } from "react";
import type { Move, WorksOrder } from "@/lib/works-orders";
import { pounds, stamp } from "@/components/maintenance/works-ui";
import { openDocument } from "@/lib/doc-sheet";

/**
 * A CONTRACTOR'S OWN INVOICE, WAITING FOR THE AGENT (Sean McMahon, 23 Nov
 * 2026: "all invoices should be sent to the agent ONLY. The agent should
 * check the works and invoice and then, and only then should it be added to
 * the system for payment").
 *
 * Until 24 Nov 2026 an invoice a contractor uploaded from their link went
 * straight to accounts. Now it waits on the job (lib/works-orders
 * invoice_wait) and this card is where the agent answers it: send it to
 * accounts, or send it back with why. It shows on whatever step the job is
 * on, because the invoice arrives when the contractor sends it, not when the
 * job reaches The Money.
 */
const btn = "wn-btn rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-50";
const primary = "wn-primary rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50";
const field = "wn-field w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";

export default function InvoiceWaiting({ o, move, busy }: { o: WorksOrder; move: (m: Move) => Promise<unknown>; busy: boolean }) {
  const [back, setBack] = useState(false);
  const [why, setWhy] = useState("");
  const file = [...(o.files ?? [])].reverse().find((f) => f.kind === "invoice");
  const who = o.contractorName || "The contractor";
  const open = () => file && openDocument({ key: file.key, name: file.name, label: `Job #${o.ref}`, property: o.propertyName, url: `/api/r2/file?key=${encodeURIComponent(file.key)}` });

  if (o.invoiceWaitPence == null) {
    /* Sent back and nothing since: said once, quietly, so nobody wonders where it went. */
    if (!o.invoiceDeclinedAt || o.invoicePence != null) return null;
    return (
      <div className="mb-3 rounded-xl border border-line/80 bg-card p-3 text-[12.5px] text-muted">
        {who}&apos;s invoice was sent back by {o.invoiceDeclinedBy || "the agent"} {stamp(o.invoiceDeclinedAt)}: {o.invoiceDeclinedNote} They can send another from their link. Accounts were never told.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-accent-dark/30 bg-accent-soft/50 p-3.5" data-steve="invoice-waiting">
      <p className="text-[10px] font-bold uppercase tracking-wider text-accent-dark">An invoice to check</p>
      <p className="mt-1 text-[14px]">
        <strong>{pounds(o.invoiceWaitPence)}</strong> from {who}{o.invoiceWaitRef ? ` · invoice ${o.invoiceWaitRef}` : ""}
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        Uploaded from their link {stamp(o.invoiceWaitAt)}. It hasn&apos;t gone to accounts, and it won&apos;t until you send it.
      </p>
      {!back ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void move({ action: "invoice_approve" })} className={primary}>Send to Accounts</button>
          <button type="button" disabled={busy} onClick={() => setBack(true)} className={btn}>Send It Back</button>
          {file && <button type="button" onClick={open} className="text-[12px] underline underline-offset-2">Open the invoice</button>}
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} placeholder="Why it's going back, e.g. the total doesn't match the quote" className={field} autoFocus />
          <p className="text-[11.5px] text-muted">Nothing is emailed to {who} from here. Ring or email them with what to change; they can upload a corrected invoice from the same link.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !why.trim()} onClick={() => void move({ action: "invoice_decline", note: why.trim() })} className={primary}>Send It Back</button>
            <button type="button" disabled={busy} onClick={() => setBack(false)} className={btn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
