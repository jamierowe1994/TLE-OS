"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import { openDocument } from "@/lib/doc-sheet";
import type { Contractor, WorksOrder, WorksEvent, WorksSummary, Kind, Move, Status, Urgency, PaidHow } from "@/lib/works-orders";

/**
 * Maintenance: every job on the managed book, reported through paid.
 *
 * Two sections, as James set out on 7 Sep 2026: REPAIRS, where something is
 * broken and an urgency sets the clock, and PLANNED, where a date does - a
 * gas safety, an EICR, a boiler service. The same job sheet either way, the
 * same trades book, the same timeline under the person's name.
 *
 * The screen is a list by status rather than a kanban: a burst pipe and a
 * boiler service are not columns to drag between, they are jobs with a
 * next thing to do, and the row says what that is.
 */

/* The constants are typed in lib/works-orders (server-only); these are the
   client-side copies the screen draws with. Keep them in step. */
const URGENCIES: { id: Urgency; label: string; within: string; blurb: string }[] = [
  { id: "emergency", label: "Emergency", within: "24 hours", blurb: "No heating in winter, a burst pipe, no power, a security risk." },
  { id: "urgent", label: "Urgent", within: "3 days", blurb: "Something broken that makes the home hard to live in." },
  { id: "routine", label: "Routine", within: "14 days", blurb: "Everything else." },
];
const REPAIR_CATEGORIES = ["Plumbing", "Heating & boiler", "Electrical", "Gas", "Appliance", "Roof & gutters", "Windows & doors", "Locks & security", "Damp & mould", "Decoration", "Flooring", "Garden & fences", "Pests", "Cleaning", "Structural", "Other"];
const PLANNED_CATEGORIES = ["Gas safety (CP12)", "EICR", "EPC", "Boiler service", "Legionella risk assessment", "PAT test", "Smoke & CO alarms", "Fire risk assessment", "HMO licence inspection", "Property inspection", "Inventory & check-in", "Check-out", "Other"];
const REPORTED_BY = ["Tenant", "Landlord", "Agent", "Inspection", "Compliance tracker", "Contractor"];
const STATUS_LABEL: Record<Status, string> = { reported: "Reported", approval: "Awaiting landlord", approved: "Approved", scheduled: "Booked", done: "Done", invoiced: "Invoiced", paid: "Paid", cancelled: "Cancelled" };
const STATUS_ORDER: Status[] = ["reported", "approval", "approved", "scheduled", "done", "invoiced", "paid", "cancelled"];
const OPEN: Status[] = ["reported", "approval", "approved", "scheduled"];
const PAID_HOW: { id: PaidHow; label: string }[] = [
  { id: "payprop", label: "Charged to the landlord through PayProp" },
  { id: "landlord", label: "Paid by the landlord direct" },
  { id: "tle", label: "Paid by TLE" },
  { id: "tenant", label: "Recharged to the tenant" },
];

const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const toPence = (s: string) => Math.round(Number(String(s).replace(/[£,\s]/g, "")) * 100);

/** What the row says to do next. The job's next thing, not its status. */
function nextFor(o: WorksOrder): { text: string; hot: boolean } {
  const late = o.dueAt ? new Date(o.dueAt).getTime() < Date.now() : false;
  switch (o.status) {
    case "reported": return { text: o.kind === "repair" ? `Attend by ${stamp(o.dueAt)}` : `Due ${day(o.dueAt)} - book a contractor`, hot: late || o.urgency === "emergency" };
    case "approval": return { text: `Waiting on the landlord to approve ${pounds(o.quotePence)}`, hot: late };
    case "approved": return { text: "Book a contractor", hot: late };
    case "scheduled": return { text: `${o.contractorName || "Contractor"} booked for ${stamp(o.scheduledAt)}`, hot: false };
    case "done": return { text: "Waiting on the invoice", hot: false };
    case "invoiced": return { text: `${pounds(o.invoicePence)} to settle`, hot: false };
    case "paid": return { text: `Paid ${day(o.paidAt)}`, hot: false };
    case "cancelled": return { text: o.cancelledReason || "Cancelled", hot: false };
  }
}

type Property = { id: string; name: string; locality: string; landlord?: string; tenant?: string | null };

export default function Maintenance() {
  const router = useRouter();
  const params = useSearchParams();
  /* The rail's two children: Jobs (repairs and planned, with the invoices
     beside them) and Contractors. The pills row narrows within Jobs. */
  const rail = params.get("section") === "contractors" ? "contractors" : "jobs";
  const [section, setSection] = useState<Kind | "contractors" | "invoices">("repair");
  useEffect(() => {
    if (rail === "contractors") setSection("contractors");
    else if (params.get("section") === "invoices") setSection("invoices");
    else setSection((cur) => (cur === "contractors" ? "repair" : cur));
  }, [rail, params]);
  const [data, setData] = useState<{ orders: WorksOrder[]; contractors: Contractor[]; summary: WorksSummary | null; live: boolean; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [raising, setRaising] = useState<Kind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/api/works-orders", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setError(null); } else setError(j.error ?? "Could not read the jobs."); })
      .catch(() => setError("Could not read the jobs."));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raise = sp.get("raise");
      if (raise === "repair" || raise === "planned") { setSection(raise); setRaising(raise); }
      const open = sp.get("open");
      if (open) setOpenId(open);
    } catch { /* fine */ }
  }, []);

  const orders = data?.orders ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (section !== "contractors" && section !== "invoices" && o.kind !== section) return false;
      if (!showClosed && !OPEN.includes(o.status)) return false;
      if (needle && !`${o.propertyName} ${o.locality} ${o.title} ${o.category} ${o.contractorName} ${o.landlord} ${o.tenant} ${o.ref}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [orders, section, showClosed, q]);
  const grouped = useMemo(() => STATUS_ORDER.map((s) => ({ status: s, rows: rows.filter((r) => r.status === s) })).filter((g) => g.rows.length), [rows]);
  const s = data?.summary;
  const open = orders.find((o) => o.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Maintenance"
        blurb={
          rail === "contractors"
            ? "The people who do the work. Your own book of trades beside the company's, each with a profile, their jobs and what they are owed."
            : "Every job on the managed book, reported through paid. Repairs run on an urgency; planned jobs like a gas safety run on a date. Nothing here is a note-to-self: a job carries its contractor, its quote, its invoice and who said yes."
        }
        illustration="/illustrations/notioly/home-caring.svg"
        lineBreak="dip"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search jobs, addresses, contractors…"
        actions={
          <div className="flex gap-2">
            <PressButton onClick={() => { setSection("repair"); setRaising("repair"); }} className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
              <span className="text-[15px] leading-none">+</span> Report a repair
            </PressButton>
            <PressButton onClick={() => { setSection("planned"); setRaising("planned"); }} className="flex items-center gap-2 rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold">
              <span className="text-[15px] leading-none">+</span> Plan a job
            </PressButton>
          </div>
        }
      />

      {/* ── The four counts. ── */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {(
          [
            ["Open jobs", s ? String(s.open) : "•", s ? `${s.byKind.repair} repair${s.byKind.repair === 1 ? "" : "s"} · ${s.byKind.planned} planned` : "reading", "setting"],
            ["Overdue", s ? String(s.overdue) : "•", s?.emergencies ? `${s.emergencies} emergenc${s.emergencies === 1 ? "y" : "ies"} open` : "past their date", "bell"],
            ["Awaiting the landlord", s ? String(s.awaitingLandlord) : "•", "quotes over their authority", "user"],
            ["Invoiced, unpaid", s ? pounds(s.invoicedUnpaidPence) : "•", "contractor invoices to settle", "coin"],
          ] as const
        ).map(([k, v, hint, icon]) => (
          <div key={k} className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              <DoodleIcon name={icon} size={14} className="text-accent-dark" />
              {k}
            </p>
            <p className="figures mt-1.5 text-[26px] leading-none">{v}</p>
            <p className="mt-1.5 truncate text-[11px] text-accent-dark">{hint}</p>
          </div>
        ))}
      </div>

      {/* ── The two sections, and the trades book. ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(
          [
            ["repair", "Repairs", s?.byKind.repair],
            ["planned", "Planned maintenance", s?.byKind.planned],
            ["invoices", "Invoices", undefined],
          ] as const
        ).filter(() => rail === "jobs").map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors ${section === key ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`}
          >
            {label}
            {n != null && <span className="ml-1.5 opacity-70">{n}</span>}
          </button>
        ))}
        {section !== "contractors" && section !== "invoices" && (
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="ml-auto text-[11.5px] text-muted underline transition-colors hover:text-ink">
            {showClosed ? "Hide finished jobs" : "Show finished jobs"}
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {data && !data.live && <p className="mt-4 text-[12.5px] text-muted">{data.reason}</p>}

      {section === "invoices" ? (
        <Invoices onOpen={(id) => router.push(`/maintenance/invoices/${id}`)} />
      ) : section === "contractors" ? (
        <Contractors onChange={load} openJob={(id) => { router.push("/maintenance?section=jobs"); setOpenId(id); }} />
      ) : !data ? (
        <p className="mt-6 text-[12.5px] text-muted">Reading the jobs…</p>
      ) : grouped.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line/80 bg-panel p-8 text-center">
          <p className="hand text-[20px]">{section === "repair" ? "Nothing broken that we know of." : "Nothing planned."}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            {section === "repair" ? "Report a repair when a tenant or landlord rings." : "Plan a job from a certificate that is due, or straight from here."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map((g) => (
            <section key={g.status} className="rounded-2xl border border-line/80 bg-panel p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px]">{STATUS_LABEL[g.status]}</h2>
                <span className="text-[11px] text-muted">{g.rows.length}</span>
              </div>
              <ul className="mt-3 divide-y divide-line/50">
                {g.rows.map((o) => {
                  const next = nextFor(o);
                  return (
                    <li key={o.id}>
                      <button type="button" onClick={() => setOpenId(o.id)} className="grid w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-3 text-left transition-colors hover:bg-accent-soft/20 md:grid-cols-[52px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                        <span className="figures text-[13px] text-muted">#{o.ref}</span>
                        <span className="min-w-0">
                          <span className="hand block truncate text-[13.5px]">{o.title}</span>
                          <span className="block truncate text-[10.5px] text-muted">
                            {o.propertyName}{o.locality ? `, ${o.locality}` : ""}{o.tenant ? ` · ${o.tenant}` : ""}
                          </span>
                        </span>
                        <span className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto">
                          {o.urgency && (
                            <Pill tone={o.urgency === "emergency" ? "accent" : "neutral"}>{URGENCIES.find((u) => u.id === o.urgency)?.label}</Pill>
                          )}
                          <span className="text-[11px] text-muted">{o.category}</span>
                        </span>
                        <span className={`col-start-2 text-[12px] md:col-start-auto ${next.hot ? "font-semibold text-accent-dark" : "text-muted"}`}>{next.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {raising && (
        <RaiseJob
          kind={raising}
          contractors={data?.contractors ?? []}
          onClose={() => setRaising(null)}
          onRaised={(o) => { setRaising(null); load(); setOpenId(o.id); }}
        />
      )}
      {open && (
        <JobDrawer
          order={open}
          contractors={data?.contractors ?? []}
          onClose={() => setOpenId(null)}
          onChanged={(o) => { setData((d) => (d ? { ...d, orders: d.orders.map((x) => (x.id === o.id ? o : x)) } : d)); load(); }}
        />
      )}
    </>
  );
}

/* ── Raise a job ────────────────────────────────────────────────────────── */

function RaiseJob({ kind, contractors, onClose, onRaised }: { kind: Kind; contractors: Contractor[]; onClose: () => void; onRaised: (o: WorksOrder) => void }) {
  const [props, setProps] = useState<Property[] | null>(null);
  const [pq, setPq] = useState("");
  const [picked, setPicked] = useState<Property | null>(null);
  const [manual, setManual] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(kind === "repair" ? REPAIR_CATEGORIES[0] : PLANNED_CATEGORIES[0]);
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [dueAt, setDueAt] = useState("");
  const [reportedBy, setReportedBy] = useState(kind === "repair" ? "Tenant" : "Compliance tracker");
  const [tenant, setTenant] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [landlordEmail, setLandlordEmail] = useState("");
  const [access, setAccess] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* The managed book, for the address. Read once; the same list Compliance
     shows, so a home the tracker knows is a home a job can be raised on. */
  useEffect(() => {
    fetch("/api/compliance/book", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProps(Array.isArray(j.properties) ? j.properties.map((p: Property) => ({ id: p.id, name: p.name, locality: p.locality, landlord: p.landlord, tenant: p.tenant })) : []))
      .catch(() => setProps([]));
    try {
      const sp = new URLSearchParams(window.location.search);
      const pre = sp.get("property");
      const cat = sp.get("category");
      if (pre) setPq(pre);
      if (cat) setCategory(cat);
      const due = sp.get("due");
      if (due) setDueAt(due.slice(0, 10));
    } catch { /* fine */ }
  }, []);
  useEffect(() => {
    if (!props || picked) return;
    const needle = pq.trim().toLowerCase();
    if (needle.length > 2) {
      const hit = props.find((p) => p.name.toLowerCase() === needle || p.id === pq.trim());
      if (hit) setPicked(hit);
    }
  }, [props, pq, picked]);
  useEffect(() => { if (picked?.tenant) setTenant(picked.tenant); }, [picked]);

  const hits = useMemo(() => {
    const needle = pq.trim().toLowerCase();
    if (!props || needle.length < 2) return [];
    return props.filter((p) => `${p.name} ${p.locality}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [props, pq]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function raise() {
    const propertyName = picked?.name ?? manual.trim();
    if (!propertyName) return setErr("Which property?");
    if (!title.trim()) return setErr(kind === "repair" ? "What is wrong, in a few words?" : "What is the job?");
    if (kind === "planned" && !dueAt) return setErr("When is it due?");
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/works-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind, propertyId: picked?.id ?? null, propertyName, locality: picked?.locality ?? "", landlord: picked?.landlord ?? "", tenant, tenantEmail, landlordEmail,
        title, description, category, urgency: kind === "repair" ? urgency : null, dueAt: kind === "planned" ? new Date(dueAt).toISOString() : null,
        reportedBy, access, contractorId: contractorId || null, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not raise the job.");
    onRaised(r.order);
  }

  const cats = kind === "repair" ? REPAIR_CATEGORIES : PLANNED_CATEGORIES;
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />
      <div className="fade-up relative w-full max-w-2xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{kind === "repair" ? "Repair" : "Planned maintenance"}</p>
            <h2 className="mt-1 text-[22px] leading-tight">{kind === "repair" ? "Report a repair" : "Plan a job"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="relative sm:col-span-2">
            <label className={label}>Property</label>
            {picked ? (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-accent-dark/50 bg-accent-soft/30 px-3 py-2.5">
                <span className="min-w-0 truncate text-[13px]">{picked.name}{picked.locality ? `, ${picked.locality}` : ""}{picked.landlord ? ` · landlord ${picked.landlord}` : ""}</span>
                <button type="button" onClick={() => { setPicked(null); setPq(""); }} className="text-[11px] text-muted underline">change</button>
              </div>
            ) : (
              <>
                <input value={pq} onChange={(e) => { setPq(e.target.value); setManual(e.target.value); }} placeholder={props === null ? "Reading the book…" : "Start typing the address"} className={`mt-1 ${field}`} />
                {hits.length > 0 && (
                  <ul className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line/80 bg-card shadow-lg">
                    {hits.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setPicked(p)} className="flex w-full flex-col px-3 py-2 text-left hover:bg-panel">
                          <span className="text-[13px]">{p.name}</span>
                          <span className="text-[10.5px] text-muted">{p.locality}{p.landlord ? ` · landlord ${p.landlord}` : ""}{p.tenant ? ` · ${p.tenant}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {props && props.length > 0 && pq.trim().length > 2 && hits.length === 0 && <p className="mt-1 text-[11px] text-muted">Not on the managed book. The job will carry the address as typed.</p>}
              </>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={label}>{kind === "repair" ? "What is wrong" : "The job"}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "repair" ? "Boiler not firing, no hot water" : "Annual gas safety"} className={`mt-1 ${field}`} />
          </div>

          <div>
            <label className={label}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${field}`}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {kind === "repair" ? (
            <div>
              <label className={label}>How urgent</label>
              <div className="mt-1 flex gap-1.5">
                {URGENCIES.map((u) => (
                  <button key={u.id} type="button" onClick={() => setUrgency(u.id)} title={u.blurb} className={`flex-1 rounded-lg border px-2 py-2 text-[11.5px] ${urgency === u.id ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark" : "border-line/80 text-muted"}`}>
                    {u.label}
                    <span className="block text-[9.5px] font-normal opacity-70">{u.within}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className={label}>Due by</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={`mt-1 ${field}`} />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className={label}>Detail</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={kind === "repair" ? "What the tenant said, where it is, when it started." : "Anything the contractor needs to know."} className={`mt-1 ${field}`} />
          </div>

          <div>
            <label className={label}>Reported by</label>
            <select value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} className={`mt-1 ${field}`}>
              {REPORTED_BY.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Tenant, for access</label>
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Name and number" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Tenant's email</label>
            <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="So they're told at each step" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Landlord's email</label>
            <input type="email" value={landlordEmail} onChange={(e) => setLandlordEmail(e.target.value)} placeholder="For approvals over their authority" className={`mt-1 ${field}`} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Access notes</label>
            <input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Key safe, tenant works days, dog in the garden" className={`mt-1 ${field}`} />
          </div>

          <div>
            <label className={label}>Contractor, if already known</label>
            <ContractorPick contractors={contractors} value={contractorId} onChange={setContractorId} className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Booked for, if already booked</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={`mt-1 ${field}`} />
          </div>
        </div>

        {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted hover:text-ink">Cancel</button>
          <PressButton onClick={() => void raise()} className={`rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
            {busy ? "Raising…" : kind === "repair" ? "Report it" : "Plan it"}
          </PressButton>
        </div>
      </div>
    </div>
  );
}

/* ── The job sheet ──────────────────────────────────────────────────────── */

function JobDrawer({ order, contractors, onClose, onChanged }: { order: WorksOrder; contractors: Contractor[]; onClose: () => void; onChanged: (o: WorksOrder) => void }) {
  const [o, setO] = useState(order);
  const [events, setEvents] = useState<WorksEvent[]>([]);
  const [shown, setShown] = useState(false);
  const [act, setAct] = useState<Move["action"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});

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

  async function move(m: Move) {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/works-orders/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(m) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't work.");
    setO(r.order);
    setEvents(r.events ?? []);
    setAct(null);
    setF({});
    onChanged(r.order);
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("scope", "document");
    fd.append("ref", `works-${o.ref}`);
    setBusy(true);
    const r = await fetch("/api/r2/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "The file did not upload.");
    await move({ action: "file", file: { key: r.key, name: r.name, type: r.type } });
  }

  const next = nextFor(o);
  const open = OPEN.includes(o.status);
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";
  const btn = "rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40";
  const primary = "rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page";

  /* Which buttons the job offers now. Its next thing first. */
  const actions: { a: Move["action"]; label: string; primary?: boolean }[] = [];
  if (open) {
    if (o.status === "reported" || o.status === "approved") actions.push({ a: "assign", label: o.contractorId ? "Book a date" : "Book a contractor", primary: true });
    if (o.status === "approval") actions.push({ a: "approve", label: "Landlord approved", primary: true });
    if (o.status === "scheduled") actions.push({ a: "done", label: "Mark done", primary: true });
    actions.push({ a: "quote", label: o.quotePence != null ? "Change the quote" : "Add a quote" });
    if (o.status !== "approval" && !o.approvedAt) actions.push({ a: "approve", label: "Record approval" });
    if (o.status === "scheduled") actions.push({ a: "schedule", label: "Move the date" });
    actions.push({ a: "cancel", label: "Cancel" });
  } else if (o.status === "done") {
    actions.push({ a: "invoice", label: "Add the contractor's invoice", primary: true });
    actions.push({ a: "reopen", label: "Reopen" });
  } else if (o.status === "invoiced") {
    actions.push({ a: "paid", label: "Mark paid", primary: true });
    actions.push({ a: "invoice", label: "Change the contractor's invoice" });
  } else if (o.status === "cancelled") {
    actions.push({ a: "reopen", label: "Reopen", primary: true });
  }
  actions.push({ a: "note", label: "Add a note" });
  actions.push({ a: "edit", label: "Edit details" });

  return (
    <div className="fixed inset-0 z-[130]">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="shrink-0 border-b border-line/70 px-6 pt-5">
          <div className="flex items-start justify-between gap-3 pb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Job #{o.ref} · {o.kind === "repair" ? "Repair" : "Planned"} · {STATUS_LABEL[o.status]}
              </p>
              <h2 className="mt-1 text-[20px] leading-tight">{o.title}</h2>
              <p className="mt-1 text-[12px] text-muted">
                {o.propertyName}{o.locality ? `, ${o.locality}` : ""}{o.landlord ? ` · landlord ${o.landlord}` : ""}{o.tenant ? ` · ${o.tenant}` : ""}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className={`rounded-2xl border p-4 ${next.hot ? "border-accent-dark/50 bg-accent-soft/30" : "border-line/80 bg-panel"}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Next</p>
            <p className={`mt-1 text-[14px] ${next.hot ? "font-semibold text-accent-dark" : ""}`}>{next.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((x) => (
                <button key={x.a + x.label} type="button" onClick={() => { setAct(x.a); setF({}); setErr(null); }} className={x.primary ? primary : btn}>
                  {x.label}
                </button>
              ))}
              {(o.status === "done" || o.status === "invoiced" || o.status === "paid") && (
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    const r = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: o.id }) }).then((x) => x.json()).catch(() => null);
                    setBusy(false);
                    if (!r?.ok) return setErr(r?.error ?? "Could not draft the invoice.");
                    window.location.href = `/maintenance/invoices/${r.invoice.id}`;
                  }}
                  className={btn}
                  title="Draft an invoice to the landlord from this job: their name, the job as the reference, and the contractor's cost as the first line"
                >
                  Invoice the landlord
                </button>
              )}
              <label className={`${btn} cursor-pointer`}>
                Add a file
                <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
              </label>
            </div>

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
                    <input value={f.tenant ?? o.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value })} placeholder="Tenant, for access" className={field} />
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
                        : act === "edit" ? { action: "edit", fields: { title: f.title, description: f.description, tenant: f.tenant, tenantEmail: f.tenantEmail, landlord: f.landlord, landlordEmail: f.landlordEmail, access: f.access, authorityPence: f.authority ? toPence(f.authority) : undefined, urgency: f.urgency as Urgency | undefined, dueAt: f.dueAt !== undefined ? (f.dueAt ? new Date(f.dueAt).toISOString() : null) : undefined } }
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
              <section className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">The job</p>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{o.description || <span className="text-muted">No detail recorded.</span>}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
                  <Fact k="Category" v={o.category} />
                  {o.kind === "repair" ? <Fact k="Urgency" v={URGENCIES.find((u) => u.id === o.urgency)?.label ?? "—"} /> : <Fact k="Due" v={day(o.dueAt)} />}
                  {o.kind === "repair" && <Fact k="Attend by" v={stamp(o.dueAt)} />}
                  <Fact k="Reported by" v={`${o.reportedBy || "—"} · ${day(o.reportedAt)}`} />
                  <Fact k="Tenant's email" v={o.tenantEmail || "none - not being told"} />
                  <Fact k="Landlord's email" v={o.landlordEmail || "none - not being told"} />
                  <Fact k="Raised by" v={o.raisedBy || "—"} />
                  <Fact k="Access" v={o.access || "—"} />
                  <Fact k="Contractor" v={o.contractorName || "not yet"} />
                  <Fact k="Booked for" v={stamp(o.scheduledAt)} />
                </dl>
              </section>

              <section className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Money</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
                  <Fact k="Landlord's authority" v={pounds(o.authorityPence)} />
                  <Fact k="Quote" v={pounds(o.quotePence)} />
                  <Fact k="Approved" v={o.approvedAt ? `${o.approvedBy} · ${day(o.approvedAt)}` : "not yet"} />
                  <Fact k="Invoice" v={o.invoicePence != null ? `${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}` : "not yet"} />
                  <Fact k="Paid" v={o.paidAt ? `${day(o.paidAt)} · ${PAID_HOW.find((h) => h.id === o.paidHow)?.label ?? ""}` : "not yet"} />
                </dl>
              </section>

              {o.files.length > 0 && (
                <section className="rounded-2xl border border-line/80 bg-panel p-4">
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

            <section className="rounded-2xl border border-line/80 bg-panel p-4">
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
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</dt>
      <dd className="mt-0.5 truncate" title={v}>{v}</dd>
    </div>
  );
}

/* ── Picking a contractor, or adding one without leaving the job ────────── */

function ContractorPick({ contractors, value, onChange, className }: { contractors: Contractor[]; value: string; onChange: (id: string) => void; className: string }) {
  const [list, setList] = useState(contractors);
  const [adding, setAdding] = useState(false);
  useEffect(() => setList(contractors), [contractors]);
  const mine = list.filter((c) => c.active && c.ownerId);
  const corp = list.filter((c) => c.active && !c.ownerId);
  return (
    <div>
      <select value={adding ? "__add" : value} onChange={(e) => { if (e.target.value === "__add") setAdding(true); else onChange(e.target.value); }} className={className}>
        <option value="">Not yet</option>
        {mine.length > 0 && <optgroup label="Your contractors">{mine.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.trade}</option>)}</optgroup>}
        {corp.length > 0 && <optgroup label="The company's">{corp.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.trade}</option>)}</optgroup>}
        <option value="__add">+ Add a contractor…</option>
      </select>
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

/* ── The trades book ────────────────────────────────────────────────────── */

const BLANK_CONTRACTOR: Partial<Contractor> = { name: "", contact: "", trade: "", phone: "", email: "", website: "", address: "", registration: "", notes: "", active: true };

/** The form, used from the book and from inside a job. */
function ContractorForm({ initial, canCorporate, onSaved, onClose, compact = false }: { initial: Partial<Contractor>; canCorporate: boolean; onSaved: (c: Contractor) => void; onClose: () => void; compact?: boolean }) {
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

function Contractors({ onChange, openJob }: { onChange: () => void; openJob: (id: string) => void }) {
  const [data, setData] = useState<{ contractors: Contractor[]; me: string | null; canCorporate: boolean } | null>(null);
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/contractors", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) setData(j); else setErr(j.error ?? "Could not read the book."); }).catch(() => setErr("Could not read the book."));
  }, []);
  useEffect(load, [load]);
  const all = data?.contractors ?? [];
  const needle = q.trim().toLowerCase();
  const match = (c: Contractor) => !needle || `${c.name} ${c.contact} ${c.trade} ${c.phone} ${c.email} ${c.notes} ${c.registration}`.toLowerCase().includes(needle);
  const mine = all.filter((c) => c.ownerId && match(c));
  const corporate = all.filter((c) => !c.ownerId && match(c));

  const Shelf = ({ title, blurb, rows, canEdit }: { title: string; blurb: string; rows: Contractor[]; canEdit: boolean }) => (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px]">{title}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">{blurb}</p>
        </div>
        <span className="text-[11px] text-muted">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">Nobody here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/50">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <button type="button" onClick={() => setProfile(c.id)} className="min-w-0 flex-1 text-left">
                <p className={`hand text-[13.5px] ${c.active ? "" : "text-muted line-through"}`}>{c.name} <span className="font-sans text-[11px] text-muted">· {c.trade}</span></p>
                <p className="truncate text-[11px] text-muted">{[c.contact, c.phone, c.email, c.registration].filter(Boolean).join(" · ") || "no contact details yet"}</p>
              </button>
              {canEdit && <button type="button" onClick={() => setEditing(c)} className="text-[11.5px] text-muted underline hover:text-ink">Edit</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the book…" className="w-full max-w-xs rounded-full border border-line/80 bg-box px-4 py-2 text-[12.5px] outline-none focus:border-ink" />
        <PressButton onClick={() => setEditing({ ...BLANK_CONTRACTOR })} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">+ Add a contractor</PressButton>
      </div>
      {err && <p className="text-[12.5px] text-accent-dark">{err}</p>}
      {editing && data && (
        <div className="rounded-2xl border border-line/80 bg-panel p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{editing.id ? "Edit" : "New contractor"}</p>
          <div className="mt-3">
            <ContractorForm initial={editing} canCorporate={data.canCorporate} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChange(); }} />
          </div>
        </div>
      )}
      {!data ? (
        <p className="text-[12.5px] text-muted">Reading the book…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Shelf title="Your contractors" blurb="The people you ring. Yours alone - nobody else sees them." rows={mine} canEdit />
          <Shelf title="The company's contractors" blurb="Kept by the office. Everyone can book them." rows={corporate} canEdit={data.canCorporate} />
        </div>
      )}
      {profile && <ContractorProfile id={profile} onClose={() => setProfile(null)} onEdit={(c) => { setProfile(null); setEditing(c); }} openJob={openJob} canEdit={(c) => Boolean(c.ownerId) || Boolean(data?.canCorporate)} />}
    </div>
  );
}

/** One contractor, pulled out: who they are, what they have done for us, what is owed. */
function ContractorProfile({ id, onClose, onEdit, openJob, canEdit }: { id: string; onClose: () => void; onEdit: (c: Contractor) => void; openJob: (id: string) => void; canEdit: (c: Contractor) => boolean }) {
  const [d, setD] = useState<{ contractor: Contractor; stats: { jobs: number; open: number; quotedPence: number; invoicedPence: number; paidPence: number; outstandingPence: number; lastJobAt: string | null }; jobs: WorksOrder[] } | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    fetch(`/api/contractors?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) setD(j); }).catch(() => {});
    return () => cancelAnimationFrame(t);
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = d?.contractor;
  return (
    <div className="fixed inset-0 z-[130]">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${shown ? "translate-x-0" : "translate-x-full"}`} style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        <div className="shrink-0 border-b border-line/70 px-6 pt-5">
          <div className="flex items-start justify-between gap-3 pb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{c ? (c.ownerId ? "Your contractor" : "Company contractor") : "Contractor"}{c && !c.active ? " · not active" : ""}</p>
              <h2 className="mt-1 text-[20px] leading-tight">{c?.name ?? "Reading…"}</h2>
              <p className="mt-1 text-[12px] text-muted">{c ? [c.trade, c.contact, c.registration].filter(Boolean).join(" · ") : ""}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {c && canEdit(c) && <button type="button" onClick={() => onEdit(c)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">Edit</button>}
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
            </div>
          </div>
        </div>
        {c && d && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <section className="rounded-2xl border border-line/80 bg-panel p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">How to reach them</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
                    <Fact k="Phone" v={c.phone || "—"} />
                    <Fact k="Email" v={c.email || "—"} />
                    <Fact k="Website" v={c.website || "—"} />
                    <Fact k="Address" v={c.address || "—"} />
                    <Fact k="Registration" v={c.registration || "—"} />
                    <Fact k="Added by" v={c.createdBy || "—"} />
                  </dl>
                  {c.notes && <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed">{c.notes}</p>}
                </section>
                <section className="rounded-2xl border border-line/80 bg-panel p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Their jobs</p>
                  {d.jobs.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-muted">None yet. Put them on a job and it shows here.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line/50">
                      {d.jobs.map((o) => (
                        <li key={o.id}>
                          <button type="button" onClick={() => { onClose(); openJob(o.id); }} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-accent-soft/20">
                            <span className="min-w-0">
                              <span className="block truncate text-[13px]">#{o.ref} · {o.title}</span>
                              <span className="block truncate text-[10.5px] text-muted">{o.propertyName} · {STATUS_LABEL[o.status]}</span>
                            </span>
                            <span className="figures shrink-0 text-[12.5px]">{o.invoicePence != null ? pounds(o.invoicePence) : o.quotePence != null ? `${pounds(o.quotePence)} quoted` : "—"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <section className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Money through them</p>
                <dl className="mt-2 space-y-2 text-[12.5px]">
                  <div className="flex justify-between"><dt className="text-muted">Jobs</dt><dd className="figures">{d.stats.jobs}{d.stats.open ? ` · ${d.stats.open} open` : ""}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Quoted</dt><dd className="figures">{pounds(d.stats.quotedPence)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Invoiced</dt><dd className="figures">{pounds(d.stats.invoicedPence)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="figures">{pounds(d.stats.paidPence)}</dd></div>
                  <div className="flex justify-between border-t border-line/60 pt-2 font-semibold"><dt>Owed to them</dt><dd className="figures">{pounds(d.stats.outstandingPence)}</dd></div>
                </dl>
                <p className="mt-3 text-[11px] text-muted">Read off the jobs they were on: the quote logged, the invoice added, and what is marked paid.</p>
              </section>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ── The invoicing schedule ─────────────────────────────────────────────── */

type InvoiceRow = { id: string; number: string | null; status: string; toName: string; property: string; issueDate: string; dueDate: string; reference: string; orderRef: number | null; lines: { qty: number; unitPence: number; vatRate: number }[] };
type Settings = { companyName: string; addressLines: string[]; email: string; phone: string; vatNumber: string; companyNumber: string; bankName: string; accountName: string; sortCode: string; accountNumber: string; prefix: string; termsDays: number; defaultVatRate: number; footer: string };

const INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "good" }> = {
  draft: { label: "Draft", tone: "neutral" }, issued: { label: "Produced", tone: "accent" }, sent: { label: "Sent", tone: "accent" }, paid: { label: "Paid", tone: "good" }, void: { label: "Void", tone: "neutral" },
};
const totalOf = (lines: InvoiceRow["lines"]) => lines.reduce((a, l) => { const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPence) || 0)); return a + net + Math.round((net * (Number(l.vatRate) || 0)) / 100); }, 0);

function Invoices({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<{ invoices: InvoiceRow[]; settings: Settings | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/invoices", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) { setData(j); setSettings(j.settings); } else setErr(j.error ?? "Could not read the invoices."); }).catch(() => setErr("Could not read the invoices."));
  }, []);
  useEffect(load, [load]);

  async function blank() {
    setBusy(true);
    const r = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not draft the invoice.");
    onOpen(r.invoice.id);
  }
  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    const r = await fetch("/api/invoices", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not save the settings.");
    setSettings(r.settings);
    setShowSettings(false);
  }
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[12.5px] outline-none focus:border-ink";
  const rows = data?.invoices ?? [];
  const outstanding = rows.filter((r) => r.status === "issued" || r.status === "sent").reduce((a, r) => a + totalOf(r.lines), 0);
  const overdue = rows.filter((r) => (r.status === "issued" || r.status === "sent") && r.dueDate && new Date(r.dueDate).getTime() < Date.now()).length;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/80 bg-panel p-5">
        <div>
          <h2 className="text-[15px]">The invoicing schedule</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Every invoice we raise, numbered in order. A draft takes its number when it is produced.
            {data ? ` ${pounds(outstanding)} outstanding${overdue ? ` · ${overdue} overdue` : ""}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]">Who invoices are from</button>
          <PressButton onClick={() => void blank()} className={`rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>+ New invoice</PressButton>
        </div>
      </div>
      {err && <p className="text-[12.5px] text-accent-dark">{err}</p>}

      {showSettings && settings && (
        <div className="rounded-2xl border border-line/80 bg-panel p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Who invoices are from</p>
          <p className="mt-1 text-[11.5px] text-muted">Copied onto every invoice when it is produced, so an old invoice keeps the details it went out with.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} placeholder="Company name" className={field} />
            <input value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} placeholder="Accounts email" className={field} />
            <input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} placeholder="Phone" className={field} />
            <textarea value={settings.addressLines.join("\n")} onChange={(e) => setSettings({ ...settings, addressLines: e.target.value.split("\n") })} placeholder="Address, one line per line" rows={3} className={`${field} sm:col-span-2 lg:col-span-3`} />
            <input value={settings.vatNumber} onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })} placeholder="VAT number" className={field} />
            <input value={settings.companyNumber} onChange={(e) => setSettings({ ...settings, companyNumber: e.target.value })} placeholder="Company number" className={field} />
            <input value={settings.prefix} onChange={(e) => setSettings({ ...settings, prefix: e.target.value })} placeholder="Number prefix, e.g. INV-" className={field} />
            <input value={settings.bankName} onChange={(e) => setSettings({ ...settings, bankName: e.target.value })} placeholder="Bank" className={field} />
            <input value={settings.accountName} onChange={(e) => setSettings({ ...settings, accountName: e.target.value })} placeholder="Account name" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <input value={settings.sortCode} onChange={(e) => setSettings({ ...settings, sortCode: e.target.value })} placeholder="Sort code" className={field} />
              <input value={settings.accountNumber} onChange={(e) => setSettings({ ...settings, accountNumber: e.target.value })} placeholder="Account number" className={field} />
            </div>
            <input value={settings.termsDays} onChange={(e) => setSettings({ ...settings, termsDays: Number(e.target.value) || 0 })} placeholder="Payment terms, days" className={field} />
            <input value={settings.defaultVatRate} onChange={(e) => setSettings({ ...settings, defaultVatRate: Number(e.target.value) || 0 })} placeholder="Default VAT %" className={field} />
            <textarea value={settings.footer} onChange={(e) => setSettings({ ...settings, footer: e.target.value })} placeholder="The note at the foot of a new invoice" rows={2} className={`${field} sm:col-span-2 lg:col-span-3`} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowSettings(false)} className="rounded-full border border-line/80 px-4 py-1.5 text-[12px] text-muted">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void saveSettings()} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">Save</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        {!data ? (
          <p className="text-[12.5px] text-muted">Reading the schedule…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-muted">No invoices yet. Draft one from a finished job, or start a blank one.</p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line/70 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                <th className="pb-2 pr-3">Number</th><th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">To</th><th className="pb-2 pr-3">For</th><th className="pb-2 pr-3 text-right">Total</th><th className="pb-2 pr-3">Due</th><th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = INVOICE_STATUS[r.status] ?? INVOICE_STATUS.draft;
                const late = (r.status === "issued" || r.status === "sent") && r.dueDate && new Date(r.dueDate).getTime() < Date.now();
                return (
                  <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-line/40 transition-colors last:border-0 hover:bg-page">
                    <td className="figures py-3 pr-3">{r.number ?? <span className="text-muted">draft</span>}</td>
                    <td className="py-3 pr-3 text-muted">{day(r.issueDate)}</td>
                    <td className="py-3 pr-3">{r.toName || <span className="text-muted">—</span>}</td>
                    <td className="max-w-[260px] truncate py-3 pr-3 text-muted">{r.reference || r.property || "—"}</td>
                    <td className="figures py-3 pr-3 text-right">{pounds(totalOf(r.lines))}</td>
                    <td className={`py-3 pr-3 ${late ? "font-semibold text-accent-dark" : "text-muted"}`}>{day(r.dueDate)}</td>
                    <td className="py-3"><Pill tone={st.tone}>{st.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Produce assigns the next number and freezes the company details onto the invoice. Send emails the page they can open and print. A void invoice keeps its number, so the sequence always reads.{" "}
        <Link href="/marketing-hub/templates" className="underline">The invoice email is editable under Marketing.</Link>
      </p>
    </div>
  );
}
