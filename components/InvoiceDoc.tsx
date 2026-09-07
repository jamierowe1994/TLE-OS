"use client";

import { useRef } from "react";

/**
 * The invoice, as a document.
 *
 * One component draws it everywhere: the editor (where every field is
 * clickable and typed straight into), the public page a landlord opens and
 * prints, and the preview. James, 7 Sep 2026: "see and preview the invoice,
 * see all of the editable fields in there, and make edits by either clicking
 * into the actual document or clicking onto the sidebar". The sidebar and
 * the document edit the same object, so they cannot disagree.
 *
 * Plain CSS in the component rather than Tailwind so the public page - which
 * is outside the OS shell and prints to PDF from the browser - carries its
 * own look, in Montserrat, on white, A4-shaped.
 */

export interface DocLine {
  id: string;
  description: string;
  qty: number;
  unitPence: number;
  vatRate: number;
}

export interface DocData {
  number: string | null;
  status: string;
  toName: string;
  toAddress: string;
  toEmail: string;
  property: string;
  issueDate: string;
  dueDate: string;
  reference: string;
  lines: DocLine[];
  notes: string;
  from: {
    companyName: string;
    addressLines: string[];
    email: string;
    phone: string;
    vatNumber: string;
    companyNumber: string;
    bankName: string;
    accountName: string;
    sortCode: string;
    accountNumber: string;
    footer: string;
  };
}

export const gbp = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const docTotals = (lines: DocLine[]) => {
  let sub = 0, vat = 0;
  for (const l of lines) {
    const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPence) || 0));
    sub += net;
    vat += Math.round((net * (Number(l.vatRate) || 0)) / 100);
  }
  return { sub, vat, total: sub + vat };
};
const longDate = (d: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

/** A field on the page. Editable: a contentEditable span that hands back text on blur. */
function F({ value, onChange, placeholder, block, className = "" }: { value: string; onChange?: (v: string) => void; placeholder?: string; block?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const Tag = block ? "div" : "span";
  if (!onChange) return <Tag className={className}>{value || (placeholder ? <span className="inv-ph">{placeholder}</span> : null)}</Tag>;
  return (
    <Tag
      ref={ref as never}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ""}
      className={`inv-edit ${className}`}
      onBlur={(e) => onChange((e.currentTarget as HTMLElement).innerText.replace(/ /g, " ").trim())}
      onKeyDown={(e) => { if (e.key === "Enter" && !block) { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
    >
      {value}
    </Tag>
  );
}

export default function InvoiceDoc({ inv, onChange }: { inv: DocData; onChange?: (patch: Partial<DocData>) => void }) {
  const t = docTotals(inv.lines);
  const editable = Boolean(onChange);
  const setLine = (i: number, patch: Partial<DocLine>) => onChange?.({ lines: inv.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const money = (s: string) => Math.round(Number(s.replace(/[£,\s]/g, "")) * 100) || 0;

  return (
    <div className={`inv ${inv.status === "draft" ? "inv-draft" : ""}`}>
      <style>{`
        .inv { background:#fff; color:#101014; font-family: Unitext, Montserrat, system-ui, sans-serif; font-size: 13px; line-height: 1.5; padding: 48px 52px; max-width: 800px; margin: 0 auto; min-height: 1000px; position: relative; }
        .inv h1 { font-size: 30px; font-weight: 500; letter-spacing: 0; margin: 0; }
        .inv-muted { color: #6b6b70; }
        .inv-small { font-size: 11px; }
        .inv-row { display: flex; justify-content: space-between; gap: 32px; }
        .inv-block { margin-top: 28px; }
        .inv-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b70; margin-bottom: 4px; }
        .inv table { width: 100%; border-collapse: collapse; margin-top: 28px; }
        .inv th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b70; padding: 0 8px 8px 0; border-bottom: 1px solid #cdc9c0; }
        .inv td { padding: 10px 8px 10px 0; border-bottom: 1px solid #e7e5e0; vertical-align: top; }
        .inv .r { text-align: right; white-space: nowrap; }
        .inv-totals { margin-left: auto; margin-top: 16px; width: 280px; }
        .inv-totals div { display: flex; justify-content: space-between; padding: 4px 0; }
        .inv-totals .inv-total { border-top: 1px solid #101014; margin-top: 6px; padding-top: 10px; font-size: 16px; font-weight: 600; }
        .inv-foot { margin-top: 36px; padding-top: 16px; border-top: 1px solid #cdc9c0; }
        .inv-ph { color: #b6b4ae; font-style: italic; }
        .inv-edit { outline: none; border-bottom: 1px dashed transparent; border-radius: 2px; min-width: 1em; display: inline-block; }
        .inv-edit:hover { background: #ffe4df66; border-bottom-color: #de968f; }
        .inv-edit:focus { background: #ffe4df99; border-bottom-color: #a85a51; }
        .inv-edit:empty:before { content: attr(data-placeholder); color: #b6b4ae; font-style: italic; }
        .inv-stamp { position: absolute; top: 44px; right: 52px; border: 2px solid #a85a51; color: #a85a51; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; font-size: 11px; padding: 4px 10px; transform: rotate(-6deg); }
        .inv-del { border: 0; background: none; color: #a85a51; cursor: pointer; font-size: 14px; padding: 0 4px; }
        .inv-add { border: 1px dashed #cdc9c0; background: none; color: #6b6b70; cursor: pointer; font-size: 12px; padding: 8px 12px; border-radius: 8px; margin-top: 8px; width: 100%; text-align: left; }
        @media print { .inv { padding: 0; min-height: 0; } .inv-add, .inv-del { display: none; } .inv-edit { border: 0; background: none; } }
      `}</style>
      {inv.status === "draft" && <span className="inv-stamp">Draft</span>}
      {inv.status === "void" && <span className="inv-stamp">Void</span>}
      {inv.status === "paid" && <span className="inv-stamp" style={{ borderColor: "#3f8f5f", color: "#3f8f5f" }}>Paid</span>}

      <div className="inv-row">
        <div>
          <h1>Invoice</h1>
          <p className="inv-muted" style={{ margin: "6px 0 0" }}>{inv.number ?? "Number assigned when produced"}</p>
        </div>
        <div style={{ textAlign: "right", maxWidth: 300 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{inv.from.companyName}</div>
          {inv.from.addressLines.map((l, i) => <div key={i} className="inv-muted">{l}</div>)}
          {inv.from.email && <div className="inv-muted">{inv.from.email}</div>}
          {inv.from.phone && <div className="inv-muted">{inv.from.phone}</div>}
          {inv.from.vatNumber && <div className="inv-muted inv-small">VAT {inv.from.vatNumber}</div>}
          {inv.from.companyNumber && <div className="inv-muted inv-small">Company no. {inv.from.companyNumber}</div>}
        </div>
      </div>

      <div className="inv-row inv-block">
        <div style={{ maxWidth: 320 }}>
          <div className="inv-label">To</div>
          <div style={{ fontWeight: 600 }}><F value={inv.toName} onChange={onChange && ((v) => onChange({ toName: v }))} placeholder="Who it's to" /></div>
          <F block value={inv.toAddress} onChange={onChange && ((v) => onChange({ toAddress: v }))} placeholder="Their address" className="inv-muted" />
          <F block value={inv.toEmail} onChange={onChange && ((v) => onChange({ toEmail: v }))} placeholder="Their email" className="inv-muted inv-small" />
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="inv-label">Invoice date</div>
          <div>{editable ? <input type="date" value={inv.issueDate} onChange={(e) => onChange?.({ issueDate: e.target.value })} style={{ font: "inherit", border: "1px dashed #cdc9c0", borderRadius: 4, padding: "2px 4px" }} /> : longDate(inv.issueDate)}</div>
          <div className="inv-label" style={{ marginTop: 10 }}>Due</div>
          <div>{editable ? <input type="date" value={inv.dueDate} onChange={(e) => onChange?.({ dueDate: e.target.value })} style={{ font: "inherit", border: "1px dashed #cdc9c0", borderRadius: 4, padding: "2px 4px" }} /> : longDate(inv.dueDate)}</div>
          <div className="inv-label" style={{ marginTop: 10 }}>Property</div>
          <div><F value={inv.property} onChange={onChange && ((v) => onChange({ property: v }))} placeholder="The property" /></div>
          <div className="inv-label" style={{ marginTop: 10 }}>Reference</div>
          <div><F value={inv.reference} onChange={onChange && ((v) => onChange({ reference: v }))} placeholder="Job, tenancy, anything they'll recognise" /></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: "52%" }}>Description</th>
            <th className="r">Qty</th>
            <th className="r">Unit</th>
            <th className="r">VAT</th>
            <th className="r">Amount</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => {
            const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPence) || 0));
            return (
              <tr key={l.id}>
                <td><F block value={l.description} onChange={onChange && ((v) => setLine(i, { description: v }))} placeholder="What this line is for" /></td>
                <td className="r"><F value={String(l.qty)} onChange={onChange && ((v) => setLine(i, { qty: Number(v) || 0 }))} /></td>
                <td className="r"><F value={gbp(l.unitPence)} onChange={onChange && ((v) => setLine(i, { unitPence: money(v) }))} /></td>
                <td className="r"><F value={`${l.vatRate}%`} onChange={onChange && ((v) => setLine(i, { vatRate: Number(v.replace(/[^\d.]/g, "")) || 0 }))} /></td>
                <td className="r">{gbp(net)}</td>
                {editable && <td className="r"><button type="button" className="inv-del" title="Remove the line" onClick={() => onChange?.({ lines: inv.lines.filter((_, k) => k !== i) })}>✕</button></td>}
              </tr>
            );
          })}
          {inv.lines.length === 0 && !editable && <tr><td colSpan={5} className="inv-muted">No lines.</td></tr>}
        </tbody>
      </table>
      {editable && (
        <button type="button" className="inv-add" onClick={() => onChange?.({ lines: [...inv.lines, { id: `l${Date.now()}`, description: "", qty: 1, unitPence: 0, vatRate: 20 }] })}>
          + Add a line
        </button>
      )}

      <div className="inv-totals">
        <div><span className="inv-muted">Subtotal</span><span>{gbp(t.sub)}</span></div>
        <div><span className="inv-muted">VAT</span><span>{gbp(t.vat)}</span></div>
        <div className="inv-total"><span>Total due</span><span>{gbp(t.total)}</span></div>
      </div>

      <div className="inv-foot">
        {(inv.from.bankName || inv.from.accountNumber) && (
          <div style={{ marginBottom: 12 }}>
            <div className="inv-label">Pay by bank transfer</div>
            <div>{inv.from.accountName}{inv.from.bankName ? ` · ${inv.from.bankName}` : ""}</div>
            <div className="inv-muted">{inv.from.sortCode ? `Sort code ${inv.from.sortCode}` : ""}{inv.from.accountNumber ? ` · Account ${inv.from.accountNumber}` : ""}{inv.number ? ` · Reference ${inv.number}` : ""}</div>
          </div>
        )}
        <F block value={inv.notes} onChange={onChange && ((v) => onChange({ notes: v }))} placeholder="Payment terms, a note, anything else" className="inv-muted" />
      </div>
    </div>
  );
}
