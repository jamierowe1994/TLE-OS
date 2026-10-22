"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import SendRecord from "@/components/portfolio/SendRecord";

/**
 * SEND TO TENANTS (Josel Banagua, 20 Oct 2026; lib/home-send).
 *
 * "It would also be extremely helpful if we could send compliance documents
 * directly to tenants through OS, rather than having to manage this
 * separately." Three screens, then the press:
 *
 *   1. Documents   the home's certificates, its documents and (for the
 *                  office) the clean sweep's papers a tenant is owed. In-date
 *                  certificates start ticked; an expired one, or one still
 *                  with compliance for its check, is shown and can't be.
 *   2. Tenants     everyone living there, ticked; on a shared house, every
 *                  room. Nobody without an email can be ticked.
 *   3. Check       who gets what (a room's own papers only to that room),
 *                  the subject and the words, both editable (James, 20 Oct
 *                  2026, Email Certificates: "it'll bring up an email which is
 *                  editable"), and the email itself as each tenant gets it.
 *                  Then Send.
 *
 * Nothing goes until Send is pressed, and Send says what happened to each.
 * Every email is kept as it went, with each file's fingerprint (View Record).
 * Opened from the Compliance tab it is "Email Certificates": the same screens,
 * with the in-date certificates ticked to start with.
 */

type Doc = {
  id: string; group: string; label: string; name: string; expiry: string | null; sizeBytes: number | null;
  room: string | null; where: string | null; blocked: string | null; suggested: boolean;
};
type Tenant = { key: string; name: string; email: string | null; listingId: string; where: string | null };
type Info = {
  title: string; documents: Doc[]; tenants: Tenant[]; customerEmail: boolean; office: boolean; viewingAs: boolean; test: boolean;
  via: "mailbox" | "ours"; sender: string;
};
type Preview = {
  subject: string; to: string; name: string; html: string; defaults: { subject: string; message: string };
  attachments: { label: string; name: string; sizeBytes: number | null }[];
  perTenant: { key: string; name: string; email: string | null; where: string | null; documents: string[] }[];
};
type Result = { key: string; name: string; email: string; sent: boolean; detail: string; documents: string[] };

const GROUPS = ["Certificates", "Documents on this home", "From the clean sweep"];
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const size = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function SendToTenants({
  listing,
  listings,
  title,
  heading = "Send to Tenants",
  start = null,
  onClose,
  onSent,
}: {
  listing: string;
  listings: string[];
  title: string;
  /** "Email Certificates" from the Compliance tab, "Send to Tenants" from Documents. */
  heading?: string;
  /** Opened from one document's row: that one ticked to start with. */
  start?: string | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [who, setWho] = useState<Set<string>>(new Set());
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
        setDocs(new Set((first.length ? first : i.documents.filter((d) => d.suggested && !d.blocked)).map((d) => d.id)));
        setWho(new Set(i.tenants.filter((t) => t.email).map((t) => t.key)));
      })
      .catch(() => live && setFailed("The documents couldn't be read. Try again in a minute."));
    return () => { live = false; };
  }, [listing, listings.join(","), start]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickedDocs = useMemo(() => (info ? info.documents.filter((d) => docs.has(d.id)) : []), [info, docs]);
  const pickedTenants = useMemo(() => (info ? info.tenants.filter((t) => t.email && who.has(t.key)) : []), [info, who]);

  /* Step 3 draws the email for one tenant at a time, and redraws when the words settle. */
  useEffect(() => {
    if (step !== 3 || !info || !pickedDocs.length || !pickedTenants.length) return;
    let live = true;
    const t = setTimeout(() => {
      setPreview("loading");
      setPreviewErr(null);
      fetch("/api/portfolio/send-to-tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", listing, listings, documents: [...docs], tenants: pickedTenants.map((x) => x.key), subject, message, previewFor: previewFor ?? pickedTenants[0].key }),
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
  }, [step, subject, message, previewFor, docs, pickedTenants.map((x) => x.key).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (sending || !info) return;
    setSending(true);
    setSendErr(null);
    const j = await fetch("/api/portfolio/send-to-tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "send", listing, listings, documents: [...docs], tenants: pickedTenants.map((x) => x.key), subject, message }),
    }).then((x) => x.json()).catch(() => null);
    setSending(false);
    if (!j?.ok) { setSendErr(j?.error ?? "That couldn't be sent just now. Try again in a minute."); return; }
    setResults(j.results ?? []);
    setRecordId(typeof j.record === "string" ? j.record : null);
    onSent?.();
    /* The property file under it reads its Sent lines again (Email Tenant, 22 Oct 2026). */
    window.dispatchEvent(new Event("os:home-sent"));
  }

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const noEmail = info ? info.tenants.filter((t) => !t.email) : [];
  const blockedSend = Boolean(info?.viewingAs || info?.test);

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
            {(["Documents", "Tenants", "Check and send"] as const).map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const can = n === 1 || (n === 2 && pickedDocs.length > 0) || (n === 3 && pickedDocs.length > 0 && pickedTenants.length > 0);
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
          <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the documents and tenants…</p>
        ) : results ? (
          <Results results={results} onClose={onClose} onRecord={recordId ? () => setShowRecord(true) : null} />
        ) : step === 1 ? (
          <>
            <p className="text-[12.5px] leading-relaxed">Tick what to send. Each tenant gets one email from you with the documents attached. References, ID, right to rent papers, the landlord&apos;s papers and invoices are never offered here.</p>
            {info.documents.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">There is nothing on this home that can go to a tenant yet. Add a certificate on the Compliance tab, or a document on the Documents tab.</p>
            ) : (
              <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto">
                {GROUPS.map((g) => {
                  const rows = info.documents.filter((d) => d.group === g);
                  if (!rows.length) return null;
                  return (
                    <section key={g}>
                      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{g}</p>
                      <ul className="overflow-hidden rounded-xl border border-line/50 bg-white">
                        {rows.map((d) => (
                          <li key={d.id} className="border-b border-line/40 last:border-0">
                            <label className={`flex items-start gap-3 px-4 py-2.5 text-[12.5px] ${d.blocked ? "opacity-60" : "cursor-pointer hover:bg-box"}`}>
                              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" disabled={Boolean(d.blocked)} checked={!d.blocked && docs.has(d.id)} onChange={() => setDocs((s) => toggle(s, d.id))} />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold">{d.label}{d.where ? <span className="font-normal text-muted"> · {d.where}</span> : null}</span>
                                <span className="block truncate text-muted">{[d.name, d.expiry ? `runs to ${day(d.expiry)}` : null, size(d.sizeBytes)].filter(Boolean).join(" · ")}</span>
                                {d.blocked && <span className="block text-accent-dark">{d.blocked}</span>}
                                {d.room && !d.blocked && <span className="block text-[11.5px] text-muted">Only goes to the tenants of {d.where ?? "its room"}.</span>}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => setStep(2)} disabled={!pickedDocs.length} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {pickedDocs.length ? `Next: who gets ${pickedDocs.length === 1 ? "it" : `these ${pickedDocs.length}`}` : "Tick at least one document"}
              </PressButton>
              <button type="button" onClick={onClose} className="text-[12px] text-muted underline">Cancel</button>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <p className="text-[12.5px] leading-relaxed">Everyone living there is ticked{info.tenants.some((t) => t.where) ? ", every room of the house" : ""}. Untick anybody who shouldn&apos;t get it.</p>
            {info.tenants.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">Nobody is living here on the record, so there is nobody to send to.</p>
            ) : (
              <ul className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-line/50 bg-white">
                {info.tenants.map((t) => (
                  <li key={t.key} className="border-b border-line/40 last:border-0">
                    <label className={`flex items-start gap-3 px-4 py-2.5 text-[12.5px] ${t.email ? "cursor-pointer hover:bg-box" : "opacity-60"}`}>
                      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" disabled={!t.email} checked={Boolean(t.email) && who.has(t.key)} onChange={() => setWho((s) => toggle(s, t.key))} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t.name}{t.where ? <span className="font-normal text-muted"> · {t.where}</span> : null}</span>
                        <span className="block truncate text-muted">{t.email ?? "No email on file, so they can't be sent anything"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {noEmail.length > 0 && <p className="mt-2 text-[11.5px] text-muted">{noEmail.length} {noEmail.length === 1 ? "tenant has" : "tenants have"} no email on file. Add one on their card on the home&apos;s page.</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => setStep(3)} disabled={!pickedTenants.length} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {pickedTenants.length ? "Next: check the email" : "Tick at least one tenant"}
              </PressButton>
              <button type="button" onClick={() => setStep(1)} className="text-[12px] text-muted underline">Back</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {!info.customerEmail && (
                <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">
                  <strong>Email to landlords and tenants is switched off.</strong> Nothing will reach a tenant until it is on in Admin, Switches. Sends to our own addresses still go, for testing.
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
                    <span className={t.documents.length ? "text-muted" : "text-accent-dark"}>{t.documents.length ? t.documents.join(", ") : "Nothing ticked is for their room, so they get nothing"}</span>
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
                The email <span className="font-normal text-muted">(change anything you like)</span>
                <textarea value={message ?? defaults?.message ?? ""} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={4000} disabled={!defaults}
                  className="mt-1 block w-full resize-y rounded-xl border border-line/80 bg-white px-3 py-2 text-[12.5px] font-normal leading-relaxed outline-none focus:border-ink disabled:bg-box" />
              </label>
              <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
                <span>Each email starts &ldquo;Hi&rdquo; and their first name, lists what is attached, and ends with your name.</span>
                {(subject != null || message != null) && (
                  <button type="button" onClick={() => { setSubject(null); setMessage(null); }} className="font-semibold text-accent-dark underline-offset-2 hover:underline">Back to the Standard Wording</button>
                )}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-line/50 bg-white p-3">
              {pickedTenants.length > 1 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                  <span className="text-muted">The email for</span>
                  {pickedTenants.map((t) => (
                    <button key={t.key} type="button" onClick={() => setPreviewFor(t.key)}
                      className={`rounded-full border px-2.5 py-1 font-semibold ${(previewFor ?? pickedTenants[0].key) === t.key ? "border-ink bg-ink text-page" : "border-line/70 hover:border-ink/40"}`}>
                      {t.name.split(/\s+/)[0]}
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
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {preview.attachments.map((a) => (
                        <span key={a.label + a.name} className="inline-flex max-w-full items-center gap-1 rounded-full bg-box px-2.5 py-1 text-[11px]">
                          <DoodleIcon name="folder" size={11} className="shrink-0 text-accent-dark" /><span className="truncate">{a.name}</span>
                        </span>
                      ))}
                    </p>
                  </div>
                  <iframe title="The email" srcDoc={preview.html} sandbox="" className="h-[46vh] w-full rounded-lg border border-line/50 bg-white" />
                </>
              )}
            </div>

            {sendErr && <p className="mt-3 text-[12px] text-accent-dark">{sendErr}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => void send()} disabled={sending || blockedSend || !preview || preview === "loading"} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {sending ? "Sending…" : `Send to ${pickedTenants.length} ${pickedTenants.length === 1 ? "tenant" : "tenants"}`}
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
            <strong>{r.name || r.email}</strong> <span className="text-muted">{r.email}</span>
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
