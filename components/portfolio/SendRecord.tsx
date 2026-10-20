"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE RECORD OF ONE SEND (Email Certificates, 20 Oct 2026; lib/home-send).
 *
 * What went, to whom, when, from whom, and the proof: each email exactly as
 * it left, each file with the SHA-256 of its bytes (the same file opened
 * later gives the same fingerprint, a changed one never does), and the
 * provider's own id where it gave one. Read only: nothing here changes it.
 */

type File = { id: string; label: string; name: string; expiry: string | null; source: string; bytes: number; sha256: string; certificateId: string | null };
type Email = { id: string; at: string; toName: string; toEmail: string; subject: string; html: string; htmlSha256: string; attachments: File[]; via: string | null; messageId: string | null; sent: boolean; detail: string };
type Record = {
  id: string; home: string; at: string; doneAt: string | null; by: { name: string; email: string };
  subject: string; message: string; documents: { label: string; name: string; expiry: string | null }[]; emails: Email[];
  earlier: { key: string; name: string; email: string; sent: boolean; detail: string; documents: string[] }[] | null;
};

export const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const exact = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function SendRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const [rec, setRec] = useState<Record | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    fetch(`/api/portfolio/send-to-tenants?record=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) { if (j?.ok) setRec(j.record); else setFailed(j?.error ?? "The record couldn't be read."); } })
      .catch(() => live && setFailed("The record couldn't be read. Try again in a minute."));
    return () => { live = false; };
  }, [id]);

  const rows = rec ? (rec.earlier ?? rec.emails) : [];
  const sent = rows.filter((e) => e.sent).length;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[760px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-normal leading-tight">Record of What Was Sent</h2>
            <p className="mt-1 text-[12.5px] text-muted">{rec?.home ?? "Reading the record…"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink">
            <DoodleIcon name="cross" size={13} />
          </button>
        </div>

        {failed ? (
          <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">{failed}</p>
        ) : !rec ? (
          <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the record…</p>
        ) : (
          <>
            <dl className="grid gap-x-4 gap-y-1.5 rounded-xl border border-line/50 bg-white p-4 text-[12.5px] sm:grid-cols-[130px_1fr]">
              <dt className="text-muted">Sent by</dt>
              <dd className="min-w-0 break-words">{rec.by.name}{rec.by.email ? <span className="text-muted"> ({rec.by.email})</span> : null}</dd>
              <dt className="text-muted">Pressed</dt>
              <dd>{exact(rec.at)}</dd>
              <dt className="text-muted">Outcome</dt>
              <dd className={sent === rows.length ? "" : "text-accent-dark"}>{rows.length ? `${sent} of ${rows.length} sent` : "Nothing was sent"}</dd>
              <dt className="text-muted">Subject</dt>
              <dd className="min-w-0 break-words">{rec.subject || "As the email"}</dd>
              <dt className="text-muted">Record number</dt>
              <dd className="font-mono text-[11.5px]">{rec.id}</dd>
            </dl>

            {rec.earlier && (
              <>
                <p className="mt-4 rounded-xl bg-box px-4 py-2.5 text-[12px] text-muted">Sent before the full record was kept, so only who it went to, what was attached and whether it went are held for this one.</p>
                <ul className="mt-2 space-y-2">
                  {rec.earlier.map((r) => (
                    <li key={r.key} className="rounded-xl border border-line/50 bg-white p-4 text-[12.5px]">
                      <strong>{r.name || r.email}</strong> <span className="text-muted">{r.email}</span>
                      <span className={`block ${r.sent ? "text-muted" : "text-accent-dark"}`}>{r.detail}</span>
                      {r.documents.length > 0 && <span className="block text-muted">{r.documents.join(", ")}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {rec.emails.length > 0 && <p className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Each email</p>}
            <ul className="space-y-2.5">
              {rec.emails.map((e) => (
                <li key={e.id} className={`rounded-xl border bg-white p-4 text-[12.5px] ${e.sent ? "border-line/50" : "border-accent-dark/40"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 break-words"><strong>{e.toName || e.toEmail}</strong> <span className="text-muted">{e.toEmail}</span></span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${e.sent ? "bg-[#e3ecd9] text-[#3f5a2c]" : "bg-accent-soft text-accent-dark"}`}>{e.sent ? "Sent" : "Not sent"}</span>
                  </div>
                  <p className="mt-1 text-muted">{exact(e.at)}{e.via ? ` · ${e.via === "mailbox" ? `from ${rec.by.name}'s own Outlook` : "from The Letting Experts"}` : ""}</p>
                  {!e.sent && <p className="mt-1 text-accent-dark">{e.detail}</p>}
                  {e.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {e.attachments.map((f) => (
                        <li key={f.id} className="rounded-lg bg-box px-2.5 py-1.5">
                          <span className="block min-w-0 break-words"><strong className="font-semibold">{f.label}</strong>{f.expiry ? ` · runs to ${day(f.expiry)}` : ""} <span className="text-muted">· {f.name} · {size(f.bytes)}</span></span>
                          <span className="block break-all font-mono text-[10.5px] text-muted" title="SHA-256 of the file's bytes as attached">SHA-256 {f.sha256}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(e.messageId || e.htmlSha256) && (
                    <p className="mt-2 break-all font-mono text-[10.5px] text-muted">
                      {e.messageId ? `Provider id ${e.messageId} · ` : e.via === "mailbox" ? "In the sender's Sent Items, header X-TLE-OS-Send " + e.id + " · " : ""}
                      {e.htmlSha256 ? `Email SHA-256 ${e.htmlSha256}` : ""}
                    </p>
                  )}
                  {e.html && (
                    <div className="mt-2">
                      <button type="button" onClick={() => setShown((s) => (s === e.id ? null : e.id))} className="text-[12px] font-semibold text-accent-dark underline-offset-2 hover:underline">
                        {shown === e.id ? "Hide the email" : "Show the email as it went"}
                      </button>
                      {shown === e.id && (
                        <div className="mt-2">
                          <p className="truncate text-[12px]"><span className="text-muted">Subject</span> <strong>{e.subject}</strong></p>
                          <iframe title={`The email to ${e.toName || e.toEmail}`} srcDoc={e.html} sandbox="" className="mt-1 h-[52vh] w-full rounded-lg border border-line/50 bg-white" />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Kept for good and never changed. A file&apos;s SHA-256 is its fingerprint: the same file always gives the same one, so anybody can show later that this exact certificate was the one sent.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
