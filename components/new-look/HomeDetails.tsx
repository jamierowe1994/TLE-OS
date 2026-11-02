"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import FieldSelect from "@/components/FieldSelect";
import FieldDate from "@/components/FieldDate";
import { Ico } from "@/components/new-look/Parts";
import { toast } from "@/lib/toast";
import { CHOICES, type HomeFacts } from "@/lib/home-facts-shared";
import {
  FIELD_LABEL,
  LET_TYPES,
  SERVICE_CHOICES,
  SERVICE_LABEL,
  isServiceLevel,
  serviceLevelOf,
  type OverrideField,
  type ServiceLevel,
  type OverrideLogEntry,
  type OverrideTenant,
} from "@/lib/home-overrides-shared";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";

/**
 * THE DETAILS, WITH ONE EDIT (2 Nov 2026, lib/home-overrides).
 *
 * James: about 40% of the agents' tickets were "I can't change this field"
 * or "the details didn't pull through". The details stay fixed until Edit
 * (as the lead's and the appraisal's do), then every field the agent might
 * need to put right opens at once: the service, the let type, the tenancy's
 * dates, the type of home and its gas, who lives there, and - for Michael
 * and the owners - that it is no longer managed. Save sends only what
 * changed. What is saved is the OS's answer and is never written to REX;
 * where REX still says something else the field says so, quietly, with a
 * way back to REX's.
 */

type Marks = NonNullable<ManagedProperty["overridden"]>;
type Mark = { by: string; at: string; was: string | null };

export interface DetailRow {
  key: string;
  label: string;
  text: string;
  quiet?: boolean;
  title?: string;
  /** The field of the OS's answers this row shows, so it can say REX differs. */
  field?: OverrideField;
}

type Loaded = {
  canEdit: boolean;
  canEnd: boolean;
  factsKey: string | null;
  values: Partial<Record<OverrideField, unknown>>;
  facts: HomeFacts | null;
  factsBook: { hmo: boolean; hasGas: boolean } | null;
  log: OverrideLogEntry[];
};

type Draft = {
  service: string;
  letType: string;
  tenancyStart: string;
  tenancyEnd: string;
  rolling: boolean;
  homeType: string;
  gasSupply: string;
  ended: boolean;
  reason: string;
  tenants: OverrideTenant[];
};

const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const tenantsOf = (list: Party[]): OverrideTenant[] => list.map((t) => ({ name: t.name, email: t.email ?? null, phone: t.phone ?? null }));
const sameTenants = (a: OverrideTenant[], b: OverrideTenant[]) =>
  JSON.stringify(a.map((t) => [t.name.trim(), (t.email ?? "").trim(), (t.phone ?? "").trim()])) === JSON.stringify(b.map((t) => [t.name.trim(), (t.email ?? "").trim(), (t.phone ?? "").trim()]));

/** "Changed by Rhiannon, 1 Nov · was Let Only" under a field the OS put right. Agent screens never name REX. */
function Was({ mark }: { mark?: Mark | null; source?: string }) {
  if (!mark) return null;
  return (
    <small className="nl-fact-was" title={`Changed by ${mark.by}, ${stamp(mark.at)}.`}>
      Changed by {mark.by.split(" ")[0]}, {short(mark.at)}
      {mark.was ? ` · was ${mark.was}` : ""}
    </small>
  );
}

export default function HomeDetails({
  listingId,
  label,
  endListingIds,
  rows,
  current,
  marks,
  tenancySet,
  letFieldsOff,
  test,
  more,
  onSaved,
  onEnded,
  onResign,
}: {
  listingId: string;
  /** "12 High Street, Filton", for the archive's record. */
  label: string;
  /** The lets taken off management together: the room, or every let of the house. */
  endListingIds: string[];
  /** The fixed view, as the page reads it. Type of home and Gas are added here. */
  rows: DetailRow[];
  /** The values the form opens on - the book's row, which already carries the OS's answers. */
  current: { service: string | null; letType: string | null; letSince: string | null; tenancyEnd: string | null | undefined; tenants: Party[] };
  marks: Marks | undefined;
  /** The tenancy route's word on whose dates they are (PayProp's or the OS's). */
  tenancySet: { start: Mark | null; end: Mark | null } | null;
  /** Why the let's fields can't be changed from here (a house of rooms), or null. */
  letFieldsOff: string | null;
  test: boolean;
  more?: ReactNode;
  onSaved: () => void;
  onEnded: () => void;
  /** Yes to "Do you need to re-sign a new contract?": open the terms to send, on this service. */
  onResign?: (service: string) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [back, setBack] = useState<Set<OverrideField>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [allLog, setAllLog] = useState(false);
  /* The service just changed: does the landlord sign new terms? Asked once, straight after Save. */
  const [ask, setAsk] = useState<{ level: ServiceLevel; words: string } | null>(null);
  const [answering, setAnswering] = useState(false);
  /* Brought into view once, when it appears. */
  const askInView = useCallback((el: HTMLDivElement | null) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }), []);

  async function noContract() {
    if (!ask) return;
    setAnswering(true);
    try {
      const r = await fetch("/api/property/details", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listing: listingId, contract: "no", service: ask.level }) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) { toast(j?.error ?? "That didn't save. Try again.", "bad"); return; }
      setData(j);
      setAsk(null);
      toast("Noted on the home: no new contract needed");
    } catch {
      toast("That didn't go through. Try again.", "bad");
    } finally {
      setAnswering(false);
    }
  }

  const load = useCallback(() => {
    if (test) return;
    fetch(`/api/property/details?listing=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) { setData(j); setLoadErr(null); }
        else setLoadErr(j?.error ?? "The home's details couldn't be read.");
      })
      .catch(() => setLoadErr("The home's details couldn't be read."));
  }, [listingId, test]);
  useEffect(() => {
    setData(null);
    setEditing(false);
    load();
  }, [load]);

  /* What the form opens on, and so what counts as a change. */
  const start = useMemo<Draft | null>(() => {
    if (!data) return null;
    const f = data.facts;
    const fb = data.factsBook;
    return {
      service: (isServiceLevel(data.values.service) ? data.values.service : serviceLevelOf(current.service)) ?? "",
      letType: current.letType ?? "",
      tenancyStart: current.letSince ? current.letSince.slice(0, 10) : "",
      tenancyEnd: current.tenancyEnd ?? "",
      rolling: current.tenancyEnd === null,
      homeType: f?.homeType ?? (fb ? (fb.hmo ? "hmo" : "single") : ""),
      gasSupply: f?.gasSupply ?? (fb ? (fb.hasGas ? "gas" : "none") : ""),
      ended: false,
      reason: "",
      tenants: tenantsOf(current.tenants),
    };
  }, [data, current.service, current.letType, current.letSince, current.tenancyEnd, current.tenants]);

  const begin = () => {
    if (!start) return;
    setDraft({ ...start, tenants: start.tenants.length ? start.tenants : [] });
    setBack(new Set());
    setErr(null);
    setEditing(true);
  };
  const stop = () => { setEditing(false); setDraft(null); setBack(new Set()); setErr(null); };

  /* Only what changed is sent; a field sent back to REX goes as null. */
  const body = useMemo(() => {
    if (!draft || !start) return null;
    const b: Record<string, unknown> = {};
    for (const f of back) b[f] = null;
    if (!back.has("service") && draft.service && draft.service !== start.service) b.service = draft.service;
    if (!back.has("letType") && draft.letType && draft.letType !== start.letType) b.letType = draft.letType;
    if (!letFieldsOff) {
      if (!back.has("tenancyStart") && draft.tenancyStart && draft.tenancyStart !== start.tenancyStart) b.tenancyStart = draft.tenancyStart;
      if (!back.has("tenancyEnd")) {
        if (draft.rolling && !start.rolling) b.tenancyEnd = "rolling";
        else if (!draft.rolling && draft.tenancyEnd && (draft.tenancyEnd !== start.tenancyEnd || start.rolling)) b.tenancyEnd = draft.tenancyEnd;
      }
      if (!back.has("tenants") && !sameTenants(draft.tenants.filter((t) => t.name.trim() || t.email || t.phone), start.tenants)) b.tenants = draft.tenants;
    }
    if (draft.homeType && draft.homeType !== start.homeType) b.homeType = draft.homeType;
    if (draft.gasSupply && draft.gasSupply !== start.gasSupply) b.gasSupply = draft.gasSupply;
    if (draft.ended) b.end = { listingIds: endListingIds, label, reason: draft.reason };
    return b;
  }, [draft, start, back, letFieldsOff, endListingIds, label]);
  const dirty = Boolean(body && Object.keys(body).length);

  async function save() {
    if (!body || !dirty) return;
    if (draft?.ended && !draft.reason.trim()) { setErr("Say why it is no longer managed: sold, management ended, or what happened."); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/property/details", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listing: listingId, ...body }) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error ?? "That didn't save. Try again in a minute."); return; }
      if (j.ended) {
        toast("Taken off management. It can be put back from the home's page");
        stop();
        onEnded();
        return;
      }
      /* A new service: ask straight away whether the landlord signs new terms (James, 2 Nov 2026). */
      if ("service" in body && onResign) {
        const level = typeof body.service === "string" ? body.service : serviceLevelOf(markOf("service")?.was ?? null);
        const words = level && isServiceLevel(level) ? SERVICE_LABEL[level] : null;
        if (words && level !== start?.service) setAsk({ level: level as ServiceLevel, words });
      }
      setData(j);
      stop();
      toast("The home's details are saved");
      onSaved();
    } catch {
      setErr("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const sendBack = (f: OverrideField) => setBack((s) => new Set(s).add(f));
  const keep = (f: OverrideField) => setBack((s) => { const n = new Set(s); n.delete(f); return n; });
  /* The start is said against PayProp's where PayProp has one, else REX's let date. */
  const payStart = Boolean(tenancySet?.start?.was);
  const markOf = (f: OverrideField): Mark | null =>
    f === "tenancyStart" ? (payStart ? tenancySet!.start : marks?.tenancyStart ?? tenancySet?.start ?? null) : f === "tenancyEnd" ? tenancySet?.end ?? null : marks?.[f] ?? null;
  const sourceOf = (f: OverrideField | null | undefined) => (f === "tenancyEnd" || (f === "tenancyStart" && payStart) ? "PayProp" : "REX");

  /* Type of home and Gas, as the certificates read them. */
  const facts = data?.facts ?? null;
  const fb = data?.factsBook ?? null;
  /* Short words for the fixed view, where a long one is cut off. */
  const typeText = facts?.homeType ? (facts.homeType === "hmo" ? "HMO" : "Not an HMO") : fb ? (fb.hmo ? "HMO" : "Not an HMO") : null;
  const gasText = facts?.gasSupply ? (facts.gasSupply === "gas" ? "Yes" : "None") : fb ? (fb.hasGas ? "Yes" : "None") : null;
  const factMark = (k: "homeType" | "gasSupply"): Mark | null => {
    const s = facts?.setBy?.[k];
    if (!s) return null;
    const rec = k === "homeType" ? (fb ? (fb.hmo ? "HMO" : "Not an HMO") : null) : fb ? (fb.hasGas ? "gas" : "no gas") : null;
    return { by: s.by, at: s.at, was: rec && rec !== (k === "homeType" ? typeText : gasText === "Yes" ? "gas" : "no gas") ? rec : null };
  };
  const shown: (DetailRow & { mark?: Mark | null; source?: string })[] = [
    ...rows.map((r) => ({ ...r, mark: r.field ? markOf(r.field) : null, source: sourceOf(r.field) })),
    ...(data?.factsKey
      ? [
          { key: "homeType", label: "Type of home", text: typeText ?? "Not known", quiet: !typeText, mark: factMark("homeType"), source: "The record" },
          { key: "gas", label: "Gas supply", text: gasText ?? "Not known", quiet: !gasText, mark: factMark("gasSupply"), source: "The record" },
        ]
      : []),
  ];

  const canEdit = Boolean(data?.canEdit) && !test;
  const log = data?.log ?? [];

  /* One field in the form: its label, the control, and REX's word on it. */
  const field = (f: OverrideField | null, title: string, control: ReactNode, opts: { wide?: boolean; off?: string | null; hint?: ReactNode } = {}) => {
    const m = f ? markOf(f) : null;
    const goingBack = f ? back.has(f) : false;
    return (
      <div className={`nl-fact${opts.wide ? " is-wide" : ""}`}>
        <span>{title}</span>
        {opts.off ? (
          <p className="nl-hint">{opts.off}</p>
        ) : goingBack ? (
          <p className="nl-hint">
            Back to the original{m?.was ? `: ${m.was}` : ""}, on save.{" "}
            <button type="button" className="nl-link" onClick={() => f && keep(f)}>Keep the OS&apos;s</button>
          </p>
        ) : (
          <div className="nl-fact-in">{control}</div>
        )}
        {!opts.off && !goingBack && m && (
          <small className="nl-fact-was">
            {m.was ? `Was ${m.was}. ` : ""}
            <button type="button" className="nl-link" onClick={() => f && sendBack(f)}>Put the original back</button>
          </small>
        )}
        {opts.hint && <small className="nl-fact-was">{opts.hint}</small>}
      </div>
    );
  };

  return (
    <section className={`nl-facts${editing ? " is-editing nl-home-edit" : ""}`}>
      <div className="nl-facts-head">
        <h3 className="nl-block-title">The Details</h3>
        {editing ? (
          <span className="nl-facts-flag"><i /> Editing</span>
        ) : canEdit ? (
          <button type="button" className="nl-link" onClick={begin} disabled={!start}>
            <Ico name="pen" size={13} /> Edit
          </button>
        ) : !data && !loadErr && !test ? (
          <span className="nl-meta inline-flex items-center gap-1.5"><span className="nl-leads-spin" aria-hidden /> Reading</span>
        ) : null}
      </div>

      {!editing || !draft ? (
        <>
          {/* Straight after a change of service (James, 2 Nov 2026), first thing under the title. */}
          {ask && (
            <div ref={askInView} className="nl-home-ask" role="dialog" aria-label="Do you need to re-sign a new contract?">
              <p className="nl-strong">Do you need to re-sign a new contract?</p>
              <p className="nl-hint">The service is now {ask.words}. If the landlord&apos;s signed terms say otherwise, send new ones on {ask.words}: they replace the old ones once signed.</p>
              <div className="nl-home-ask-acts">
                <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={answering} onClick={() => void noContract()}>
                  {answering ? "Saving…" : "No"}
                </button>
                <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={answering} onClick={() => { const w = ask.words; setAsk(null); onResign?.(w); }}>
                  Yes, send new terms
                </button>
              </div>
            </div>
          )}
          <div className="nl-facts-grid">
            {shown.map((r) => (
              <div key={r.key} className="nl-fact">
                <span>{r.label}</span>
                <b className={r.quiet ? "is-quiet" : ""} title={r.title}>{r.text}</b>
                <Was mark={r.mark} />
              </div>
            ))}
          </div>
          {more}
          {loadErr && <p className="nl-hint mt-2">{loadErr}</p>}
          {log.length > 0 && (
            <div className="nl-home-log">
              <p className="nl-meta">Changed in the OS</p>
              <ul>
                {(allLog ? log : log.slice(0, 3)).map((e) => (
                  <li key={e.id}>
                    <b>{FIELD_LABEL[e.field] ?? e.field}</b>
                    {e.to == null ? ` put back to the original${e.from ? ` (was ${e.from})` : ""}` : e.from ? `: ${e.from} to ${e.to}` : `: ${e.to}`}
                    <span> · {e.by}, {stamp(e.at)}</span>
                  </li>
                ))}
              </ul>
              {log.length > 3 && (
                <button type="button" className="nl-link" onClick={() => setAllLog((x) => !x)}>{allLog ? "Show fewer" : `Show all ${log.length}`}</button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="nl-hint nl-home-edit-lead">What you save here shows on every screen.</p>
          <div className="nl-facts-grid nl-home-edit-grid">
            {field("service", "Service",
              <FieldSelect value={draft.service} onChange={(v) => set("service", v)} options={SERVICE_CHOICES.map((c) => ({ value: c.value, label: c.label, sub: c.sub }))} placeholder="Choose the service" />)}
            {field("letType", "Let type",
              <FieldSelect value={draft.letType} onChange={(v) => set("letType", v)} options={LET_TYPES.map((t) => ({ value: t, label: t }))} placeholder="Choose the let type" />)}
            {data?.factsKey
              ? field(null, "Type of home",
                  <FieldSelect value={draft.homeType} onChange={(v) => set("homeType", v)} options={CHOICES.homeType.map((c) => ({ value: c.value, label: c.label, sub: c.sub }))} placeholder="Choose" />,
                  { hint: draft.homeType !== start?.homeType ? (draft.homeType === "single" ? "No HMO licence, fire risk assessment, PAT or alarm checks will be asked for." : "The HMO licence, fire risk assessment, PAT and alarm checks will be asked for.") : null })
              : null}
            {field("tenancyStart", "Tenancy start",
              <FieldDate value={draft.tenancyStart} onChange={(v) => set("tenancyStart", v)} placeholder="Choose the day" />,
              { off: letFieldsOff })}
            {field("tenancyEnd", "Tenancy end",
              <div className="nl-home-end">
                {!draft.rolling && <FieldDate value={draft.tenancyEnd} onChange={(v) => set("tenancyEnd", v)} placeholder="Choose the day" min={draft.tenancyStart || undefined} />}
                <label className="nl-home-check">
                  <input type="checkbox" checked={draft.rolling} onChange={(e) => set("rolling", e.target.checked)} /> Rolling, no end date
                </label>
              </div>,
              { off: letFieldsOff })}
            {data?.factsKey
              ? field(null, "Gas supply",
                  <FieldSelect value={draft.gasSupply} onChange={(v) => set("gasSupply", v)} options={CHOICES.gasSupply.map((c) => ({ value: c.value, label: c.label, sub: c.sub }))} placeholder="Choose" />,
                  { hint: draft.gasSupply !== start?.gasSupply ? (draft.gasSupply === "none" ? "No gas safety certificate will be asked for." : "A gas safety certificate will be asked for every 12 months.") : null })
              : null}

            {field("tenants", "Who lives here",
              <div className="nl-home-tenants">
                {draft.tenants.map((t, i) => (
                  <div key={i} className="nl-home-tenant">
                    <input value={t.name} placeholder="Full name" aria-label={`Tenant ${i + 1} name`} onChange={(e) => set("tenants", draft.tenants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input type="tel" value={t.phone ?? ""} placeholder="Mobile" aria-label={`Tenant ${i + 1} mobile`} onChange={(e) => set("tenants", draft.tenants.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                    <input type="email" value={t.email ?? ""} placeholder="Email" aria-label={`Tenant ${i + 1} email`} onChange={(e) => set("tenants", draft.tenants.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                    <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label={`Take ${t.name || "this tenant"} off`} onClick={() => set("tenants", draft.tenants.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                {!draft.tenants.length && <p className="nl-hint">Nobody. Save like this if the home is empty.</p>}
                <button type="button" className="nl-link self-start" onClick={() => set("tenants", [...draft.tenants, { name: "", email: null, phone: null }])}>
                  <Ico name="plus" size={13} /> Add a tenant
                </button>
              </div>,
              { wide: true, off: letFieldsOff, hint: letFieldsOff ? null : "Only if the record names the wrong people. To change a tenant's number or email, use Edit on their card." })}

            {/* No longer managed is the archive (lib/archived-homes): the home's own agent, Michael, Susan and the owners (2 Nov 2026). */}
            {field(null, "Management",
              data?.canEnd ? (
                <FieldSelect
                  value={draft.ended ? "ended" : "ours"}
                  onChange={(v) => set("ended", v === "ended")}
                  options={[
                    { value: "ours", label: "Managed by us", sub: "On Portfolio, inspections and compliance" },
                    { value: "ended", label: "No longer managed", sub: "Sold, or management ended. Comes off everywhere, can be put back" },
                  ]}
                />
              ) : (
                <p className="nl-hint">Managed by us. Taking a home off management is for its own agent, Michael, Susan and the owners: ask one of them, and add a note saying why.</p>
              ),
              { wide: true })}

            {draft.ended && (
              <div className="nl-fact is-wide">
                <span>Why it is no longer managed</span>
                <div className="nl-fact-in">
                  <input value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Sold, management ended, landlord took it back..." maxLength={300} aria-label="Why it is no longer managed" />
                </div>
                <small className="nl-fact-was">
                  It comes off Portfolio, inspections, the compliance desk, the rent figures and search for everyone{endListingIds.length > 1 ? ", every room with it" : ""}. Nothing is deleted, and it can be put back from the home&apos;s page.
                </small>
              </div>
            )}
          </div>

          {err && <p className="nl-prop-err mt-2" role="alert">{err}</p>}
          {dirty || busy ? (
            <div className="nl-saverow">
              <span className="nl-saverow-dot" />
              <span>{busy ? "Saving…" : "Not saved yet"}</span>
              <span className="flex-1" />
              <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={busy} onClick={stop}>Cancel</button>
              <button type="button" className={`nl-btn nl-btn--sm ${draft.ended ? "nl-btn--danger" : "nl-btn--primary"}`} disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : draft.ended ? "Save and take off management" : "Save changes"}
              </button>
            </div>
          ) : (
            <button type="button" className="nl-link mt-2 self-start" onClick={stop}>Close without changes</button>
          )}
        </>
      )}
    </section>
  );
}
