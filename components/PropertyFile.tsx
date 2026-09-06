"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";

/**
 * The property file: one panel, the same wherever a home is opened.
 *
 * James, 6 Sep 2026: "when a file gets attached, it will travel with it no
 * matter where it goes. If it's in market appraisal when it gets uploaded,
 * great, but it'll follow it all the way through to compliance." So the
 * panel is keyed on the REX property, and where there is no property yet
 * (an appraisal) on the address, which the matcher turns into the property
 * the day it exists. Every row is one duty: where it stands in REX, whether
 * REX has the certificate itself, and the files the OS holds. Attach reads
 * the document first - type, dates, the address printed on it - and files
 * it through the same intake the backlog used, so REX gets it too.
 */

interface VaultFile { key: string; certKey: string; label: string; name: string; size: number; uploadedAt: string | null; open: string }
interface Row { type: string; label: string; state: "valid" | "expiring" | "expired" | "missing" | "not-required" | "held-here"; expiry: string | null; issued: string | null; inRex: boolean; fileInRex: boolean; files: VaultFile[]; fromHouse?: string }
interface Candidate { id: string; name: string; locality: string }
interface Answer {
  ok: boolean;
  live: boolean;
  propertyId: string | null;
  pendingKey: string | null;
  checked: boolean;
  match: { verdict: "confident" | "check" | "no match"; how: string; targets: Candidate[]; possible: Candidate[] } | null;
  rows: Row[];
  outstanding: number;
  error?: string;
}
interface Read { type: string; issue: string | null; expiry: string | null; expiryDerived: boolean; address: string; postcode: string; confidence: string; notes: string }

const TYPE_LABEL: Record<string, string> = {
  gas_safety: "Gas safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  mandatory_hmo_license: "HMO licence",
  additional_hmo_license: "HMO licence (additional)",
  selective_hmo_license: "Selective licence",
  legionella_risk_assessment: "Legionella risk assessment",
  portable_appliance_testing: "PAT",
  smoke_alarms: "Smoke alarms",
  co_alarms: "CO alarms",
  emergency_lighting_fire_exit: "Fire safety",
};
const READER_TO_TYPE: Record<string, string> = { hmo_licence: "mandatory_hmo_license" };

const STATE: Record<Row["state"], { label: string; tone: "good" | "accent" | "neutral" }> = {
  valid: { label: "In date", tone: "good" },
  expiring: { label: "Due soon", tone: "accent" },
  expired: { label: "Expired", tone: "accent" },
  missing: { label: "No record", tone: "accent" },
  "not-required": { label: "Not required", tone: "neutral" },
  "held-here": { label: "Held here", tone: "neutral" },
};
/* James, 6 Sep: "not required" reads as optional. A gas entry marked not
   required means there is no gas at the property, so say that. */
const stateLabel = (r: Row) => (r.state === "not-required" && r.type === "gas_safety" ? "No gas at the property" : STATE[r.state].label);

const day = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : iso;
};

export default function PropertyFile({
  propertyId,
  address,
  title = "Property file",
  screen = "the OS",
}: {
  /** The REX property. Give this when you have it. */
  propertyId?: string | null;
  /** Else the address, and the matcher finds the property or holds the file against the address.
   *  Given WITH the property (an appraisal that has just been linked), files held against the address move onto it. */
  address?: string | null;
  title?: string;
  /** Where the file was attached from, kept on the record: "the listing", "the application", "the market appraisal". */
  screen?: string;
}) {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null); // a candidate the person chose
  const [open, setOpen] = useState<Record<string, boolean>>({}); // rows showing every file, not just the latest
  const [pending, setPending] = useState<{ file: File; forType: string | null; read: Read | null; type: string; expiry: string; issue: string; busy: boolean; note: string | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const forType = useRef<string | null>(null);

  const key = propertyId ? `property=${encodeURIComponent(propertyId)}` : address ? `address=${encodeURIComponent(address)}` : null;
  const effectiveId = propertyId ?? pick ?? data?.propertyId ?? null;

  /* Given both a property and the address it was known by before, anything
     held against the address moves onto the property - once, idempotent. */
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (!propertyId || !address || linked.current === `${propertyId}|${address}`) return;
    linked.current = `${propertyId}|${address}`;
    void fetch("/api/property-file/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, propertyId }) }).catch(() => null);
  }, [propertyId, address]);

  const load = useCallback(() => {
    if (!key) return;
    const url = pick ? `/api/property-file?property=${encodeURIComponent(pick)}` : `/api/property-file?${key}`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => (await r.json()) as Answer)
      .then((j) => {
        if (!j.ok) throw new Error(j.error ?? "Could not read the file.");
        setData(j);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not read the file."));
  }, [key, pick]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function chose(file: File) {
    setPending({ file, forType: forType.current, read: null, type: forType.current ?? "", expiry: "", issue: "", busy: true, note: null });
    const body = new FormData();
    body.set("file", file);
    if (forType.current) body.set("expect", forType.current);
    const j = await fetch("/api/compliance/certificates/read", { method: "POST", body }).then((r) => r.json()).catch(() => ({ ok: false }));
    const read: Read | null = j.ok ? j.read : null;
    const type = forType.current ?? (read ? READER_TO_TYPE[read.type] ?? read.type : "");
    setPending((p) => (p ? { ...p, read, type: TYPE_LABEL[type] ? type : p.type, expiry: read?.expiry ?? "", issue: read?.issue ?? "", busy: false, note: j.ok ? null : j.error ?? "The reader could not open it; fill the facts in by hand." } : p));
  }

  async function file() {
    if (!pending || !pending.type || !pending.expiry) return;
    setPending((p) => (p ? { ...p, busy: true, note: null } : p));
    const body = new FormData();
    body.set("file", pending.file);
    if (effectiveId) body.set("propertyId", effectiveId);
    else if (address) body.set("address", address);
    body.set("type", pending.type);
    body.set("expiry", pending.expiry);
    if (pending.issue) body.set("issue", pending.issue);
    if (address) body.set("propertyName", address);
    body.set("source", `attached on ${screen}`);
    const j = await fetch("/api/compliance/certificates", { method: "POST", body }).then((r) => r.json()).catch(() => ({ ok: false, error: "The upload did not land." }));
    if (!j.ok) {
      setPending((p) => (p ? { ...p, busy: false, note: j.error ?? "The upload did not land." } : p));
      return;
    }
    setPending(null);
    load();
  }

  async function link(candidate: Candidate) {
    setPick(candidate.id);
    if (address) await fetch("/api/property-file/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, propertyId: candidate.id }) }).catch(() => null);
  }

  const openPicker = (type: string | null) => {
    forType.current = type;
    input.current?.click();
  };

  const attachAll = (
    <button type="button" onClick={() => openPicker(null)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40">
      Attach a certificate
    </button>
  );

  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void chose(f); }} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name="shield" size={17} className="text-accent-dark" />
          {title}
          {data && data.outstanding > 0 && <Pill tone="accent">{data.outstanding} outstanding</Pill>}
          {data && data.rows.length > 0 && data.outstanding === 0 && data.checked && <Pill tone="good">All in date</Pill>}
        </h3>
        {attachAll}
      </div>

      {/* ── Which property this is ── */}
      {data?.match && !propertyId && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          {effectiveId ? (
            <>In REX as <span className="font-semibold text-ink">{(data.match.targets.find((t) => t.id === effectiveId) ?? data.match.targets[0])?.name ?? `property ${effectiveId}`}</span>. Files attached here go on that property.</>
          ) : data.match.verdict === "no match" && !data.match.possible.length ? (
            <>Not in REX yet. A file attached here is held against the address and moves onto the property the day it is instructed.</>
          ) : (
            <>
              REX has more than one home this could be. Which is it?
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {[...data.match.targets, ...data.match.possible].map((c) => (
                  <button key={c.id} type="button" onClick={() => void link(c)} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] hover:border-ink/40">
                    {c.locality ? `${c.name}, ${c.locality}` : c.name}
                  </button>
                ))}
              </span>
            </>
          )}
        </p>
      )}

      {/* ── The pending attachment: what the reader made of it ── */}
      {pending && (
        <div className="mb-4 rounded-xl border border-accent-dark/40 bg-card p-4">
          <p className="text-[12.5px] font-semibold">{pending.file.name}</p>
          {pending.busy && !pending.read ? (
            <p className="mt-1 text-[12px] text-muted">Reading the document…</p>
          ) : (
            <>
              {pending.read && (
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Reads as {TYPE_LABEL[READER_TO_TYPE[pending.read.type] ?? pending.read.type] ?? pending.read.type}
                  {pending.read.expiry ? `, expires ${day(pending.read.expiry)}${pending.read.expiryDerived ? " (worked out from the issue date)" : ""}` : ", no expiry printed"}
                  {pending.read.address ? `. Address on it: ${pending.read.address}` : ""}
                  {pending.read.notes ? ` ${pending.read.notes}` : ""}
                </p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-[11px] text-muted">
                  Type
                  <select value={pending.type} onChange={(e) => setPending((p) => (p ? { ...p, type: e.target.value } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink">
                    <option value="">Choose…</option>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-muted">
                  Expires
                  <input type="date" value={pending.expiry} onChange={(e) => setPending((p) => (p ? { ...p, expiry: e.target.value } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink" />
                </label>
                <label className="text-[11px] text-muted">
                  Issued
                  <input type="date" value={pending.issue} onChange={(e) => setPending((p) => (p ? { ...p, issue: e.target.value } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink" />
                </label>
              </div>
              {pending.note && <p className="mt-2 text-[12px] text-accent-dark">{pending.note}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button type="button" disabled={pending.busy || !pending.type || !pending.expiry} onClick={() => void file()} className="rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-50">
                  {pending.busy ? "Filing…" : effectiveId ? "File it in REX and here" : "Hold it against the address"}
                </button>
                <button type="button" onClick={() => setPending(null)} className="rounded-full border border-line/80 px-4 py-2 text-[12px]">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── The rows ── */}
      {error ? (
        <p className="text-[12px] text-accent-dark">{error}</p>
      ) : !data ? (
        <p className="text-[12px] text-muted">Reading the file…</p>
      ) : !data.rows.length ? (
        <p className="text-[12px] leading-relaxed text-muted">
          {effectiveId ? (data.checked ? "REX holds no certificates for this home yet." : "REX did not answer for this home, so nothing can be said about it.") : "Nothing held yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.rows.map((r) => {
            const s = STATE[r.state];
            return (
              <li key={r.type} className={`rounded-xl border p-3 ${r.state === "expired" ? "border-accent-dark bg-accent-soft/30" : r.state === "missing" || r.state === "expiring" ? "border-accent-dark/40" : "border-line/70"}`}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] font-semibold">{r.label}</span>
                  <Pill tone={s.tone}>{stateLabel(r)}</Pill>
                  <span className="text-[11px] text-muted">
                    {r.expiry ? `${r.state === "expired" ? "Expired" : "Expires"} ${day(r.expiry)}` : r.issued ? `Issued ${day(r.issued)}` : ""}
                    {r.inRex && !r.fileInRex && r.expiry ? " · no document in REX" : ""}
                    {r.fromHouse ? ` · held on ${r.fromHouse}` : ""}
                  </span>
                  <button type="button" onClick={() => openPicker(r.type)} className="ml-auto rounded-full border border-line/80 px-3 py-1 text-[11px] hover:border-ink/40">
                    Attach
                  </button>
                </div>
                {r.files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {(open[r.type] ? r.files : r.files.slice(0, 2)).map((f) => (
                      <li key={f.key} className="flex items-center gap-2 text-[12px]">
                        <DoodleIcon name="doc" size={13} className="text-muted" />
                        <span className="min-w-0 truncate">{f.name}</span>
                        <a href={f.open} target="_blank" rel="noreferrer" className="ml-auto shrink-0 rounded-full border border-line/80 px-2.5 py-0.5 text-[11px] hover:border-ink/40">Open</a>
                      </li>
                    ))}
                    {r.files.length > 2 && (
                      <li>
                        <button type="button" onClick={() => setOpen((o) => ({ ...o, [r.type]: !o[r.type] }))} className="text-[11px] text-muted underline-offset-2 hover:underline">
                          {open[r.type] ? "Show the latest only" : `${r.files.length - 2} earlier ${r.files.length - 2 === 1 ? "file" : "files"}`}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && !data.checked && effectiveId && data.rows.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">REX did not give a complete answer for this home; what is shown may be short.</p>
      )}
    </section>
  );
}
