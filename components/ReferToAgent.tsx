"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick, PressButton } from "@/components/Bits";

/**
 * The sales referral, revealed by what the agent typed.
 *
 * This is the whole progressive idea in one component: nothing on the record
 * asks "is this a sales lead?", because a form field nobody fills in is worse
 * than no field at all. Instead the moment somebody tags a lead as looking to
 * sell or buy, the offer appears — the system noticed, so the agent didn't
 * have to remember.
 *
 * The referral itself is money: a lettings agency that spots a vendor and does
 * nothing has given the instruction away for free.
 */

/**
 * Tags that mean this person has a SALES intention, not a lettings one.
 *
 * Deliberately excludes "valuation": a landlord asking for a valuation almost
 * always wants a rental appraisal, which is the core business, and firing a
 * "refer this away" prompt at it is exactly how a prompt teaches people to
 * ignore prompts. Sales valuations have to say so — hence the explicit tag.
 *
 * Word-bounded so "sale" doesn't match inside an unrelated word.
 */
const SALE_WORDS = /(sell|selling|\bsales?\b|vendor|\bbuy(ing)?\b)/i;

export function isSalesIntent(tags: string[]): boolean {
  return tags.some((t) => SALE_WORDS.test(t));
}

/** The tags that trigger it, offered in the add-tag menu so it's findable. */
export const SALES_TAGS = ["Looking to sell", "Looking to buy", "For sale", "Sales valuation"];

export default function ReferToAgent({ name, trigger }: { name: string; trigger: string }) {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="fade-up flex items-center gap-4 rounded-2xl border border-line/80 bg-accent-soft/40 px-5 py-4">
        <DoneTick size={34} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Referred to the sales team</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {name} is queued for the Launchpad referrals page. Nothing has actually been
            sent — the API isn&apos;t connected yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up flex flex-wrap items-center gap-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-dark text-page">
        <DoodleIcon name="rocket" size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">
          {name.split(" ")[0]} is tagged &ldquo;{trigger}&rdquo; — refer them to an agent?
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
          This is a sales lead sitting in a lettings book. Referring it sends the contact
          to the Launchpad referrals page and keeps the fee.
        </p>
      </div>
      <PressButton
        onClick={() => setSent(true)}
        className="press-ring flex shrink-0 items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-page"
      >
        <DoodleIcon name="link" size={14} />
        Refer this lead
      </PressButton>
    </div>
  );
}
