"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import ConfirmEditor, { payloadOf, type ConfirmDraft, type ConfirmEditorHandle, type ConfirmTarget } from "@/components/ConfirmEditor";

/**
 * A booking confirmation, shown before it goes (James, 17 Sep 2026).
 *
 * "They should have an option to send an email. They can then see the
 * template and rewrite any parts of it that they need to ... What we don't
 * want to do is for emails to be sent out and for them not to be aware."
 *
 * So booking only books, and this opens straight after: who it is going to,
 * the subject, and the email itself exactly as it will arrive, editable in
 * place - click into any sentence and change it. Send, or Not now. Nothing
 * leaves until Send is pressed.
 *
 * The server keeps what was sent (lib/confirmations). The same appointment at
 * the same time is never confirmed twice by accident: the sheet says when it
 * went, and the button becomes Send again. A moved appointment says so.
 */

export type { ViewingBookingInput } from "@/components/ConfirmEditor";

type Target = ConfirmTarget;

export default function ConfirmSheet({
  target,
  title,
  onClose,
  onSent,
}: {
  target: Target;
  title?: string;
  onClose: () => void;
  /** After a send went, with the sentence to show on the record. */
  onSent: (detail: string) => void;
}) {
  const [draft, setDraft] = useState<ConfirmDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const editor = useRef<ConfirmEditorHandle>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  async function send() {
    if (!draft?.ok || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", ...payloadOf(target), subject: editor.current?.subject, html: editor.current?.html(), again: Boolean(draft.alreadySent) }),
      });
      const j = (await r.json()) as { sent?: boolean; detail?: string; error?: string };
      if (!j.sent) throw new Error(j.detail ?? j.error ?? "It didn't send.");
      onSent(j.detail ?? "Confirmation sent.");
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "It didn't send.");
      setSending(false);
    }
  }

  const canSend = Boolean(draft?.ok && draft.to && !draft.blocked);

  /* Portalled to <body>: it opens from inside cards and drawers that animate
     with a transform, and a transformed ancestor turns "fixed" into "fixed
     to that card" - the sheet came up squashed inside the appointment box. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => !sending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Send the confirmation"}
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex h-full max-h-[900px] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name="mail" size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] leading-tight">{title ?? "Send the confirmation"}</h3>
            <p className="mt-0.5 truncate text-[12px] text-muted">Nothing goes until you press Send.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
          <ConfirmEditor ref={editor} target={target} onDraft={setDraft} />
          {msg && <p className="rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">{msg}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-3.5">
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend || sending}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            <DoodleIcon name="mail" size={13} />
            {sending ? "Sending…" : draft?.alreadySent ? "Send again" : "Send"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40"
          >
            Not now
          </button>
          <span className="ml-auto text-[11px] text-muted">Nothing goes until you press Send.</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
