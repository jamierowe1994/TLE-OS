"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PressButton } from "@/components/Bits";
import type { Contractor, WorksOrder, Kind, Urgency } from "@/lib/works-orders";
import { PLANNED_CATEGORIES, REPAIR_CATEGORIES, URGENCIES } from "@/lib/works-catalogue";
import { CATEGORY_CERT, ContractorPick, REPORTED_BY, type Property } from "@/components/maintenance/works-ui";

/** Report a repair or plan a job. On /maintenance and on the property's own page. */
export default function RaiseJob({ kind, contractors, home = null, onClose, onRaised }: {
  kind: Kind;
  contractors: Contractor[];
  /** Raised from the property's own page: the home is already known. */
  home?: Property | null;
  onClose: () => void;
  onRaised: (o: WorksOrder) => void;
}) {
  const [props, setProps] = useState<Property[] | null>(null);
  const [pq, setPq] = useState("");
  const [picked, setPicked] = useState<Property | null>(home);
  const [manual, setManual] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(kind === "repair" ? REPAIR_CATEGORIES[0] : PLANNED_CATEGORIES[0]);
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [dueAt, setDueAt] = useState("");
  const [reportedBy, setReportedBy] = useState(kind === "repair" ? "Tenant" : "Compliance tracker");
  const [tenant, setTenant] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  /* Every tenant on the home, so a shared house can say which of them rang. */
  const [tenants, setTenants] = useState<{ name: string; email: string; phone: string }[]>([]);
  const [whichTenant, setWhichTenant] = useState(0);
  const [landlordEmail, setLandlordEmail] = useState("");
  const [landlordMobile, setLandlordMobile] = useState("");
  const [landlordName, setLandlordName] = useState("");
  const [source, setSource] = useState("");
  const [access, setAccess] = useState("");
  const [place, setPlace] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [filled, setFilled] = useState<string[] | null>(null);
  const [sent, setSent] = useState<WorksOrder | null>(null);
  const [contractorId, setContractorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
  useEffect(() => { if (picked?.tenant) setTenant(picked.tenant); }, [picked]);
  /* Picking a tenant from the list fills the three fields together. */
  const chooseTenant = useCallback((list: { name: string; email: string; phone: string }[], i: number) => {
    const t = list[i];
    setWhichTenant(i);
    setTenant(t?.name ?? "");
    setTenantPhone(t?.phone ?? "");
    setTenantEmail(t?.email ?? "");
  }, []);
  /* What the OS knows about the home fills the form: the tenant's name,
     number and email, the landlord's email and mobile, the access notes on
     file. James, 7 Sep 2026: "all of this stuff should be automated." */
  useEffect(() => {
    if (!picked) { setFilled(null); return; }
    let live = true;
    setFilled([]);
    fetch(`/api/property/people?id=${encodeURIComponent(picked.id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!live || !j.ok) return;
      const got: string[] = [];
      const list = (Array.isArray(j.tenants) ? j.tenants : []) as { name: string; email: string; phone: string }[];
      const l = j.landlord as { name: string; email: string; phone: string } | null;
      setTenants(list);
      if (list.length) {
        chooseTenant(list, 0);
        got.push(list.length === 1 ? "the tenant" : `${list.length} tenants`);
      }
      if (l?.name) { setLandlordName(l.name); got.push("landlord"); }
      if (l?.email) { setLandlordEmail(l.email); got.push("landlord's email"); }
      if (l?.phone) { setLandlordMobile(l.phone); got.push("landlord's mobile"); }
      if (j.access) { setAccess(j.access); got.push("access notes"); }
      setPlace({ lat: j.lat ?? null, lng: j.lng ?? null });
      setSource(typeof j.source === "string" ? j.source : "");
      setFilled(got);
    }).catch(() => { if (live) setFilled([]); });
    return () => { live = false; };
  }, [picked]);

  /* A planned job is due when the certificate we hold runs out, so picking
     the home and the category fills the date in. Only while the date is
     untouched - a date typed by hand always wins. */
  const [dueTouched, setDueTouched] = useState(false);
  useEffect(() => {
    if (kind !== "planned" || dueTouched || !picked) return;
    const key = CATEGORY_CERT[category];
    const days = key ? picked.certs?.[key]?.expires : null;
    if (days == null) return;
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDueAt(d.toISOString().slice(0, 10));
  }, [kind, picked, category, dueTouched]);

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
        kind, propertyId: picked?.id ?? null, propertyName, locality: picked?.locality ?? "",
        landlord: landlordName || picked?.landlord || "", tenant, tenantPhone, tenantEmail, landlordEmail, landlordMobile,
        propertyLat: place.lat, propertyLng: place.lng,
        title, description, category, urgency: kind === "repair" ? urgency : null, dueAt: kind === "planned" ? new Date(dueAt).toISOString() : null,
        reportedBy, access, contractorId: contractorId || null, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not raise the job.");
    /* The "message sent" moment James asked for, then straight into
       telling the landlord. */
    setSent(r.order);
    setTimeout(() => onRaised(r.order), 1100);
  }

  const cats = kind === "repair" ? REPAIR_CATEGORIES : PLANNED_CATEGORIES;
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />
      <div className="fade-up relative w-full max-w-2xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        {sent && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-page/95">
            <span className="fade-up flex h-16 w-16 items-center justify-center rounded-full bg-ink text-page">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </span>
            <p className="hand mt-4 text-[22px]">{kind === "repair" ? "Report sent" : "Job planned"}</p>
            <p className="mt-1 text-[12px] text-muted">{sent.tenantEmail ? "The tenant has been told. " : ""}Now the landlord.</p>
          </div>
        )}
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
              <div>
                <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-accent-dark/50 bg-accent-soft/30 px-3 py-2.5">
                  <span className="min-w-0 truncate text-[13px]">{picked.name}{picked.locality ? `, ${picked.locality}` : ""}{picked.landlord ? ` · landlord ${picked.landlord}` : ""}</span>
                  <button type="button" onClick={() => { setPicked(null); setPq(""); }} className="text-[11px] text-muted underline">change</button>
                </div>
                <p className="mt-1 text-[11px] text-muted">
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
              <input type="date" value={dueAt} onChange={(e) => { setDueTouched(true); setDueAt(e.target.value); }} className={`mt-1 ${field}`} />
              {picked && CATEGORY_CERT[category] && picked.certs?.[CATEGORY_CERT[category]]?.expires != null && !dueTouched && (
                <p className="mt-1 text-[11px] text-muted">
                  {(picked.certs[CATEGORY_CERT[category]]!.expires as number) < 0 ? "Overdue - the certificate we hold ran out on this date." : "From the certificate we hold on this home."}
                </p>
              )}
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
          {tenants.length > 1 && (
            <div className="sm:col-span-2">
              <label className={label}>{kind === "repair" ? "Which of them reported it" : "Who we'll arrange access with"}</label>
              <select value={whichTenant} onChange={(e) => chooseTenant(tenants, Number(e.target.value))} className={`mt-1 ${field}`}>
                {tenants.map((t, i) => (
                  <option key={`${t.name}-${i}`} value={i}>{t.name}{t.phone ? ` · ${t.phone}` : ""}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted">{tenants.length} tenants on this home. The one you pick is who the emails go to.</p>
            </div>
          )}
          <div>
            <label className={label}>Tenant</label>
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Tenant's number</label>
            <input value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="For access" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Tenant's email</label>
            <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="So they're told at each step" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Landlord</label>
            <input value={landlordName} onChange={(e) => setLandlordName(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Landlord's email</label>
            <input type="email" value={landlordEmail} onChange={(e) => setLandlordEmail(e.target.value)} placeholder="For the report and approvals" className={`mt-1 ${field}`} />
          </div>
          <div>
            <label className={label}>Landlord's mobile</label>
            <input value={landlordMobile} onChange={(e) => setLandlordMobile(e.target.value)} placeholder="To ring them first" className={`mt-1 ${field}`} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Access notes</label>
            <input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Key safe, tenant works days, dog in the garden" className={`mt-1 ${field}`} />
          </div>

          {kind === "planned" && (
            <>
              <div>
                <label className={label}>Contractor, if already known</label>
                <ContractorPick contractors={contractors} value={contractorId} onChange={setContractorId} className={`mt-1 ${field}`} />
              </div>
              <div>
                <label className={label}>Booked for, if already booked</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={`mt-1 ${field}`} />
              </div>
            </>
          )}
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
