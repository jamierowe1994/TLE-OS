"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import SendRecord from "@/components/portfolio/SendRecord";

/**
 * EMAIL DOCS (Josel Banagua, 20 Oct 2026; lib/home-send).
 *
 * "It would also be extremely helpful if we could send compliance documents
 * directly to tenants through OS, rather than having to manage this
 * separately." Then James's team call, 29 Oct 2026 (Sean McMahon): the
 * landlord too, and anything on the home's Docs, not only certificates - "it
 * says email certificates, but you can actually just attach anything that's
 * on the docs ... you pick who you want it to go out to". Three screens, then
 * the press:
 *
 *   1. Who         the tenants (every room on a shared house), the landlord,
 *                  any additional landlord or point of contact on the home,
 *                  or both sides at once. Nobody without an email can be
 *                  ticked.
 *   2. Documents   the home's certificates, its documents and (for the
 *                  office) the clean sweep's papers, for whoever is ticked,
 *                  plus files from the sender's computer. None at all is fine:
 *                  Email at the top of the page is just an email.
 *   3. Check       who gets what (a landlord never a tenant's references or
 *                  ID, a tenant never the landlord's papers, a room's own
 *                  papers only to that room), the subject and the words, both
 *                  editable, and the email itself as each person gets it.
 *                  Then Send.
 *
 * Nothing goes until Send is pressed, and Send says what happened to each.
 * Every email is kept as it went, with each file's fingerprint (View Record).
 * Opened from one certificate (`start`), the tenants and that certificate are
 * ticked, as Email Tenant always did.
 */

type Role = "tenant" | "landlord";
type Doc = {
  id: string; group: string; label: string; name: string; expiry: string | null; sizeBytes: number | null;
  room: string | null; where: string | null; blocked: string | null; suggested: boolean; forTenants: boolean; forLandlord: boolean;
};
type Person = { key: string; name: string; email: string | null; listingId: string; where: string | null; role: Role };
type Info = {
  title: string; documents: Doc[]; tenants: Person[]; customerEmail: boolean; office: boolean; viewingAs: boolean; test: boolean;
  via: "mailbox" | "ours"; sender: string;
};
type Preview = {
  subject: string; to: string; name: string; html: string; defaults: { subject: string; message: string };
  attachments: { label: string; name: string; sizeBytes: number | null }[];
  perTenant: { key: string; name: string; email: string | null; where: string | null; role?: Role; documents: string[] }[];
};
type Result = { key: string; name: string; email: string; sent: boolean; detail: string; documents: string[]; role?: Role };

const GROUPS = ["Certificates", "Documents on this home", "From the clean sweep"];
const MAX_FILE = 12 * 1024 * 1024;
const MAX_FILES = 5;
/* A company or an estate as the landlord is called by its whole name, as the email greets it (lib/home-send). */
const COMPANY = /\b(ltd|limited|llp|plc|estate|trust|trustees|properties|property|holdings|investments|group|partnership)\b/i;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const size = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const asBase64 = (f: File) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? "").replace(/^data:[^,]*,/, ""));
    r.onerror = () => no(new Error(`${f.name} couldn't be read.`));
    r.readAsDataURL(f);
  });

/** "2 tenants and the landlord", "Sophie Bell and 2 landlords", "3 tenants and 2 on the landlord side". */
function whoLine(people: { name: string; role?: Role; where?: string | null }[]): string {
  const t = people.filter((p) => (p.role ?? "tenant") === "tenant");
  const l = people.filter((p) => p.role === "landlord");
  const tenants = t.length === 0 ? null : t.length === 1 ? t[0].name : `${t.length} tenants`;
  const allLandlords = l.every((p) => p.where === "Landlord" || p.where === "Additional landlord");
  const landlords = l.length === 0 ? null : l.length === 1 ? (l[0].where === "Landlord" ? "the landlord" : l[0].name) : `${l.length} ${allLandlords ? "landlords" : "on the landlord side"}`;
  return [tenants, landlords].filter(Boolean).join(" and ") || "nobody";
}

export default function SendToTenants({
  listing,
  listings,
  title,
  heading = "Email Docs",
  start = null,
  blank = false,
  onClose,
  onSent,
}: {
  listing: string;
  listings: string[];
  title: string;
  /** "Email Docs", "Email" from the top of the page, "Email Tenant" from the compliance desk. */
  heading?: string;
  /** Opened from one document's row: the tenants and that one ticked to start with. */
  start?: string | null;
  /** Email at the top of the page: nobody and nothing ticked, just an email. */
  blank?: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [who, setWho] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  /* The subject and words: null until edited, so the defaults follow what is ticked. */
  const [subject, setSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<{ subject: string; message: string } | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [preview, setPreview] = useState<Preview | "loading" | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  useEffect(() => {
    let live = true;
    fetch(`/api/portfolio/send-to-tenants?listing=${encodeURIComponent(listing)}&listings=${encodeURIComponent(listings.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.ok) { setFailed(j?.error ?? "The documents couldn't be read."); return; }
        const i = j as Info;
        setInfo(i);
        const first = start ? i.documents.filter((d) => d.id === start && !d.blocked) : [];
        setDocs(new Set((first.length ? first : blank ? [] : i.documents.filter((d) => d.suggested && !d.blocked)).map((d) => d.id)));
        /* From one certificate it is for the tenants, as Email Tenant was; otherwise the sender picks. */
        if (start) setWho(new Set(i.tenants.filter((t) => t.role === "tenant" && t.email).map((t) => t.key)));
      })
      .catch(() => live && setFailed("The documents couldn't be read. Try again in a minute."));
    return () => { live = false; };
  }, [listing, listings.join(","), start, blank]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickedPeople = useMemo(() => (info ? info.tenants.filter((t) => t.email && who.has(t.key)) : []), [info, who]);
  const roles = useMemo(() => new Set(pickedPeople.map((p) => p.role)), [pickedPeople]);
  /* Only what can go to somebody ticked is offered. */
  const shownDocs = useMemo(
    () => (info ? info.documents.filter((d) => (roles.has("tenant") && d.forTenants) || (roles.has("landlord") && d.forLandlord) || roles.size === 0) : []),
    [info, roles]
  );
  const pickedDocs = useMemo(() => shownDocs.filter((d) => docs.has(d.id) && !d.blocked), [shownDocs, docs]);
  const attachCount = pickedDocs.length + files.length;
  const uploadsMeta = useMemo(() => files.map((f) => ({ name: f.name, size: f.size })), [files]);

  /* Step 3 draws the email for one person at a time, and redraws when the words settle. */
  useEffect(() => {
    if (step !== 3 || !info || !pickedPeople.length) return;
    let live = true;
    const t = setTimeout(() => {
      setPreview("loading");
      setPreviewErr(null);
      fetch("/api/portfolio/send-to-tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", listing, listings, documents: pickedDocs.map((d) => d.id), uploads: uploadsMeta, tenants: pickedPeople.map((x) => x.key), subject, message, previewFor: previewFor ?? pickedPeople[0].key }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (!live) return;
          if (j?.ok) { setPreview(j as Preview); setDefaults((j as Preview).defaults ?? null); }
          else { setPreview(null); setPreviewErr(j?.error ?? "The email couldn't be drawn."); }
        })
        .catch(() => { if (live) { setPreview(null); setPreviewErr("The email couldn't be drawn. Try again in a minute."); } });
    }, subject != null || message != null ? 450 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [step, subject, message, previewFor, pickedDocs.map((d) => d.id).join(","), uploadsMeta.map((u) => u.name + u.size).join(","), pickedPeople.map((x) => x.key).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = (message ?? defaults?.message ?? "").trim();
  const needsWords = attachCount === 0 && !words;

  async function send() {
    if (sending || !info) return;
    setSending(true);
    setSendErr(null);
    let uploads: { name: string; data: string }[] = [];
    try {
      uploads = await Promise.all(files.map(async (f) => ({ name: f.name, data: await asBase64(f) })));
    } catch (e) {
      setSending(false);
      setSendErr(e instanceof Error ? e.message : "A file couldn't be read. Add it again.");
      return;
    }
    const j = await fetch("/api/portfolio/send-to-tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "send", listing, listings, documents: pickedDocs.map((d) => d.id), uploads, tenants: pickedPeople.map((x) => x.key), subject, message }),
    }).then((x) => x.json()).catch(() => null);
    setSending(false);
    if (!j?.ok) { setSendErr(j?.error ?? "That couldn't be sent just now. Try again in a minute."); return; }
    setResults(j.results ?? []);
    setRecordId(typeof j.record === "string" ? j.record : null);
    onSent?.();
    /* The property file under it reads its Sent lines again (Email Tenant, 22 Oct 2026). */
    window.dispatchEvent(new Event("os:home-sent"));
  }

  function addFiles(list: FileList | null) {
    setFileErr(null);
    const add = Array.from(list ?? []);
    const big = add.filter((f) => f.size > MAX_FILE);
    const ok = add.filter((f) => f.size <= MAX_FILE);
    const next = [...files, ...ok.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))];
    if (big.length) setFileErr(`${big.map((f) => f.name).join(", ")} ${big.length === 1 ? "is" : "are"} over 12 MB, too big to email.`);
    if (next.length > MAX_FILES) setFileErr(`Add at most ${MAX_FILES} files from your computer.`);
    setFiles(next.slice(0, MAX_FILES));
    if (fileInput.current) fileInput.current.value = "";
  }

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const blockedSend = Boolean(info?.viewingAs || info?.test);
  const tenantsList = info ? info.tenants.filter((t) => t.role === "tenant") : [];
  const landlordList = info ? info.tenants.filter((t) => t.role === "landlord") : [];
  const mainLandlords = landlordList.filter((t) => t.where === "Landlord" || t.where === "Additional landlord");
  const side = (list: Person[]) => list.filter((t) => t.email).map((t) => t.key);
  const pickSide = (keys: string[]) => setWho(new Set(keys));
  const sideOn = (keys: string[]) => keys.length > 0 && keys.length === who.size && keys.every((k) => who.has(k));
  const quick: { label: string; keys: string[] }[] = [
    { label: "The tenants", keys: side(tenantsList) },
    { label: "The landlord", keys: side(mainLandlords) },
    { label: "Both", keys: [...side(tenantsList), ...side(mainLandlords)] },
  ];

  const personRow = (t: Person) => (
    <li key={t.key} className="border-b border-line/40 last:border-0">
      <label className={`flex items-start gap-3 px-4 py-2.5 text-[12.5px] ${t.email ? "cursor-pointer hover:bg-box" : "opacity-60"}`}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" disabled={!t.email} checked={Boolean(t.email) && who.has(t.key)} onChange={() => setWho((s) => toggle(s, t.key))} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t.name}{t.where ? <span className="font-normal text-muted"> · {t.where}</span> : null}</span>
          <span className="block truncate text-muted">{t.email ?? `No email on file, so they can't be sent anything. Add one on ${t.role === "landlord" ? "the landlord's" : "their"} card on the home's page.`}</span>
        </span>
      </label>
    </li>
  );

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={() => !sending && onClose()} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[760px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-normal leading-tight">{heading}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{info?.title || title}</p>
          </div>
          <button type="button" onClick={() => !sending && onClose()} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink"><DoodleIcon name="cross" size={13} /></button>
        </div>

        {!results && (
          <ol className="mb-4 flex flex-wrap gap-1.5 text-[12px]" aria-label="Steps">
            {(["Who", "Documents", "Check and send"] as const).map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const can = n === 1 || pickedPeople.length > 0;
              return (
                <li key={label}>
                  <button type="button" disabled={!can || sending} onClick={() => setStep(n)} aria-current={step === n ? "step" : undefined}
                    className={`rounded-full border px-3 py-1.5 font-semibold transition-colors disabled:opacity-40 ${step === n ? "border-ink bg-ink text-page" : "border-line/70 bg-white hover:border-ink/40"}`}>
                    {n} {label}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {failed ? (
          <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">{failed}</p>
        ) : !info ? (
          <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the documents and who to send to…</p>
        ) : results ? (
          <Results results={results} onClose={onClose} onRecord={recordId ? () => setShowRecord(true) : null} />
        ) : step === 1 ? (
          <>
            <p className="text-[12.5px] leading-relaxed">Who should it go to? Each person gets their own email from you.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {quick.map((x) => (
                <button key={x.label} type="button" disabled={!x.keys.length} onClick={() => pickSide(x.keys)} aria-pressed={sideOn(x.keys)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-40 ${sideOn(x.keys) ? "border-accent-dark bg-accent-dark text-page" : "border-line/70 bg-white hover:border-ink/40"}`}>
                  {x.label}
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-[46vh] space-y-3 overflow-y-auto">
              <section>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Tenants</p>
                {tenantsList.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">Nobody is living here on the record.</p>
                ) : (
                  <ul className="overflow-hidden rounded-xl border border-line/50 bg-white">{tenantsList.map(personRow)}</ul>
                )}
              </section>
              <section>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Landlord</p>
                {landlordList.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">No landlord on the record for this home. Add one in the Landlords box on the home&apos;s page.</p>
                ) : (
                  <ul className="overflow-hidden rounded-xl border border-line/50 bg-white">{landlordList.map(personRow)}</ul>
                )}
              </section>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => setStep(2)} disabled={!pickedPeople.length} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {pickedPeople.length ? "Next: what to attach" : "Tick at least one person"}
              </PressButton>
              <button type="button" onClick={onClose} className="text-[12px] text-muted underline">Cancel</button>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <p className="text-[12.5px] leading-relaxed">
              Tick anything on this home to attach, add a file from your computer, or attach nothing and just write.{" "}
              <span className="text-muted">A landlord is never offered a tenant&apos;s references, ID or right to rent papers; a tenant never the landlord&apos;s papers or invoices.</span>
            </p>
            {shownDocs.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">There is nothing on this home for {whoLine(pickedPeople)} yet. Add a certificate on the Compliance tab or a document on the Documents tab, or add a file below.</p>
            ) : (
              <div className="mt-3 max-h-[46vh] space-y-3 overflow-y-auto">
                {GROUPS.map((g) => {
                  const rows = shownDocs.filter((d) => d.group === g);
                  if (!rows.length) return null;
                  return (
                    <section key={g}>
                      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{g}</p>
                      <ul className="overflow-hidden rounded-xl border border-line/50 bg-white">
                        {rows.map((d) => {
                          const onlyOne = roles.size > 1 && d.forTenants !== d.forLandlord ? (d.forLandlord ? "Only goes to the landlord side." : "Only goes to the tenants.") : null;
                          return (
                            <li key={d.id} className="border-b border-line/40 last:border-0">
                              <label className={`flex items-start gap-3 px-4 py-2.5 text-[12.5px] ${d.blocked ? "opacity-60" : "cursor-pointer hover:bg-box"}`}>
                                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" disabled={Boolean(d.blocked)} checked={!d.blocked && docs.has(d.id)} onChange={() => setDocs((s) => toggle(s, d.id))} />
                                <span className="min-w-0 flex-1">
                                  <span className="block font-semibold">{d.label}{d.where ? <span className="font-normal text-muted"> · {d.where}</span> : null}</span>
                                  <span className="block truncate text-muted">{[d.name, d.expiry ? `runs to ${day(d.expiry)}` : null, size(d.sizeBytes)].filter(Boolean).join(" · ")}</span>
                                  {d.blocked && <span className="block text-accent-dark">{d.blocked}</span>}
                                  {onlyOne && !d.blocked && <span className="block text-[11.5px] text-muted">{onlyOne}</span>}
                                  {d.room && !d.blocked && roles.has("tenant") && <span className="block text-[11.5px] text-muted">Only goes to the tenants of {d.where ?? "its room"}{roles.has("landlord") && d.forLandlord ? " and the landlord side" : ""}.</span>}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
            <section className="mt-3">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">From your computer</p>
              <div className="rounded-xl border border-line/50 bg-white">
                {files.length > 0 && (
                  <ul>
                    {files.map((f) => (
                      <li key={f.name + f.size} className="flex items-center gap-3 border-b border-line/40 px-4 py-2.5 text-[12.5px]">
                        <DoodleIcon name="folder" size={13} className="shrink-0 text-accent-dark" />
                        <span className="min-w-0 flex-1 truncate"><strong>{f.name}</strong> <span className="text-muted">· {size(f.size)}</span></span>
                        <button type="button" onClick={() => setFiles((x) => x.filter((y) => y !== f))} className="shrink-0 text-[12px] text-muted underline">Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[12.5px] font-semibold text-accent-dark hover:bg-box">
                  <DoodleIcon name="upload" size={13} className="shrink-0" />
                  <span className="whitespace-nowrap">Add a File</span>
                  <span className="font-normal text-muted">Goes to everyone ticked. Kept with the record, not added to the home.</span>
                  <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
                </label>
              </div>
              {fileErr && <p className="mt-1.5 text-[11.5px] text-accent-dark">{fileErr}</p>}
            </section>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => setStep(3)} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {attachCount ? `Next: check the email (${attachCount} attached)` : "Next: write the email"}
              </PressButton>
              <button type="button" onClick={() => setStep(1)} className="text-[12px] text-muted underline">Back</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {!info.customerEmail && (
                <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">
                  <strong>Email to landlords and tenants is switched off.</strong> Nothing will reach a landlord or tenant until it is on in Admin, Switches. Sends to our own addresses still go, for testing.
                </p>
              )}
              {info.viewingAs && <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">You&apos;re viewing as somebody. The email goes under the name of the person who presses Send, so stop viewing as them first.</p>}
              {info.test && <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">This is a test home, so nothing is sent from it.</p>}
              <p className="flex items-start gap-2 rounded-xl bg-box px-4 py-2.5 text-[12px] text-muted">
                <DoodleIcon name="mail" size={13} className="mt-0.5 shrink-0 text-accent-dark" />
                {info.via === "mailbox"
                  ? `From ${info.sender}'s own Outlook, with your email footer, so replies come back to you.`
                  : "From The Letting Experts, under your name with your address to reply to. It goes from your own Outlook once that is connected in Profile."}
              </p>
            </div>

            {preview && preview !== "loading" && (
              <ul className="mt-3 space-y-1.5 rounded-xl border border-line/50 bg-white p-3 text-[12px]">
                {preview.perTenant.map((t) => (
                  <li key={t.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0"><strong>{t.name}</strong>{t.where ? <span className="text-muted"> · {t.where}</span> : null} <span className="text-muted">{t.email}</span></span>
                    <span className={t.documents.length || !attachCount ? "text-muted" : "text-accent-dark"}>
                      {t.documents.length ? t.documents.join(", ") : !attachCount ? "The email, nothing attached" : t.role === "landlord" ? "Nothing ticked is for a landlord, so they get nothing" : "Nothing ticked is for them, so they get nothing"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 rounded-xl border border-line/50 bg-white p-3">
              <label className="block text-[12px] font-semibold">
                Subject
                <input value={subject ?? defaults?.subject ?? ""} onChange={(e) => setSubject(e.target.value)} maxLength={200} disabled={!defaults}
                  className="mt-1 block w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[12.5px] font-normal outline-none focus:border-ink disabled:bg-box" />
              </label>
              <label className="mt-2.5 block text-[12px] font-semibold">
                The email <span className="font-normal text-muted">{attachCount ? "(change anything you like)" : "(write what you want to say)"}</span>
                <textarea value={message ?? defaults?.message ?? ""} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={4000} disabled={!defaults}
                  placeholder={attachCount ? undefined : "Write your email here."}
                  className="mt-1 block w-full resize-y rounded-xl border border-line/80 bg-white px-3 py-2 text-[12.5px] font-normal leading-relaxed outline-none focus:border-ink disabled:bg-box" />
              </label>
              <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
                <span>Each email starts &ldquo;Hi&rdquo; and their first name{attachCount ? ", lists what is attached," : ""} and ends with your name.</span>
                {(subject != null || message != null) && attachCount > 0 && (
                  <button type="button" onClick={() => { setSubject(null); setMessage(null); }} className="font-semibold text-accent-dark underline-offset-2 hover:underline">Back to the Standard Wording</button>
                )}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-line/50 bg-white p-3">
              {pickedPeople.length > 1 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                  <span className="text-muted">The email for</span>
                  {pickedPeople.map((t) => (
                    <button key={t.key} type="button" onClick={() => setPreviewFor(t.key)}
                      className={`rounded-full border px-2.5 py-1 font-semibold ${(previewFor ?? pickedPeople[0].key) === t.key ? "border-ink bg-ink text-page" : "border-line/70 hover:border-ink/40"}`}>
                      {t.role === "landlord" && COMPANY.test(t.name) ? t.name : t.name.split(/\s+/)[0]}{t.role === "landlord" ? " (landlord)" : ""}
                    </button>
                  ))}
                </div>
              )}
              {preview === "loading" || !preview ? (
                previewErr ? <p className="text-[12px] text-accent-dark">{previewErr}</p>
                  : <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Drawing the email…</p>
              ) : (
                <>
                  <div className="mb-2 text-[12px]">
                    <p className="truncate"><span className="text-muted">To</span> {preview.name} &lt;{preview.to}&gt;</p>
                    <p className="truncate"><span className="text-muted">Subject</span> <strong>{preview.subject}</strong></p>
                    {preview.attachments.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {preview.attachments.map((a) => (
                          <span key={a.label + a.name} className="inline-flex max-w-full items-center gap-1 rounded-full bg-box px-2.5 py-1 text-[11px]">
                            <DoodleIcon name="folder" size={11} className="shrink-0 text-accent-dark" /><span className="truncate">{a.name}</span>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <iframe title="The email" srcDoc={preview.html} sandbox="" className="h-[46vh] w-full rounded-lg border border-line/50 bg-white" />
                </>
              )}
            </div>

            {sendErr && <p className="mt-3 text-[12px] text-accent-dark">{sendErr}</p>}
            {needsWords && preview && preview !== "loading" && <p className="mt-3 text-[12px] text-muted">Write your email, or go back and attach something.</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => void send()} disabled={sending || blockedSend || needsWords || !preview || preview === "loading"} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {sending ? "Sending…" : `Send to ${whoLine(pickedPeople)}`}
              </PressButton>
              <button type="button" onClick={() => setStep(2)} disabled={sending} className="text-[12px] text-muted underline">Back</button>
            </div>
          </>
        )}
      </div>
      {showRecord && recordId && <SendRecord id={recordId} onClose={() => setShowRecord(false)} />}
    </div>
  );
}

function Results({ results, onClose, onRecord }: { results: Result[]; onClose: () => void; onRecord: (() => void) | null }) {
  const sent = results.filter((r) => r.sent);
  return (
    <div>
      <p className="text-[14px] font-semibold">{sent.length === results.length ? `All ${sent.length} sent.` : `${sent.length} of ${results.length} sent.`}</p>
      <ul className="mt-3 space-y-2 rounded-xl border border-line/50 bg-white p-3 text-[12px]">
        {results.map((r) => (
          <li key={r.key}>
            <strong>{r.name || r.email}</strong>{r.role === "landlord" ? <span className="text-muted"> · landlord</span> : null} <span className="text-muted">{r.email}</span>
            <br />
            <span className={r.sent ? "text-muted" : "text-accent-dark"}>{r.detail}</span>
            {r.sent && r.documents.length > 0 && <span className="block text-muted">{r.documents.join(", ")}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-muted">Kept for good on the home&apos;s activity and against each certificate: who sent it, when, to which address, the email exactly as it went, and a fingerprint of every file.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PressButton onClick={onClose} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">Done</PressButton>
        {onRecord && <button type="button" onClick={onRecord} className="text-[12.5px] font-semibold text-accent-dark underline-offset-2 hover:underline">View Record</button>}
      </div>
    </div>
  );
}
