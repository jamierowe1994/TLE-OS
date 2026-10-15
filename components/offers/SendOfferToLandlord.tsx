"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick, PressButton } from "@/components/Bits";

/**
 * SEND THE OFFER TO THE LANDLORD (Howard, 8 Oct 2026, ticket 0268fdcc).
 *
 * Nothing tells a landlord about an offer by itself (James, 2 Oct 2026). This
 * is the agent doing it: the email as the server draws it, a line of their own
 * to add, and Send. Nothing goes until Send is pressed, and it goes from their
 * own address through the customer email switch (POST /api/offers/landlord-email).
 */

type To = { name: string; email: string | null; problem: string | null };
type Preview = { to: To; subject: string; html: string; last: { at: string; by: string } | null };

const short = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default function SendOfferToLandlord({
  offerRef,
  listingId,
  name,
  onClose,
  onSent,
}: {
  offerRef: string;
  listingId: string;
  /** Who the offer is from, for the heading. */
  name: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [line, setLine] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const seq = useRef(0);

  /* The email redrawn as the line is typed, a beat after the last key. */
  useEffect(() => {
    const n = ++seq.current;
    setDrawing(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/offers/landlord-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ref: offerRef, listingId, line }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<Preview>;
        if (n !== seq.current) return;
        if (j.ok && j.html && j.to) {
          setPreview({ to: j.to, subject: j.subject ?? "", html: j.html, last: j.last ?? null });
          setPreviewError(null);
        } else setPreviewError(j.error ?? "The email couldn't be drawn.");
      } catch {
        if (n === seq.current) setPreviewError("The OS couldn't be reached. Try again in a moment.");
      } finally {
        if (n === seq.current) setDrawing(false);
      }
    }, line ? 450 : 0);
    return () => clearTimeout(t);
  }, [offerRef, listingId, line]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const to = preview?.to ?? null;
  const canSend = Boolean(to?.email) && !sending && !drawing;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch("/api/offers/landlord-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: offerRef, listingId, line, send: true }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; sent?: boolean; detail?: string; error?: string };
      if (j.ok && j.sent) {
        setSent(j.detail ?? "Sent.");
        onSent();
      } else setSendError(j.error ?? j.detail ?? "It did not send.");
    } catch {
      setSendError("It did not send - the OS could not be reached.");
    } finally {
      setSending(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Send the offer to the landlord" className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">{sent ? "On Its Way" : "Send to the Landlord"}</h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">{name}&apos;s offer</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted transition-colors hover:text-ink"
          >
            <DoodleIcon name="cross" size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {sent ? (
            <div className="flex flex-col items-center py-8 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">Sent to {to?.name || "the landlord"}</p>
              <p className="mt-1.5 max-w-sm text-[12.5px] text-muted">{sent}</p>
              <p className="mt-1 max-w-sm text-[12px] text-muted">It&apos;s on the listing&apos;s notes too.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-line/50 bg-white px-3.5 py-3 text-[12.5px]">
                <div className="flex gap-3">
                  <span className="w-12 shrink-0 text-muted">To</span>
                  {to ? (
                    <span className="min-w-0 flex-1 break-words">
                      {to.name || "The landlord"}
                      {to.email && <span className="text-muted"> · {to.email}</span>}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-muted">
                      <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                      Finding the landlord&hellip;
                    </span>
                  )}
                </div>
                {preview && (
                  <div className="mt-1.5 flex gap-3">
                    <span className="w-12 shrink-0 text-muted">Subject</span>
                    <span className="min-w-0 flex-1 break-words">{preview.subject}</span>
                  </div>
                )}
              </div>
              {to?.problem && <p className="mt-2.5 text-[12px] leading-snug text-accent-dark">{to.problem}</p>}
              {preview?.last && (
                <p className="mt-2.5 text-[11.5px] text-muted">
                  Already sent {short(preview.last.at)} by {preview.last.by}. Sending again sends it again.
                </p>
              )}

              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted" htmlFor="offer-landlord-line">
                A line from you
              </label>
              <textarea
                id="offer-landlord-line"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                rows={3}
                maxLength={1500}
                placeholder="What you thought of them at the viewing, or why you'd recommend it. Optional."
                className="mt-1.5 w-full resize-y rounded-xl border border-line/80 bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-ink"
              />

              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">The email</p>
                {drawing && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                    Drawing it&hellip;
                  </span>
                )}
              </div>
              {preview ? (
                <iframe title="The email" srcDoc={preview.html} sandbox="" className="mt-2 h-[420px] w-full rounded-2xl border border-line/70 bg-white" />
              ) : previewError ? (
                <p className="mt-2 text-[12.5px] text-accent-dark">{previewError}</p>
              ) : (
                <div className="mt-2 flex h-[220px] items-center justify-center rounded-2xl border border-line/70 bg-white">
                  <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
                </div>
              )}
              <p className="mt-2.5 text-[11px] leading-snug text-muted">
                Nothing goes until you press Send. It goes from your own email, so their reply comes back to you. No income or contact details are in it.
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line/70 px-5 py-4 sm:px-6">
          {sent ? (
            <button type="button" onClick={onClose} className="ml-auto rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page">
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40">
                Cancel
              </button>
              {sendError && <p className="order-first min-w-0 basis-full text-[12px] leading-snug text-accent-dark sm:order-none sm:flex-1 sm:basis-auto sm:text-right">{sendError}</p>}
              <PressButton
                onClick={send}
                className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${canSend ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
              >
                <span className="flex items-center gap-2">
                  <DoodleIcon name="mail" size={15} />
                  {sending ? "Sending…" : `Send to ${to?.name?.trim().split(/\s+/)[0] || "the landlord"}`}
                </span>
              </PressButton>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
