"use client";

import QueryThread from "@/components/QueryThread";
import { CHECKING_LABEL, VERIFIED_LABEL, type CertChecking } from "@/lib/cert-hold";
import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { openDocument } from "@/lib/doc-sheet";
import PropertyAnswers from "@/components/PropertyAnswers";
import { useSaveReporter } from "@/components/SaveChip";
import { CHOICES, eicExpiry, type EicReason } from "@/lib/home-facts-shared";
import SendRecord, { stamp } from "@/components/portfolio/SendRecord";

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
interface Row { type: string; label: string; state: "valid" | "expiring" | "expired" | "missing" | "not-required" | "held-here"; expiry: string | null; issued: string | null; inRex: boolean; fileInRex: boolean; files: VaultFile[]; fromHouse?: string; renewal?: { appliedOn: string; ref: string; holdEnds: string; by: string }; checking?: CertChecking; verified?: { by: string; at: string }; removed?: { name: string; reason: "wrong" | "replaced"; by: string; at: string } }
interface Candidate { id: string; name: string; locality: string }
interface Answer {
  ok: boolean;
  live: boolean;
  propertyId: string | null;
  pendingKey: string | null;
  checked: boolean;
  match: { verdict: "confident" | "check" | "no match"; how: string; targets: Candidate[]; possible: Candidate[] } | null;
  rows: Row[];
  /** The latest send of each file to tenants, by R2 key (lib/home-send stampsFor). */
  sent?: Record<string, { sendId: string; at: string; by: string; to: string[] }>;
  /** Where compliance's check stands on each file, by R2 key (lib/cert-check-state). No entry: none needed. */
  checks?: Record<string, { state: "waiting" | "queried" | "verified"; certificateId: string; by?: string; at?: string }>;
  outstanding: number;
  checking?: number;
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

/**
 * An EIC in place of an EICR (Dan, 17 Oct 2026): on a new build or after a
 * full rewire the Electrical Installation Certificate answers the electrical
 * check. It is filed as the home's EICR - one duty, one row, REX's own type -
 * named as an EIC, with the reason, and the home remembers it (lib/home-facts).
 */
const EIC = "eic";
const TYPE_CHOICES: [string, string][] = Object.entries(TYPE_LABEL).flatMap(([k, v]): [string, string][] => (k === "eicr" ? [[k, v], [EIC, "EIC (new build or full rewire)"]] : [[k, v]]));
/** The reader calls an EIC an EICR (it is told one counts as the other); its notes say which it was. */
const looksLikeEic = (r: Read | null) => Boolean(r && r.type === "eicr" && /installation certificate|new (electrical )?installation|\bEIC\b/i.test(r.notes) && !/condition report/i.test(r.notes));
/** An EIC's expiry is five years from its issue at most, whatever it recommends. */
const cappedEic = (issue: string, expiry: string) => {
  const cap = eicExpiry(issue);
  return cap && (!expiry || expiry > cap) ? cap : expiry;
};

/**
 * HOW IT GOT HERE, and why it is a question rather than a guess.
 *
 * James, 14 Sep 2026: a certificate arrives three ways - we upload it, the
 * contractor drops it on their page, or the landlord emails it over. The
 * contractor's door records itself. The other two both end up on this panel,
 * and they are not the same event: "the landlord emailed it over" is the one
 * the landlord themselves may later ask us to prove. There is no inbound
 * mailbox, so the honest way to record it is to ask the person filing it.
 */
const SOURCES: { id: string; label: string }[] = [
  { id: "we uploaded it", label: "We uploaded it" },
  { id: "emailed by the landlord", label: "The landlord emailed it over" },
  { id: "emailed by the contractor", label: "The contractor emailed it over" },
  { id: "from the tenant", label: "The tenant sent it" },
  { id: "downloaded from Propoly", label: "Out of Propoly" },
];

const STATE: Record<Row["state"], { label: string; tone: "good" | "accent" | "neutral" | "warn" }> = {
  valid: { label: "In date", tone: "good" },
  expiring: { label: "Due soon", tone: "warn" },
  expired: { label: "Expired", tone: "accent" },
  missing: { label: "No record", tone: "accent" },
  "not-required": { label: "Not required", tone: "neutral" },
  "held-here": { label: "Held here", tone: "neutral" },
};
/* James, 6 Sep: "not required" reads as optional. A gas entry marked not
   required means there is no gas at the property, so say that. */
const stateLabel = (r: Row) => (r.state === "not-required" && r.type === "gas_safety" ? "No gas at the property" : STATE[r.state].label);
/* James, 7 Oct: a file full of "Not required" licences and fire safety rows is
   noise, so they are hidden - "No gas at the property" too. A row with a
   document on it still shows, so nothing filed goes out of sight. */
const worthShowing = (r: Row) => r.state !== "not-required" || r.files.length > 0;

/* A document uploaded after the certificate on the row: offered as its
   replacement (Dan, 20 Oct 2026 - "even when uploading via Documents it
   doesn't replace the document originally assigned"). */
const newerThanFiled = (d: LooseDoc, r: Row) => Boolean(r.files[0]?.uploadedAt && d.at > (r.files[0].uploadedAt as string));

/* Any licence answers "HMO licence". */
const LICENCES = new Set(["mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license"]);
const answers = (row: Row, type: string) => row.type === type || (type === "mandatory_hmo_license" && LICENCES.has(row.type)) || (type === "smoke_alarms" && row.type === "co_alarms");

/** A document uploaded on the file's Documents and marked as a certificate, not yet filed as one. */
export interface LooseDoc { type: string; name: string; url: string; at: string }

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
  propertyName = null,
  onLink,
  required,
  loose = [],
  emailTenant,
  onFiled,
}: {
  /** The REX property. Give this when you have it. */
  propertyId?: string | null;
  /** Else the address, and the matcher finds the property or holds the file against the address.
   *  Given WITH the property (an appraisal that has just been linked), files held against the address move onto it. */
  address?: string | null;
  title?: string;
  /** Where the file was attached from, kept on the record: "the listing", "the application", "the market appraisal". */
  screen?: string;
  /** The home's line, for the document sheet's heading. */
  propertyName?: string | null;
  /** Keep the home the person picked on whatever this panel sits on (an
   *  appraisal), so it is not asked again. Only ever on a pick: a linked home
   *  that is listed moves an appraisal to Won, so nothing links on its own. */
  onLink?: (propertyId: string) => void | Promise<void>;
  /** What this home has to hold (lib/let-type requiredFor). Any not on the
   *  file shows as Missing with its own Attach, so the list is the whole job. */
  required?: string[];
  /** Documents uploaded as a certificate type; offered on that row to read in. */
  loose?: LooseDoc[];
  /** Email Tenant on each certificate (James, 22 Oct 2026), where the home has
   *  tenants: `open` sends from here (the home's page), `href` goes to the
   *  home's page to send, `none` says why nobody can be sent it. Without it,
   *  no button: an appraisal or a listing has no tenant to send to. */
  emailTenant?: { open?: (start: string) => void; href?: (start: string) => string; none?: string | null };
  /** A certificate has just been filed here: the screen around it reads its figures again. */
  onFiled?: () => void;
}) {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null); // a candidate the person chose
  const [open, setOpen] = useState<Record<string, boolean>>({}); // rows showing every file, not just the latest
  const [pending, setPending] = useState<{ file: File; forType: string | null; read: Read | null; type: string; expiry: string; issue: string; how: string; busy: boolean; note: string | null; eicReason?: EicReason | ""; replaces?: { key: string; name: string } | null } | null>(null);
  /* Taking one off (Dan, 20 Oct 2026): the file being asked about, and why. */
  const [removing, setRemoving] = useState<{ key: string; name: string; label: string; reason: "wrong" | "replaced" | null; busy: boolean; note: string | null } | null>(null);
  /* Who the certificate reached, on the same screen as the filing. Not a
     toast: "the tenant has no email address on the record" is a finding
     somebody has to act on, and it must not slide away after four seconds. */
  const [went, setWent] = useState<string | null>(null);
  const [record, setRecord] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const forType = useRef<string | null>(null);
  /* Replace: the certificate the next attachment takes the place of. */
  const replacing = useRef<{ key: string; name: string } | null>(null);

  const key = propertyId ? `property=${encodeURIComponent(propertyId)}` : address ? `address=${encodeURIComponent(address)}` : null;
  const effectiveId = propertyId ?? pick ?? data?.propertyId ?? null;

  /* Whichever screen this panel sits on hears its saves on that screen's
     Auto save chip; on its own it still toasts (23 Sep 2026). */
  const reporter = useSaveReporter();

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
  /* A send from Email Tenant or Email Certificates: the Sent lines change, nothing else does. */
  useEffect(() => {
    window.addEventListener("os:home-sent", load);
    return () => window.removeEventListener("os:home-sent", load);
  }, [load]);

  /* Moving what was held against the address onto the property. Both callers
     used to throw the answer away, so a move that failed (no vault, signed
     out, the connection) looked exactly like one that worked (23 Sep 2026).
     `loud` is the agent's own click; the automatic move on opening only
     speaks up when it fails, or every visit to the file would toast. */
  const moveHeld = useCallback(
    async (pid: string, addr: string, loud: boolean): Promise<boolean> => {
      const settle = loud ? reporter.begin("Property link") : null;
      let problem: string | null = null;
      try {
        const r = await fetch("/api/property-file/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: addr, propertyId: pid }) });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!r.ok || !j?.ok) problem = j?.error ?? "The files held against the address did not move onto the property.";
      } catch {
        problem = "The files held against the address did not move - the connection dropped.";
      }
      if (problem) {
        (settle ?? reporter.begin("Property link"))({ ok: false, problem, retry: () => void moveHeld(pid, addr, true) });
        return false;
      }
      settle?.({ ok: true });
      return true;
    },
    [reporter]
  );

  /* Given both a property and the address it was known by before, anything
     held against the address moves onto the property - once, idempotent. */
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (!propertyId || !address || linked.current === `${propertyId}|${address}`) return;
    linked.current = `${propertyId}|${address}`;
    void moveHeld(propertyId, address, false);
  }, [propertyId, address, moveHeld]);

  async function chose(file: File) {
    setWent(null);
    setPending({ file, forType: forType.current, read: null, type: forType.current ?? "", expiry: "", issue: "", how: SOURCES[0].id, busy: true, note: null, replaces: replacing.current });
    const body = new FormData();
    body.set("file", file);
    if (forType.current) body.set("expect", forType.current);
    const j = await fetch("/api/compliance/certificates/read", { method: "POST", body }).then((r) => r.json()).catch(() => ({ ok: false }));
    const read: Read | null = j.ok ? j.read : null;
    const read0 = forType.current ?? (read ? READER_TO_TYPE[read.type] ?? read.type : "");
    const type = read0 === "eicr" && looksLikeEic(read) ? EIC : read0;
    const issue = read?.issue ?? "";
    const expiry = type === EIC && issue ? cappedEic(issue, read?.expiry ?? "") : read?.expiry ?? "";
    setPending((p) => (p ? { ...p, read, type: TYPE_LABEL[type] || type === EIC ? type : p.type, expiry, issue, eicReason: "", busy: false, note: j.ok ? null : j.error ?? "The reader could not open it; fill the facts in by hand." } : p));
  }

  async function file() {
    if (!pending || !pending.type || !pending.expiry) return;
    const eic = pending.type === EIC;
    if (eic && (!pending.issue || !pending.eicReason)) {
      setPending((p) => (p ? { ...p, note: "An EIC needs the date it was issued, and whether the home is a new build or was fully rewired." } : p));
      return;
    }
    setPending((p) => (p ? { ...p, busy: true, note: null } : p));
    const body = new FormData();
    body.set("file", pending.file);
    if (effectiveId) body.set("propertyId", effectiveId);
    else if (address) body.set("address", address);
    body.set("type", eic ? "eicr" : pending.type);
    body.set("expiry", eic ? cappedEic(pending.issue, pending.expiry) : pending.expiry);
    if (pending.issue) body.set("issue", pending.issue);
    if (address) body.set("propertyName", address);
    const why = eic ? CHOICES.eicReason.find((c) => c.value === pending.eicReason)?.label.toLowerCase() : null;
    body.set("source", `${eic ? `EIC (${why}), ` : ""}${pending.how}, on ${screen}`);
    if (pending.replaces) body.set("replaces", pending.replaces.key);
    /* Reported to the screen's Auto save chip as well as the line under the
       form, which stays: it is where the agent is looking. A failure keeps
       the form and what was typed into it. */
    const settle = reporter.begin("Certificate");
    type Filed = { ok?: boolean; error?: string; duplicate?: boolean; share?: { line?: string }; replaced?: string | null };
    const j: Filed = await fetch("/api/compliance/certificates", { method: "POST", body })
      .then(async (r) => {
        const b = (await r.json().catch(() => null)) as Filed | null;
        return r.ok && b?.ok ? b : { ok: false, error: b?.error };
      })
      .catch(() => ({ ok: false, error: "The upload did not land." }));
    if (!j.ok) {
      const problem = j.error ?? "The upload did not land.";
      settle({ ok: false, problem, retry: () => void file() });
      setPending((p) => (p ? { ...p, busy: false, note: problem } : p));
      return;
    }
    settle({ ok: true });
    /* The home remembers its electrics are an EIC, so its row and the
       compliance tiles say so from now on (lib/home-facts). */
    if (eic && effectiveId && /^(\d+|pm-[0-9a-f-]+)$/i.test(effectiveId)) {
      await fetch("/api/home-facts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ home: effectiveId, electrical: "eic", eicReason: pending.eicReason }) }).catch(() => null);
    }
    setPending(null);
    setWent(j.duplicate ? "That certificate is already on this home; nothing was sent again." : [j.replaced, j.share?.line].filter(Boolean).join(" ") || null);
    replacing.current = null;
    load();
    if (!j.duplicate) onFiled?.();
  }

  /* Take a certificate off the home: the wrong document, or one that is out
     of date. It stops counting everywhere at once; the file is kept aside. */
  async function removeFile() {
    /* A file held against the address (no property yet) sits on the address's shelf. */
    const home = effectiveId ?? data?.pendingKey ?? null;
    if (!removing?.reason || !home) return;
    setRemoving((r) => (r ? { ...r, busy: true, note: null } : r));
    const settle = reporter.begin("Certificate");
    const j = (await fetch("/api/compliance/certificates/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: home, key: removing.key, reason: removing.reason }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "That did not go through - the connection dropped." }))) as { ok?: boolean; error?: string; name?: string };
    if (!j.ok) {
      const problem = j.error ?? "It could not be taken off just now.";
      settle({ ok: false, problem, retry: () => void removeFile() });
      setRemoving((r) => (r ? { ...r, busy: false, note: problem } : r));
      return;
    }
    settle({ ok: true });
    setWent(`${removing.name} has been taken off the ${removing.label}. It no longer counts for this home.`);
    setRemoving(null);
    load();
  }

  async function link(candidate: Candidate) {
    setPick(candidate.id);
    if (address) await moveHeld(candidate.id, address, true);
    /* Picked once, kept (Howard, 1 Oct 2026): the choice used to live on this
       screen only, so the same question came back on every visit. */
    if (onLink && /^\d+$/.test(candidate.id)) await onLink(candidate.id);
  }


  const openPicker = (type: string | null, replace: { key: string; name: string } | null = null) => {
    forType.current = type;
    replacing.current = replace;
    input.current?.click();
  };

  const attachAll = (
    <button type="button" data-attach onClick={() => openPicker(null)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40">
      Attach a certificate
    </button>
  );

  const rows = (() => {
    if (!data) return [];
    /* With the home's list given, a duty it does not have here is not shown
       as a gap (James, 12 Oct: "it's a UK property, in England, we know that
       it will only have quite a certain number of things") - legionella on
       an English home, say. Anything with a document on it still shows. */
    const needed = (r: Row) => !required || r.files.length > 0 || r.state === "valid" || r.state === "held-here" || required.some((t) => answers(r, t));
    const held = data.rows.filter(worthShowing).filter(needed);
    const gaps: Row[] = (required ?? [])
      .filter((t) => !data.rows.some((r) => answers(r, t)))
      .map((t) => ({ type: t, label: TYPE_LABEL[t] ?? t, state: "missing", expiry: null, issued: null, inRex: false, fileInRex: false, files: [] }));
    return [...held, ...gaps];
  })();
  const outstanding = !data ? 0 : required
    ? rows.filter((r) => !r.renewal && !(r.checking && !r.checking.queried) && (r.state === "expired" || r.state === "expiring" || r.state === "missing")).length
    : data.outstanding;

  /* Read a document already uploaded on the file as this row's certificate:
     the same reader and form as a fresh Attach. */
  async function readIn(d: LooseDoc, type: string, replace: { key: string; name: string } | null = null) {
    forType.current = type;
    replacing.current = replace;
    try {
      const blob = await fetch(`${d.url}${d.url.includes("?") ? "&" : "?"}bytes=1`).then((r) => (r.ok ? r.blob() : Promise.reject()));
      await chose(new File([blob], d.name, { type: blob.type || "application/pdf" }));
    } catch {
      setWent(`${d.name} could not be opened to read. Download it and use Attach instead.`);
    }
  }

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5">
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void chose(f); }} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name="shield" size={17} className="text-accent-dark" />
          {title}
          {data && outstanding > 0 && <Pill tone="accent">{outstanding} outstanding</Pill>}
          {data && (data.checking ?? 0) > 0 && <Pill tone="neutral">{data.checking} with compliance</Pill>}
          {data && rows.length > 0 && outstanding === 0 && !(data.checking ?? 0) && data.checked && <Pill tone="good">All in date</Pill>}
        </h3>
        {attachAll}
      </div>

      {/* ── Which property this is ── */}
      {data?.match && !propertyId && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          {effectiveId ? (
            <>On our books as <span className="font-semibold text-ink">{(data.match.targets.find((t) => t.id === effectiveId) ?? data.match.targets[0])?.name ?? `property ${effectiveId}`}</span>. Files attached here go on that property.</>
          ) : data.match.verdict === "no match" && !data.match.possible.length ? (
            <>Not on our books yet. A file attached here is held against the address and moves onto the property the day it is instructed.</>
          ) : (
            <>
              There is more than one home on our books this could be. Which is it?
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
          {pending.replaces && <p className="mt-0.5 text-[12px] text-muted">Replaces {pending.replaces.name}, which comes off this home once this one is kept.</p>}
          {pending.busy && !pending.read ? (
            <p className="mt-1 text-[12px] text-muted">Reading the document…</p>
          ) : (
            <>
              {pending.read && (
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Reads as {looksLikeEic(pending.read) ? "an EIC" : TYPE_LABEL[READER_TO_TYPE[pending.read.type] ?? pending.read.type] ?? pending.read.type}
                  {pending.read.expiry ? `, expires ${day(pending.read.expiry)}${pending.read.expiryDerived ? " (worked out from the issue date)" : ""}` : ", no expiry printed"}
                  {pending.read.address ? `. Address on it: ${pending.read.address}` : ""}
                  {pending.read.notes ? ` ${pending.read.notes}` : ""}
                </p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-[11px] text-muted">
                  Type
                  <select value={pending.type} onChange={(e) => setPending((p) => (p ? { ...p, type: e.target.value, expiry: e.target.value === EIC && p.issue ? cappedEic(p.issue, p.expiry) : p.expiry } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink">
                    <option value="">Choose…</option>
                    {TYPE_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-muted">
                  Expires
                  <input type="date" value={pending.expiry} onChange={(e) => setPending((p) => (p ? { ...p, expiry: e.target.value } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink" />
                </label>
                <label className="text-[11px] text-muted">
                  Issued
                  <input type="date" value={pending.issue} onChange={(e) => setPending((p) => (p ? { ...p, issue: e.target.value, expiry: p.type === EIC && e.target.value ? cappedEic(e.target.value, p.expiry) : p.expiry } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink" />
                </label>
                {pending.type === EIC && (
                  <label className="text-[11px] text-muted sm:col-span-3">
                    Why an EIC
                    <select value={pending.eicReason ?? ""} onChange={(e) => setPending((p) => (p ? { ...p, eicReason: e.target.value as EicReason } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink">
                      <option value="">Choose…</option>
                      {CHOICES.eicReason.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <span className="mt-1 block leading-snug">
                      An EIC counts in place of an EICR for 5 years from the day it was issued{pending.issue && eicExpiry(pending.issue) ? `, so it runs to ${day(eicExpiry(pending.issue))}` : ""}. After that an EICR is due.
                    </span>
                  </label>
                )}
                <label className="text-[11px] text-muted sm:col-span-3">
                  How it got here
                  <select value={pending.how} onChange={(e) => setPending((p) => (p ? { ...p, how: e.target.value } : p))} className="mt-1 w-full rounded-lg border border-line/80 bg-page px-2.5 py-2 text-[12.5px] text-ink">
                    {SOURCES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              {pending.note && <p className="mt-2 text-[12px] text-accent-dark">{pending.note}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button type="button" disabled={pending.busy || !pending.type || !pending.expiry} onClick={() => void file()} className="rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-50">
                  {pending.busy ? "Filing…" : effectiveId ? "File it on the property" : "Hold it against the address"}
                </button>
                <button type="button" onClick={() => setPending(null)} className="rounded-full border border-line/80 px-4 py-2 text-[12px]">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Who the certificate reached, once it is filed ── */}
      {went && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-line/80 bg-card p-3">
          <p className="flex-1 text-[12px] leading-relaxed text-muted">{went}</p>
          <button type="button" onClick={() => setWent(null)} className="text-[11px] font-semibold text-muted transition-colors hover:text-ink">Hide</button>
        </div>
      )}

      {/* ── The rows ── */}
      {error ? (
        <p className="text-[12px] text-accent-dark">{error}</p>
      ) : !data ? (
        <p className="text-[12px] text-muted">Reading the file…</p>
      ) : !rows.length ? (
        <p className="text-[12px] leading-relaxed text-muted">
          {effectiveId ? (data.checked ? "No certificates held for this home yet." : "The records did not answer for this home, so nothing can be said about it.") : "Nothing held yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const s = STATE[r.state];
            /* With the compliance team (lib/cert-hold, 9 Oct 2026): the
               renewal is in, so nothing here is an alarm while they check it. */
            const withCompliance = Boolean(r.checking && !r.checking.queried);
            const liveOk = r.state === "valid" || r.state === "not-required" || r.state === "held-here";
            return (
              <li key={r.type} className={`rounded-xl border p-3 ${r.renewal || withCompliance ? "border-line/70" : r.state === "expired" ? "border-accent-dark bg-accent-soft/30" : r.state === "expiring" ? "border-[#e0b24a]/70" : r.state === "missing" ? "border-accent-dark/40" : "border-line/70"}`}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] font-semibold">{r.label}</span>
                  {r.verified && liveOk && (
                    <span title={`${VERIFIED_LABEL}: ${r.verified.by}, ${day(r.verified.at.slice(0, 10))}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#56634a]">
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="text-emerald-600">
                        <circle cx="8" cy="8" r="7.25" fill="currentColor" opacity="0.14" />
                        <path d="M4.5 8.4 L7 10.8 L11.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Verified
                    </span>
                  )}
                  {withCompliance && !liveOk ? (
                    /* Wraps on a phone rather than running off the card. */
                    <span className="rounded-lg bg-page px-2.5 py-0.5 text-[11px] font-medium leading-snug text-muted">{CHECKING_LABEL}</span>
                  ) : (
                    <Pill tone={r.renewal ? "neutral" : s.tone}>{r.renewal ? "With the council" : stateLabel(r)}</Pill>
                  )}
                  <span className="text-[11px] text-muted">
                    {r.expiry ? `${r.state === "expired" ? "Expired" : "Expires"} ${day(r.expiry)}` : r.issued ? `Issued ${day(r.issued)}` : ""}
                    {r.renewal ? ` · renewal applied for ${day(r.renewal.appliedOn)}${r.renewal.ref ? ` (ref ${r.renewal.ref})` : ""}, back on the list ${day(r.renewal.holdEnds)} if no new licence` : ""}
                    {r.inRex && !r.fileInRex && r.expiry ? " · no document on file" : ""}
                    {r.fromHouse ? ` · held on ${r.fromHouse}` : ""}
                  </span>
                  <button type="button" onClick={() => openPicker(r.type)} className="ml-auto rounded-full border border-line/80 px-3 py-1 text-[11px] hover:border-ink/40">
                    Attach
                  </button>
                </div>
                {r.checking && (
                  <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-snug ${r.checking.queried ? "bg-accent-soft/40 text-accent-dark" : "bg-box text-ink/80"}`}>
                    {r.checking.queried
                      ? `Queried by the compliance team: ${r.checking.queried}`
                      : `${liveOk ? `New certificate, ${CHECKING_LABEL.toLowerCase()}. ` : ""}Filed ${day(r.checking.at.slice(0, 10))}${r.checking.by ? ` by ${r.checking.by}` : ""}, runs to ${day(r.checking.expiry)}. It goes live once the compliance team have verified it.`}
                  </p>
                )}
                {r.removed && !r.files.length && (
                  <p className="mt-2 text-[12px] text-muted">
                    {r.removed.name} was taken off {day(r.removed.at.slice(0, 10))} by {r.removed.by}: {r.removed.reason === "wrong" ? "the wrong document" : "out of date or replaced"}.
                  </p>
                )}
                {r.checking?.queried && <QueryThread kind="certificate" id={r.checking.id} />}
                {/* Uploaded as a document but never read in as the certificate
                    (James, 12 Oct: "they have a gas safety uploaded to this
                    property ... why this hasn't tagged the gas"). */}
                {!r.checking && loose.filter((d) => (answers(r, d.type) || d.type === r.type) && (r.state !== "valid" || newerThanFiled(d, r))).slice(0, 2).map((d) => (
                  <div key={d.url} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-box px-2.5 py-1.5 text-[12px]">
                    <DoodleIcon name="doc" size={13} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">
                      Uploaded as a document {day(d.at.slice(0, 10))}: <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{d.name}</a>
                    </span>
                    <button type="button" onClick={() => void readIn(d, r.type, r.files[0] ? { key: r.files[0].key, name: r.files[0].name } : null)} className="rounded-full bg-accent-dark px-3 py-1 text-[11px] font-semibold text-page">
                      {r.files[0] ? "Use this instead" : "Read it in"}
                    </button>
                  </div>
                ))}
                {/* The newest file IS the certificate; a new one attached
                    on top replaces it here, the older ones fold away. Click
                    opens it in the sheet from the bottom of the page. */}
                {emailTenant && !r.files.length && r.fileInRex && !r.fromHouse && effectiveId && VAULT_KEY[r.type] && (r.state === "valid" || r.state === "expiring") && (
                  <EmailTenant start={`rex:${effectiveId}:${VAULT_KEY[r.type]}`} blocked={emailTenant.none ?? null} sent={null} via={emailTenant} onRecord={setRecord} />
                )}
                {r.files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {(open[r.type] ? r.files : r.files.slice(0, 1)).map((f, i) => (
                      <li key={f.key}>
                        <div className="flex items-center gap-1 rounded-lg transition-colors hover:bg-box">
                          <button
                            type="button"
                            onClick={() => openDocument({ key: f.key, name: f.name, label: r.label, property: propertyName, url: f.open })}
                            className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12px] ${i > 0 ? "text-muted" : ""}`}
                          >
                            <DoodleIcon name="doc" size={13} className="shrink-0 text-muted" />
                            <span className="min-w-0 truncate">{f.name}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-muted">{i === 0 ? "Open" : "Earlier"}</span>
                          </button>
                          {i === 0 && (
                            <button type="button" onClick={() => openPicker(r.type, { key: f.key, name: f.name })} className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-accent-dark hover:underline">
                              Replace
                            </button>
                          )}
                          <button type="button" onClick={() => setRemoving({ key: f.key, name: f.name, label: r.label, reason: null, busy: false, note: null })} className="mr-1 shrink-0 rounded-full px-2 py-1 text-[11px] text-muted hover:text-accent-dark hover:underline">
                            Remove
                          </button>
                        </div>
                        {removing?.key === f.key && (
                          <div className="mt-1.5 rounded-lg border border-accent-dark/30 bg-accent-soft/20 px-3 py-2.5 text-[12px]">
                            <p className="font-semibold">Take {f.name} off the {r.label}?</p>
                            <p className="mt-0.5 text-muted">It stops counting for this home straight away. The file is kept aside with your name on it, not deleted.</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {([["wrong", "It's the wrong document"], ["replaced", "It's out of date or replaced"]] as const).map(([v, l]) => (
                                <button key={v} type="button" onClick={() => setRemoving((x) => (x ? { ...x, reason: v } : x))} className={`rounded-full border px-3 py-1 text-[11.5px] ${removing.reason === v ? "border-accent-dark bg-accent-dark text-page" : "border-line/80 hover:border-ink/40"}`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            {removing.note && <p className="mt-2 text-accent-dark">{removing.note}</p>}
                            <div className="mt-2.5 flex gap-2">
                              <button type="button" disabled={!removing.reason || removing.busy} onClick={() => void removeFile()} className="rounded-full bg-accent-dark px-3.5 py-1.5 text-[11.5px] font-semibold text-page disabled:opacity-50">
                                {removing.busy ? "Taking it off…" : "Take it off"}
                              </button>
                              <button type="button" onClick={() => setRemoving(null)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px]">
                                Keep it
                              </button>
                            </div>
                          </div>
                        )}
                        {/* Who it went to (Email Certificates, 20 Oct 2026): the stamp, and the record behind it. */}
                        {i === 0 && emailTenant ? (
                          <EmailTenant
                            start={`vault:${f.key}`}
                            blocked={r.state === "expired" ? "Expired, so it isn't sent" : waitReason(data.checks?.[f.key]) ?? emailTenant.none ?? null}
                            sent={data.sent?.[f.key] ?? null}
                            via={emailTenant}
                            onRecord={setRecord}
                          />
                        ) : data.sent?.[f.key] && (() => {
                          const st = data.sent[f.key];
                          const names = st.to.length > 2 ? `${st.to.slice(0, 2).join(", ")} and ${st.to.length - 2} more` : st.to.join(" and ");
                          return (
                            <button type="button" onClick={() => setRecord(st.sendId)} className="ml-2 mt-0.5 flex items-start gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11.5px] text-[#3f5a2c] hover:bg-box">
                              <DoodleIcon name="mail" size={12} className="mt-[2px] shrink-0" />
                              <span>Sent to {names}, {stamp(st.at)} by {st.by} <span className="text-muted underline underline-offset-2">Record</span></span>
                            </button>
                          );
                        })()}
                      </li>
                    ))}
                    {r.files.length > 1 && (
                      <li className="px-2">
                        <button type="button" onClick={() => setOpen((o) => ({ ...o, [r.type]: !o[r.type] }))} className="text-[11px] text-muted underline-offset-2 hover:underline">
                          {open[r.type] ? "Show the current one only" : `${r.files.length - 1} earlier ${r.files.length - 1 === 1 ? "certificate" : "certificates"}`}
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
      {data && !data.checked && effectiveId && rows.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">The records did not give a complete answer for this home; what is shown may be short.</p>
      )}

      {/* WHAT THE LANDLORD TOLD US, on the same panel as the certificates
          because it answers the same kind of question: where is the stopcock,
          who has the keys, how far can we go on a repair without ringing them.
          Keyed the way this panel already is - the property where REX has one,
          the address where it does not - and it draws nothing at all until
          there are answers. */}
      <div className="mt-5">
        <PropertyAnswers propertyId={effectiveId ?? null} address={address ?? null} />
      </div>
      {record && <SendRecord id={record} onClose={() => setRecord(null)} />}
    </section>
  );
}

/** REX's type → the key Email Certificates uses for a certificate only REX holds (lib/home-send). */
const VAULT_KEY: Record<string, string> = {
  gas_safety: "gas", eicr: "eicr", epc: "epc", mandatory_hmo_license: "licence", additional_hmo_license: "licence", selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella", portable_appliance_testing: "pat", smoke_alarms: "alarms", co_alarms: "alarms", emergency_lighting_fire_exit: "fire",
};

const waitReason = (c: NonNullable<Answer["checks"]>[string] | undefined) =>
  c?.state === "waiting" ? "Verify first" : c?.state === "queried" ? "Queried, verify a good one first" : null;

/**
 * EMAIL TENANT (James, 22 Oct 2026, after Jo's feedback): on every certificate,
 * "blocked out until it's verified, and then we should be able to click it.
 * When we click it ... it'll come up with a pre-drafted email." The email is
 * Email Certificates (lib/home-send) with this certificate ticked and the
 * home's tenants, so the record and the once-a-minute guard are the same.
 * Sent, it says when and to whom, with the record, and offers Send Again.
 */
function EmailTenant({
  start,
  blocked,
  sent,
  via,
  onRecord,
}: {
  start: string;
  blocked: string | null;
  sent: { sendId: string; at: string; by: string; to: string[] } | null;
  via: { open?: (start: string) => void; href?: (start: string) => string };
  onRecord: (id: string) => void;
}) {
  const cls = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition";
  const label = sent ? "Send Again" : "Email Docs";
  const button = blocked ? (
    <span aria-disabled="true" title={blocked} className={`${cls} cursor-not-allowed border border-line/70 bg-box text-muted`}>
      <DoodleIcon name="mail" size={12} className="shrink-0 opacity-60" />{label}
    </span>
  ) : via.open ? (
    <button type="button" onClick={() => via.open?.(start)} className={`${cls} ${sent ? "border border-line/80 hover:border-ink/40" : "bg-accent-dark text-page hover:opacity-90"}`}>
      <DoodleIcon name="mail" size={12} className="shrink-0" />{label}
    </button>
  ) : via.href ? (
    <a href={via.href(start)} className={`${cls} ${sent ? "border border-line/80 hover:border-ink/40" : "bg-accent-dark text-page hover:opacity-90"}`}>
      <DoodleIcon name="mail" size={12} className="shrink-0" />{label}
    </a>
  ) : null;
  const names = sent ? (sent.to.length > 2 ? `${sent.to.slice(0, 2).join(", ")} and ${sent.to.length - 2} more` : sent.to.join(" and ")) : "";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-2">
      {sent && (
        <button type="button" onClick={() => onRecord(sent.sendId)} className="flex min-w-0 items-start gap-1.5 rounded-md py-0.5 text-left text-[11.5px] text-[#3f5a2c] hover:bg-box">
          <DoodleIcon name="mail" size={12} className="mt-[2px] shrink-0" />
          <span>Sent {stamp(sent.at)} to {names}, by {sent.by} <span className="text-muted underline underline-offset-2">View Record</span></span>
        </button>
      )}
      {button}
      {blocked && <span className="text-[11px] text-muted">{blocked}</span>}
    </div>
  );
}
