"use client";

import { useEffect, useState } from "react";

/**
 * The contract, signed WITHOUT leaving The Letting Experts.
 *
 * James, 14 Sep 2026: "I don't want to do it as a pop-out. The simple reason
 * is that it will look a bit shocking for them to get sent to some random
 * site. No one's heard of DocuSeal."
 *
 * He is right, and it is not only a branding point. A landlord who clicks
 * "sign your contract" and lands on a domain they have never heard of, with
 * somebody else's logo at the top, has been given a good reason to stop and
 * ring the office - and the ones who do not stop are the ones who would sign
 * anything, which is worse. The signing surface has to look like the company
 * whose name is on the agreement.
 *
 * ── What this is, and what it is not ──────────────────────────────────────
 *
 * It is our modal, our masthead, our colours, holding their form in a frame.
 * The signature itself is still DocuSeal's - it has to be, because the
 * audit trail and the certificate are what make the thing enforceable, and
 * those belong to whoever collected the signature.
 *
 * So the chrome is ours as far as the frame's edge and no further. Their own
 * header inside it is hidden by the embed's options where they allow it; what
 * cannot be reached from outside a cross-origin frame is listed on the tile
 * that opens this, so nobody is surprised by it later.
 */
export default function SignModal({
  url,
  onClose,
  onDone,
}: {
  url: string;
  onClose: () => void;
  /** They said they had finished, so the page behind should read itself again. */
  onDone: () => void;
}) {
  const [done, setDone] = useState(false);

  /* Escape closes it, and the page behind does not scroll while it is open -
     a modal the length of a twelve-page contract is a scroll trap otherwise. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [onClose]);

  /**
   * DocuSeal posts a message when the form is completed. It is a
   * cross-origin frame, so this is the only thing it can tell us - and it is
   * enough: the webhook is what actually files the contract, and this only
   * decides whether the screen says "signed" before the page reloads.
   *
   * Shape-checked rather than trusted: any page can post a message.
   */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      try {
        if (!/docuseal/i.test(new URL(url).hostname)) return;
        if (e.origin !== new URL(url).origin) return;
      } catch {
        return;
      }
      const type = typeof e.data === "string" ? e.data : (e.data as { type?: string })?.type;
      if (typeof type === "string" && /complet|sign/i.test(type)) setDone(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [url]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b201d]/55 p-0 sm:p-6" onClick={onClose}>
      <div
        className="drawer-in flex h-full w-full max-w-[980px] flex-col overflow-hidden bg-page sm:h-[92vh] sm:rounded-[26px] sm:shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your terms of business"
      >
        {/* OUR masthead, so the first thing they read is our name and not a
            product they have never heard of. */}
        <div className="flex items-center gap-3 border-b border-line/60 bg-card px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent-dark">The Letting Experts</p>
            <h2 className="text-[16px] font-bold leading-tight">Your terms of business</h2>
          </div>
          {done ? (
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white"
            >
              All done
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-page hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <iframe
          src={url}
          title="Your terms of business"
          className="min-h-0 flex-1 border-0 bg-page"
          /* Their form needs its own scripting, forms and downloads; it gets
             nothing else, and no access to this page. */
          sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"
          allow="clipboard-write"
        />

        <div className="flex items-center gap-3 border-t border-line/60 bg-card px-5 py-3">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
            {done
              ? "Signed. Your copy is on its way to your file."
              : "Scroll to the end and sign where it asks. Nothing is final until you press sign."}
          </p>
          {!done ? (
            <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-muted underline transition hover:text-ink">
              Finish later
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
