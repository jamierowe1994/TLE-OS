"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

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

export type ViewingBookingInput = {
  leadId: string;
  listingId?: string | number | null;
  applicantName: string;
  applicantEmail?: string | null;
  address: string;
  startsAt: string;
  minutes: number;
  unaccompanied?: boolean;
};

type Target = { kind: "appraisal"; id: string } | { kind: "viewing"; booking: ViewingBookingInput };

type Draft = {
  ok: boolean;
  error?: string;
  to: string | null;
  toName: string;
  subject: string;
  html: string;
  blocked?: string;
  alreadySent?: { at: string; to: string; subject: string };
  moved?: { from: string };
  attachment: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  const payload = target.kind === "appraisal" ? { kind: "appraisal", id: target.id } : { kind: "viewing", booking: target.booking };

  useEffect(() => {
    let live = true;
    fetch("/api/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "draft", ...payload }),
    })
      .then((r) => r.json())
      .then((d: Draft) => {
        if (!live) return;
        setDraft(d);
        setSubject(d.subject ?? "");
      })
      .catch(() => live && setDraft({ ok: false, error: "Couldn't load the email.", to: null, toName: "", subject: "", html: "", attachment: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  /* The email is edited where it sits: the preview IS the editor. */
  function armEditing() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.designMode = "on";
    const style = doc.createElement("style");
    style.setAttribute("data-editor", "1");
    style.textContent = "html{cursor:text} a{pointer-events:none}";
    doc.head?.appendChild(style);
  }

  function editedHtml(): string | undefined {
    const doc = frame.current?.contentDocument;
    if (!doc?.documentElement) return undefined;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("style[data-editor]").forEach((n) => n.remove());
    return `<!DOCTYPE html>\n${clone.outerHTML}`;
  }

  async function send() {
    if (!draft?.ok || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", ...payload, subject, html: editedHtml(), again: Boolean(draft.alreadySent) }),
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
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {draft === null ? "Getting the email ready…" : draft.to ? `To ${draft.toName} · ${draft.to}` : `To ${draft.toName || "them"} · no email address`}
            </p>
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

        {draft === null ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12.5px] text-muted">
            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
            Getting the email ready…
          </div>
        ) : !draft.ok ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-muted">{draft.error ?? "Couldn't load the email."}</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
            {draft.blocked && (
              <p className="rounded-xl bg-accent-soft/70 px-3.5 py-2.5 text-[12px] leading-snug text-accent-dark">{draft.blocked}</p>
            )}
            {draft.alreadySent && (
              <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-snug text-amber-900">
                <span className="font-semibold">Already sent</span> to {draft.alreadySent.to} on {when(draft.alreadySent.at)}. Sending
                again sends them a second email.
              </p>
            )}
            {draft.moved && (
              <p className="rounded-xl bg-panel px-3.5 py-2.5 text-[12px] leading-snug text-muted">
                They were confirmed for {when(draft.moved.from)}. The time has changed, so this one says it has moved.
              </p>
            )}

            <label className="block">
              <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Subject</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-line/80 bg-card px-3.5 py-2.5 text-[13px] outline-none focus:border-ink"
              />
            </label>

            <div className="flex min-h-0 flex-1 flex-col">
              <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                The email
                <span className="font-normal normal-case tracking-normal">Click into any of it to change the words.</span>
              </p>
              <iframe
                ref={frame}
                title="The email, editable"
                srcDoc={draft.html}
                onLoad={armEditing}
                sandbox="allow-same-origin"
                className="min-h-[260px] w-full flex-1 rounded-2xl border border-line/80 bg-white"
              />
            </div>

            {draft.attachment && (
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <DoodleIcon name="calendar" size={12} /> The calendar invite goes with it.
              </p>
            )}
            {msg && <p className="rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">{msg}</p>}
          </div>
        )}

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
