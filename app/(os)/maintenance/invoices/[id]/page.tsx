"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import InvoiceDoc, { docTotals, gbp, type DocData, type DocLine } from "@/components/InvoiceDoc";
import { PressButton } from "@/components/Bits";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";

/**
 * The invoice editor: the document on the left, the same fields in a rail
 * on the right, both writing to one object. Autosaves as you go while it
 * is a draft or produced-but-unsent. Produce assigns the number and
 * freezes the company details; Send emails it and opens nothing else.
 */

type Inv = DocData & {
  id: string;
  orderId: string | null;
  orderRef: number | null;
  token: string;
  sentAt: string | null;
  sentTo: string;
  paidAt: string | null;
  paidNote: string;
};

const STATUS: Record<string, string> = { draft: "Draft", issued: "Produced", sent: "Sent", paid: "Paid", void: "Void" };

export default function InvoiceEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<Inv | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [asking, setAsking] = useState<null | "send" | "paid" | "void">(null);
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<DocData>>({});
  /* The Auto save chip beside the title (components/SaveChip), 23 Sep 2026.
     Every write on this page - the typed edits and the four buttons - reports
     to it and to a toast, so nobody has to wonder whether an edit landed. */
  const saves = useSaveScope(id);
  const reporter = saves.reporter;

  useEffect(() => {
    fetch(`/api/invoices/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setInv(j.invoice); setSendTo(j.invoice.toEmail); } else setErr(j.error ?? "Could not read the invoice."); })
      .catch(() => setErr("Could not read the invoice."));
  }, [id]);

  const locked = !inv || inv.status === "sent" || inv.status === "paid" || inv.status === "void";

  /* Sends whatever edits are waiting, now. Null when nothing was waiting.
     A refused save puts its edits BACK in the queue (under anything typed
     since, which is newer) - until 23 Sep a failure emptied the queue first,
     so the edits were gone from the server's copy while still showing on
     screen, and Try again had nothing to send. */
  const sendNow = useCallback((keepalive = false): Promise<boolean> | null => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const fields = pending.current;
    if (Object.keys(fields).length === 0) return null;
    pending.current = {};
    const settle = reporter.begin("Invoice");
    return fetch(`/api/invoices/${id}`, { method: "PATCH", keepalive, headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }) })
      .then((x) => x.json())
      .catch(() => null)
      .then((r) => {
        if (!r?.ok) {
          pending.current = { ...fields, ...pending.current };
          const problem = r?.error ?? "Could not save.";
          setSaveErr(problem);
          settle({ ok: false, problem, retry: () => void sendNow() });
          return false;
        }
        /* The server's copy, with anything typed while it was on its way laid back over it. */
        setInv((cur) => (cur ? { ...cur, ...r.invoice, lines: r.invoice.lines, ...pending.current } : cur));
        setSaveErr(null);
        settle({ ok: true });
        return true;
      });
  }, [id, reporter]);

  /* The chip's Save sends the waiting edits at once rather than after the pause. */
  useEffect(() => reporter.waiting(() => sendNow() !== null), [reporter, sendNow]);
  /* Leaving the page inside the pause used to drop the last edit. Now it goes
     as the page closes, and its toast says whether it landed. */
  useEffect(() => () => void sendNow(true), [sendNow]);

  /* One object, two views. Every edit lands here, is drawn at once, and is
     saved a moment later - batched, so typing a description is one write. */
  const change = useCallback((patch: Partial<DocData>) => {
    if (locked) return;
    setInv((cur) => (cur ? { ...cur, ...patch } : cur));
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sendNow(), 600);
  }, [locked, sendNow]);

  async function act(action: "issue" | "send" | "paid" | "void") {
    setBusy(true);
    setErr(null);
    /* Edits still in the pause go first, so Produce and Send never work
       from a copy missing the last line typed. If they are refused, stop. */
    const waiting = sendNow();
    if (waiting && !(await waiting)) { setBusy(false); return; }
    const settle = reporter.begin("Invoice");
    const r = await fetch(`/api/invoices/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note, to: sendTo }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "That didn't work.";
      setErr(problem);
      if (r?.invoice) setInv(r.invoice);
      settle({ ok: false, problem });
      return;
    }
    setInv(r.invoice);
    setAsking(null);
    setNote("");
    setFlash(action === "issue" ? `Produced as ${r.invoice.number}.` : action === "send" ? `Sent to ${r.sentTo}.` : action === "paid" ? "Marked paid." : "Voided.");
    settle({ ok: true });
  }

  if (err && !inv) return <p className="mt-8 text-[12.5px] text-accent-dark">{err}</p>;
  if (!inv) return <p className="mt-8 text-[12.5px] text-muted">Reading the invoice…</p>;
  const t = docTotals(inv.lines);
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[12.5px] outline-none focus:border-ink disabled:opacity-60";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";
  const setLine = (i: number, patch: Partial<DocLine>) => change({ lines: inv.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });

  return (
    <SaveScopeProvider scope={saves}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/maintenance?section=invoices" className="text-[11.5px] text-muted hover:text-ink">← Invoices</Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-[24px] leading-tight">{inv.number ?? "New invoice"} <span className="ml-2 text-[13px] text-muted">{STATUS[inv.status]}</span></h1>
            <SaveChip scope={saves} />
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            {inv.toName ? `To ${inv.toName}` : "Nobody yet"}{inv.orderRef ? ` · job #${inv.orderRef}` : ""} · {gbp(t.total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {inv.status === "draft" && <PressButton onClick={() => void act("issue")} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">Produce</PressButton>}
          {(inv.status === "draft" || inv.status === "issued") && <PressButton onClick={() => setAsking("send")} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold">Send</PressButton>}
          {(inv.status === "issued" || inv.status === "sent") && <PressButton onClick={() => setAsking("paid")} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]">Mark paid</PressButton>}
          {inv.status !== "void" && inv.status !== "paid" && <PressButton onClick={() => setAsking("void")} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted">Void</PressButton>}
          <a href={`/invoice/${inv.token}`} target="_blank" rel="noreferrer" className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]">Open the page</a>
          {inv.orderId && <button type="button" onClick={() => router.push(`/maintenance?open=${inv.orderId}`)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted">The job</button>}
        </div>
      </div>

      {flash && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{flash}</p>}
      {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
      {saveErr && <p className="mt-4 text-[12.5px] text-accent-dark">Your last edits are not saved - {saveErr}</p>}

      {asking && (
        <div className="mt-4 rounded-2xl border border-line/80 bg-panel p-4">
          {asking === "send" && (
            <>
              <p className="text-[12.5px]">Email the invoice, with the page they can open and print. {inv.status === "draft" ? "It will be produced first and take its number." : ""}</p>
              <input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="To" className={`mt-2 max-w-sm ${field}`} />
            </>
          )}
          {asking === "paid" && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How it was paid, and when" className={`max-w-sm ${field}`} />}
          {asking === "void" && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why" className={`max-w-sm ${field}`} />}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsking(null)} className="rounded-full border border-line/80 px-4 py-1.5 text-[12px] text-muted">Back</button>
            <button type="button" disabled={busy} onClick={() => void act(asking)} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">{busy ? "Working…" : asking === "send" ? "Send it" : asking === "paid" ? "Mark paid" : "Void it"}</button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-x-auto rounded-2xl border border-line/80 bg-card shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)]">
          <InvoiceDoc inv={inv} onChange={locked ? undefined : change} />
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">To</p>
            <div className="mt-2 space-y-2">
              <input disabled={locked} value={inv.toName} onChange={(e) => change({ toName: e.target.value })} placeholder="Name" className={field} />
              <textarea disabled={locked} value={inv.toAddress} onChange={(e) => change({ toAddress: e.target.value })} placeholder="Address" rows={3} className={field} />
              <input disabled={locked} type="email" value={inv.toEmail} onChange={(e) => change({ toEmail: e.target.value })} placeholder="Email" className={field} />
            </div>
          </section>
          <section className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">The invoice</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><label className={label}>Date</label><input disabled={locked} type="date" value={inv.issueDate} onChange={(e) => change({ issueDate: e.target.value })} className={`mt-1 ${field}`} /></div>
              <div><label className={label}>Due</label><input disabled={locked} type="date" value={inv.dueDate} onChange={(e) => change({ dueDate: e.target.value })} className={`mt-1 ${field}`} /></div>
              <div className="col-span-2"><label className={label}>Property</label><input disabled={locked} value={inv.property} onChange={(e) => change({ property: e.target.value })} className={`mt-1 ${field}`} /></div>
              <div className="col-span-2"><label className={label}>Reference</label><input disabled={locked} value={inv.reference} onChange={(e) => change({ reference: e.target.value })} className={`mt-1 ${field}`} /></div>
            </div>
          </section>
          <section className="rounded-2xl border border-line/80 bg-panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lines</p>
              {!locked && <button type="button" onClick={() => change({ lines: [...inv.lines, { id: `l${Date.now()}`, description: "", qty: 1, unitPence: 0, vatRate: 20 }] })} className="text-[11px] text-accent-dark underline">+ line</button>}
            </div>
            <div className="mt-2 space-y-3">
              {inv.lines.map((l, i) => (
                <div key={l.id} className="rounded-xl border border-line/70 bg-card p-2.5">
                  <input disabled={locked} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" className={field} />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div><label className={label}>Qty</label><input disabled={locked} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className={`mt-1 ${field}`} /></div>
                    <div><label className={label}>Unit £</label><input disabled={locked} value={(l.unitPence / 100).toFixed(2)} onChange={(e) => setLine(i, { unitPence: Math.round(Number(e.target.value) * 100) || 0 })} className={`mt-1 ${field}`} /></div>
                    <div><label className={label}>VAT %</label><input disabled={locked} value={l.vatRate} onChange={(e) => setLine(i, { vatRate: Number(e.target.value) || 0 })} className={`mt-1 ${field}`} /></div>
                  </div>
                  {!locked && <button type="button" onClick={() => change({ lines: inv.lines.filter((_, k) => k !== i) })} className="mt-1.5 text-[11px] text-muted underline">Remove</button>}
                </div>
              ))}
              {inv.lines.length === 0 && <p className="text-[12px] text-muted">No lines yet.</p>}
            </div>
            <dl className="mt-3 space-y-1 border-t border-line/60 pt-3 text-[12px]">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{gbp(t.sub)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">VAT</dt><dd>{gbp(t.vat)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{gbp(t.total)}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Note on the invoice</p>
            <textarea disabled={locked} value={inv.notes} onChange={(e) => change({ notes: e.target.value })} rows={3} className={`mt-2 ${field}`} />
            {locked && <p className="mt-2 text-[11px] text-muted">{inv.status === "sent" ? `Sent to ${inv.sentTo}. Void it and raise another to change it.` : inv.status === "paid" ? "Paid. Nothing to change." : "Void."}</p>}
          </section>
        </aside>
      </div>
    </SaveScopeProvider>
  );
}
