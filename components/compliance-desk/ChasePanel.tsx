"use client";

import { useEffect, useState } from "react";
import type { ChaseBrief, ChaseRecord } from "@/lib/cert-chase";

/**
 * Chase the Agent, on a certificate (Josel, ticket 11c8acc9, 11 Nov 2026:
 * "a tab to email the agent on OS directly on the cert itself").
 *
 * Opens under the certificate's row in Property Compliance. The message is
 * written for them (what it is, the address, the expiry, what is needed) and
 * is theirs to change before it goes. Below it, every chase on this
 * certificate so far, by hand and automatic, with the words that went.
 */

const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const longWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

function stageWords(stage: number | null): string {
  return stage === 0 ? "on expiry" : stage != null ? `${stage} days before` : "";
}

/**
 * The history a certificate row shows in one line, oldest first:
 * "Chased Sam, 3 Nov by Josel; reminder sent 10 Nov". Newest three only.
 */
export function chaseLine(briefs: ChaseBrief[] | undefined): string | null {
  if (!briefs?.length) return null;
  const parts = briefs
    .slice(0, 3)
    .reverse()
    .map((b, i) => {
      const who = first(b.agentName || "the agent");
      if (b.how === "auto") {
        return b.sent ? `${i === 0 ? "Reminder" : "reminder"} sent to ${who} ${shortDay(b.at)}` : `${i === 0 ? "Reminder" : "reminder"} to ${who} did not go ${shortDay(b.at)}`;
      }
      return b.sent
        ? `${i === 0 ? "Chased" : "chased"} ${who}, ${shortDay(b.at)} by ${first(b.byName)}`
        : `${i === 0 ? "Chase" : "chase"} to ${who} did not go, ${shortDay(b.at)}`;
    });
  const more = briefs.length > 3 ? ` (${briefs.length} in all)` : "";
  return `${parts.join("; ")}${more}`;
}

type Loaded = {
  ok: boolean;
  error?: string;
  live?: boolean;
  agent?: { name: string | null; email: string | null; canEmail: boolean; why: string | null };
  from?: "mailbox" | "ours";
  draft?: { subject: string; message: string; expiry: string | null };
  history?: ChaseRecord[] | null;
};

export function History({ items }: { items: ChaseRecord[] | null | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  if (items === null) return <p className="text-[11.5px] text-accent-dark">The chase record could not be read, so this cannot say who has been chased.</p>;
  if (!items?.length) return <p className="text-[11.5px] text-muted">Nobody has been chased about this certificate yet.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg border border-line/60 bg-white px-3 py-2">
          <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-left">
            <span className="text-[12px]">
              {c.how === "auto" ? (
                <>
                  Automatic reminder to <span className="font-semibold">{c.agentName}</span>
                  {c.stage != null ? `, ${stageWords(c.stage)}` : ""}
                </>
              ) : (
                <>
                  <span className="font-semibold">{c.byName}</span> chased <span className="font-semibold">{c.agentName}</span>
                </>
              )}
              {!c.sent && <span className="text-accent-dark"> - did not go{c.note ? `: ${c.note}` : ""}</span>}
            </span>
            <span className="text-[11px] text-muted">
              {longWhen(c.at)}
              {c.sent ? (c.via === "mailbox" ? " · from their Outlook" : " · from TLE OS") : ""}
            </span>
          </button>
          {open === c.id && c.message && (
            <div className="mt-2 border-t border-line/50 pt-2">
              <p className="text-[11.5px] font-semibold">{c.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">{c.message}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ChasePanel({
  propertyId,
  cert,
  onClose,
  onChased,
}: {
  propertyId: string;
  cert: string;
  onClose: () => void;
  /** After a send, with the certificate's whole history as it now stands. */
  onChased: (history: ChaseRecord[]) => void;
}) {
  const [d, setD] = useState<Loaded | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/compliance/chase?propertyId=${encodeURIComponent(propertyId)}&cert=${encodeURIComponent(cert)}`)
      .then((r) => r.json())
      .then((j: Loaded) => {
        if (!live) return;
        setD(j);
        if (j.draft) {
          setSubject(j.draft.subject);
          setMessage(j.draft.message);
        }
      })
      .catch(() => live && setD({ ok: false, error: "The OS could not be reached. Try again." }));
    return () => {
      live = false;
    };
  }, [propertyId, cert]);

  async function send() {
    setBusy(true);
    setSaid(null);
    try {
      const j = await fetch("/api/compliance/chase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId, cert, subject, message }),
      }).then((r) => r.json());
      setSaid({ ok: Boolean(j.ok), text: j.said || j.error || "That did not go." });
      if (Array.isArray(j.history)) {
        setD((cur) => (cur ? { ...cur, history: j.history } : cur));
        onChased(j.history);
      }
    } catch {
      setSaid({ ok: false, text: "That did not go - the OS could not be reached. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] text-ink";
  return (
    <div className="rounded-xl border border-line/70 bg-page p-3.5">
      {!d ? (
        <p className="flex items-center gap-2 text-[11.5px] text-muted">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
          Finding the agent and writing the message…
        </p>
      ) : !d.ok ? (
        <>
          <p className="text-[12px] text-accent-dark">{d.error}</p>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          {d.agent?.canEmail ? (
            <p className="text-[12px] leading-relaxed">
              To <span className="font-semibold">{d.agent.name}</span>
              <span className="text-muted"> ({d.agent.email})</span>,{" "}
              <span className="text-muted">
                {d.from === "mailbox" ? "from your Outlook, so their reply comes back to you." : "from TLE OS, with your address to reply to."}
              </span>
            </p>
          ) : (
            <p className="text-[12px] leading-relaxed text-accent-dark">{d.agent?.why ?? "There is nobody to email."}</p>
          )}
          {d.live === false && (
            <p className="mt-1 text-[11px] text-muted">Not live: this laptop has no REX, so the certificate is from a stand-in book.</p>
          )}
          {d.agent?.canEmail && (
            <div className="mt-2.5 space-y-2">
              <label className="block text-[10.5px] text-muted">
                Subject
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={`mt-1 ${field}`} />
              </label>
              <label className="block text-[10.5px] text-muted">
                Message
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} maxLength={10_000} className={`mt-1 ${field} leading-relaxed`} />
              </label>
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
            {said && <p className={`mr-auto text-[11.5px] ${said.ok ? "text-[#2f6b3a]" : "text-accent-dark"}`}>{said.text}</p>}
            <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">
              Close
            </button>
            {d.agent?.canEmail && (
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !subject.trim() || !message.trim()}
                className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send to the Agent"}
              </button>
            )}
          </div>
          <div className="mt-3 border-t border-line/60 pt-3">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted">Chased so Far</p>
            <History items={d.history} />
          </div>
        </>
      )}
    </div>
  );
}
