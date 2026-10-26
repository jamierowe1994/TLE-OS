"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PressButton } from "@/components/Bits";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import FieldSelect from "@/components/FieldSelect";
import FieldMultiSelect from "@/components/FieldMultiSelect";
import FieldDate, { sayDate } from "@/components/FieldDate";
import { ContractorForm } from "@/components/WorksNow";
import type { Contractor, JobTenant, WorksOrder, Kind, Urgency } from "@/lib/works-orders";
import { CATEGORY_TRADE, PLANNED_CATEGORIES, REPAIR_CATEGORIES, URGENCIES, categoriesOf, joinCategories } from "@/lib/works-catalogue";
import { CATEGORY_CERT, ContractorPick, REPORTED_BY, type Property } from "@/components/maintenance/works-ui";
import { searchMatches } from "@/lib/search-match";
import DoodleIcon from "@/components/DoodleIcon";
import FloatSheet, { FloatChoice, FloatDone, FloatFoot } from "@/components/new-look/FloatSheet";
import CategoryIcon from "@/components/maintenance/CategoryIcon";

type Group = "property" | "what" | "urgency" | "when" | "tenant" | "landlord" | "check";

/** A tenant on a planned job, ticked in or out of the works order. */
type TenantRow = JobTenant & { on: boolean };

/** What an unfinished report holds, to pick it up again. */
export interface RaiseDraft {
  title?: string; description?: string; category?: string; urgency?: string; dueAt?: string; reportedBy?: string;
  tenant?: string; tenantPhone?: string; tenantEmail?: string; landlordName?: string; landlordEmail?: string; landlordMobile?: string;
  access?: string; contractorId?: string; scheduledAt?: string; step?: number;
  /** Every tenant, ticked or not, and whether the landlord was skipped. */
  tenants?: TenantRow[]; landlordSkipped?: boolean;
  /** Repair: whether the tenants are told, and which of them reported it. */
  tellTenants?: boolean; reporter?: number;
}

/** Report a repair or plan a job. On /maintenance and on the property's own page. */
export default function RaiseJob({ kind, contractors, home = null, inline = false, draft = null, onDraft, onClose, onRaised, look }: {
  kind: Kind;
  /** The new look's floating boxes over a darkened page (the Contractors page,
   *  25 Oct 2026). The same screens, checks, emails and save; only drawn as
   *  separate cards. Ignored with `inline`. */
  look?: "float";
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
  /* A few questions to a screen, everywhere and for both kinds: the last
     screen is the works order going to the contractor (James, 8 Oct 2026;
     a repair too since 9 Oct). */
  const stepped = true;
  const [props, setProps] = useState<Property[] | null>(null);
  const [pq, setPq] = useState("");
  const [picked, setPicked] = useState<Property | null>(home);
  /* The address, changed from the last screen (Lianna, 9 Oct 2026: realising
     at the end it went on the wrong home meant back, back, back and cancel). */
  const [moving, setMoving] = useState(false);
  const [manual, setManual] = useState("");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  /* Several categories at once - a boiler service and an EPC on the same
     visit, or pests and holes to fill on a repair (Lianna, 9 Oct 2026) - kept
     together as "Pests, General repairs" (lib/works-catalogue), so it starts
     with none ticked. */
  const [category, setCategory] = useState<string>(draft?.category ?? "");
  const picks = useMemo(() => categoriesOf(category), [category]);
  /* Picked, never assumed (Howard, 12 Oct 2026): a fresh repair starts with
     no urgency, because Routine by default was how an emergency got filed as
     one that could wait a month. A draft keeps what was chosen. */
  const [urgency, setUrgency] = useState<Urgency | "">((draft?.urgency as Urgency) ?? "");
  const [dueAt, setDueAt] = useState(draft?.dueAt ?? "");
  const [reportedBy, setReportedBy] = useState(draft?.reportedBy ?? (kind === "repair" ? "Tenant" : "Compliance tracker"));
  /* Which of the tenants on the job reported it (a repair): the job's lead
     tenant, so the emails that still go to one person go to them. */
  const [reporter, setReporter] = useState(draft?.reporter ?? 0);
  /* A repair tells the tenants a contractor is coming - never the works order,
     which can carry notes they shouldn't read (Lianna, 9 Oct 2026). Off for
     a discreet job, and then nothing automatic goes to them at all. */
  /* Plan a certificate has the same tick, OFF to start (James, 10 Oct 2026:
     "it should be optional, they just click the box"): who will be in touch
     to arrange access, and nothing else. */
  const [tellTenants, setTellTenants] = useState(draft?.tellTenants ?? kind === "repair");
  /* Every tenant in the house, all on the works order unless unticked
     (James, 8 Oct 2026: "especially if it's an HMO, we need to pull through
     every tenant under that property"). A repair too, since 9 Oct. */
  const [rows, setRows] = useState<TenantRow[]>(
    draft?.tenants ?? (draft?.tenant ? [{ name: draft.tenant, phone: draft.tenantPhone ?? "", email: draft.tenantEmail ?? "", on: true }] : [])
  );
  const [adding, setAdding] = useState<JobTenant | null>(null);
  const [landlordEmail, setLandlordEmail] = useState(draft?.landlordEmail ?? "");
  const [landlordMobile, setLandlordMobile] = useState(draft?.landlordMobile ?? "");
  const [landlordName, setLandlordName] = useState(draft?.landlordName ?? "");
  const [landlordSkipped, setLandlordSkipped] = useState(Boolean(draft?.landlordSkipped));
  /* The landlord on file and anyone else kept on the home - a joint landlord,
     a point of contact (lib/property-people, 16 Oct 2026) - to pick who the
     job is reported to. */
  const [reportTo, setReportTo] = useState<{ label: string; name: string; email: string; phone: string }[]>([]);
  const [source, setSource] = useState("");
  const [access, setAccess] = useState(draft?.access ?? "");
  const [place, setPlace] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [filled, setFilled] = useState<string[] | null>(null);
  const [sent, setSent] = useState<{ order: WorksOrder; to: string | null; quote?: boolean } | null>(null);
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
  /* Others asked for a price at the same time (James, 22 Oct 2026: "they can
     send out to multiple contractors"). Quotes only: one firm gets the works
     order, so the rest are asked to price it and the one taken goes on the job. */
  const [alsoAsk, setAlsoAsk] = useState<string[]>([]);
  const askIds = contractorId ? [contractorId, ...alsoAsk.filter((x) => x !== contractorId)] : [];

  /* The managed book, for the address. Read once; the same list Compliance
     shows, so a home the tracker knows is a home a job can be raised on. */
  useEffect(() => {
    /* The compliance book is the office's (owners and compliance only). An
       agent was refused it and got an address box that found nothing, so
       every job they raised from here carried the address as typed and no
       home (15 Oct 2026). They search their own book instead - Portfolio's,
       scoped to them - and can still type an address that isn't on it. */
    const fromPortfolio = () =>
      fetch("/api/portfolio", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setProps(Array.isArray(j.properties)
          ? (j.properties as { propertyId: string | null; name: string; locality: string; landlord: { name: string } | null; tenants: { name: string }[] }[])
              .filter((p, i, all) => p.propertyId && all.findIndex((x) => x.propertyId === p.propertyId && x.name === p.name) === i)
              .map((p) => ({ id: p.propertyId as string, name: p.name, locality: p.locality, landlord: p.landlord?.name ?? "", tenant: p.tenants?.[0]?.name ?? null }))
          : []))
        .catch(() => setProps([]));
    fetch("/api/compliance/book", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok && Array.isArray(j.properties)
        ? setProps(j.properties.map((p: Property) => ({ id: p.id, name: p.name, locality: p.locality, landlord: p.landlord, tenant: p.tenant, certs: p.certs })))
        : fromPortfolio()))
      .catch(() => fromPortfolio());
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
  /* A draft's home is filled from the draft; a home picked afterwards - the
     address changed on the last screen - is filled from its own records. */
  const filledFor = useRef<string | null>(draft && home ? home.id : null);
  /* What the OS knows about the home fills the form: the tenants' names,
     numbers and emails, the landlord's email and mobile, the access notes on
     file. James, 7 Sep 2026: "all of this stuff should be automated." */
  useEffect(() => {
    if (!picked) { setFilled(null); return; }
    let live = true;
    const fromDraft = filledFor.current === picked.id;
    filledFor.current = null;
    setFilled([]);
    fetch(`/api/property/people?id=${encodeURIComponent(picked.id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!live || !j.ok) return;
      const got: string[] = [];
      const list = (Array.isArray(j.tenants) ? j.tenants : []) as JobTenant[];
      const l = j.landlord as { name: string; email: string; phone: string } | null;
      setPlace({ lat: j.lat ?? null, lng: j.lng ?? null });
      setSource(typeof j.source === "string" ? j.source : "");
      /* A draft keeps what was typed; the record only fills a fresh form. */
      if (fromDraft) { setFilled([]); return; }
      setRows(list.map((t) => ({ ...t, on: true })));
      setReporter(0);
      if (list.length) got.push(list.length === 1 ? "the tenant" : `${list.length} tenants`);
      else if (picked.tenant) setRows([{ name: picked.tenant, phone: "", email: "", on: true }]);
      const others = (Array.isArray(j.others) ? j.others : []) as { label: string; name: string; email: string; phone: string; relation?: string }[];
      setReportTo(others.length ? [
        ...(l?.name ? [{ label: "Landlord", name: l.name, email: l.email ?? "", phone: l.phone ?? "" }] : []),
        ...others.map((o) => ({ label: o.relation ? `${o.label}, ${o.relation}` : o.label, name: o.name, email: o.email, phone: o.phone })),
      ] : []);
      setLandlordName(l?.name ?? picked.landlord ?? "");
      setLandlordEmail(l?.email ?? "");
      setLandlordMobile(l?.phone ?? "");
      setLandlordSkipped(false);
      if (l?.name) got.push("landlord");
      if (l?.email) got.push("landlord's email");
      if (l?.phone) got.push("landlord's mobile");
      setAccess(j.access ?? "");
      if (j.access) got.push("access notes");
      setFilled(got);
    }).catch(() => { if (live) setFilled([]); });
    return () => { live = false; };
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The tenants who go on the job: the ticked ones. The first is the job's
     own tenant, for every screen that still reads one - on a repair, the one
     who reported it. */
  const ticked = useMemo(() => rows.filter((r) => r.on).map(({ on: _on, ...t }) => t), [rows]);
  const lead = planned ? 0 : Math.min(reporter, Math.max(0, ticked.length - 1));
  const onJobCount = ticked.length;
  const onJob = useMemo(() => (lead > 0 ? [ticked[lead], ...ticked.filter((_, i) => i !== lead)] : ticked), [ticked, lead]);

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
    const needle = pq.trim();
    if (!props || needle.length < 2) return [];
    return props.filter((p) => searchMatches(needle, p.name, p.locality)).slice(0, 8);
  }, [props, pq]);

  useEffect(() => {
    /* The floating boxes close themselves on Escape. */
    if (look === "float" && !inline) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, look, inline]);

  /* askQuote: the contractor is asked for a price first and no works order
     goes until the landlord has approved it (Sean, 20 Oct 2026). */
  async function raise(send = false, askQuote = false) {
    const propertyName = picked?.name ?? manual.trim();
    /* Whatever was skipped, the required answers are checked again here, and
       a missing one takes the agent straight to its screen. */
    const gap = steps.find((x) => x.required && missing(x.id));
    if (gap) { jump(gap.id); return setErr(missing(gap.id)); }
    if ((send || askQuote) && !contractorId) return setErr(askQuote ? "Pick a contractor to ask." : "Pick a contractor to send it to.");
    setBusy(true);
    setErr(null);
    const first = onJob[0] ?? null;
    const r = await fetch("/api/works-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind, propertyId: picked?.id ?? null, propertyName, locality: picked?.locality ?? "",
        landlord: landlordName || picked?.landlord || "",
        tenant: first?.name ?? "", tenantPhone: first?.phone ?? "", tenantEmail: first?.email ?? "",
        landlordEmail: landlordSkipped ? "" : landlordEmail, landlordMobile: landlordSkipped ? "" : landlordMobile,
        propertyLat: place.lat, propertyLng: place.lng,
        title, description, category, urgency: kind === "repair" ? urgency : null, dueAt: planned ? new Date(dueAt).toISOString() : null,
        reportedBy, access, contractorId: contractorId || null, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        tenants: onJob, landlordSkipped, send, askQuote, quoteFrom: askQuote ? askIds : undefined,
        tellTenants,
        skipped: steps.filter((x) => skipped.has(x.id)).map((x) => x.title),
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not raise the job.");
    /* The "message sent" moment James asked for, then the job itself. */
    const askedNames = askIds.map((x) => book.find((c) => c.id === x)?.name).filter(Boolean) as string[];
    setSent({ order: r.order, to: askQuote && askedNames.length > 1 ? `${askedNames.length} contractors` : send || askQuote ? contractor?.name ?? "the contractor" : null, quote: askQuote });
    setTimeout(() => onRaised(r.order), 1300);
  }

  /* ── A few questions to a screen ─────────────────────────────────────
     James, 7 Oct 2026: too many questions on one screen are split into
     groups that belong together, which slide across like the presentation's
     questionnaire, then one screen to check it all before it goes. A planned
     job's last screen is the works order itself, as the contractor will get
     it (8 Oct 2026). */
  /* REQUIRED OR OPTIONAL (Howard, 12 Oct 2026: "agents will still bypass
     the system, so unless absolutely required, give them the option to skip
     steps - but make sure any required information is asked for").

     A step is required when the job cannot be worked without what is on it,
     and says why in one line. An optional step has Skip for now; whatever was
     on file stays as it was, the last screen lists it, and the job's timeline
     records it was skipped so it can be filled in on the job.

       Which property       required  the job has to sit on a home
       What's wrong / job   required  the contractor's brief; the category picks the trade
       Urgency / expiry     required  the clock the job is chased against
       Tenants and access   required  someone to ring, or a way in
       The landlord         optional  nothing goes to them when a job is raised;
                                      telling them is the job's first step after */
  const steps: { id: Group; title: string; blurb: string; required: boolean; why: string }[] = [
    ...(picked && !moving ? [] : [{ id: "property" as const, title: "Which property", blurb: moving ? "Pick the right home. Its tenants and landlord fill in again." : "Start typing the address.", required: true, why: "So the job sits on the right home and the contractor knows where to go." }]),
    kind === "repair"
      ? { id: "what", title: "What's wrong", blurb: "In a few words, then whatever the tenant told you.", required: true, why: "So the contractor knows what they're coming to, and the category picks the trade." }
      : { id: "what", title: "The job", blurb: "What needs doing, every category the visit covers, and anything the contractor should know.", required: true, why: "So the contractor knows what the visit covers, and the category picks the trade." },
    kind === "repair"
      ? { id: "urgency", title: "Urgency and contractor", blurb: "How soon a contractor has to attend, and who is doing it.", required: true, why: "The urgency sets how soon the contractor has to attend, and when the job is late." }
      : { id: "when", title: "Expiry and contractor", blurb: "When the current certificate runs out, and who is doing it.", required: true, why: "The expiry date is the deadline the job is chased against." },
    planned
      ? { id: "tenant", title: "Tenants and access", blurb: "The contractor arranges a time with them directly. Untick anyone who shouldn't be on it.", required: true, why: "The contractor needs someone to ring, or a way in, to arrange the visit." }
      : { id: "tenant", title: "Tenants and access", blurb: "Every tenant goes on the works order so the contractor can ring them. Untick anyone who shouldn't be on it.", required: true, why: "The contractor needs someone to ring, or a way in, to arrange the visit." },
    { id: "landlord", title: "The landlord", blurb: "Who the job is reported to, and how they hear about it. Nothing goes to them when you raise it.", required: false, why: "" },
    contractor
      ? { id: "check", title: `Send to ${contractor.name}`, blurb: "This is the works order they'll get. Nothing goes until you press Send.", required: false, why: "" }
      : planned
        ? { id: "check", title: "Check and plan", blurb: "No contractor yet: plan it now and pick one on the job.", required: false, why: "" }
        : { id: "check", title: "Check and report", blurb: "No contractor yet: report it now and pick one on the job.", required: false, why: "" },
  ];
  /* What a required step still needs, in the words the screen says it in. */
  const reachable = onJob.some((t) => t.phone.trim() || t.email.trim()) || access.trim().length > 0;
  function missing(id: Group): string | null {
    if (id === "property") return picked || manual.trim() ? null : "Which property?";
    if (id === "what") {
      if (!title.trim()) return kind === "repair" ? "What is wrong, in a few words?" : "What is the job?";
      return picks.length ? null : "Tick at least one category.";
    }
    if (id === "urgency") return kind === "repair" && !urgency ? "How urgent is it? Pick one." : null;
    if (id === "when") return planned && !dueAt ? "When does it expire?" : null;
    if (id === "tenant") return reachable ? null : "Add someone the contractor can ring, or access notes for how to get in.";
    return null;
  }
  /* The optional steps passed by with Skip for now. Going through one again
     with Continue takes it off the list. */
  const [skipped, setSkipped] = useState<Set<Group>>(new Set());
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
      title, description, category, urgency, dueAt, reportedBy,
      landlordName, landlordEmail, landlordMobile, access, contractorId, scheduledAt, step: moving ? Math.max(0, step - 1) : step,
      tenants: rows, landlordSkipped, tellTenants, ...(planned ? {} : { reporter }),
    }), 700);
    return () => clearTimeout(t);
  }, [title, description, category, urgency, dueAt, reportedBy, landlordName, landlordEmail, landlordMobile, access, contractorId, scheduledAt, step, sent, rows, landlordSkipped, planned, tellTenants, reporter, moving]);
  function go(d: 1 | -1, skip = false) {
    if (d > 0) {
      const gap = here.required ? missing(here.id) : null;
      if (gap) return setErr(gap);
      /* Changed the address: straight back to the last screen to check it. */
      if (here.id === "property" && moving) { backToCheck(); return; }
      setSkipped((cur) => {
        const next = new Set(cur);
        if (skip) next.add(here.id); else next.delete(here.id);
        return next;
      });
    }
    setErr(null);
    setDir(d);
    setStep((n) => Math.max(0, Math.min(steps.length - 1, n + d)));
  }
  const jump = (id: Group) => {
    if (id === "property") { setErr(null); setDir(-1); setMoving(true); setStep(0); return; }
    const i = steps.findIndex((x) => x.id === id);
    if (i < 0) return;
    setErr(null);
    setDir(-1);
    setStep(i);
  };
  const skipLandlord = () => { setLandlordSkipped(true); go(1); };
  const skipForNow = () => go(1, true);
  /* Out of the address and back to the last screen. The address step stays
     in the list only while no home from the book is picked. */
  function backToCheck() {
    setErr(null);
    setMoving(false);
    setDir(1);
    setStep(picked ? steps.length - 2 : steps.length - 1);
  }

  /* The works order, as the contractor will get it. Read when the last
     screen opens, and again if anything on it changed since. */
  const [preview, setPreview] = useState<{ key: string; subject: string; html: string; to: string } | { key: string; error: string } | null>(null);
  const previewKey = JSON.stringify([title, description, category, urgency, dueAt, scheduledAt, access, contractorId, onJob, picked?.id, manual]);
  useEffect(() => {
    if (here.id !== "check" || !contractorId || preview?.key === previewKey) return;
    let live = true;
    fetch("/api/works-orders/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind, urgency: planned ? null : urgency || null,
        title, description, category, access, contractorId, tenants: onJob,
        dueAt: planned ? dueAt || null : null, scheduledAt: scheduledAt || null,
        propertyName: picked?.name ?? manual.trim(), locality: picked?.locality ?? "",
      }),
    }).then((r) => r.json()).then((j) => {
      if (!live) return;
      setPreview(j?.ok ? { key: previewKey, subject: j.subject, html: j.html, to: j.to } : { key: previewKey, error: j?.error ?? "The preview could not be written." });
    }).catch(() => { if (live) setPreview({ key: previewKey, error: "The preview could not be written." }); });
    return () => { live = false; };
  }, [here.id, contractorId, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = kind === "repair" ? REPAIR_CATEGORIES : PLANNED_CATEGORIES;
  /* The floating boxes (look="float", the new-look Contractors page, 25 Oct
     2026): the same screens, questions, checks and buttons, drawn as separate
     cards over a darkened page. Only the class names and the frame change. */
  const F = look === "float" && !inline;
  const field = F ? "nl-fs-input" : "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = F ? "nl-fs-label" : "block text-[10px] font-bold uppercase tracking-wider text-muted";
  const hint = F ? "nl-fs-hint" : "mt-1 text-[11px] leading-snug text-muted";
  const opt = F ? <em> - optional</em> : <span className="font-normal normal-case tracking-normal"> - optional</span>;
  /* A group's box: a card of its own in the floating look, as it was otherwise. */
  const card = (cls: string) => (F ? `nl-fs-card ${cls}` : cls);
  const canSend = !!contractor;
  const contractorHasEmail = !!contractor?.email?.includes("@");
  const back = () => (moving ? backToCheck() : step === 0 ? onClose() : go(-1));

  const fields = (
    <>
          {at("property") && (
          <div className={card("relative sm:col-span-2")}>
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
                      <li key={`${p.id}-${p.name}`}>
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
          <div className={card("sm:col-span-2")}>
            <label className={label}>{kind === "repair" ? "What is wrong" : "The job"}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "repair" ? "Boiler not firing, no hot water" : "Annual gas safety"} className={`mt-1 ${field}`} />
          </div>
          )}

          {at("what") && F && (
            /* The floating look: every category as a tile to tap, with its
               icon, straight on the dark - the same ticks, the same field. */
            <div className="sm:col-span-2">
              <p className="nl-fs-lb mb-2">{planned ? "What the visit covers" : "What kind of job"} <em>- tick as many as it needs</em></p>
              <div className="nl-fs-tiles" role="group" aria-label="Category">
                {cats.map((c) => {
                  const on = picks.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCategory(joinCategories(on ? picks.filter((x) => x !== c) : [...picks, c]))}
                      className={`nl-fs-tile${on ? " is-on" : ""}`}
                    >
                      <span className="nl-fs-tile-i"><CategoryIcon name={c} /></span>
                      <span className="nl-fs-tile-t">{c}</span>
                      {on && (
                        <svg className="nl-fs-tile-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {at("what") && !F && (
          <div className={card("sm:col-span-2")}>
            <label className={label}>Category {F ? <em>- {planned ? "tick as many as the visit covers" : "type to find, tick as many as it needs"}</em> : <span className="font-normal normal-case tracking-normal">- {planned ? "tick as many as the visit covers" : "type to find, tick as many as it needs"}</span>}</label>
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

          {at("urgency") && kind === "repair" && (F ? (
            <div className="sm:col-span-2">
              <p className="nl-fs-lb mb-2">How urgent{!urgency && " - pick one"}</p>
              <div className="nl-fs-choices">
                {URGENCIES.map((u) => (
                  <FloatChoice key={u.id} on={urgency === u.id} onClick={() => setUrgency(u.id)} icon={<CategoryIcon name={u.id === "emergency" ? "bolt" : u.id === "urgent" ? "clock" : "calendar"} />} title={u.label} text={u.blurb} aside={<span className="text-muted">{u.within}</span>} />
                ))}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label className={label}>How urgent{!urgency && <span className="font-normal normal-case tracking-normal"> - pick one</span>}</label>
              <div className="mt-1 flex gap-1.5">
                {URGENCIES.map((u) => (
                  <button key={u.id} type="button" onClick={() => setUrgency(u.id)} title={u.blurb} className={`flex-1 rounded-lg border px-2 py-2 text-[11.5px] ${urgency === u.id ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark" : "border-line/80 text-muted"}`}>
                    {u.label}
                    <span className="block text-[9.5px] font-normal opacity-70">{u.within}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {at("what") && (
          <div className={card("sm:col-span-2")}>
            <label className={label}>Detail{F ? <em> - optional</em> : <span className="font-normal normal-case tracking-normal"> - optional</span>}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={kind === "repair" ? "What the tenant said, where it is, when it started." : "Anything the contractor needs to know."} className={`mt-1 ${field}`} />
          </div>
          )}

          {at("when") && planned && (
            <div className={card("")}>
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
          <div className={card("")}>
            <label className={label}>{planned ? "Raised from" : "Reported by"}</label>
            <FieldSelect className="mt-1" value={reportedBy} onChange={setReportedBy} options={REPORTED_BY.map((r) => ({ value: r, label: r }))} />
            {planned && <p className={hint}>Where this job came from, for the record.</p>}
          </div>
          )}

          {at(planned ? "when" : "urgency") && (
            <div className={F ? "grid gap-3 sm:col-span-2 sm:grid-cols-2" : "grid gap-x-5 gap-y-4 sm:col-span-2 sm:grid-cols-2"}>
              <div className={card("")}>
                <label className={label}>Contractor{opt}</label>
                <ContractorPick contractors={book} value={contractorId} onChange={setContractorId} className={`mt-1 ${field}`} styled onAdd={() => setAddingContractor(true)} />
                <p className={hint}>{contractor ? `${contractor.trade}${contractor.email ? ` · ${contractor.email}` : " · no email on file"}` : "From your book or the company's. Not on there? Add them."}</p>
                {!planned && contractor && (
                  <div className="mt-3">
                    <label className={label}>Ask others for a quote too{opt}</label>
                    <FieldMultiSelect
                      className="mt-1"
                      values={alsoAsk.filter((x) => x !== contractorId)}
                      onChange={setAlsoAsk}
                      placeholder="Just them"
                      options={book.filter((c) => c.active && c.id !== contractorId && c.email?.includes("@")).map((c) => ({ value: c.id, label: `${c.name} · ${c.trade}` }))}
                    />
                    <p className={hint}>Each gets their own link to price it. Whoever&apos;s quote is taken goes on the job.</p>
                  </div>
                )}
              </div>
              <div className={card("")}>
                <label className={label}>Already booked?{opt}</label>
                <FieldDate className="mt-1" withTime clearable value={scheduledAt} onChange={setScheduledAt} placeholder="Not booked yet" />
                <p className={hint}>Only if a date and time are agreed. Otherwise the contractor tells us.</p>
              </div>
              {addingContractor && (
                <div className={F ? "nl-fs-card sm:col-span-2" : "fade-up rounded-2xl border border-line/80 bg-white p-4 sm:col-span-2 sm:p-5"}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold">Add a contractor</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">Saved to your own book as active, and put on this job.</p>
                    </div>
                    <button type="button" onClick={() => setAddingContractor(false)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted hover:text-ink">✕</button>
                  </div>
                  <ContractorForm
                    initial={{ trade: picks.map((c) => CATEGORY_TRADE[c] ?? (planned ? "" : c)).find(Boolean) ?? "" }}
                    canCorporate={false}
                    onClose={() => setAddingContractor(false)}
                    onSaved={(c) => { setAdded((cur) => [c, ...cur.filter((x) => x.id !== c.id)]); setContractorId(c.id); setAddingContractor(false); }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── the tenants: every one in the house, on either kind of job ── */}
          {at("tenant") && (
            <div className={card("sm:col-span-2")}>
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
                    <button type="button" onClick={() => setAdding(null)} className={F ? "nl-btn nl-fs-ghost nl-btn--sm" : "rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted"}>Cancel</button>
                    <button type="button" disabled={!adding.name.trim() && !adding.phone.trim()} onClick={() => { setRows((cur) => [...cur, { ...adding, on: true }]); setAdding(null); }} className={F ? "nl-btn nl-btn--primary nl-btn--sm" : "rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40"}>Add</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding({ name: "", phone: "", email: "" })} className={F ? "nl-btn nl-btn--secondary nl-btn--sm mt-2" : "mt-2 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] hover:border-ink/40"}>+ Add someone</button>
              )}
              {planned && <p className={hint}>The contractor rings them. Tick below to tell them first who&apos;ll be in touch, and you can send them the booking once it&apos;s made.</p>}
            </div>
          )}
          {at("tenant") && !planned && reportedBy === "Tenant" && onJobCount > 1 && (
            <div className={card("")}>
              <label className={label}>Which of them reported it</label>
              <FieldSelect className="mt-1" value={String(lead)} onChange={(v) => setReporter(Number(v))} options={ticked.map((t, i) => ({ value: String(i), label: t.name || "No name", sub: [t.room, t.phone, t.email].filter(Boolean).join(" · ") }))} />
              <p className={hint}>They&apos;re the job&apos;s lead tenant: the booking and the follow-up go to them.</p>
            </div>
          )}
          {at("tenant") && (
            <label className={F ? `nl-fs-card nl-fs-tick-row sm:col-span-2${tellTenants ? " is-on" : ""}` : `flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 sm:col-span-2 ${tellTenants ? "border-accent-dark/50 bg-accent-soft/30" : "border-line/70 bg-white"}`}>
              <input type="checkbox" checked={tellTenants} onChange={(e) => setTellTenants(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{planned ? "Let the tenants know who'll be in touch" : "Let the tenants know"}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                  {planned
                    ? tellTenants
                      ? `Everyone ticked with an email gets a short note when the job goes to ${contractor ? contractor.name : "the contractor"}: they'll be in touch to arrange access. Not sent once a date is already set. They never see the works order.`
                      : "Optional. Tick it to tell the tenants who will be in touch to arrange access. Otherwise the contractor just rings them."
                    : tellTenants
                      ? `Everyone ticked with an email gets a short note: we've had the report${contractor ? ` and ${contractor.name} will be in touch to arrange a time` : ""}. They never see the works order or its notes.`
                      : "A discreet job: nothing automatic goes to the tenants about it, now or later."}
                </span>
              </span>
            </label>
          )}
          {at("tenant") && (
          <div className={card("sm:col-span-2")}>
            <label className={label}>Access notes{onJob.some((t) => t.phone.trim() || t.email.trim()) ? opt : F ? <em> - needed when there&apos;s nobody to ring</em> : <span className="font-normal normal-case tracking-normal"> - needed when there&apos;s nobody to ring</span>}</label>
            <input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Key safe, tenant works days, dog in the garden" className={`mt-1 ${field}`} />
          </div>
          )}

          {/* ── the landlord, or skipped ── */}
          {at("landlord") && landlordSkipped ? (
            <div className={F ? "nl-fs-card nl-fs-row sm:col-span-2" : "flex items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-white px-4 py-3 sm:col-span-2"}>
              <p className="text-[12.5px]"><strong>Skipped.</strong> {landlordName || "The landlord"} isn&apos;t involved and won&apos;t be emailed about this job.</p>
              <button type="button" onClick={() => setLandlordSkipped(false)} className="shrink-0 text-[12px] text-muted underline underline-offset-2 hover:text-ink">Undo</button>
            </div>
          ) : (
            <>
              {at("landlord") && reportTo.length > 1 && (
              <div className={card("sm:col-span-2")}>
                <p className={label}>Who to report it to</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {reportTo.map((o) => {
                    const on = o.name === landlordName && o.email === landlordEmail;
                    return (
                      <button
                        key={`${o.label}-${o.name}`}
                        type="button"
                        aria-pressed={on}
                        onClick={() => { setLandlordName(o.name); setLandlordEmail(o.email); setLandlordMobile(o.phone); }}
                        className={`rounded-full border px-3 py-1.5 text-left text-[12px] transition-colors ${on ? "border-accent-dark bg-accent-dark text-page" : "border-line/80 bg-white hover:border-ink"}`}
                      >
                        <span className="font-semibold">{o.name}</span> <span className={on ? "opacity-80" : "text-muted"}>· {o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              )}
              {at("landlord") && (
              <div className={card("")}>
                <label className={label}>Landlord</label>
                <input value={landlordName} onChange={(e) => setLandlordName(e.target.value)} placeholder="Their name" className={`mt-1 ${field}`} />
              </div>
              )}
              {at("landlord") && (
              <div className={card("")}>
                <label className={label}>Landlord&apos;s email</label>
                <input type="email" value={landlordEmail} onChange={(e) => setLandlordEmail(e.target.value)} placeholder="For the report and approvals" className={`mt-1 ${field}`} />
              </div>
              )}
              {at("landlord") && (
              <div className={card("")}>
                <label className={label}>Landlord&apos;s mobile</label>
                <input value={landlordMobile} onChange={(e) => setLandlordMobile(e.target.value)} placeholder="To ring them first" className={`mt-1 ${field}`} />
              </div>
              )}
              {stepped && at("landlord") && (
                landlordEmail.includes("@") ? (
                  <LandlordJobEmails key={landlordEmail} landlord={landlordEmail} name={landlordName || "the landlord"} className={F ? "nl-fs-card sm:col-span-2" : "rounded-xl border border-line/60 bg-white px-4 py-3 sm:col-span-2"} />
                ) : (
                  <p className={F ? "nl-fs-card m-0 text-[12.5px] text-muted sm:col-span-2" : "rounded-xl border border-line/60 bg-white px-4 py-3 text-[12px] text-muted sm:col-span-2"}>No email for the landlord, so they won&apos;t be emailed about this job - ring them.</p>
                )
              )}
            </>
          )}

          {/* ── the last screen: check it, and on a planned job, the works order ── */}
          {stepped && at("check") && skipped.size > 0 && (
            <div className={F ? "nl-fs-card sm:col-span-2" : "rounded-xl border border-dashed border-line bg-white px-4 py-3 sm:col-span-2"}>
              <p className="text-[12.5px] font-semibold">Skipped for now</p>
              <ul className="mt-1.5 space-y-1.5">
                {steps.filter((x) => skipped.has(x.id)).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="min-w-0 text-muted">{x.title}: not checked. It goes as it&apos;s on file and the job notes it was skipped, so you can fill it in there.</span>
                    <button type="button" onClick={() => jump(x.id)} className="shrink-0 text-[11.5px] font-semibold underline underline-offset-2 hover:text-accent-dark">Add now</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stepped && at("check") && (
            <dl className={F ? "nl-fs-card is-tight m-0 divide-y divide-line/50 text-[12.5px] sm:col-span-2" : "divide-y divide-line/50 overflow-hidden rounded-xl border border-line/60 bg-white text-[12.5px] sm:col-span-2"}>
              {([
                ["Property", "property", [picked ? `${picked.name}${picked.locality ? `, ${picked.locality}` : ""}` : manual.trim() || "—"].join("")],
                [steps.find((x) => x.id === "what")!.title, "what", [title || "—", category, description].filter(Boolean).join(" · ")],
                kind === "repair"
                  ? ["Urgency and contractor", "urgency", [URGENCIES.find((u) => u.id === urgency)?.label ?? "urgency not picked", `reported by ${reportedBy.toLowerCase()}`, contractor?.name ?? "no contractor yet", scheduledAt ? `booked ${sayDate(scheduledAt, true)}` : null].filter(Boolean).join(" · ")]
                  : ["Expiry and contractor", "when", [dueAt ? `expires ${sayDate(dueAt)}` : "—", contractor?.name ?? "no contractor yet", scheduledAt ? `booked ${sayDate(scheduledAt, true)}` : null].filter(Boolean).join(" · ")],
                ["Tenants", "tenant", [
                  onJob.length ? onJob.map((t) => `${t.name}${t.room ? ` (${t.room})` : ""}`).join(", ") : "none on the works order",
                  planned
                    ? tellTenants ? (onJob.some((t) => t.email) ? "told who will be in touch about access" : "no emails to tell them") : null
                    : tellTenants ? (onJob.some((t) => t.email) ? "told a contractor is coming" : "no emails to tell them") : "not told - discreet",
                  access ? `access: ${access}` : null,
                ].filter(Boolean).join(" · ")],
                ["Landlord", "landlord", landlordSkipped ? "Skipped - not involved, not emailed" : [landlordName || "—", landlordEmail ? `emailed at ${landlordEmail}` : "not emailed", landlordMobile || null].filter(Boolean).join(" · ")],
              ] as [string, Group, string][]).map(([k, g, v]) => (
                <div key={g} className={F ? "flex items-start gap-3 py-3" : "flex items-start gap-3 px-3.5 py-2.5"}>
                  <div className="min-w-0 flex-1">
                    <dt className={F ? "flex items-center gap-2 text-[12px] text-muted" : "flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted"}>
                      {k}
                      {skipped.has(g) && <span className={F ? "text-[11.5px] text-[var(--warning)]" : "rounded-full border border-line/80 px-2 py-0.5 text-[9.5px]"}>Skipped</span>}
                    </dt>
                    <dd className={F ? "m-0 mt-0.5 break-words text-[13.5px]" : "mt-0.5 break-words"}>{skipped.has(g) ? `Not checked - as on file: ${v}` : v}</dd>
                  </div>
                  <button type="button" onClick={() => jump(g)} className="shrink-0 text-[11px] text-muted underline underline-offset-2 hover:text-ink">{skipped.has(g) ? "Add now" : "Change"}</button>
                </div>
              ))}
            </dl>
          )}
          {stepped && at("check") && canSend && (
            <div className={card("sm:col-span-2")}>
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
    </>
  );

  const onEnter = stepped ? (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
    e.preventDefault();
    if (!last) go(1);
  } : undefined;

  if (F) {
    const sendTo = canSend && contractorHasEmail;
    return (
      <FloatSheet
        title={kind === "repair" ? "Report a Repair" : "Plan a Certificate"}
        step={step + 1}
        steps={sent ? undefined : steps.length}
        onBack={sent ? undefined : moving || step > 0 ? back : undefined}
        onClose={onClose}
        dismissible={!busy}
        screenKey={sent ? "sent" : `${here.id}${moving ? "-moving" : ""}`}
        question={sent ? undefined : here.title}
        lede={sent ? undefined : here.blurb}
        foot={sent ? undefined : (
          <FloatFoot
            left={err ? <span className="nl-fs-err" role="alert">{err}</span> : here.id === "check" ? <span>{canSend ? "Nothing goes until you press Send." : "Pick a contractor on the job when you're ready."}</span> : (
              <>
                <span>{here.required ? "Required" : "Optional"}</span>
                {!here.required && !last && <button type="button" onClick={skipForNow} className="nl-link" title="Move on without checking this screen. You can add it on the job later.">Skip for now</button>}
              </>
            )}
          >
            {!last ? (
              <>
                <button type="button" onClick={back} className="nl-btn nl-fs-ghost">{step === 0 && !moving ? "Cancel" : "Back"}</button>
                {here.id === "landlord" && !landlordSkipped && (
                  <button type="button" onClick={skipLandlord} className="nl-btn nl-btn--secondary" title="They aren't involved: no emails to them about this job">Not involved</button>
                )}
                <button type="button" onClick={() => go(1)} className="nl-btn nl-btn--primary">
                  Continue
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </>
            ) : sendTo ? (
              <>
                <button type="button" onClick={() => go(-1)} className="nl-btn nl-fs-ghost">Back</button>
                <button type="button" disabled={busy} onClick={() => void raise(false)} className="nl-btn nl-fs-ghost" title="The job goes on the board; nothing is sent to the contractor">
                  {planned ? "Plan it without sending" : "Report it without sending"}
                </button>
                {!planned && <button type="button" disabled={busy} onClick={() => void raise(false, true)} className="nl-btn nl-btn--secondary" title="They're emailed for a price. No works order goes until the landlord has approved it">
                  {askIds.length > 1 ? `Ask ${askIds.length} contractors for a quote` : `Ask ${contractor!.name} for a quote`}
                </button>}
                <button type="button" disabled={busy} onClick={() => void raise(true)} className="nl-btn nl-btn--primary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  {busy ? "Sending…" : `Send to ${contractor!.name}`}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => go(-1)} className="nl-btn nl-fs-ghost">Back</button>
                <button type="button" disabled={busy} onClick={() => void raise(false)} className="nl-btn nl-btn--primary">
                  {busy ? "Raising…" : kind === "repair" ? "Report it" : "Plan it"}
                </button>
              </>
            )}
          </FloatFoot>
        )}
      >
        {sent ? (
          <FloatDone title={sent.quote ? `Quote asked from ${sent.to}` : sent.to ? `Sent to ${sent.to}` : kind === "repair" ? "Repair reported" : "Job planned"}>
            {sent.quote
              ? "Nothing is booked. The landlord approves the price before any works order goes."
              : kind === "repair"
              ? `${sent.to ? "They'll arrange a time with the tenants. " : ""}${tellTenants && onJob.some((t) => t.email) ? "The tenants have been told. " : ""}${landlordSkipped ? "" : "Now the landlord."}`
              : sent.to
                ? `They'll arrange a time with the tenants and tell us the date.${tellTenants && !scheduledAt && onJob.some((t) => t.email) ? " The tenants have been told to expect them." : ""}`
                : "Pick a contractor on the job when you're ready."}
          </FloatDone>
        ) : (
          <>
            {here.id !== "check" && (
              <p className="nl-fs-say">{here.required ? here.why : "You can skip this for now and add it on the job later."}</p>
            )}
            <div className="nl-fs-cols" onKeyDown={onEnter}>{fields}</div>
          </>
        )}
      </FloatSheet>
    );
  }

  return (
    <div className={inline ? "contents" : "fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center"}>
      {!inline && <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />}
      <div className={inline ? "relative" : "fade-up relative w-full max-w-2xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"}>
        {sent && (
          <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-page/95`}>
            <span className="fade-up flex h-16 w-16 items-center justify-center rounded-full bg-ink text-page">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </span>
            <p className="hand mt-4 text-[22px]">{sent.quote ? `Quote asked from ${sent.to}` : sent.to ? `Sent to ${sent.to}` : kind === "repair" ? "Repair reported" : "Job planned"}</p>
            <p className="mt-1 text-[12px] text-muted">
              {sent.quote
                ? "Nothing is booked. The landlord approves the price before any works order goes."
                : kind === "repair"
                ? `${sent.to ? "They'll arrange a time with the tenants. " : ""}${tellTenants && onJob.some((t) => t.email) ? "The tenants have been told. " : ""}${landlordSkipped ? "" : "Now the landlord."}`
                : sent.to
                  ? `They'll arrange a time with the tenants and tell us the date.${tellTenants && !scheduledAt && onJob.some((t) => t.email) ? " The tenants have been told to expect them." : ""}`
                  : "Pick a contractor on the job when you're ready."}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{kind === "repair" ? "Repair" : "Planned maintenance"}</p>
            <h2 className="mt-1 text-[22px] leading-tight">{kind === "repair" ? "Report a repair" : "Plan a certificate"}</h2>
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
          onKeyDown={onEnter}
        >
          {stepped && (
            <div className="sm:col-span-2">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                {step + 1} of {steps.length}
                {here.id !== "check" && (
                  <span className={`rounded-full px-2 py-0.5 text-[9.5px] tracking-wider ${here.required ? "bg-accent-soft/70 text-accent-dark" : "border border-line/80 text-muted"}`}>
                    {here.required ? "Required" : "Optional"}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[16px] font-semibold leading-tight">{here.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{here.blurb}</p>
              {here.id !== "check" && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
                  <DoodleIcon name={here.required ? "info" : "clock"} size={13} className="mt-px" />
                  {here.required ? here.why : "You can skip this for now and add it on the job later."}
                </p>
              )}
            </div>
          )}
          {fields}
        </div>

        {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
        {stepped && !last ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={back} className="whitespace-nowrap rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink">
              {step === 0 && !moving ? "Cancel" : "Back"}
            </button>
            {/* On a phone the skip sits on its own line under the buttons,
                so Continue never runs off the edge of the sheet. */}
            {!here.required && (
              <button type="button" onClick={skipForNow} className="order-last w-full whitespace-nowrap py-1 text-right text-[12.5px] text-muted underline underline-offset-2 hover:text-ink sm:hidden">
                Skip for now
              </button>
            )}
            <span className="ml-auto flex items-center gap-2">
              {!here.required && (
                <button type="button" onClick={skipForNow} className="hidden whitespace-nowrap px-3 py-2 text-[12.5px] text-muted underline underline-offset-2 hover:text-ink sm:inline" title="Move on without checking this screen. You can add it on the job later.">
                  Skip for now
                </button>
              )}
              {here.id === "landlord" && !landlordSkipped && (
                <button type="button" onClick={skipLandlord} className="whitespace-nowrap rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] hover:border-ink/40" title="They aren't involved: no emails to them about this job">
                  Not involved
                </button>
              )}
              <PressButton onClick={() => go(1)} className="whitespace-nowrap rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                Continue
              </PressButton>
            </span>
          </div>
        ) : (
          <div className={`mt-5 flex flex-wrap items-center gap-2 ${stepped ? "justify-between" : "justify-end"}`}>
            <button type="button" onClick={() => (stepped ? go(-1) : onClose())} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink">{stepped ? "Back" : "Cancel"}</button>
            {canSend && contractorHasEmail ? (
              <span className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy} onClick={() => void raise(false)} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] hover:border-ink/40 disabled:opacity-50" title="The job goes on the board; nothing is sent to the contractor">
                  {planned ? "Plan it without sending" : "Report it without sending"}
                </button>
                {!planned && <button type="button" disabled={busy} onClick={() => void raise(false, true)} className="rounded-full border border-ink/70 bg-white px-4 py-2 text-[12.5px] font-semibold hover:bg-panel disabled:opacity-50" title="They're emailed for a price. No works order goes until the landlord has approved it">
                  {askIds.length > 1 ? `Ask ${askIds.length} contractors for a quote` : `Ask ${contractor!.name} for a quote`}
                </button>}
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
