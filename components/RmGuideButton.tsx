"use client";

import { CORAL, CreamSlide, HAND, Rise } from "@/components/present-kit";
import { guideHref, RM_GUIDE_LABEL, type RmGuide } from "@/lib/rm-guide";

/**
 * The landlord's way into the agent's Rightmove Best Price Guide - see
 * lib/rm-guide. Always a new tab: the deck stays where they left it.
 *
 * An <a>, not a button with window.open, so it works with no script, a
 * long-press on a phone offers "open in new tab", and nothing is blocked as
 * a pop-up.
 */

const Arrow = ({ size }: { size: number }) => (
  <svg viewBox="0 0 24 24" aria-hidden style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

/** On the deck's What's letting nearby slide. */
export function RmGuideButton({ guide, className = "" }: { guide: RmGuide; className?: string }) {
  return (
    <a
      href={guideHref(guide)}
      target="_blank"
      rel="noopener noreferrer"
      data-rm-guide
      className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-full px-5 text-[14px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.03] ${className}`}
      style={{ background: CORAL }}
    >
      {RM_GUIDE_LABEL}
      <Arrow size={15} />
    </a>
  );
}

/** On the booklet's page, which is a fixed 1440x900 stage scaled to fit. */
export function RmGuideBookButton({ guide }: { guide: RmGuide }) {
  return (
    <a
      href={guideHref(guide)}
      target="_blank"
      rel="noopener noreferrer"
      data-rm-guide
      /* Above the turn zones (z-7), so the press opens the guide rather
         than turning the page. Same as Sign the terms. */
      className="relative z-[8] inline-flex h-[54px] items-center gap-3 rounded-full px-7 text-[16px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.03]"
      style={{ background: "var(--p-accent)", pointerEvents: "auto" }}
    >
      {RM_GUIDE_LABEL}
      <Arrow size={17} />
    </a>
  );
}

/**
 * The slide when the agent used a guide INSTEAD of comparables: no range of
 * ours to state, so it says where the evidence is and opens it. A heading
 * over an empty list would read as a broken page; this reads as a choice.
 */
export function RmGuideOnlySlide({ guide, show }: { guide: RmGuide; show: boolean }) {
  return (
    <CreamSlide id="comparables">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[680px]">
          <Rise show={show} i={0}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
              What&rsquo;s letting nearby
            </span>
          </Rise>
          <Rise show={show} i={1}>
            <h2
              className="mt-4 leading-[1.02] tracking-[-0.015em]"
              style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(32px, 3.8vw, 54px)" }}
            >
              Rightmove&rsquo;s <span style={{ color: CORAL }}>price guide</span>
            </h2>
          </Rise>
          <Rise show={show} i={2}>
            <p className="mt-4 max-w-[540px] text-[15px] font-light leading-[1.6] text-black/55">
              We&rsquo;ve used Rightmove&rsquo;s Best Price Guide for homes like yours nearby. Open it
              to see the evidence - we&rsquo;ll use it to agree the right figure together.
            </p>
          </Rise>
          <Rise show={show} i={3}>
            <RmGuideButton guide={guide} className="mt-7" />
          </Rise>
        </div>
      </div>
    </CreamSlide>
  );
}
