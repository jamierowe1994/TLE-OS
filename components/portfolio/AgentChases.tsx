"use client";

import { useEffect } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The certificate reminders sent to the agent about this home, on the home
 * itself (Michael Healy, ticket 7717f8d1, 17 Nov 2026: the compliance desk
 * says "Reminder sent to Richard 12 Nov; reminder sent to Richard 15 Nov",
 * and the property page showed none of it). Read from
 * GET /api/property/agent-chases: the same rows the desk lists, the automatic
 * reminders and Chase the Agent by hand, each opening the email as it went.
 */

export type AgentChase = {
  id: string;
  at: string;
  property: string;
  cert: string;
  certLabel: string;
  expiry: string | null;
  certState: string;
  agentName: string;
  agentEmail: string;
  how: "hand" | "auto";
  stage: number | null;
  byName: string;
  subject: string;
  message: string;
  sent: boolean;
  via: "mailbox" | "ours" | null;
  note: string;
};

export type ChasesLoaded = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; chases: AgentChase[]; office: boolean };

const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Automatic reminder, 7 days before" / "Michael Healy, by hand". */
export function chaseHow(c: AgentChase): string {
  if (c.how === "auto") return c.stage === 0 ? "Automatic reminder, on the day it expired" : c.stage ? `Automatic reminder, ${c.stage} days before it expires` : "Automatic reminder";
  return `${c.byName || "The compliance office"}, by hand`;
}

/** One line for the latest activity. */
export function chaseLine(c: AgentChase): { title: string; sub: string } {
  return {
    title: `${c.sent ? "Agent reminded" : "Agent reminder not sent"} · ${c.certLabel || c.cert}`,
    sub: `${c.how === "auto" ? "Automatic reminder" : `By ${c.byName || "hand"}`} to ${c.agentName || "the agent"}`,
  };
}

export function AgentChaseList({ loaded, onOpen, look = true }: { loaded: ChasesLoaded; onOpen: (c: AgentChase) => void; look?: boolean }) {
  if (loaded.state === "loading") return <p className="nl-meta text-[12.5px] text-muted">Reading the reminders sent to the agent…</p>;
  if (loaded.state === "failed" || !Array.isArray(loaded.chases)) {
    return <p className="nl-meta text-[12.5px] text-accent-dark">The reminders couldn&apos;t be read: {loaded.state === "failed" ? loaded.error : "refresh the page to try again."}</p>;
  }
  const { chases, office } = loaded;
  const none = office ? "No certificate reminders have gone to the agent about this home." : "No certificate reminders have come to you about this home.";
  if (!look) {
    return (
      <section aria-label="Reminders to the agent">
        <h3 className="mb-2 text-[15px] font-normal">Reminders to the Agent <span className="text-[12px] text-muted">{chases.length}</span></h3>
        {chases.length === 0 ? <p className="text-[12.5px] text-muted">{none}</p> : (
          <ul className="divide-y divide-line/50 rounded-2xl border border-line/70 bg-white">
            {chases.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpen(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[12.5px] hover:bg-page">
                  <DoodleIcon name="mail" size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.certLabel || c.cert} · to {c.agentName || "the agent"}</span>
                    <span className="block truncate text-[11.5px] text-muted">{chaseHow(c)}</span>
                  </span>
                  <span className={`shrink-0 text-[11.5px] ${c.sent ? "text-muted" : "text-accent-dark"}`}>{c.sent ? stamp(c.at) : `Not sent · ${stamp(c.at)}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  return (
    <section className="nl-prop-group" aria-label="Reminders to the agent">
      <h3 className="nl-prop-group-title">Reminders to the Agent <span className="nl-meta">{chases.length}</span></h3>
      {chases.length === 0 ? (
        <p className="nl-prop-blank">{none}</p>
      ) : (
        <ul className="nl-prop-list">
          {chases.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c)} className="nl-prop-job">
                <span className={`nl-prop-row-ic${c.sent ? "" : " is-hot"}`} aria-hidden><DoodleIcon name="mail" size={17} /></span>
                <span className="min-w-0">
                  <span className="nl-prop-row-title">{c.certLabel || c.cert} · to {c.agentName || "the agent"}</span>
                  <span className="nl-meta block truncate">{chaseHow(c)}</span>
                </span>
                <span className={`nl-prop-job-next${c.sent ? "" : " is-hot"}`}>{c.sent ? stamp(c.at) : `Not sent · ${stamp(c.at)}`}</span>
                <span className="nl-link">Read it</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="nl-meta nl-prop-group-foot">The same reminders the compliance desk lists, automatic and by hand.</p>
    </section>
  );
}

export function AgentChaseView({ chase: c, onClose }: { chase: AgentChase; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto p-3 text-ink sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[760px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-normal leading-tight">Reminder to {first(c.agentName) || "the Agent"}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{c.certLabel || c.cert} · {c.property} · {c.sent ? "sent" : "not sent"} {stamp(c.at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink"><DoodleIcon name="cross" size={13} /></button>
        </div>
        <div className="rounded-2xl border border-line/60 bg-card p-4 text-[12.5px]">
          <p className="break-words text-[14px] font-semibold">{c.subject || "(no subject)"}</p>
          <dl className="mt-2 grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
            <dt>To</dt><dd className="break-words">{c.agentName}{c.agentEmail ? ` <${c.agentEmail}>` : ""}</dd>
            <dt>From</dt><dd className="break-words">{c.how === "auto" ? "TLE OS, automatic reminder" : `${c.byName}${c.via === "mailbox" ? ", from their Outlook" : ""}`}</dd>
          </dl>
          <div className="mt-3 max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words border-t border-line/50 pt-3 text-[12.5px] leading-relaxed">{c.message || "The wording wasn't kept for this one."}</div>
        </div>
        {(!c.sent || c.note) && <p className="mt-3 text-[11.5px] text-accent-dark">{c.sent ? c.note : `It didn't go${c.note ? `: ${c.note}` : "."}`}</p>}
        <p className="mt-3 text-[11px] text-muted">{chaseHow(c)}. Every reminder is also on the compliance desk&apos;s list.</p>
      </div>
    </div>
  );
}
