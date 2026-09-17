"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * SIGNED - AND WHAT COMES NEXT (James, 17 Sep 2026).
 *
 * "After they've signed the contract, we should pop up and then say, Cool.
 * The next thing you need to sort out is your compliance. Fill out this
 * questionnaire, and give them a button." Before this the contract closed and
 * the page behind still said Sign your contract.
 *
 * The signed copy reaches us a few seconds after the last press (DocuSeal's
 * webhook), and the questions only open once it has. So the pop-up comes up
 * straight away and waits for that before its buttons go anywhere - a
 * landlord who has just signed must not land on a page that says they haven't.
 */
export default function SignedNext({ appraisalId }: { appraisalId: string }) {
  const [filed, setFiled] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const look = async () => {
      if (stop) return;
      tries++;
      const j = await fetch(`/api/landlord/sign?appraisalId=${encodeURIComponent(appraisalId)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({}));
      /* Half a minute at most: past that the buttons work anyway, and the
         page says whatever is true when it loads. */
      if ((j as { signed?: boolean }).signed || tries > 20) return setFiled(true);
      window.setTimeout(look, 1500);
    };
    void look();
    return () => {
      stop = true;
    };
  }, [appraisalId]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#2b201d]/60 p-4 backdrop-blur-sm" style={{ animation: "signed-in 300ms ease-out both" }}>
      <style>{`
        @keyframes signed-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes signed-card { from { opacity: 0; transform: translateY(14px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes signed-tick { from { transform: scale(.3) rotate(-20deg); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your contract is signed"
        className="w-full max-w-[480px] rounded-[28px] bg-white p-7 shadow-2xl sm:p-9"
        style={{ animation: "signed-card 420ms cubic-bezier(.2,.9,.3,1.1) 80ms both" }}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-dark text-white" style={{ animation: "signed-tick 420ms cubic-bezier(.2,.9,.3,1.4) 260ms both" }}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.8} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="mt-5 text-[26px] leading-tight sm:text-[30px]">Brilliant, Your Contract Is Signed</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          The next thing to sort out is your compliance. It starts with a few questions about the property that only you can answer - it saves as you go.
        </p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={!filed}
            onClick={() => window.location.assign("/landlord/questions")}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-dark px-6 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {filed ? (
              <>
                Answer the questions <span aria-hidden>→</span>
              </>
            ) : (
              <>
                <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving your signed copy
              </>
            )}
          </button>
          <button
            type="button"
            disabled={!filed}
            onClick={() => window.location.reload()}
            className="rounded-full px-5 py-3 text-[13px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
