"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PressButton } from "@/components/Bits";
import DoodleIcon from "@/components/DoodleIcon";
import { JOB_MERGE_HINT, type JobMessagePerson, type JobMessageTemplate } from "@/lib/works-message";

/**
 * Message the landlord and the tenants about a job, in one go (Sean McMahon,
 * ticket 055aeda4, 10 Nov 2026). Who, what, and what they will receive side
 * by side, the same window as an email to one person (components/Compose),
 * sent by /api/works-orders/<id>/message: a copy each, with their own name,
 * and one line on the job's timeline.
 */
export default function JobMessage({ jobId, jobTitle, open, onClose, onSent }: {
  jobId: string;
  jobTitle: string;
  open: boolean;
  onClose: () => void;
  /** After a send, so the page reads the job's timeline again. */
  onSent?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [load, setLoad] = useState<{ state: "loading" } | { state: "failed"; error: string } | { state: "ready"; people: JobMessagePerson[]; templates: JobMessageTemplate[]; sendEnabled: boolean }>({ state: "loading" });
  const [to, setTo] = useState<string[]>([]);
  const [picked, setPicked] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<{ html: string; missing: string[]; to: string | null } | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoad({ state: "loading" });
    setTo([]);
    setPicked("");
    setSubject("");
    setBody("");
    setPreview(null);
    setNote(null);
    fetch(`/api/works-orders/${encodeURIComponent(jobId)}/message`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.ok) return setLoad({ state: "failed", error: j?.error ?? "The job's people did not load." });
        setLoad({ state: "ready", people: j.people, templates: j.templates, sendEnabled: Boolean(j.sendEnabled) });
      })
      .catch(() => live && setLoad({ state: "failed", error: "The job's people did not load. Try again in a minute." }));
    return () => {
      live = false;
    };
  }, [open, jobId]);

  /* What the first person ticked will receive, a moment after the typing stops. */
  useEffect(() => {
    if (!open || !body.trim()) return void setPreview(null);
    const t = setTimeout(() => {
      fetch(`/api/works-orders/${encodeURIComponent(jobId)}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, body, intent: "preview" }),
      })
        .then((r) => r.json())
        .then((j) => j?.ok && setPreview({ html: j.html, missing: j.missing ?? [], to: j.to ?? null }))
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, [open, jobId, to, subject, body]);

  if (!open || !mounted) return null;

  const people = load.state === "ready" ? load.people : [];
  const templates = load.state === "ready" ? load.templates : [];
  const sendEnabled = load.state === "ready" && load.sendEnabled;
  const toggle = (key: string) => setTo((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const choose = (t: JobMessageTemplate) => {
    setPicked(t.id);
    setSubject(t.subject);
    setBody(t.body);
    setNote(null);
  };
  const chosen = people.filter((p) => to.includes(p.key));
  const missing = preview?.missing ?? [];
  const canSend = sendEnabled && chosen.length > 0 && chosen.every((p) => p.email) && body.trim().length > 0 && !missing.length;
  const group = (role: "landlord" | "tenant") => people.filter((p) => p.role === role);

  const send = async () => {
    setNote(null);
    const r = await fetch(`/api/works-orders/${encodeURIComponent(jobId)}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, subject, body, intent: "send" }),
    });
    const j = await r.json().catch(() => null);
    const sent: string[] = j?.sent ?? [];
    if (sent.length) onSent?.();
    if (sent.length && !j?.error) {
      onClose();
      return;
    }
    setNote({ tone: sent.length ? "good" : "bad", text: [sent.length ? `Sent to ${sent.join(", ")}.` : "", j?.error ?? (sent.length ? "" : "It did not go. Try again in a minute.")].filter(Boolean).join(" ") });
  };

  return createPortal(
    <div data-look="new" className="nl-compose-wrap" style={{ zIndex: 430 }} onClick={onClose}>
      <aside className="nl-compose" style={{ height: "min(860px, calc(100dvh - 6vh))" }} role="dialog" aria-label="Message about this job" onClick={(e) => e.stopPropagation()}>
        <header className="nl-compose-head">
          <div className="min-w-0">
            <p className="nl-compose-title">Message about this Job</p>
            <p className="nl-compose-to">{jobTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="nl-compose-x" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div className="nl-compose-main">
          <div className="nl-compose-write">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Who it goes to</p>
            {load.state === "loading" ? (
              <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
                <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />
                Reading who is on the job…
              </p>
            ) : load.state === "failed" ? (
              <p className="mt-2 text-[12.5px] text-accent-dark">{load.error}</p>
            ) : (
              <div className="mt-2 grid gap-3 sm:grid-cols-2" data-job-message-people>
                {(["landlord", "tenant"] as const).map((role) => {
                  const list = group(role);
                  return (
                    <div key={role} className="min-w-0">
                      <p className="text-[11.5px] text-muted">{role === "landlord" ? "Landlord" : list.length > 1 ? `Tenants (${list.length})` : "Tenant"}</p>
                      {list.length === 0 ? (
                        <p className="mt-1 text-[12.5px] text-muted">No tenant on this job.</p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-1">
                          {list.map((p) => (
                            <li key={p.key}>
                              <label className={`flex min-w-0 items-start gap-2 border border-line/80 bg-white px-3 py-2 ${p.email ? "cursor-pointer hover:border-ink/40" : "opacity-60"}`}>
                                <input type="checkbox" className="mt-[3px]" disabled={!p.email} checked={to.includes(p.key)} onChange={() => toggle(p.key)} />
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                                  <span className="block truncate text-[11.5px] text-muted">{p.email ?? "No email on file"}{p.email && p.note ? ` - ${p.note}` : ""}</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {people.some((p) => p.role === "tenant" && p.note === "A discreet job") && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">A discreet job: the tenants are not told anything automatically. Only tick them if they should hear about it.</p>
            )}

            <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-muted">Start from</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => choose(t)}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${picked === t.id ? "border-accent-dark bg-accent-soft/40" : "border-line/80 hover:border-ink/40"}`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px]" placeholder="What it is about" />
            </label>
            <label className="mt-4 block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Message</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="mt-1.5 w-full resize-y rounded-xl border border-line/80 bg-panel px-3 py-2.5 text-[13px] leading-relaxed" placeholder="Pick a starting point above, or write it here" />
            </label>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">Each person gets their own copy with their own name. You can use {JOB_MERGE_HINT}.</p>

            {missing.length > 0 && (
              <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-3 text-[12px] leading-relaxed">
                The job has nothing to fill {missing.map((m) => `{{${m}}}`).join(", ")} yet. Type over it, or pick another starting point.
              </p>
            )}
          </div>

          <div className="nl-compose-preview">
            <p className="nl-compose-k">What {preview?.to && chosen.length ? preview.to.split(/\s+/)[0] : "they"} will receive</p>
            {preview ? (
              <iframe title="Email preview" srcDoc={preview.html} sandbox="" />
            ) : (
              <p className="nl-compose-empty">Pick who it goes to and a starting point, and it shows here as they will see it.</p>
            )}
          </div>
        </div>

        <div className="nl-compose-foot">
          <p className={`text-[11px] leading-relaxed ${note ? (note.tone === "bad" ? "text-accent-dark" : "text-ink") : "text-muted"}`} role={note ? "status" : undefined}>
            {note
              ? note.text
              : load.state !== "ready"
              ? ""
              : !sendEnabled
                ? "Email to landlords and tenants is switched off, so this cannot go from here. Ring them, or send it from Outlook if it cannot wait."
                : chosen.length
                  ? `Goes to ${chosen.map((p) => p.name).join(", ")}, and is noted on the job.`
                  : "Tick who it goes to."}
          </p>
          <PressButton onClick={send} disabled={!canSend} className="nl-btn nl-btn--primary">
            <DoodleIcon name="mail" size={13} />
            {load.state === "ready" && !sendEnabled ? "Sending is off" : chosen.length > 1 ? `Send to ${chosen.length} people` : "Send"}
          </PressButton>
        </div>
      </aside>
    </div>,
    document.body
  );
}
