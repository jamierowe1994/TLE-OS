"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * EMAIL THE TEAM, IN A FEW TICKS (James, 6 Nov 2026; app/api/mail-threads/team).
 *
 * "We need to make sending them an email really easy - offering them options
 * on the failed reasons, ask additional questions etc." So: who it goes to,
 * suggested first; the pack's own reasons to tick; the questions that come up
 * every week to tick; a note if there is more to say. Then a look at the email
 * as it will read, and Send. It goes from the sender's own Outlook, and every
 * reply in that thread is saved on the record. A new email is not.
 */

type Person = { name: string; email: string; role: string; why?: string };
type Ready = { address: string; reasons: string[]; suggested: Person[]; everyone: Person[]; outlook: string | null; viewingAs: boolean };

/* The questions that come up again and again between an agent and the office. */
const QUESTIONS = [
  "Can you send the missing document, or save it on the OS?",
  "Can the landlord confirm this in writing?",
  "Is the engineer or contractor scheme registered (Gas Safe, NICEIC, NAPIT or similar)?",
  "Has the tenant been told?",
  "When will this be sorted by?",
  "Can you give me a call about this?",
];

const field = "w-full rounded-xl border border-line/80 bg-white px-3 py-2.5 text-[13px] outline-none transition focus:border-ink";

export default function TeamEmail({ caseId, listing, listings, title = "Email the Team", onClose, onSent }: {
  caseId?: string;
  listing?: string;
  listings?: string[];
  title?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [own, setOwn] = useState("");
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const qs = new URLSearchParams(caseId ? { case: caseId } : { listing: listing ?? "", listings: (listings ?? []).join(",") });
    fetch(`/api/mail-threads/team?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) return setErr(j?.error ?? "The team couldn't be read just now.");
        setReady(j);
        /* The agent on it, straight away, when the office is writing; nobody when it is unclear. */
        const agent = (j.suggested as Person[]).find((p) => p.why === "The agent");
        if (agent) setTo([agent.email]);
        setSubject(`${String(j.address).split(",")[0]} - ${caseId ? "the PLC check" : "a question"}`);
      })
      .catch(() => setErr("The team couldn't be read just now."));
  }, [caseId, listing, listings]);

  const byEmail = useMemo(() => new Map((ready?.everyone ?? []).concat(ready?.suggested ?? []).map((p) => [p.email, p])), [ready]);
  const toggle = (setter: (f: (x: string[]) => string[]) => void, v: string) => setter((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]));
  const allQuestions = [...questions, ...(own.trim() ? [own.trim()] : [])];
  const problem = !to.length ? "Pick who it goes to." : !reasons.length && !allQuestions.length && !note.trim() ? "Tick a reason or a question, or write a note." : !subject.trim() ? "Give it a subject." : null;

  async function send() {
    setSending(true);
    setErr(null);
    const j = await fetch("/api/mail-threads/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ case: caseId, listing, listings, to, subject, reasons, questions: allQuestions, note }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "That email didn't go. Try again in a minute." }));
    setSending(false);
    if (!j.ok) return setErr(j.error ?? "That email didn't go.");
    setSent(j.detail ?? "Sent.");
    onSent?.();
  }

  const names = to.map((e) => (byEmail.get(e)?.name ?? e).split(/\s+/)[0]);
  const hi = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[680px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-7">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-normal leading-tight">{title}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{ready?.address ?? "…"}{ready?.outlook ? ` · from ${ready.outlook}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink"><DoodleIcon name="cross" size={13} /></button>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-line/60 bg-white p-5 text-[13px]">
            <p className="flex items-center gap-2 font-semibold"><DoodleIcon name="check" size={15} className="text-accent-dark" />Sent</p>
            <p className="mt-1.5 text-muted">{sent}</p>
            <button type="button" onClick={onClose} className="mt-4 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">Done</button>
          </div>
        ) : !ready ? (
          err ? <p className="text-[12.5px] text-accent-dark">{err}</p> : <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Getting the team…</p>
        ) : !ready.outlook || ready.viewingAs ? (
          <p className="rounded-xl border border-line/60 bg-white px-4 py-3 text-[12.5px] text-muted">
            {ready.viewingAs
              ? "This goes from your own Outlook, so it can't be sent while you're viewing as somebody."
              : "Connect your Outlook on your Profile first. It goes from your own mailbox so the replies come back to you, and onto the record."}
          </p>
        ) : checking ? (
          <>
            <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted">Check it</p>
            <div className="mt-2 rounded-2xl border border-line/60 bg-white p-5 text-[13px] leading-relaxed">
              <p className="text-[11.5px] text-muted">To {to.map((e) => byEmail.get(e)?.name ?? e).join(", ")}</p>
              <p className="mt-0.5 font-semibold">{subject}</p>
              <div className="mt-3 space-y-3">
                <p>Hi {hi},</p>
                <p>This is about {ready.address}.</p>
                {reasons.length > 0 && (<><p>{reasons.length === 1 ? "The point to look at:" : "The points to look at:"}</p><ul className="list-disc space-y-1 pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul></>)}
                {allQuestions.length > 0 && (<><p>Could you let me know:</p><ul className="list-disc space-y-1 pl-5">{allQuestions.map((r) => <li key={r}>{r}</li>)}</ul></>)}
                {note.trim() && <p className="whitespace-pre-wrap">{note.trim()}</p>}
                <p>Reply to this email and your answer is saved on the record.</p>
              </div>
            </div>
            {err && <p className="mt-3 text-[12.5px] text-accent-dark">{err}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={sending} onClick={() => void send()} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
              <button type="button" disabled={sending} onClick={() => setChecking(false)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40">Change It</button>
            </div>
          </>
        ) : (
          <div className="space-y-5 text-[13px]">
            <section>
              <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted">Who It Goes To</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ready.suggested.map((p) => (
                  <button key={p.email} type="button" onClick={() => toggle(setTo, p.email)} className={`rounded-full border px-3 py-1.5 text-[12px] ${to.includes(p.email) ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink/40"}`}>
                    {p.name}{p.why ? <span className={to.includes(p.email) ? "opacity-70" : "text-muted"}> · {p.why}</span> : null}
                  </button>
                ))}
                {to.filter((e) => !ready.suggested.some((p) => p.email === e)).map((e) => (
                  <button key={e} type="button" onClick={() => toggle(setTo, e)} className="rounded-full border border-ink bg-ink px-3 py-1.5 text-[12px] text-page">{byEmail.get(e)?.name ?? e}</button>
                ))}
              </div>
              <select value={adding} onChange={(e) => { if (e.target.value) toggle(setTo, e.target.value); setAdding(""); }} className={`mt-2 ${field} sm:w-[320px]`}>
                <option value="">Add somebody else…</option>
                {ready.everyone.filter((p) => !to.includes(p.email)).map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
              </select>
            </section>

            {ready.reasons.length > 0 && (
              <section>
                <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted">What It&apos;s About</p>
                <ul className="mt-2 space-y-1.5">
                  {ready.reasons.map((r) => (
                    <li key={r}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/50 bg-white px-3 py-2.5 hover:border-ink/30">
                        <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggle(setReasons, r)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" />
                        <span className="min-w-0 break-words leading-snug">{r}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted">Ask Them</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUESTIONS.map((qn) => (
                  <button key={qn} type="button" onClick={() => toggle(setQuestions, qn)} className={`rounded-full border px-3 py-1.5 text-left text-[12px] ${questions.includes(qn) ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink/40"}`}>{qn}</button>
                ))}
              </div>
              <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Another question of your own" className={`mt-2 ${field}`} />
            </section>

            <section>
              <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted">Anything Else</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="A note, if the ticks don't say it all" className={`mt-2 ${field} resize-y`} />
              <label className="mt-3 block text-[11.5px] uppercase tracking-[0.14em] text-muted">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-2 ${field}`} />
            </section>

            <div className="flex flex-wrap items-center gap-3 border-t border-line/50 pt-4">
              <button type="button" disabled={Boolean(problem)} onClick={() => setChecking(true)} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40">Check and Send</button>
              {problem && <span className="text-[12px] text-muted">{problem}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
