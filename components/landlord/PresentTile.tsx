"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import PresentModal from "@/components/PresentModal";
import { CTA } from "@/components/landlord/StepAction";
import type { PresentDeck } from "@/lib/present";

/**
 * "View presentation", on the landlord's portal. Opens the book here
 * (PresentModal) rather than sending them to a link - James, 13 Sep 2026:
 * "click View Presentation ... it will then launch a modal out." Same two
 * shapes as SignTile and MessageTile: the big button on the next-step
 * card, or a row in the list.
 */
export default function PresentTile({
  variant,
  deck,
  sign,
  label,
  sub,
  icon,
}: {
  variant: "button" | "row" | "link";
  deck: PresentDeck;
  /** This landlord's contract, for the "Sign your contract" button along the
   *  booklet's foot. See PresentModal - the deck's own signUrl is null until a
   *  deck is looked up per landlord, and the portal knows better. */
  sign?: { appraisalId?: string | null; url?: string | null };
  label: string;
  sub: string;
  icon: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "button" ? (
        <button type="button" onClick={() => setOpen(true)} className={CTA}>
          {label} <span aria-hidden>→</span>
        </button>
      ) : variant === "link" ? (
        /* In the home card's "Also:" line, beside the plain links. */
        <button type="button" onClick={() => setOpen(true)} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          {label}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-4 py-3.5 text-left transition-opacity hover:opacity-80">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
            <DoodleIcon name={icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">{label}</span>
            <span className="block text-[12px] text-muted">{sub}</span>
          </span>
          <span aria-hidden className="text-[15px] text-muted">›</span>
        </button>
      )}
      {/* Portalled to the body: the link form sits inside a <p>, and a
          dialog inside a paragraph is invalid HTML that React refuses to
          hydrate. */}
      {open && typeof document !== "undefined" && createPortal(<PresentModal deck={deck} sign={sign} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
