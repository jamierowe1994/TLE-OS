"use client";

import { useEffect, useState } from "react";
import { openDocument } from "@/lib/doc-sheet";
import type { Contractor, WorksOrder, WorksEvent, Move, Urgency, PaidHow } from "@/lib/works-orders";
import { URGENCIES } from "@/lib/works-catalogue";
import { WorksNow } from "@/components/WorksNow";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import { ContractorPick, Fact, OPEN, PAID_HOW, STATUS_LABEL, day, pounds, stamp, toPence } from "@/components/maintenance/works-ui";

/* ── The job sheet ──────────────────────────────────────────────────────── */

export default function JobDrawer({ order, contractors, canCorporate, onClose, onChanged }: { order: WorksOrder; contractors: Contractor[]; canCorporate: boolean; onClose: () => void; onChanged: (o: WorksOrder) => void }) {
  const [o, setO] = useState(order);
  const [events, setEvents] = useState<WorksEvent[]>([]);
  const [shown, setShown] = useState(false);
  const [act, setAct] = useState<Move["action"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  /* The Auto save chip by the close button (components/SaveChip), 23 Sep
     2026: every move on the job - the Now card's and the More menu's - says
     whether it landed, on the chip and in a toast. */
  const saves = useSaveScope(order.id);
  const reporter = saves.reporter;

  useEffect(() => setO(order), [order]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    fetch(`/api/works-orders/${order.id}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) { setO(j.order); setEvents(j.events); } }).catch(() => {});
    return () => cancelAnimationFrame(id);
  }, [order.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (act ? setAct(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, act]);

  async function move(m: Move, label = "Job") {
    setBusy(true);
    setErr(null);
    const settle = reporter.begin(label);
    const r = await fetch(`/api/works-orders/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(m) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "That didn't work.";
      setErr(problem);
      settle({ ok: false, problem });
      return;
    }
    setO(r.order);
    setEvents(r.events ?? []);
    setAct(null);
    setF({});
    onChanged(r.order);
    settle({ ok: true });
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("scope", "document");
    fd.append("ref", `works-${o.ref}`);
    setBusy(true);
    const r = await fetch("/api/r2/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "The file did not upload.";
      setErr(problem);
      reporter.begin("File")({ ok: false, problem });
      return;
    }
    await move({ action: "file", file: { key: r.key, name: r.name, type: r.type } }, "File");
  }

  const open = OPEN.includes(o.status);
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";
  const btn = "rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40";
  const primary = "rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page";

  /* The Now card fronts the workflow; these are the sheet's other tools. */
  const actions: { a: Move["action"]; label: string }[] = [];
  if (open) {
    actions.push({ a: "quote", label: o.quotePence != null ? "Change the quote" : "Add a quote" });
    if (o.status === "approval") actions.push({ a: "approve", label: "Landlord approved" });
    else if (!o.approvedAt) actions.push({ a: "approve", label: "Record approval" });
    actions.push({ a: "assign", label: o.contractorId ? "Change the contractor" : "Set a contractor directly" });
    actions.push({ a: "cancel", label: "Cancel" });
  } else if (o.status === "done" || o.status === "invoiced") {
    if (o.invoicePence != null) actions.push({ a: "invoice", label: "Change the contractor's invoice" });
    actions.push({ a: "reopen", label: "Reopen" });
  } else if (o.status === "cancelled") {
    actions.push({ a: "reopen", label: "Reopen" });
  }
  actions.push({ a: "note", label: "Add a note" });
  actions.push({ a: "edit", label: "Edit details" });

  async function invoiceLandlord() {
    setBusy(true);
    const settle = reporter.begin("Invoice");
    const r = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: o.id }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "Could not draft the invoice.";
      setErr(problem);
      settle({ ok: false, problem });
      return;
    }
    settle({ ok: true });
    window.location.href = `/maintenance/invoices/${r.invoice.id}`;
  }

  return (
    <SaveScopeProvider scope={saves}>
    <div className="fixed inset-0 z-[130]">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="shrink-0 border-b border-line/70 px-6 pt-5">
          {/* Buttons above the title on a phone, so the chip is never squeezed. */}
          <div className="flex flex-col-reverse gap-3 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Job #{o.ref} · {o.kind === "repair" ? "Repair" : "Planned"} · {STATUS_LABEL[o.status]}
              </p>
              <h2 className="mt-1 text-[20px] leading-tight">{o.title}</h2>
              <p className="mt-1 text-[12px] text-muted">
                {o.propertyName}{o.locality ? `, ${o.locality}` : ""}{o.landlord ? ` · landlord ${o.landlord}` : ""}{o.tenant ? ` · ${o.tenant}` : ""}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 sm:shrink-0">
              <SaveChip scope={saves} />
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <WorksNow
            o={o}
            move={move}
            busy={busy}
            err={act ? null : err}
            canCorporate={canCorporate}
            onInvoiceLandlord={() => void invoiceLandlord()}
          />

          {/* The landlord's say over the job emails, by the job it governs. */}
          {o.landlordEmail.includes("@") && (
            <LandlordJobEmails key={o.landlordEmail} job={o.id} name={o.landlord} order={o} className="mt-3 rounded-2xl border border-line/50 bg-white px-4 py-3" />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">More</span>
            {actions.map((x) => (
              <button key={x.a + x.label} type="button" onClick={() => { setAct(x.a); setF({}); setErr(null); }} className={btn}>
                {x.label}
              </button>
            ))}
            <label className={`${btn} cursor-pointer`}>
              Add a file
              <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
            </label>
          </div>
          <div className={act ? "rounded-[22px] border border-line/50 bg-white p-4 mt-3" : ""}>
            {act && (
              <div className="mt-4 rounded-xl border border-line/80 bg-card p-4">
                {act === "assign" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ContractorPick contractors={contractors} value={f.contractorId ?? o.contractorId ?? ""} onChange={(v) => setF({ ...f, contractorId: v })} className={field} />
                    <input type="datetime-local" value={f.scheduledAt ?? ""} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} className={field} />
                    <input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="A line for the timeline (optional)" className={`${field} sm:col-span-2`} />

                  </div>
                )}
                {act === "schedule" && <input type="datetime-local" value={f.scheduledAt ?? ""} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} className={field} />}
                {act === "quote" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={f.amount ?? ""} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="£ quote" className={field} />
                    <input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="From whom, what it covers" className={field} />
                    <p className="text-[11.5px] text-muted sm:col-span-2">The landlord's authority on this job is {pounds(o.authorityPence)}. Over that, the job waits on them.</p>
                  </div>
                )}
                {act === "approve" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={f.approvedBy ?? o.landlord} onChange={(e) => setF({ ...f, approvedBy: e.target.value })} placeholder="Who said yes" className={field} />
                    <input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="How - phone, email, in person" className={field} />
                  </div>
                )}
                {act === "done" && (
                  <div className="grid gap-3">
                    <textarea value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} placeholder="What was done. If a certificate was issued, add it as a file too." className={field} />
                    <input type="datetime-local" value={f.completedAt ?? ""} onChange={(e) => setF({ ...f, completedAt: e.target.value })} className={field} />
                  </div>
                )}
                {act === "invoice" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={f.amount ?? ""} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="£ invoice total" className={field} />
                    <input value={f.ref ?? ""} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="Invoice number" className={field} />
                  </div>
                )}
                {act === "paid" && (
                  <div className="grid gap-2">
                    {PAID_HOW.map((h) => (
                      <label key={h.id} className="flex items-center gap-2 text-[12.5px]">
                        <input type="radio" name="how" checked={f.how === h.id} onChange={() => setF({ ...f, how: h.id })} />
                        {h.label}
                      </label>
                    ))}
                    <p className="text-[11px] text-muted">PayProp is read-only to the OS: choosing it records the fact here, and the charge is raised in PayProp by hand.</p>
                  </div>
                )}
                {(act === "cancel" || act === "note" || act === "reopen") && (
                  <textarea value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder={act === "cancel" ? "Why" : "The note"} className={field} />
                )}
                {act === "edit" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={f.title ?? o.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={`${field} sm:col-span-2`} />
                    <textarea value={f.description ?? o.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className={`${field} sm:col-span-2`} />
                    <input value={f.tenant ?? o.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value })} placeholder="Tenant's name" className={field} />
                    <input value={f.tenantPhone ?? o.tenantPhone} onChange={(e) => setF({ ...f, tenantPhone: e.target.value })} placeholder="Tenant's number" className={field} />
                    <input value={f.tenantEmail ?? o.tenantEmail} onChange={(e) => setF({ ...f, tenantEmail: e.target.value })} placeholder="Tenant's email" className={field} />
                    <input value={f.landlord ?? o.landlord} onChange={(e) => setF({ ...f, landlord: e.target.value })} placeholder="Landlord" className={field} />
                    <input value={f.landlordEmail ?? o.landlordEmail} onChange={(e) => setF({ ...f, landlordEmail: e.target.value })} placeholder="Landlord's email" className={field} />
                    <input value={f.access ?? o.access} onChange={(e) => setF({ ...f, access: e.target.value })} placeholder="Access notes" className={`${field} sm:col-span-2`} />
                    <input value={f.authority ?? String(o.authorityPence / 100)} onChange={(e) => setF({ ...f, authority: e.target.value })} placeholder="£ landlord's authority" className={field} />
                    {o.kind === "repair" ? (
                      <select value={f.urgency ?? o.urgency ?? "routine"} onChange={(e) => setF({ ...f, urgency: e.target.value })} className={field}>
                        {URGENCIES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                      </select>
                    ) : (
                      <input type="date" value={f.dueAt ?? (o.dueAt ? o.dueAt.slice(0, 10) : "")} onChange={(e) => setF({ ...f, dueAt: e.target.value })} className={field} />
                    )}
                  </div>
                )}
                {err && <p className="mt-2 text-[12px] text-accent-dark">{err}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setAct(null)} className={btn}>Back</button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const m: Move | null =
                        act === "assign" ? (f.contractorId || o.contractorId ? { action: "assign", contractorId: f.contractorId || o.contractorId!, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null, note: f.note } : null)
                        : act === "schedule" ? (f.scheduledAt ? { action: "schedule", scheduledAt: new Date(f.scheduledAt).toISOString() } : null)
                        : act === "quote" ? { action: "quote", quotePence: toPence(f.amount ?? ""), note: f.note }
                        : act === "approve" ? { action: "approve", approvedBy: f.approvedBy ?? o.landlord, note: f.note }
                        : act === "done" ? { action: "done", note: f.note ?? "", completedAt: f.completedAt ? new Date(f.completedAt).toISOString() : null }
                        : act === "invoice" ? { action: "invoice", invoicePence: toPence(f.amount ?? ""), invoiceRef: f.ref }
                        : act === "paid" ? (f.how ? { action: "paid", paidHow: f.how as PaidHow } : null)
                        : act === "cancel" ? { action: "cancel", reason: f.note ?? "" }
                        : act === "reopen" ? { action: "reopen", note: f.note }
                        : act === "note" ? { action: "note", note: f.note ?? "" }
                        : act === "edit" ? { action: "edit", fields: { title: f.title, description: f.description, tenant: f.tenant, tenantPhone: f.tenantPhone, tenantEmail: f.tenantEmail, landlord: f.landlord, landlordEmail: f.landlordEmail, access: f.access, authorityPence: f.authority ? toPence(f.authority) : undefined, urgency: f.urgency as Urgency | undefined, dueAt: f.dueAt !== undefined ? (f.dueAt ? new Date(f.dueAt).toISOString() : null) : undefined } }
                        : null;
                      if (!m) return setErr(act === "assign" ? "Pick a contractor." : act === "paid" ? "Say how it was paid." : "Fill it in first.");
                      void move(m);
                    }}
                    className={`${primary} ${busy ? "opacity-50" : ""}`}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <section className="rounded-[22px] border border-line/50 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">The job</p>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{o.description || <span className="text-muted">No detail recorded.</span>}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
                  <Fact k="Category" v={o.category} />
                  {o.kind === "repair" ? <Fact k="Urgency" v={URGENCIES.find((u) => u.id === o.urgency)?.label ?? "—"} /> : <Fact k="Due" v={day(o.dueAt)} />}
                  {o.kind === "repair" && <Fact k="Attend by" v={stamp(o.dueAt)} />}
                  <Fact k="Reported by" v={`${o.reportedBy || "—"} · ${day(o.reportedAt)}`} />
                  <Fact k="Tenant" v={o.tenant || "—"} />
                  <Fact k="Tenant's number" v={o.tenantPhone || "—"} />
                  <Fact k="Tenant's email" v={o.tenantEmail || "none - not being told"} />
                  <Fact k="Landlord's email" v={o.landlordEmail || "none - not being told"} />
                  <Fact k="Landlord's mobile" v={o.landlordMobile || "—"} />
                  <Fact k="Landlord told" v={o.landlordToldAt ? stamp(o.landlordToldAt) : "not yet"} />
                  <Fact k="Arranging" v={o.arranging === "landlord" ? `Landlord · follow up ${day(o.landlordFollowUpAt)}` : o.arranging === "us" ? "Us" : "—"} />
                  <Fact k="Tenant happy" v={o.tenantHappy ? `${o.tenantHappy === "yes" ? "Yes" : "No"} · ${day(o.tenantHappyAt)}` : "not asked yet"} />
                  <Fact k="Raised by" v={o.raisedBy || "—"} />
                  <Fact k="Access" v={o.access || "—"} />
                  <Fact k="Contractor" v={o.contractorName || "not yet"} />
                  <Fact k="Booked for" v={stamp(o.scheduledAt)} />
                </dl>
              </section>

              <section className="rounded-[22px] border border-line/50 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Money</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
                  <Fact k="Landlord's authority" v={pounds(o.authorityPence)} />
                  <Fact k="Quote" v={pounds(o.quotePence)} />
                  <Fact k="Approved" v={o.approvedAt ? `${o.approvedBy} · ${day(o.approvedAt)}` : "not yet"} />
                  <Fact k="Payee" v={o.payee === "agent" ? `${o.raisedBy} (paid it themselves)` : o.payee === "contractor" ? o.contractorName : "—"} />
                  <Fact k="Invoice" v={o.invoicePence != null ? `${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}` : "not yet"} />
                  <Fact k="Accounts told" v={o.accountsToldAt ? day(o.accountsToldAt) : "not yet"} />
                  <Fact k="Paid" v={o.paidAt ? `${day(o.paidAt)} · ${PAID_HOW.find((h) => h.id === o.paidHow)?.label ?? ""}` : "not yet"} />
                </dl>
              </section>

              {o.files.length > 0 && (
                <section className="rounded-[22px] border border-line/50 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Files</p>
                  <ul className="mt-2 divide-y divide-line/50">
                    {o.files.map((fl) => (
                      <li key={fl.key} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                        <button type="button" onClick={() => openDocument({ key: fl.key, name: fl.name, label: `Job #${o.ref}`, property: o.propertyName, url: `/api/r2/file?key=${encodeURIComponent(fl.key)}` })} className="truncate text-left hover:underline">
                          {fl.name}
                        </button>
                        <span className="shrink-0 text-[10.5px] text-muted">{fl.by} · {day(fl.at)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <section className="rounded-[22px] border border-line/50 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Timeline</p>
              <ul className="mt-2 space-y-3">
                {events.length === 0 && <li className="text-[12px] text-muted">Reading…</li>}
                {events.map((e) => (
                  <li key={e.id} className="text-[12px]">
                    <p className="leading-snug">{e.text}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted">{e.by} · {stamp(e.at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </aside>
    </div>
    </SaveScopeProvider>
  );
}
