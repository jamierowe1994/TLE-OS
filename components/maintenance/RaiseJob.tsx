"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PressButton } from "@/components/Bits";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import FieldSelect from "@/components/FieldSelect";
import FieldMultiSelect from "@/components/FieldMultiSelect";
import FieldDate, { sayDate } from "@/components/FieldDate";
import { ContractorForm } from "@/components/WorksNow";
import type { Contractor, JobTenant, WorksOrder, Kind, Urgency } from "@/lib/works-orders";
import { CATEGORY_TRADE, PLANNED_CATEGORIES, REPAIR_CATEGORIES, URGENCIES, categoriesOf, joinCategories } from "@/lib/works-catalogue";
import { CATEGORY_CERT, ContractorPick, REPORTED_BY, type Property } from "@/components/maintenance/works-ui";

type Group = "property" | "what" | "urgency" | "when" | "tenant" | "landlord" | "check";

/** A tenant on a planned job, ticked in or out of the works order. */
type TenantRow = JobTenant & { on: boolean };

/** What an unfinished report holds, to pick it up again. */
export interface RaiseDraft {
  title?: string; description?: string; category?: string; urgency?: string; dueAt?: string; reportedBy?: string;
  tenant?: string; tenantPhone?: string; tenantEmail?: string; landlordName?: string; landlordEmail?: string; landlordMobile?: string;
  access?: string; contractorId?: string; scheduledAt?: string; step?: number;
  /** Planned: every tenant, ticked or not, and whether the landlord was skipped. */
  tenants?: TenantRow[]; landlordSkipped?: boolean;
}

/** Report a repair or plan a job. On /maintenance and on the property's own page. */
export default function RaiseJob({ kind, contractors, home = null, inline = false, draft = null, onDraft, onClose, onRaised }: {
  kind: Kind;
  contractors: Contractor[];
  /** Raised from the property's own page: the home is already known. */
  home?: Property | null;
  /** Drawn inside a box on the page (the property's action panel), not over it. */
  inline?: boolean;
  /** Answers saved from an earlier, unfinished go (the property page's drafts). */
  draft?: RaiseDraft | null;
  /** Called a moment after each change, once there is something worth keeping. */
  onDraft?: (d: RaiseDraft) => void;
  onClose: () => void;
  onRaised: (o: WorksOrder) => void;
}) {
  const planned = kind === "planned";
  /* A few questions to a screen. On the property page for both kinds; on
     Maintenance's own pop-up for a planned job too, because its last screen
     is the works order going to the contractor (James, 8 Oct 2026). */
  const stepped = inline || planned;
  const [props, setProps] = useState<Property[] | null>(null);
  const [pq, setPq] = useState("");
  const [picked, setPicked] = useState<Property | null>(home);
  const [manual, setManual] = useState("");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  /* A repair is one category. A planned job can be several at once - a boiler
     service and an EPC on the same visit - kept together as "Boiler service,
     EPC" (lib/works-catalogue), so it starts with none ticked. */
  const [category, setCategory] = useState<string>(draft?.category ?? (kind === "repair" ? REPAIR_CATEGORIES[0] : ""));
  const picks = useMemo(() => categoriesOf(category), [category]);
  const [urgency, setUrgency] = useState<Urgency>((draft?.urgency as Urgency) ?? "routine");
  const [dueAt, setDueAt] = useState(draft?.dueAt ?? "");
  const [reportedBy, setReportedBy] = useState(draft?.reportedBy ?? (kind === "repair" ? "Tenant" : "Compliance tracker"));
  const [tenant, setTenant] = useState(draft?.tenant ?? "");
  const [tenantPhone, setTenantPhone] = useState(draft?.tenantPhone ?? "");
  const [tenantEmail, setTenantEmail] = useState(draft?.tenantEmail ?? "");
  /* Every tenant on the home, so a shared house can say which of them rang. */
  const [tenants, setTenants] = useState<JobTenant[]>([]);
  const [whichTenant, setWhichTenant] = useState(0);
  /* Planned: every tenant in the house, all on the works order unless unticked
     (James, 8 Oct 2026: "especially if it's an HMO, we need to pull through
     every tenant under that property"). */
  const [rows, setRows] = useState<TenantRow[]>(draft?.tenants ?? []);
  const [adding, setAdding] = useState<JobTenant | null>(null);
  const [landlordEmail, setLandlordEmail] = useState(draft?.landlordEmail ?? "");
  const [landlordMobile, setLandlordMobile] = useState(draft?.landlordMobile ?? "");
  const [landlordName, setLandlordName] = useState(draft?.landlordName ?? "");
  const [landlordSkipped, setLandlordSkipped] = useState(Boolean(draft?.landlordSkipped));
  const [source, setSource] = useState("");
  const [access, setAccess] = useState(draft?.access ?? "");
  const [place, setPlace] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [filled, setFilled] = useState<string[] | null>(null);
  const [sent, setSent] = useState<{ order: WorksOrder; to: string | null } | null>(null);
  /* One added here stays on the list while the page behind refreshes its own
     copy of the book, which would otherwise drop it and unpick it. */
  const [added, setAdded] = useState<Contractor[]>([]);
  const book = useMemo(() => [...added.filter((a) => !contractors.some((c) => c.id === a.id)), ...contractors], [added, contractors]);
  const [contractorId, setContractorId] = useState(draft?.contractorId ?? "");
  const [addingContractor, setAddingContractor] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(draft?.scheduledAt ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const contractor = book.find((c) => c.id === contractorId) ?? null;

  /* The managed book, for the address. Read once; the same list Compliance
     shows, so a home the tracker knows is a home a job can be raised on. */
  useEffect(() => {
    fetch("/api/compliance/book", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProps(Array.isArray(j.properties) ? j.properties.map((p: Property) => ({ id: p.id, name: p.name, locality: p.locality, landlord: p.landlord, tenant: p.tenant, certs: p.certs })) : []))
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
  useEffect(() => { if (picked?.tenant && !draft) setTenant(picked.tenant); }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Picking a tenant from the list fills the three fields together. */
  const chooseTenant = useCallback((list: JobTenant[], i: number) => {
    const t = list[i];
    setWhichTenant(i);
    setTenant(t?.name ?? "");
    setTenantPhone(t?.phone ?? "");
    setTenantEmail(t?.email ?? "");
  }, []);
  /* What the OS knows about the home fills the form: the tenants' names,
     numbers and emails, the landlord's email and mobile, the access notes on
     file. James, 7 Sep 2026: "all of this stuff should be automated." */
  useEffect(() => {
    if (!picked) { setFilled(null); return; }
    let live = true;
    setFilled([]);
    fetch(`/api/property/people?id=${encodeURIComponent(picked.id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!live || !j.ok) return;
      const got: string[] = [];
      const list = (Array.isArray(j.tenants) ? j.tenants : []) as JobTenant[];
      const l = j.landlord as { name: string; email: string; phone: string } | null;
      setTenants(list);
      setPlace({ lat: j.lat ?? null, lng: j.lng ?? null });
      setSource(typeof j.source === "string" ? j.source : "");
      /* A draft keeps what was typed; the record only fills a fresh form. */
      if (draft) { setFilled([]); return; }
      if (list.length) {
        chooseTenant(list, 0);
        setRows(list.map((t) => ({ ...t, on: true })));
        got.push(list.length === 1 ? "the tenant" : `${list.length} tenants`);
      }
      if (l?.name) { setLandlordName(l.name); got.push("landlord"); }
      if (l?.email) { setLandlordEmail(l.email); got.push("landlord's email"); }
      if (l?.phone) { setLandlordMobile(l.phone); got.push("landlord's mobile"); }
      if (j.access) { setAccess(j.access); got.push("access notes"); }
      setFilled(got);
    }).catch(() => { if (live) setFilled([]); });
    return () => { live = false; };
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The tenants who go on a planned job: the ticked ones. Their first is the
     job's own tenant, for every screen that still reads one. */
  const onJob = useMemo(() => rows.filter((r) => r.on).map(({ on: _on, ...t }) => t), [rows]);

  /* A planned job carries the date the certificate we hold runs out, so
     picking the home and the category fills it in - the soonest of them, when
     more than one is ticked. Only while the date is untouched - a date typed
     by hand always wins. */
  const [dueTouched, setDueTouched] = useState(Boolean(draft?.dueAt));
  const certDays = useMemo(() => {
    let soonest: number | null = null;
    for (const c of picks) {
      const key = CATEGORY_CERT[c];
      const days = key ? picked?.certs?.[key]?.expires : null;
      if (days != null && (soonest == null || days < soonest)) soonest = days;
    }
    return soonest;
  }, [picks, picked]);
  useEffect(() => {
    if (!planned || dueTouched || !picked || certDays == null) return;
    const d = new Date();
    d.setDate(d.getDate() + certDays);
    setDueAt(d.toISOString().slice(0, 10));
  }, [planned, picked, certDays, dueTouched]);

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

  async function raise(send = false) {
    const propertyName = picked?.name ?? manual.trim();
    if (!propertyName) return setErr("Which property?");
    if (!title.trim()) return setErr(kind === "repair" ? "What is wrong, in a few words?" : "What is the job?");
    if (!picks.length) return setErr("Tick at least one category.");
    if (planned && !dueAt) return setErr("When does it expire?");
    if (send && !contractorId) return setErr("Pick a contractor to send it to.");
    setBusy(true);
    setErr(null);
    const lead = planned ? onJob[0] : null;
    const r = await fetch("/api/works-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind, propertyId: picked?.id ?? null, propertyName, locality: picked?.locality ?? "",
        landlord: landlordName || picked?.landlord || "",
        tenant: lead ? lead.name : planned ? "" : tenant, tenantPhone: lead ? lead.phone : planned ? "" : tenantPhone, tenantEmail: lead ? lead.email : planned ? "" : tenantEmail,
        landlordEmail: landlordSkipped ? "" : landlordEmail, landlordMobile: landlordSkipped ? "" : landlordMobile,
        propertyLat: place.lat, propertyLng: place.lng,
        title, description, category, urgency: kind === "repair" ? urgency : null, dueAt: planned ? new Date(dueAt).toISOString() : null,
        reportedBy, access, contractorId: contractorId || null, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        ...(planned ? { tenants: onJob, landlordSkipped, send } : {}),
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not raise the job.");
    /* The "message sent" moment James asked for, then the job itself. */
    setSent({ order: r.order, to: send ? contractor?.name ?? "the contractor" : null });
    setTimeout(() => onRaised(r.order), 1300);
  }

  /* ── A few questions to a screen ─────────────────────────────────────
     James, 7 Oct 2026: too many questions on one screen are split into
     groups that belong together, which slide across like the presentation's
     questionnaire, then one screen to check it all before it goes. A planned
     job's last screen is the works order itself, as the contractor will get
     it (8 Oct 2026). */
  const steps: { id: Group; title: string; blurb: string }[] = [
    ...(picked ? [] : [{ id: "property" as const, title: "Which property", blurb: "Start typing the address." }]),
    kind === "repair"
      ? { id: "what", title: "What's wrong", blurb: "In a few words, then whatever the tenant told you." }
      : { id: "what", title: "The job", blurb: "What needs doing, every category the visit covers, and anything the contractor should know." },
    kind === "repair"
      ? { id: "urgency", title: "How urgent", blurb: "The urgency sets how soon a contractor has to attend." }
      : { id: "when", title: "Expiry and contractor", blurb: "When the current certificate runs out, and who is doing it." },
    planned
      ? { id: "tenant", title: "The tenants", blurb: "The contractor arranges a time with them directly. Untick anyone who shouldn't be on it." }
      : { id: "tenant", title: "The tenant and getting in", blurb: "Their email is told at every step of the job. Leave it empty and they won't be." },
    { id: "landlord", title: "The landlord", blurb: planned ? "Who the job is reported to, and how they hear about it. Skip them if they don't need to be involved." : "Who the job is reported to, and how they hear about it." },
    planned
      ? { id: "check", title: contractor ? `Send to ${contractor.name}` : "Check and plan", blurb: contractor ? "This is the works order they'll get. Nothing goes until you press Send." : "No contractor yet: plan it now and pick one on the job." }
      : { id: "check", title: "Check and send", blurb: "Nothing goes until you press Report it." },
  ];
  const [step, setStep] = useState(draft?.step ?? 0);
  const [dir, setDir] = useState<1 | -1>(1);
  const here = steps[Math.min(step, steps.length - 1)];
  const at = (g: Group) => !stepped || here.id === g;
  const last = step >= steps.length - 1;
  /* Kept as it is typed, once there is something to keep - a few words of
     what is wrong is enough - so closing the form never loses it. */
  const draftRef = useRef(onDraft);
  draftRef.current = onDraft;
  useEffect(() => {
    if (!draftRef.current || sent || !(title.trim() || description.trim())) return;
    const t = setTimeout(() => draftRef.current?.({
      title, description, category, urgency, dueAt, reportedBy, tenant, tenantPhone, tenantEmail,
      landlordName, landlordEmail, landlordMobile, access, contractorId, scheduledAt, step,
      ...(planned ? { tenants: rows, landlordSkipped } : {}),
    }), 700);
    return () => clearTimeout(t);
  }, [title, description, category, urgency, dueAt, reportedBy, tenant, tenantPhone, tenantEmail, landlordName, landlordEmail, landlordMobile, access, contractorId, scheduledAt, step, sent, rows, landlordSkipped, planned]);
  function go(d: 1 | -1) {
    if (d > 0) {
      if (here.id === "property" && !picked && !manual.trim()) return setErr("Which property?");
      if (here.id === "what" && !title.trim()) return setErr(kind === "repair" ? "What is wrong, in a few words?" : "What is the job?");
      if (here.id === "what" && !picks.length) return setErr("Tick at least one category.");
      if (here.id === "when" && !dueAt) return setErr("When does it expire?");
    }
    setErr(null);
    setDir(d);
    setStep((n) => Math.max(0, Math.min(steps.length - 1, n + d)));
  }
  const jump = (id: Group) => {
    const i = steps.findIndex((x) => x.id === id);
    if (i < 0) return;
    setErr(null);
    setDir(-1);
    setStep(i);
  };
  const skipLandlord = () => { setLandlordSkipped(true); go(1); };

  /* The works order, as the contractor will get it. Read when the last
     screen opens, and again if anything on it changed since. */
  const [preview, setPreview] = useState<{ key: string; subject: string; html: string; to: string } | { key: string; error: string } | null>(null);
  const previewKey = JSON.stringify([title, description, category, dueAt, scheduledAt, access, contractorId, onJob, picked?.id, manual]);
  useEffect(() => {
    if (!planned || here.id !== "check" || !contractorId || preview?.key === previewKey) return;
    let live = true;
    fetch("/api/works-orders/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title, description, category, access, contractorId, tenants: onJob,
        dueAt: dueAt || null, scheduledAt: scheduledAt || null,
        propertyName: picked?.name ?? manual.trim(), locality: picked?.locality ?? "",
      }),
    }).then((r) => r.json()).then((j) => {
      if (!live) return;
      setPreview(j?.ok ? { key: previewKey, subject: j.subject, html: j.html, to: j.to } : { key: previewKey, error: j?.error ?? "The preview could not be written." });
    }).catch(() => { if (live) setPreview({ key: previewKey, error: "The preview could not be written." }); });
    return () => { live = false; };
  }, [planned, here.id, contractorId, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = kind === "repair" ? REPAIR_CATEGORIES : PLANNED_CATEGORIES;
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";
  const hint = "mt-1 text-[11px] leading-snug text-muted";
  const canSend = planned && !!contractor;
  const contractorHasEmail = !!contractor?.email?.includes("@");

  return (
    <div className={inline ? "contents" : "fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center"}>
      {!inline && <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />}
      <div className={inline ? "relative" : "fade-up relative w-full max-w-2xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"}>
        {sent && (
          <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-page/95`}>
            <span className="fade-up flex h-16 w-16 items-center justify-center rounded-full bg-ink text-page">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </span>
            <p className="hand mt-4 text-[22px]">{kind === "repair" ? "Report sent" : sent.to ? `Sent to ${sent.to}` : "Job planned"}</p>
            <p className="mt-1 text-[12px] text-muted">
              {kind === "repair"
                ? `${sent.order.tenantEmail ? "The tenant has been told. " : ""}Now the landlord.`
                : sent.to
                  ? "They'll arrange a time with the tenants and tell us the date."
                  : "Pick a contractor on the job when you're ready."}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{kind === "repair" ? "Repair" : "Planned maintenance"}</p>
            <h2 className="mt-1 text-[22px] leading-tight">{kind === "repair" ? "Report a repair" : "Plan a job"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>

        {stepped && (
          <div className="mt-4 flex gap-1" aria-hidden>
            {steps.map((x, i) => (
              <span key={x.id} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent-dark" : "bg-line/70"}`} />
            ))}
          </div>
        )}
        <div
          key={stepped ? here.id : "all"}
          className={stepped ? "mt-5 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2" : "mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"}
          style={stepped ? { animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` } : undefined}
          onKeyDown={stepped ? (e) => {
            if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
            e.preventDefault();
            if (!last) go(1);
            else if (!planned) void raise();
          } : undefined}
        >
          {stepped && (
            <div className="sm:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{step + 1} of {steps.length}</p>
              <p className="mt-0.5 text-[16px] font-semibold leading-tight">{here.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{here.blurb}</p>
            </div>
          )}
          {at("property") && (
          <div className="relative sm:col-span-2">
            <label className={label}>Property</label>
            {picked ? (
              <div>
                <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-accent-dark/50 bg-accent-soft/30 px-3 py-2.5">
                  <span className="min-w-0 truncate text-[13px]">{picked.name}{picked.locality ? `, ${picked.locality}` : ""}{picked.landlord ? ` · landlord ${picked.landlord}` : ""}</span>
                  <button type="button" onClick={() => { setPicked(null); setPq(""); }} className="text-[11px] text-muted underline">change</button>
                </div>
                <p className={hint}>
                  {filled === null
                    ? "Reading the property…"
                    : filled.length === 0
                      ? "Nothing on file for the people here yet - fill them in below."
                      : `Filled from ${source || "the property"}: ${filled.join(", ")}.`}
                </p>
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
                {props && props.length > 0 && pq.trim().length > 2 && hits.length === 0 && <p className={hint}>Not on the managed book. The job will carry the address as typed.</p>}
              </>
            )}
          </div>
          )}

          {at("what") && (
          <div className="sm:col-span-2">
            <label className={label}>{kind === "repair" ? "What is wrong" : "The job"}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "repair" ? "Boiler not firing, no hot water" : "Annual gas safety"} className={`mt-1 ${field}`} />
          </div>
          )}

          {at("what") && planned && (
          <div className="sm:col-span-2">
            <label className={label}>Category <span className="font-normal normal-case tracking-normal">- tick as many as the visit covers</span></label>
            <div className="mt-1 grid gap-2 sm:grid-cols-2 sm:gap-5">
              <FieldMultiSelect values={picks} onChange={(v) => setCategory(joinCategories(v))} options={cats.map((c) => ({ value: c, label: c }))} placeholder="Choose the categories" />
              <ul className="flex flex-wrap content-start gap-1.5" aria-label="Chosen categories">
                {picks.length === 0 && <li className="py-2.5 text-[12px] text-muted">Nothing ticked yet.</li>}
                {picks.map((c) => (
                  <li key={c} className="fade-up flex items-center gap-1 rounded-full border border-accent-dark/40 bg-accent-soft/40 py-1 pl-3 pr-1 text-[12px] text-accent-dark">
                    {c}
                    <button type="button" onClick={() => setCategory(joinCategories(picks.filter((x) => x !== c)))} aria-label={`Remove ${c}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent-dark/10">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          )}

          {at("what") && kind === "repair" && (
          <div>
            <label className={label}>Category</label>
            <FieldSelect className="mt-1" value={category} onChange={setCategory} options={cats.map((c) => ({ value: c, label: c }))} />
          </div>
          )}

          {at("urgency") && kind === "repair" && (
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
          )}

          {at("what") && (
          <div className="sm:col-span-2">
            <label className={label}>Detail</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={kind === "repair" ? "What the tenant said, where it is, when it started." : "Anything the contractor needs to know."} className={`mt-1 ${field}`} />
          </div>
          )}

          {at("when") && planned && (
            <div>
              <label className={label}>Expiry date</label>
              <FieldDate className="mt-1" value={dueAt} onChange={(v) => { setDueTouched(true); setDueAt(v); }} placeholder="When it runs out" />
              <p className={hint}>
                {picked && certDays != null && !dueTouched
                  ? certDays < 0
                    ? "Overdue - the certificate we hold ran out on this date."
                    : picks.filter((c) => CATEGORY_CERT[c]).length > 1 ? "From the soonest of the certificates we hold on this home." : "From the certificate we hold on this home."
                  : "When the current certificate runs out. It's on the works order so the contractor knows."}
              </p>
            </div>
          )}

          {at(kind === "repair" ? "urgency" : "when") && (
          <div>
            <label className={label}>{planned ? "Raised from" : "Reported by"}</label>
            <FieldSelect className="mt-1" value={reportedBy} onChange={setReportedBy} options={REPORTED_BY.map((r) => ({ value: r, label: r }))} />
            {planned && <p className={hint}>Where this job came from, for the record.</p>}
          </div>
          )}

          {at("when") && planned && (
            <div className="grid gap-x-5 gap-y-4 sm:col-span-2 sm:grid-cols-2">
              <div>
                <label className={label}>Contractor</label>
                <ContractorPick contractors={book} value={contractorId} onChange={setContractorId} className={`mt-1 ${field}`} styled onAdd={() => setAddingContractor(true)} />
                <p className={hint}>{contractor ? `${contractor.trade}${contractor.email ? ` · ${contractor.email}` : " · no email on file"}` : "From your book or the company's. Not on there? Add them."}</p>
              </div>
              <div>
                <label className={label}>Already booked?</label>
                <FieldDate className="mt-1" withTime clearable value={scheduledAt} onChange={setScheduledAt} placeholder="Not booked yet" />
                <p className={hint}>Only if a date and time are agreed. Otherwise the contractor tells us.</p>
              </div>
              {addingContractor && (
                <div className="fade-up rounded-2xl border border-line/80 bg-white p-4 sm:col-span-2 sm:p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold">Add a contractor</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">Saved to your own book as active, and put on this job.</p>
                    </div>
                    <button type="button" onClick={() => setAddingContractor(false)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted hover:text-ink">✕</button>
                  </div>
                  <ContractorForm
                    initial={{ trade: picks.map((c) => CATEGORY_TRADE[c]).find(Boolean) ?? "" }}
                    canCorporate={false}
                    onClose={() => setAddingContractor(false)}
                    onSaved={(c) => { setAdded((cur) => [c, ...cur.filter((x) => x.id !== c.id)]); setContractorId(c.id); setAddingContractor(false); }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── the tenants: every one on a planned job, the one who rang on a repair ── */}
          {at("tenant") && planned && (
            <div className="sm:col-span-2">
              <label className={label}>{rows.length > 1 ? `Tenants on the works order (${onJob.length} of ${rows.length})` : "Tenant on the works order"}</label>
              {rows.length > 0 && (
                <ul className="mt-1 divide-y divide-line/50 overflow-hidden rounded-xl border border-line/70 bg-white">
                  {rows.map((t, i) => (
                    <li key={`${t.name}-${i}`}>
                      <label className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5">
                        <input type="checkbox" checked={t.on} onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
                        <span className={`min-w-0 flex-1 ${t.on ? "" : "opacity-50"}`}>
                          <span className="block text-[13px] font-semibold">{t.name || "No name"}{t.room ? <span className="font-normal text-muted"> · {t.room}</span> : null}</span>
                          <span className="block truncate text-[11.5px] text-muted">{[t.phone || "no number", t.email || "no email"].join(" · ")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {filled !== null && rows.length === 0 && !adding && <p className="mt-1 text-[12px] text-muted">Nobody on file for this home. Add who the contractor should ring.</p>}
              {adding ? (
                <div className="mt-2 grid gap-2 rounded-xl border border-line/70 bg-white p-3 sm:grid-cols-3">
                  <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Name" className={field} />
                  <input value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} placeholder="Number" className={field} />
                  <input type="email" value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} placeholder="Email" className={field} />
                  <div className="flex justify-end gap-2 sm:col-span-3">
                    <button type="button" onClick={() => setAdding(null)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted">Cancel</button>
                    <button type="button" disabled={!adding.name.trim() && !adding.phone.trim()} onClick={() => { setRows((cur) => [...cur, { ...adding, on: true }]); setAdding(null); }} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40">Add</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding({ name: "", phone: "", email: "" })} className="mt-2 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] hover:border-ink/40">+ Add someone</button>
              )}
              <p className={hint}>On a planned job the tenants aren&apos;t emailed by us. The contractor rings them, and you can send them the booking once it&apos;s made.</p>
            </div>
          )}
          {at("tenant") && !planned && tenants.length > 1 && (
            <div className="sm:col-span-2">
              <label className={label}>Which of them reported it</label>
              <FieldSelect className="mt-1" value={String(whichTenant)} onChange={(v) => chooseTenant(tenants, Number(v))} options={tenants.map((t, i) => ({ value: String(i), label: t.name, sub: [t.room, t.phone, t.email].filter(Boolean).join(" · ") }))} />
              <p className={hint}>{tenants.length} tenants on this home. The one you pick is who the emails go to.</p>
            </div>
          )}
          {at("tenant") && !planned && (
          <div>
            <label className={label}>Tenant</label>
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("tenant") && !planned && (
          <div>
            <label className={label}>Tenant&apos;s number</label>
            <input value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="For access" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("tenant") && !planned && (
          <div>
            <label className={label}>Tenant&apos;s email</label>
            <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="So they're told at each step" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("tenant") && (
          <div className="sm:col-span-2">
            <label className={label}>Access notes</label>
            <input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Key safe, tenant works days, dog in the garden" className={`mt-1 ${field}`} />
          </div>
          )}

          {/* ── the landlord, or skipped ── */}
          {at("landlord") && planned && landlordSkipped ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-white px-4 py-3 sm:col-span-2">
              <p className="text-[12.5px]"><strong>Skipped.</strong> {landlordName || "The landlord"} isn&apos;t involved and won&apos;t be emailed about this job.</p>
              <button type="button" onClick={() => setLandlordSkipped(false)} className="shrink-0 text-[12px] text-muted underline underline-offset-2 hover:text-ink">Undo</button>
            </div>
          ) : (
            <>
              {at("landlord") && (
              <div>
                <label className={label}>Landlord</label>
                <input value={landlordName} onChange={(e) => setLandlordName(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
              </div>
              )}
              {at("landlord") && (
              <div>
                <label className={label}>Landlord&apos;s email</label>
                <input type="email" value={landlordEmail} onChange={(e) => setLandlordEmail(e.target.value)} placeholder="For the report and approvals" className={`mt-1 ${field}`} />
              </div>
              )}
              {at("landlord") && (
              <div>
                <label className={label}>Landlord&apos;s mobile</label>
                <input value={landlordMobile} onChange={(e) => setLandlordMobile(e.target.value)} placeholder="To ring them first" className={`mt-1 ${field}`} />
              </div>
              )}
              {stepped && at("landlord") && (
                landlordEmail.includes("@") ? (
                  <LandlordJobEmails key={landlordEmail} landlord={landlordEmail} name={landlordName || "the landlord"} className="rounded-xl border border-line/60 bg-white px-4 py-3 sm:col-span-2" />
                ) : (
                  <p className="rounded-xl border border-line/60 bg-white px-4 py-3 text-[12px] text-muted sm:col-span-2">No email for the landlord, so they won&apos;t be emailed about this job - ring them.</p>
                )
              )}
            </>
          )}

          {/* ── the last screen: check it, and on a planned job, the works order ── */}
          {stepped && at("check") && (
            <dl className="divide-y divide-line/50 overflow-hidden rounded-xl border border-line/60 bg-white text-[12.5px] sm:col-span-2">
              {([
                [steps.find((x) => x.id === "what")!.title, "what", [title || "—", category, description].filter(Boolean).join(" · ")],
                kind === "repair"
                  ? ["How urgent", "urgency", `${URGENCIES.find((u) => u.id === urgency)?.label ?? urgency} · reported by ${reportedBy.toLowerCase()}`]
                  : ["Expiry and contractor", "when", [dueAt ? `expires ${sayDate(dueAt)}` : "—", contractor?.name ?? "no contractor yet", scheduledAt ? `booked ${sayDate(scheduledAt, true)}` : null].filter(Boolean).join(" · ")],
                planned
                  ? ["Tenants", "tenant", [onJob.length ? onJob.map((t) => `${t.name}${t.room ? ` (${t.room})` : ""}`).join(", ") : "none on the works order", access ? `access: ${access}` : null].filter(Boolean).join(" · ")]
                  : ["Tenant", "tenant", [tenant || "—", tenantEmail ? `emailed at ${tenantEmail}` : "not emailed", access ? `access: ${access}` : null].filter(Boolean).join(" · ")],
                ["Landlord", "landlord", landlordSkipped ? "Skipped - not involved, not emailed" : [landlordName || "—", landlordEmail ? `emailed at ${landlordEmail}` : "not emailed", landlordMobile || null].filter(Boolean).join(" · ")],
              ] as [string, Group, string][]).map(([k, g, v]) => (
                <div key={g} className="flex items-start gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{k}</dt>
                    <dd className="mt-0.5 break-words">{v}</dd>
                  </div>
                  <button type="button" onClick={() => jump(g)} className="shrink-0 text-[11px] text-muted underline underline-offset-2 hover:text-ink">Change</button>
                </div>
              ))}
            </dl>
          )}
          {stepped && at("check") && canSend && (
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={label}>The works order</p>
                <p className="text-[11.5px] text-muted">To {contractor!.name}{contractorHasEmail ? ` · ${contractor!.email}` : ""}</p>
              </div>
              {!contractorHasEmail ? (
                <p className="mt-1 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-3 text-[12.5px]">{contractor!.name} has no email in the book, so nothing can be sent. Plan it and ring them, or add their email on the Contractors list.</p>
              ) : !preview || preview.key !== previewKey ? (
                <div className="mt-1 flex h-40 items-center justify-center gap-2 rounded-xl border border-line/60 bg-white text-[12px] text-muted">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden /> Writing the works order…
                </div>
              ) : "error" in preview ? (
                <p className="mt-1 rounded-xl border border-line/60 bg-white px-4 py-3 text-[12.5px] text-accent-dark">{preview.error}</p>
              ) : (
                <div className="mt-1 overflow-hidden rounded-xl border border-line/60 bg-white">
                  <p className="border-b border-line/50 px-4 py-2.5 text-[12.5px]"><span className="text-muted">Subject:</span> {preview.subject}</p>
                  <iframe title="The works order" srcDoc={preview.html} sandbox="" className="block h-[380px] w-full bg-white" />
                </div>
              )}
            </div>
          )}
        </div>

        {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
        {stepped && !last ? (
          <div className="mt-5 flex items-center justify-between gap-2">
            <button type="button" onClick={() => (step === 0 ? onClose() : go(-1))} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink">
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <span className="flex items-center gap-2">
              {planned && here.id === "landlord" && !landlordSkipped && (
                <button type="button" onClick={skipLandlord} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] hover:border-ink/40" title="They aren't involved: no emails to them about this job">
                  Skip the landlord
                </button>
              )}
              <PressButton onClick={() => go(1)} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                Continue
              </PressButton>
            </span>
          </div>
        ) : (
          <div className={`mt-5 flex flex-wrap items-center gap-2 ${stepped ? "justify-between" : "justify-end"}`}>
            <button type="button" onClick={() => (stepped ? go(-1) : onClose())} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink">{stepped ? "Back" : "Cancel"}</button>
            {canSend && contractorHasEmail ? (
              <span className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy} onClick={() => void raise(false)} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] hover:border-ink/40 disabled:opacity-50" title="The job goes on the board; nothing is sent">
                  Plan it without sending
                </button>
                <PressButton onClick={() => void raise(true)} className={`flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  {busy ? "Sending…" : `Send to ${contractor!.name}`}
                </PressButton>
              </span>
            ) : (
              <PressButton onClick={() => void raise(false)} className={`rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
                {busy ? "Raising…" : kind === "repair" ? "Report it" : "Plan it"}
              </PressButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
