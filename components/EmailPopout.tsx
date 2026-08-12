"use client";

import { useState } from "react";

/**
 * An email, shown full size before it goes.
 *
 * Both appraisal emails open this rather than living in a corner of the panel:
 * the confirmation and the follow-up are the two things a landlord actually
 * judges us on before they've met anyone, and neither of them fits — or
 * deserves — a ten-line box beside a form.
 *
 * Editable on the way out, always. No template survives contact with a real
 * landlord, and an agent who can't change a sentence sends it from Outlook
 * instead, where nobody ever sees it again.
 */

export default function EmailPopout({
  title,
  to,
  contactId,
  subject,
  body,
  attachments,
  onClose,
  onSent,
  extra,
}: {
  title: string;
  to?: string | null;
  contactId?: string | null;
  subject: string;
  body: string;
  /** Named only — REX sends the words; files stay on the record. */
  attachments?: { id: string; name: string }[];
  onClose: () => void;
  onSent: () => void;
  /** An extra action for the footer (the calendar file on a confirmation). */
  extra?: React.ReactNode;
}) {
  const [subj, setSubj] = useState(subject);
  const [text, setText] = useState(body);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/appraisal-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, contactId, subject: subj, text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Send failed.");
      onSent();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[860px] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-[15px]">{title}</h3>
            <p className="text-[11.5px] text-muted">
              {to ? `To ${to}` : "No email address on file — nothing can go out"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] hover:border-ink/30"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-5">
          <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            Subject
          </label>
          <input
            value={subj}
            onChange={(e) => setSubj(e.target.value)}
            className="mb-3 w-full rounded-xl border border-line/80 bg-card px-3.5 py-2.5 text-[13px] outline-none focus:border-ink"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-0 w-full flex-1 resize-none rounded-2xl border border-line/80 bg-card px-4 py-3.5 text-[13px] leading-relaxed outline-none focus:border-ink"
          />
          {!!attachments?.length && (
            <p className="mt-2 text-[11px] text-muted">
              On the record: {attachments.map((a) => a.name).join(", ")} — these stay here rather
              than going out attached, so nothing large lands in their inbox.
            </p>
          )}
          {msg && (
            <p className="mt-2 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">
              {msg}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-3.5">
          <button
            type="button"
            disabled={sending || !to}
            onClick={send}
            className="rounded-full bg-ink px-5 py-2.5 text-[12.5px] text-page disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send it"}
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(`${subj}\n\n${text}`)}
            className="rounded-full border border-line/80 px-4 py-2.5 text-[12px]"
          >
            Copy
          </button>
          {extra}
          <button
            type="button"
            onClick={() => {
              onSent();
              onClose();
            }}
            className="ml-auto text-[11px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Already sent — move on
          </button>
        </div>
      </div>
    </div>
  );
}
