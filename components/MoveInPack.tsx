"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE MOVE-IN PACK ON A LET (lib/propoly-mail, 22 Oct 2026).
 *
 * MoveInPackCard   on the let: "Move-in pack sent <date>", opening the email
 *                  and its files; until one is seen, when it is due by.
 * PropolyMailView  one Propoly email, full screen, with every attachment the
 *                  OS copied out of Outlook.
 *
 * The pack goes from Propoly when Kirstie executes the deal, and has to reach
 * the tenant within about 28 days of moving in, or the landlord cannot later
 * serve notice for possession. The proof is the copy in the agent's Outlook.
 */

export type MailFile = { name: string; type: string; size: number; key: string | null; note?: string };
export type PropolyMail = {
  id: string; kind: "move-in" | "other"; fromName: string; fromEmail: string;
  to: { name: string; email: string }[]; cc: { name: string; email: string }[];
  subject: string; preview: string; text: string; at: string;
  attachments: MailFile[]; attachmentsNote: string | null;
  mailboxes: string[]; dealId: string | null; address: string; matchedOn: string; matchedBy: string | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const people = (l: { name: string; email: string }[]) => l.map((a) => (a.name && a.name !== a.email ? `${a.name} <${a.email}>` : a.email)).join(", ");
/** The words as a person reads them: Outlook's safelinks and the logo's alt text taken out. */
const readable = (t: string) =>
  t
    .replace(/<https?:\/\/[^>\s]+>/gi, "")
    .replace(/\[\s*https?:\/\/[^\]]*\]?/gi, "")
    .replace(/https?:\/\/\S{60,}/gi, "")
    .replace(/^(\s*\[[^\]\n]{1,40}\]\s*)+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The day the pack is due by: 28 days after the move-in. */
export function packDueBy(moveIn: string | null | undefined): string | null {
  const t = moveIn ? Date.parse(moveIn) : NaN;
  return Number.isFinite(t) ? new Date(t + 28 * 864e5).toISOString().slice(0, 10) : null;
}

export function PropolyMailView({ mail, onClose }: { mail: PropolyMail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const files = mail.attachments ?? [];
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto p-3 text-ink sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[760px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-normal leading-tight">{mail.kind === "move-in" ? "Move-in Pack" : "Propoly Email"}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{mail.address || "Not on a file yet"} · sent {at(mail.at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink"><DoodleIcon name="cross" size={13} /></button>
        </div>
        <div className="rounded-2xl border border-line/60 bg-card p-4 text-[12.5px]">
          <p className="break-words text-[14px] font-semibold">{mail.subject || "(no subject)"}</p>
          <dl className="mt-2 grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
            <dt>From</dt><dd className="break-words">{people([{ name: mail.fromName, email: mail.fromEmail }])}</dd>
            {mail.to.length > 0 && (<><dt>To</dt><dd className="break-words">{people(mail.to)}</dd></>)}
            {mail.cc.length > 0 && (<><dt>Cc</dt><dd className="break-words">{people(mail.cc)}</dd></>)}
          </dl>
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={i}>
                  {f.key ? (
                    <a href={`/api/r2/file?key=${encodeURIComponent(f.key)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-page px-3 py-1.5 text-[11.5px] font-semibold hover:border-ink/40">
                      <DoodleIcon name="doc" size={12} />{f.name}<span className="font-normal text-muted">{size(f.size)}</span>
                    </a>
                  ) : (
                    <span title={f.note} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line/80 px-3 py-1.5 text-[11.5px] text-muted">
                      <DoodleIcon name="doc" size={12} />{f.name}{f.note ? ` · ${f.note}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {mail.attachmentsNote && <p className="mt-2 text-[11.5px] text-accent-dark">{mail.attachmentsNote}</p>}
          <div className="mt-3 max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words border-t border-line/50 pt-3 text-[12.5px] leading-relaxed">{readable(mail.text || mail.preview)}</div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Read from {mail.mailboxes.length ? mail.mailboxes.join(", ") : "an agent's"} Outlook
          {mail.matchedOn === "tenant" ? ", put on this let by the tenant's email" : mail.matchedOn === "address" ? ", put on this let by the address" : mail.matchedOn === "hand" ? `, put on this let by ${mail.matchedBy ?? "hand"}` : ""}.
        </p>
      </div>
    </div>
  );
}

/**
 * The card on a let. `dealId` is the let's Propoly deal; `address` the home,
 * for an email the reader tied to the home but not the deal.
 */
export function MoveInPackCard({ dealId, address, moveIn, className = "" }: { dealId: string | null; address: string; moveIn?: string | null; className?: string }) {
  const [mail, setMail] = useState<PropolyMail[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<PropolyMail | null>(null);
  useEffect(() => {
    if (!dealId && !address) return;
    let live = true;
    const p = new URLSearchParams();
    if (dealId) p.set("deal", dealId);
    if (address) p.set("address", address);
    fetch(`/api/propoly-mail?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j?.ok) setMail(j.mail ?? []); else setFailed(true); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [dealId, address]);

  if (!dealId && !address) return null;
  const packs = (mail ?? []).filter((m) => m.kind === "move-in");
  const others = (mail ?? []).filter((m) => m.kind !== "move-in");
  const first = packs.length ? packs[packs.length - 1] : null;
  const due = packDueBy(moveIn);
  const late = !first && due && due < new Date().toISOString().slice(0, 10);

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${first ? "border-[#56634a]/20 bg-[#f1f4ec] text-[#3f5a32]" : late ? "border-accent-dark/25 bg-accent-dark/5" : "border-line/70 bg-card"} ${className}`}>
      {mail === null && !failed ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Looking for the move-in pack…</p>
      ) : failed ? (
        <p className="text-[12.5px] text-muted">The move-in pack couldn't be checked just now.</p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <DoodleIcon name={first ? "checklist" : "mail"} size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{first ? `Move-in pack sent ${day(first.at)}` : "Move-in pack not seen yet"}</p>
              <p className={`mt-0.5 text-[12px] leading-relaxed ${first ? "" : "text-muted"}`}>
                {first
                  ? `${first.attachments.filter((f) => f.key).length} ${first.attachments.filter((f) => f.key).length === 1 ? "file" : "files"} kept with it${packs.length > 1 ? ` · sent ${packs.length} times` : ""}.`
                  : due
                    ? `${late ? "It was due" : "Due"} by ${day(due)}, 28 days from the move-in. It goes from Propoly when the deal is executed, and shows here once it reaches the agent's Outlook.`
                    : "It goes from Propoly when the deal is executed, and shows here once it reaches the agent's Outlook."}
              </p>
            </div>
            {first && (
              <button type="button" onClick={() => setOpen(first)} className="shrink-0 rounded-full border border-current/30 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/60">Open</button>
            )}
          </div>
          {(packs.length > 1 || others.length > 0) && (
            <ul className="mt-2.5 space-y-1 border-t border-current/10 pt-2.5">
              {[...packs.slice(0, -1), ...others].map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpen(m)} className="flex w-full items-baseline gap-2 text-left text-[11.5px] hover:underline">
                    <span className="shrink-0 tabular-nums text-muted">{day(m.at)}</span>
                    <span className="min-w-0 truncate">{m.subject || "(no subject)"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {open && <PropolyMailView mail={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
