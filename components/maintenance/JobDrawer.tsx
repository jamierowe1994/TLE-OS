"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { openDocument } from "@/lib/doc-sheet";
import type { Contractor, WorksOrder, WorksEvent, Move, Urgency, PaidHow } from "@/lib/works-orders";
import { URGENCIES, categoriesOf } from "@/lib/works-catalogue";
import { stepOf } from "@/lib/works-steps";
import { WorksNow, CertificateUpload } from "@/components/WorksNow";
import FieldDate from "@/components/FieldDate";
import FieldSelect from "@/components/FieldSelect";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import { ContractorPick, OPEN, PAID_HOW, STATUS_LABEL, day, pounds, stamp, toPence } from "@/components/maintenance/works-ui";
import type { Status } from "@/lib/works-orders";

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

  /* The certificate from the visit (app/api/works-orders/[id]/certificate):
     on the job, done, and the home's current certificate once checked. */
  const [addingCert, setAddingCert] = useState(false);
  async function certificate(fd: FormData): Promise<string | null> {
    setBusy(true);
    setErr(null);
    const settle = reporter.begin("Certificate");
    const r = await fetch(`/api/works-orders/${o.id}/certificate`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "The certificate did not file.";
      settle({ ok: false, problem });
      return problem;
    }
    setO(r.order);
    setEvents(r.events ?? []);
    onChanged(r.order);
    settle({ ok: true });
    return null;
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

  /* The Now card fronts the workflow. The sheet's other tools sit by the
     thing they change (9 Oct 2026, James: a row of seven equal buttons left
     nobody knowing "where to look, what to click on"): the quote and the
     approval on Money, the contractor on the contractor, a note on the
     timeline, a file on Files. Cancel and Reopen go in the More menu. */
  const done = o.status === "done" || o.status === "invoiced";
  const canQuote = open;
  const approveLabel = !open ? null : o.status === "approval" ? "Landlord approved" : !o.approvedAt ? "Record approval" : null;
  const canAssign = open;
  const canChangeInvoice = done && o.invoicePence != null;
  const more: { a: Move["action"]; label: string }[] = [];
  if (open) more.push({ a: "cancel", label: "Cancel the job" });
  if (done || o.status === "cancelled") more.push({ a: "reopen", label: "Reopen" });
  const canCert = o.status !== "cancelled" && !(o.kind === "planned" && stepOf(o) === "visit");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [menu]);
  const formRef = useRef<HTMLDivElement>(null);
  const start = (a: Move["action"]) => {
    setAct(a);
    setF({});
    setErr(null);
    setMenu(false);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const ACT_TITLE: Partial<Record<Move["action"], string>> = {
    assign: o.contractorId ? "Change the contractor" : "Set a contractor",
    schedule: "The date",
    quote: o.quotePence != null ? "Change the quote" : "Add a quote",
    approve: "Record the landlord's approval",
    done: "Mark it done",
    invoice: "The contractor's invoice",
    paid: "Mark it paid",
    cancel: "Cancel the job",
    reopen: "Reopen the job",
    note: "Add a note",
    edit: "Edit the details",
  };
  const late = open && o.dueAt ? new Date(o.dueAt).getTime() < Date.now() : false;
  const urgency = o.kind === "repair" ? URGENCIES.find((u) => u.id === o.urgency)?.label ?? null : null;
  const tenants = o.tenants.length ? o.tenants : o.tenant || o.tenantPhone || o.tenantEmail ? [{ name: o.tenant, phone: o.tenantPhone, email: o.tenantEmail, room: "" }] : [];

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
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-muted">Job #{o.ref}</span>
                <Pill tone="plain">{o.kind === "repair" ? "Repair" : "Planned"}</Pill>
                <Pill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Pill>
                {urgency && open && <Pill tone={o.urgency === "emergency" ? "hot" : o.urgency === "urgent" ? "warm" : "sage"}>{urgency}</Pill>}
                {late && <Pill tone="hot">Overdue</Pill>}
              </div>
              <h2 className="mt-2 text-[22px] leading-tight">{o.title}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                <DoodleIcon name="home" size={13} />
                {o.propertyName}{o.locality ? `, ${o.locality}` : ""}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 sm:shrink-0">
              <SaveChip scope={saves} />
              {more.length > 0 && (
                <div ref={menuRef} className="relative">
                  <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} className="flex h-9 items-center rounded-full border border-line/80 px-3.5 text-[12px] text-muted hover:text-ink">More</button>
                  {menu && (
                    <div className="absolute right-0 top-11 z-10 w-48 overflow-hidden rounded-xl border border-line/70 bg-white py-1 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.25)]">
                      {more.map((x) => (
                        <button key={x.a} type="button" onClick={() => start(x.a)} className="block w-full px-3.5 py-2 text-left text-[12.5px] hover:bg-accent-soft/50">{x.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <WorksNow
            variant="feature"
            o={o}
            move={move}
            busy={busy}
            err={act ? null : err}
            canCorporate={canCorporate}
            onInvoiceLandlord={() => void invoiceLandlord()}
            onCertificate={certificate}
          />

          {/* The landlord's say over the job emails, by the job it governs. */}
          {o.landlordEmail.includes("@") && (
            <LandlordJobEmails key={o.landlordEmail} job={o.id} name={o.landlord} order={o} className="mt-3 rounded-2xl border border-line/50 bg-white px-4 py-3" />
          )}

          {/* Whichever side tool was pressed opens here, under the Now card. */}
          {act && (
            <div ref={formRef} className="mt-4 rounded-[22px] border-2 border-brown/25 bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[16px]">{ACT_TITLE[act] ?? "Change"}</h3>
                <button type="button" onClick={() => setAct(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] text-muted hover:bg-accent-soft/50 hover:text-ink">✕</button>
              </div>
              <div>
                {act === "assign" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ContractorPick contractors={contractors} value={f.contractorId ?? o.contractorId ?? ""} onChange={(v) => setF({ ...f, contractorId: v })} className={field} styled />
                    <FieldDate className="mt-1" withTime clearable value={f.scheduledAt ?? ""} onChange={(v) => setF({ ...f, scheduledAt: v })} placeholder="Booked for, if it is" />
                    <input value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="A line for the timeline (optional)" className={`${field} sm:col-span-2`} />

                  </div>
                )}
                {act === "schedule" && <FieldDate withTime value={f.scheduledAt ?? ""} onChange={(v) => setF({ ...f, scheduledAt: v })} placeholder="The date and time" />}
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
                    <FieldDate withTime clearable value={f.completedAt ?? ""} onChange={(v) => setF({ ...f, completedAt: v })} placeholder="When it was done (today if left)" />
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
                      <FieldSelect value={f.urgency ?? o.urgency ?? "routine"} onChange={(v) => setF({ ...f, urgency: v })} options={URGENCIES.map((u) => ({ value: u.id, label: u.label }))} />
                    ) : (
                      <FieldDate value={f.dueAt ?? (o.dueAt ? o.dueAt.slice(0, 10) : "")} onChange={(v) => setF({ ...f, dueAt: v })} placeholder="Expiry date" />
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
            </div>
          )}

          {addingCert && (
            <div className="mt-4">
              <CertificateUpload o={o} busy={busy} onCertificate={certificate} onDone={() => setAddingCert(false)} />
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              {/* THE JOB: what, how urgent, by when. */}
              <Card title="The Job" icon="note" action={<Quiet onClick={() => start("edit")}>Edit</Quiet>}>
                <p className="whitespace-pre-wrap rounded-xl bg-box px-3.5 py-3 text-[14px] leading-relaxed">{o.description || <span className="text-muted">No detail recorded.</span>}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categoriesOf(o.category).map((c) => <Pill key={c} tone="sage">{c}</Pill>)}
                </div>
                <dl className="mt-3 grid gap-x-5 gap-y-2.5 text-[12.5px] sm:grid-cols-2">
                  {o.kind === "repair" ? (
                    <Line icon="clock" k="Attend by" v={stamp(o.dueAt)} hot={late} />
                  ) : (
                    <Line icon="calendar" k="Due" v={day(o.dueAt)} hot={late} />
                  )}
                  <Line icon="calendar" k="Reported" v={`${day(o.reportedAt)}${o.reportedBy ? ` by ${o.reportedBy.toLowerCase()}` : ""}`} />
                  {o.raisedBy && <Line icon="user" k="Raised by" v={o.raisedBy} />}
                  {o.access && <Line icon="key" k="Access" v={o.access} />}
                </dl>
              </Card>

              {/* WHO: the tenants, the landlord, the contractor. */}
              <div className="grid gap-4 md:grid-cols-3">
                <Person tone="sage" icon="user" role={tenants.length > 1 ? `Tenants (${tenants.length})` : "Tenant"}>
                  {tenants.length === 0 ? (
                    <p className="text-[12.5px] text-muted">None on the job.</p>
                  ) : (
                    tenants.map((t, i) => (
                      <div key={`${t.name}-${i}`} className={i ? "mt-2.5 border-t border-line/50 pt-2.5" : ""}>
                        <p className="text-[13.5px] font-semibold">{t.name || "Unnamed"}{t.room ? <span className="font-normal text-muted"> · {t.room}</span> : null}</p>
                        <Reach phone={t.phone} email={t.email} />
                      </div>
                    ))
                  )}
                  {o.tenantHappy && <p className="mt-2.5 text-[11.5px]"><Pill tone={o.tenantHappy === "yes" ? "sage" : "hot"}>{o.tenantHappy === "yes" ? "Happy" : "Not happy"} · {day(o.tenantHappyAt)}</Pill></p>}
                </Person>

                <Person tone="clay" icon="home" role="Landlord">
                  <p className="text-[13.5px] font-semibold">{o.landlord || "No landlord named"}</p>
                  {o.landlordSkipped ? (
                    <p className="mt-1 text-[12px] text-muted">Not involved in this one.</p>
                  ) : o.landlordMobile || o.landlordEmail ? (
                    <Reach phone={o.landlordMobile} email={o.landlordEmail} />
                  ) : (
                    <p className="mt-1 text-[12px] text-accent-dark">No mobile or email yet.</p>
                  )}
                  {!o.landlordSkipped && (
                    <p className="mt-2.5 flex flex-wrap gap-1.5">
                      <Pill tone={o.landlordToldAt ? "sage" : "warm"}>{o.landlordToldAt ? `Told ${day(o.landlordToldAt)}` : "Not told yet"}</Pill>
                      {o.arranging === "landlord" && <Pill tone="plain">Organising it · follow up {day(o.landlordFollowUpAt)}</Pill>}
                      {o.arranging === "us" && <Pill tone="plain">We're arranging it</Pill>}
                    </p>
                  )}
                </Person>

                <Person tone="brown" icon="setting" role="Contractor" action={canAssign ? <Quiet onClick={() => start("assign")}>{o.contractorId ? "Change" : "Set"}</Quiet> : null}>
                  <p className={`text-[13.5px] ${o.contractorName ? "font-semibold" : "text-muted"}`}>{o.contractorName || "Not picked yet"}</p>
                  {o.scheduledAt ? (
                    <p className="mt-1 flex items-center gap-1.5 text-[12px]"><DoodleIcon name="calendar" size={12} className="text-muted" />Booked {stamp(o.scheduledAt)}</p>
                  ) : o.contractorName ? (
                    <p className="mt-1 text-[12px] text-muted">No date yet.</p>
                  ) : null}
                </Person>
              </div>

              {/* MONEY: only what there is. */}
              <Card
                title="Money"
                icon="coin"
                action={
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {approveLabel && <Quiet onClick={() => start("approve")}>{approveLabel}</Quiet>}
                    {canQuote && <Quiet onClick={() => start("quote")}>{o.quotePence != null ? "Change quote" : "Add a quote"}</Quiet>}
                    {canChangeInvoice && <Quiet onClick={() => start("invoice")}>Change invoice</Quiet>}
                  </span>
                }
              >
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <Figure k="Landlord's authority" v={pounds(o.authorityPence)} />
                  <Figure k="Quote" v={o.quotePence != null ? pounds(o.quotePence) : "None yet"} quiet={o.quotePence == null} />
                  <Figure
                    k="Approved"
                    v={o.approvedAt ? `${o.approvedBy || "Yes"} · ${day(o.approvedAt)}` : o.status === "approval" ? "Waiting on the landlord" : o.quotePence == null || o.quotePence <= o.authorityPence ? "Within authority" : "Not yet"}
                    quiet={!o.approvedAt}
                    hot={o.status === "approval"}
                  />
                  {o.payee && <Figure k="Paying" v={o.payee === "agent" ? `${o.raisedBy} (paid it themselves)` : o.contractorName || "The contractor"} />}
                  {o.invoicePence != null && <Figure k="Invoice" v={`${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}`} />}
                  {o.accountsToldAt && <Figure k="Accounts told" v={day(o.accountsToldAt)} />}
                  {o.paidAt && <Figure k="Paid" v={`${day(o.paidAt)} · ${PAID_HOW.find((h) => h.id === o.paidHow)?.label ?? ""}`} />}
                </div>
              </Card>

              {/* FILES, with the two ways to add one. */}
              <Card
                title="Files"
                icon="folder"
                action={
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {canCert && <Quiet onClick={() => setAddingCert((v) => !v)}>Add a certificate</Quiet>}
                    <label className={`${quietCls} cursor-pointer`}>
                      Add a file
                      <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
                    </label>
                  </span>
                }
              >
                {o.files.length === 0 ? (
                  <p className="text-[12.5px] text-muted">Nothing on the job yet. Photos, quotes and certificates go here.</p>
                ) : (
                  <ul className="divide-y divide-line/50">
                    {o.files.map((fl) => (
                      <li key={fl.key} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                        <button type="button" onClick={() => openDocument({ key: fl.key, name: fl.name, label: `Job #${o.ref}`, property: o.propertyName, url: `/api/r2/file?key=${encodeURIComponent(fl.key)}` })} className="flex min-w-0 items-center gap-2 text-left hover:underline">
                          <DoodleIcon name="doc" size={13} className="text-muted" />
                          <span className="truncate">{fl.name}</span>
                        </button>
                        <span className="shrink-0 text-[10.5px] text-muted">{fl.by} · {day(fl.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* TIMELINE: a line, newest first. */}
            <Card title="Timeline" icon="clock" action={<Quiet onClick={() => start("note")}>Add a note</Quiet>} className="self-start">
              <ol className="relative">
                {events.length === 0 && <li className="text-[12px] text-muted">Reading…</li>}
                {events.map((e, i) => (
                  <li key={e.id} className="relative pb-4 pl-6 last:pb-0">
                    {i < events.length - 1 && <span aria-hidden className="absolute left-[5px] top-3 h-full w-[2px] bg-line/60" />}
                    <span aria-hidden className={`absolute left-0 top-[5px] h-3 w-3 rounded-full ${i === 0 ? "bg-accent-dark ring-4 ring-accent-soft" : "border-2 border-line bg-white"}`} />
                    <p className="text-[12.5px] leading-snug">{e.text}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted">{e.by} · {stamp(e.at)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </aside>
    </div>
    </SaveScopeProvider>
  );
}

/* ── The sheet's pieces ─────────────────────────────────────────────────── */

type Tone = "plain" | "sage" | "warm" | "hot" | "done";
const TONE: Record<Tone, string> = {
  plain: "border border-line/70 bg-white text-ink/75",
  sage: "bg-[#f1f4ec] text-[#56634a]",
  warm: "bg-accent-soft text-accent-dark",
  hot: "bg-accent-dark text-white",
  done: "bg-sage text-white",
};
const STATUS_TONE: Record<Status, Tone> = {
  reported: "warm",
  approval: "warm",
  approved: "warm",
  scheduled: "sage",
  done: "done",
  invoiced: "done",
  paid: "done",
  cancelled: "plain",
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;
}

const quietCls = "rounded-full border border-line/80 bg-white px-3 py-1 text-[11.5px] font-medium text-ink/80 transition-colors hover:border-ink/40 hover:text-ink";
function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={quietCls}>{children}</button>;
}

function Card({ title, icon, action, className = "", children }: { title: string; icon: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-[22px] border border-line/60 bg-white p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px]">
          <DoodleIcon name={icon} size={15} className="text-accent-dark" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const PERSON_TONE = {
  sage: { band: "bg-[#f1f4ec]", ink: "text-[#56634a]", border: "border-sage/70" },
  clay: { band: "bg-accent-soft/70", ink: "text-accent-dark", border: "border-accent/50" },
  brown: { band: "bg-brown/[0.07]", ink: "text-brown", border: "border-brown/25" },
} as const;

function Person({ tone, icon, role, action, children }: { tone: keyof typeof PERSON_TONE; icon: string; role: string; action?: React.ReactNode; children: React.ReactNode }) {
  const t = PERSON_TONE[tone];
  return (
    <section className={`overflow-hidden rounded-[22px] border bg-white ${t.border}`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${t.band}`}>
        <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.ink}`}>
          <DoodleIcon name={icon} size={13} />
          {role}
        </p>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** A phone you can press and an email you can copy, or a plain "none". */
function Reach({ phone, email }: { phone: string; email: string }) {
  return (
    <div className="mt-1 space-y-0.5 text-[12px]">
      {phone ? (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 hover:underline"><DoodleIcon name="call" size={12} className="text-muted" />{phone}</a>
      ) : (
        <p className="text-muted">No number</p>
      )}
      {email ? (
        <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-1.5 hover:underline"><DoodleIcon name="mail" size={12} className="shrink-0 text-muted" /><span className="truncate">{email}</span></a>
      ) : (
        <p className="text-muted">No email</p>
      )}
    </div>
  );
}

function Line({ icon, k, v, hot = false }: { icon: string; k: string; v: string; hot?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <DoodleIcon name={icon} size={13} className={`mt-[2px] ${hot ? "text-accent-dark" : "text-muted"}`} />
      <div className="min-w-0">
        <dt className="text-[11px] text-muted">{k}</dt>
        <dd className={`break-words ${hot ? "font-semibold text-accent-dark" : ""}`}>{v}{hot ? " · overdue" : ""}</dd>
      </div>
    </div>
  );
}

function Figure({ k, v, quiet = false, hot = false }: { k: string; v: string; quiet?: boolean; hot?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-2.5 ${hot ? "bg-accent-soft/70" : "bg-box"}`}>
      <p className="text-[11px] text-muted">{k}</p>
      <p className={`mt-0.5 text-[14px] ${quiet ? "text-muted" : "font-semibold"} ${hot ? "text-accent-dark" : ""}`}>{v}</p>
    </div>
  );
}
