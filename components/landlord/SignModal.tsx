"use client";

import { useCallback, useEffect, useState } from "react";
import DocusealEmbed from "@/components/landlord/DocusealEmbed";

/**
 * The contract, signed WITHOUT leaving The Letting Experts.
 *
 * James, 14 Sep 2026: "it will look a bit shocking for them to get sent to
 * some random site. No one's heard of DocuSeal." And it is not only branding:
 * a landlord who lands on a domain they do not recognise has been handed a
 * good reason to stop and ring the office, and the ones who do NOT stop are
 * the ones who would sign anything.
 *
 * ── It rises from the bottom, and it carries no chrome ────────────────────
 *
 * James again, later the same night: get rid of the masthead - "it should
 * literally just be the contract that flows up without any border" - and
 * exaggerate the arrival so it comes up from the bottom of the screen rather
 * than appearing in the middle of it.
 *
 * So there is no title bar. The only thing over the contract is the bar at the
 * foot, which is the same shape the presentation's own signing panel uses, and
 * a close button that floats clear of the paper. What fills the modal is the
 * document, full width, which is what he asked to see.
 */
export default function SignModal({
  url,
  email,
  onClose,
  onDone,
}: {
  url: string;
  email?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [done, setDone] = useState(false);
  /* Mounted shut, then opened a frame later, so the transform has something
     to animate FROM. Rendered straight at translateY(0) there is no arrival,
     which is the whole point of the change. */
  const [up, setUp] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setUp(true));
    return () => cancelAnimationFrame(t);
  }, []);

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

  const completed = useCallback(() => setDone(true), []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#2b201d]/55 transition-opacity duration-500"
      style={{ opacity: up ? 1 : 0 }}
      onClick={onClose}
    >
      <div
        /* Attached to the bottom and floating up - the same curve and the same
           620ms as the presentation's panel, so the two feel like one product. */
        className="relative flex h-[94vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-t-[32px] bg-white shadow-[0_-30px_80px_-30px_rgba(40,25,20,0.5)]"
        style={{
          transform: up ? "translateY(0)" : "translateY(104%)",
          transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your terms of business"
      >
        {/* No masthead. The close floats over the paper instead, so nothing
            takes a strip off the top of the contract. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-muted shadow-sm backdrop-blur transition hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <DocusealEmbed url={url} email={email} onCompleted={completed} className="min-h-0 flex-1 overflow-y-auto" />

        <div className="flex items-center gap-3 border-t border-line/60 bg-card px-5 py-3">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
            {done ? "Signed. Your copy is on its way to your file." : "Sign where it asks. Nothing is final until you press sign."}
          </p>
          {done ? (
            <button type="button" onClick={onDone} className="shrink-0 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">
              All done
            </button>
          ) : (
            <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-muted underline transition hover:text-ink">
              Finish later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
