"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import OffersSheet from "@/components/landlord/OffersSheet";
import { CTA } from "@/components/landlord/StepAction";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * "View offers", as a step that opens the offers rather than scrolling to them.
 *
 * James, 16 Sep 2026: "rather than showing the offers on the homepage where it
 * says Offers ... when they click View Offers, in Your Next Step, we should be
 * able to take that."
 *
 * The step used to be an anchor to a list further down the same page, which
 * meant the most consequential thing on the portal - choosing who lives in
 * your house - was a section you scrolled past on the way to something else.
 * Behind a button it gets the whole screen and the landlord's whole attention,
 * which is the amount both deserve.
 *
 * The same three variants as the other tiles (SignTile, MessageTile), so the
 * step reads identically wherever it is rendered and only the sheet differs.
 */
export default function OffersTile({
  v,
  label,
  sub,
  icon,
  variant = "tile",
}: {
  v: LandlordView;
  label: string;
  sub: string;
  icon: string;
  variant?: "tile" | "button" | "row";
}) {
  const [open, setOpen] = useState(false);
  const offers = v.offers ?? [];
  if (offers.length === 0) return null;

  const sheet = <OffersSheet v={v} offers={offers} open={open} onClose={() => setOpen(false)} />;

  if (variant === "button") {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={CTA}>
          {label} <span aria-hidden>→</span>
        </button>
        {sheet}
      </>
    );
  }

  if (variant === "row") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-4 py-3.5 text-left transition-opacity hover:opacity-80"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
            <DoodleIcon name={icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">{label}</span>
            <span className="block text-[12px] text-muted">{sub}</span>
          </span>
          <span aria-hidden className="text-[15px] text-muted">
            ›
          </span>
        </button>
        {sheet}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-4 rounded-[18px] border border-line/60 bg-white p-4 text-left transition-colors hover:border-ink/25"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
          <DoodleIcon name={icon} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{label}</span>
          <span className="block text-[12px] text-muted">{sub}</span>
        </span>
      </button>
      {sheet}
    </>
  );
}
