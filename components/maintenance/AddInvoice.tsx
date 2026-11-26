"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Move, WorksOrder } from "@/lib/works-orders";
import { readInvoiceFile, readLine } from "@/components/maintenance/read-invoice";

/**
 * The contractor's invoice onto the job, in the order it happens (switch
 * "moneystep", James, 26 Nov 2026).
 *
 * Lauren Engley attached an invoice on 9 and 25 Nov 2026 and then pressed
 * Invoice the Landlord, which drafts OUR invoice to the landlord. The save
 * button sat above the file box and said "On the job", so the invoice never
 * reached the job and accounts were never sent it. Here the file comes first,
 * the figures read off it come second, and one button says what it does.
 *
 * Leaving with a file attached but not added asks first: a tab close or
 * reload by the browser's own question, a link in the OS by ours.
 */

type Props = {
  o: WorksOrder;
  f: Record<string, string>;
  setF: (f: Record<string, string>) => void;
  move: (m: Move) => Promise<void>;
  busy: boolean;
};

const field = "wn-field w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";
const btn = "wn-btn rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-50";
const primary = "wn-primary rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50";

const toPence = (s: string) => Math.round(Number(s.replace(/[£,\s]/g, "")) * 100);

export default function AddInvoice({ o, f, setF, move, busy }: Props) {
  const router = useRouter();
  const mine = o.payee === "agent";
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [readSaid, setReadSaid] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* Where they were going when we asked them to add it first. */
  const [leaving, setLeaving] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dirty = !!file && !sending;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    /* A link inside the OS: caught before Next's own click handler. */
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  async function attach(fl: File | null) {
    if (!fl) return;
    setFile(fl);
    setErr(null);
    setReadSaid(null);
    setReading(true);
    const r = await readInvoiceFile(fl);
    setReading(false);
    const line = readLine(r);
    if (!line) {
      setReadSaid("Couldn't read the total off it. Type it in below.");
      return;
    }
    setF({ ...f, amount: f.amount?.trim() || (r?.total != null ? r.total.toFixed(2) : ""), ref: f.ref?.trim() || r?.ref || "" });
    setReadSaid(`Filled in from the ${mine ? "receipt" : "invoice"}. Check it matches.`);
  }

  async function add(): Promise<boolean> {
    setErr(null);
    const pence = toPence(f.amount ?? "");
    if (!Number.isFinite(pence) || pence <= 0) {
      setErr("Put the total in first.");
      amountRef.current?.focus();
      return false;
    }
    setSending(true);
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scope", "document");
      fd.append("ref", `works-${o.ref}`);
      const r = await fetch("/api/r2/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) {
        setSending(false);
        setErr(r?.error ?? "The invoice file didn't upload, so nothing was saved. Try again.");
        return false;
      }
      await move({ action: "file", file: { key: r.key, name: r.name, type: r.type, kind: "invoice" } });
    }
    await move({ action: "invoice", invoicePence: pence, invoiceRef: f.ref ?? "" });
    setSending(false);
    setFile(null);
    return true;
  }

  const noun = mine ? "receipt" : "invoice";
  const addLabel = mine ? "Add the Receipt" : "Add the Invoice";
  return (
    <div className="wn-addinv rounded-xl border border-line/80 bg-card p-4">
      <p className="text-[14px]">{mine ? "Your Receipt" : "The Contractor's Invoice"}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        {mine
          ? "Attach your receipt and check the total, then add it. Accounts get it to pay you back."
          : "Attach their invoice and check the total, then add it. Accounts get it to pay through PayProp."}
      </p>

      <label className={`mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors ${file ? "border-line/80 bg-box" : "border-ink/30 bg-white hover:border-ink/60"}`}>
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 bg-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {file ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></>}
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px]">{file ? file.name : mine ? "Attach Your Receipt" : "Attach Their Invoice"}</span>
          <span className="block text-[11.5px] text-muted">{file ? "Attached, not added yet" : "PDF or a photo of it"}</span>
        </span>
        <span className="shrink-0 text-[11.5px] underline">{file ? "Change" : "Choose"}</span>
        <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { void attach(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </label>

      {(reading || readSaid) && (
        <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted" aria-live="polite">
          {reading && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
          {reading ? `Reading the ${noun}…` : readSaid}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">{mine ? "What you paid" : "Invoice total"}</span>
          <span className="relative block">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">£</span>
            <input ref={amountRef} value={(f.amount ?? "").replace(/^£\s*/, "")} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/^£\s*/, "") })} inputMode="decimal" placeholder="0.00" className={field} style={{ paddingLeft: 28 }} />
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">{mine ? "Receipt number" : "Invoice number"}</span>
          <input value={f.ref ?? ""} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="Optional" className={field} />
        </label>
      </div>

      {!file && f.amount?.trim() && <p className="mt-2 text-[11.5px] text-muted">Nothing attached. Attach the {noun} too so accounts have the paper.</p>}
      {err && <p className="mt-2 text-[11.5px] text-accent-dark">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
        <span className={`text-[11.5px] ${file ? "text-accent-dark" : "text-muted"}`}>
          {file ? `Not on the job yet. Press ${addLabel}.` : "Saved on the job and the home, and sent to accounts."}
        </span>
        <button type="button" disabled={busy || sending || reading || !f.amount?.trim()} onClick={() => void add()} className={primary}>
          {sending ? "Adding…" : addLabel}
        </button>
      </div>

      {leaving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/55 px-4" role="dialog" aria-modal="true" aria-labelledby="addinv-leave">
          <div className="w-full max-w-[420px] rounded-2xl bg-page p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
            <p id="addinv-leave" className="text-[17px]">The {noun === "receipt" ? "Receipt" : "Invoice"} Isn&apos;t Added Yet</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              {file?.name ?? "The file"} is attached but not added, so it isn&apos;t on the job and accounts don&apos;t have it.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={btn} onClick={() => { const to = leaving; setLeaving(null); setFile(null); router.push(to); }}>Leave Without Adding</button>
              <button type="button" className={primary} disabled={busy || sending} onClick={async () => { const to = leaving; const ok = await add(); setLeaving(null); if (ok && to) router.push(to); }}>Add It, Then Go</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
