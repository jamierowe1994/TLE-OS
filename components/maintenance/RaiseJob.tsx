"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PressButton } from "@/components/Bits";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import type { Contractor, WorksOrder, Kind, Urgency } from "@/lib/works-orders";
import { PLANNED_CATEGORIES, REPAIR_CATEGORIES, URGENCIES } from "@/lib/works-catalogue";
import { CATEGORY_CERT, ContractorPick, REPORTED_BY, type Property } from "@/components/maintenance/works-ui";

type Group = "property" | "what" | "urgency" | "when" | "tenant" | "landlord" | "check";

/** What an unfinished report holds, to pick it up again. */
export interface RaiseDraft {
  title?: string; description?: string; category?: string; urgency?: string; dueAt?: string; reportedBy?: string;
  tenant?: string; tenantPhone?: string; tenantEmail?: string; landlordName?: string; landlordEmail?: string; landlordMobile?: string;
  access?: string; contractorId?: string; scheduledAt?: string; step?: number;
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
  const [props, setProps] = useState<Property[] | null>(null);
  const [pq, setPq] = useState("");
  const [picked, setPicked] = useState<Property | null>(home);
  const [manual, setManual] = useState("");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [category, setCategory] = useState<string>(draft?.category ?? (kind === "repair" ? REPAIR_CATEGORIES[0] : PLANNED_CATEGORIES[0]));
  const [urgency, setUrgency] = useState<Urgency>((draft?.urgency as Urgency) ?? "routine");
  const [dueAt, setDueAt] = useState(draft?.dueAt ?? "");
  const [reportedBy, setReportedBy] = useState(draft?.reportedBy ?? (kind === "repair" ? "Tenant" : "Compliance tracker"));
  const [tenant, setTenant] = useState(draft?.tenant ?? "");
  const [tenantPhone, setTenantPhone] = useState(draft?.tenantPhone ?? "");
  const [tenantEmail, setTenantEmail] = useState(draft?.tenantEmail ?? "");
  /* Every tenant on the home, so a shared house can say which of them rang. */
  const [tenants, setTenants] = useState<{ name: string; email: string; phone: string }[]>([]);
  const [whichTenant, setWhichTenant] = useState(0);
  const [landlordEmail, setLandlordEmail] = useState(draft?.landlordEmail ?? "");
  const [landlordMobile, setLandlordMobile] = useState(draft?.landlordMobile ?? "");
  const [landlordName, setLandlordName] = useState(draft?.landlordName ?? "");
  const [source, setSource] = useState("");
  const [access, setAccess] = useState(draft?.access ?? "");
  const [place, setPlace] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [filled, setFilled] = useState<string[] | null>(null);
  const [sent, setSent] = useState<WorksOrder | null>(null);
  const [contractorId, setContractorId] = useState(draft?.contractorId ?? "");
  const [scheduledAt, setScheduledAt] = useState(draft?.scheduledAt ?? "");
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
  useEffect(() => { if (picked?.tenant && !draft) setTenant(picked.tenant); }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
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
      setPlace({ lat: j.lat ?? null, lng: j.lng ?? null });
      setSource(typeof j.source === "string" ? j.source : "");
      /* A draft keeps what was typed; the record only fills a fresh form. */
      if (draft) { setFilled([]); return; }
      if (list.length) {
        chooseTenant(list, 0);
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

  /* A planned job is due when the certificate we hold runs out, so picking
     the home and the category fills the date in. Only while the date is
     untouched - a date typed by hand always wins. */
  const [dueTouched, setDueTouched] = useState(Boolean(draft?.dueAt));
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

  /* ── In the action box: a few questions to a screen ─────────────────────
     James, 7 Oct 2026: too many questions on one screen are split into
     groups that belong together - what is wrong, how urgent, the tenant and
     getting in, the landlord and whether they are emailed - which slide
     across like the presentation's questionnaire, then one screen to check
     it all before it goes. The pop-up on Maintenance stays one screen. */
  const steps: { id: Group; title: string; blurb: string }[] = [
    ...(picked ? [] : [{ id: "property" as const, title: "Which property", blurb: "Start typing the address." }]),
    kind === "repair"
      ? { id: "what", title: "What's wrong", blurb: "In a few words, then whatever the tenant told you." }
      : { id: "what", title: "The job", blurb: "What needs doing, and anything the contractor should know." },
    kind === "repair"
      ? { id: "urgency", title: "How urgent", blurb: "The urgency sets how soon a contractor has to attend." }
      : { id: "when", title: "When it's due", blurb: "And the contractor, if it's already arranged." },
    { id: "tenant", title: kind === "repair" ? "The tenant and getting in" : "Access", blurb: "Their email is told at every step of the job. Leave it empty and they won't be." },
    { id: "landlord", title: "The landlord", blurb: "Who the job is reported to, and how they hear about it." },
    { id: "check", title: "Check and send", blurb: kind === "repair" ? "Nothing goes until you press Report it." : "Nothing goes until you press Plan it." },
  ];
  const [step, setStep] = useState(draft?.step ?? 0);
  const [dir, setDir] = useState<1 | -1>(1);
  const here = steps[Math.min(step, steps.length - 1)];
  const at = (g: Group) => !inline || here.id === g;
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
    }), 700);
    return () => clearTimeout(t);
  }, [title, description, category, urgency, dueAt, reportedBy, tenant, tenantPhone, tenantEmail, landlordName, landlordEmail, landlordMobile, access, contractorId, scheduledAt, step, sent]);
  function go(d: 1 | -1) {
    if (d > 0) {
      if (here.id === "property" && !picked && !manual.trim()) return setErr("Which property?");
      if (here.id === "what" && !title.trim()) return setErr(kind === "repair" ? "What is wrong, in a few words?" : "What is the job?");
      if (here.id === "when" && !dueAt) return setErr("When is it due?");
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

  const cats = kind === "repair" ? REPAIR_CATEGORIES : PLANNED_CATEGORIES;
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";

  return (
    <div className={inline ? "contents" : "fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center"}>
      {!inline && <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />}
      <div className={inline ? "relative" : "fade-up relative w-full max-w-2xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"}>
        {sent && (
          <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-page/95`}>
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

        {inline && (
          <div className="mt-4 flex gap-1" aria-hidden>
            {steps.map((x, i) => (
              <span key={x.id} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent-dark" : "bg-line/70"}`} />
            ))}
          </div>
        )}
        <div
          key={inline ? here.id : "all"}
          className={inline ? "mt-4 flex flex-col gap-4" : "mt-5 grid gap-4 sm:grid-cols-2"}
          style={inline ? { animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` } : undefined}
          onKeyDown={inline ? (e) => {
            if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
            e.preventDefault();
            if (last) void raise(); else go(1);
          } : undefined}
        >
          {inline && (
            <div>
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
          )}

          {at("what") && (
          <div className="sm:col-span-2">
            <label className={label}>{kind === "repair" ? "What is wrong" : "The job"}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "repair" ? "Boiler not firing, no hot water" : "Annual gas safety"} className={`mt-1 ${field}`} />
          </div>
          )}

          {at("what") && (
          <div>
            <label className={label}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${field}`}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          )}

          {at(kind === "repair" ? "urgency" : "when") && (kind === "repair" ? (
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
          ))}

          {at("what") && (
          <div className="sm:col-span-2">
            <label className={label}>Detail</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={kind === "repair" ? "What the tenant said, where it is, when it started." : "Anything the contractor needs to know."} className={`mt-1 ${field}`} />
          </div>
          )}

          {at((kind === "repair" ? "urgency" : "when")) && (
          <div>
            <label className={label}>Reported by</label>
            <select value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} className={`mt-1 ${field}`}>
              {REPORTED_BY.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          )}
          {at("tenant") && tenants.length > 1 && (
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
          {at("tenant") && (
          <div>
            <label className={label}>Tenant</label>
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("tenant") && (
          <div>
            <label className={label}>Tenant's number</label>
            <input value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="For access" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("tenant") && (
          <div>
            <label className={label}>Tenant's email</label>
            <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="So they're told at each step" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("landlord") && (
          <div>
            <label className={label}>Landlord</label>
            <input value={landlordName} onChange={(e) => setLandlordName(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("landlord") && (
          <div>
            <label className={label}>Landlord's email</label>
            <input type="email" value={landlordEmail} onChange={(e) => setLandlordEmail(e.target.value)} placeholder="For the report and approvals" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("landlord") && (
          <div>
            <label className={label}>Landlord's mobile</label>
            <input value={landlordMobile} onChange={(e) => setLandlordMobile(e.target.value)} placeholder="To ring them first" className={`mt-1 ${field}`} />
          </div>
          )}
          {at("tenant") && (
          <div className="sm:col-span-2">
            <label className={label}>Access notes</label>
            <input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Key safe, tenant works days, dog in the garden" className={`mt-1 ${field}`} />
          </div>
          )}

          {at("when") && kind === "planned" && (
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
          {inline && at("landlord") && (
            landlordEmail.includes("@") ? (
              <LandlordJobEmails key={landlordEmail} compact landlord={landlordEmail} name={landlordName || "the landlord"} className="rounded-xl bg-white px-3.5 py-3" />
            ) : (
              <p className="rounded-xl bg-white px-3.5 py-3 text-[12px] text-muted">No email for the landlord, so they won&apos;t be emailed about this job - ring them.</p>
            )
          )}
          {inline && at("check") && (
            <dl className="divide-y divide-line/50 overflow-hidden rounded-xl bg-white text-[12.5px]">
              {([
                [steps.find((x) => x.id === "what")!.title, "what", [title || "—", category, description].filter(Boolean).join(" · ")],
                kind === "repair"
                  ? ["How urgent", "urgency", `${URGENCIES.find((u) => u.id === urgency)?.label ?? urgency} · reported by ${reportedBy.toLowerCase()}`]
                  : ["Due", "when", [dueAt ? new Date(dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—", contractors.find((c) => c.id === contractorId)?.name, scheduledAt ? `booked ${new Date(scheduledAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : null].filter(Boolean).join(" · ")],
                ["Tenant", "tenant", [tenant || "—", tenantEmail ? `emailed at ${tenantEmail}` : "not emailed", access ? `access: ${access}` : null].filter(Boolean).join(" · ")],
                ["Landlord", "landlord", [landlordName || "—", landlordEmail ? `emailed at ${landlordEmail}` : "not emailed", landlordMobile || null].filter(Boolean).join(" · ")],
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
        </div>

        {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
        {inline && !last ? (
          <div className="mt-5 flex items-center justify-between gap-2">
            <button type="button" onClick={() => (step === 0 ? onClose() : go(-1))} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink">
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <PressButton onClick={() => go(1)} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
              Continue
            </PressButton>
          </div>
        ) : (
          <div className={`mt-5 flex items-center gap-2 ${inline ? "justify-between" : "justify-end"}`}>
            <button type="button" onClick={() => (inline ? go(-1) : onClose())} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted hover:text-ink">{inline ? "Back" : "Cancel"}</button>
            <PressButton onClick={() => void raise()} className={`rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
              {busy ? "Raising…" : kind === "repair" ? "Report it" : "Plan it"}
            </PressButton>
          </div>
        )}
      </div>
    </div>
  );
}
