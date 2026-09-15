"use client";

import { useEffect, useRef, useState } from "react";
import type { Stop } from "@/lib/landlord-journey";

/**
 * THE JOURNEY ON A PHONE: a wheel you scroll, with the stop you are on raised.
 *
 * James, 15 Sep 2026: "the one you're on should be big, and the rest of them
 * should be smaller. The one that you should be doing should be raised a
 * little bit higher, and the other ones will drop either side of it ... drop
 * the box around the outside ... almost like a scroll wheel where they can
 * scroll across to see the other processes. If they click on them, it will
 * then pop up in a little bubble above it."
 *
 * Seven equal dots in a scrolling row told a landlord nothing about which one
 * was theirs - it was a diagram of our process, at the size of a diagram, on a
 * screen four inches wide. This says one thing: you are HERE. Everything else
 * is smaller, lower and quieter, and only speaks when asked.
 *
 * ── The bubble replaces the list underneath ───────────────────────────────
 *
 * "Rather than showing the things you would need to do underneath, I think
 * that would be a better use of space." So the detail is spent on the stop
 * being asked about, above the wheel, and costs nothing until it is.
 */

/** What each stop actually means, in the landlord's words. */
const BLURB: Record<string, string> = {
  valuation: "We visit, look round properly, and agree what your property should let for.",
  instruction: "The terms of business. Nothing is marketed until this is signed by both of us.",
  compliance: "The certificates a let needs by law - gas, electrics, the EPC - gathered and checked.",
  marketing: "Photographs, the description, and your property live on Rightmove, Zoopla and OnTheMarket.",
  viewings: "We show people round, tell you what they said, and bring you every offer.",
  let: "An offer accepted, referencing run, and the tenancy drawn up for signing.",
  management: "Your tenant moves in. From here it is rent, repairs, inspections and renewals.",
};

export default function SpinePhone({ stops }: { stops: Stop[] }) {
  const row = useRef<HTMLDivElement | null>(null);
  const current = Math.max(0, stops.findIndex((s) => s.state === "current"));
  const [asked, setAsked] = useState<number | null>(null);

  /* Open on the stop they are at, centred, without a scroll animation they did
     not ask for. */
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const mark = el.querySelector<HTMLElement>(`[data-i="${current}"]`);
    if (mark) el.scrollLeft = mark.offsetLeft - (el.clientWidth - mark.clientWidth) / 2;
  }, [current]);

  const shown = asked ?? current;
  const s = stops[shown];

  return (
    <div className="lg:hidden">
      {/* THE BUBBLE, above the wheel and pointing at it. */}
      <div className="px-1">
        <div className="relative rounded-[16px] bg-accent-soft/80 px-4 py-3">
          <p className="text-[13.5px] font-semibold leading-tight">
            {s.label}
            <span className="ml-2 text-[11.5px] font-normal text-muted">{s.sub}</span>
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{BLURB[s.id] ?? ""}</p>
          {asked !== null && asked !== current && (
            <button
              type="button"
              onClick={() => setAsked(null)}
              className="mt-1.5 text-[11.5px] text-muted underline underline-offset-2"
            >
              Back to where you are
            </button>
          )}
        </div>
      </div>

      {/* THE WHEEL. No box around it - the stops are the thing. */}
      <div
        ref={row}
        className="mt-3 flex items-end gap-2 overflow-x-auto pb-2 pt-1"
        style={{ scrollbarWidth: "none", scrollSnapType: "x proximity" }}
      >
        {/* Half a screen of air each end, so the first and last stops can sit
            in the middle like every other one. */}
        <span className="shrink-0" style={{ width: "34%" }} aria-hidden />
        {stops.map((st, i) => {
          const here = i === shown;
          const done = st.state === "done";
          return (
            <button
              key={st.id}
              type="button"
              data-i={i}
              onClick={() => setAsked(i)}
              aria-current={i === current ? "step" : undefined}
              className="flex shrink-0 flex-col items-center"
              style={{
                width: here ? 104 : 74,
                /* Raised when it is the one being read, dropped either side. */
                transform: here ? "translateY(-10px)" : "none",
                transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms",
                scrollSnapAlign: "center",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full"
                style={{
                  height: here ? 46 : 28,
                  width: here ? 46 : 28,
                  transition: "height 320ms, width 320ms",
                  background: done ? "var(--accent-dark, #56423e)" : here ? "#fff" : "#fff",
                  border: done ? "none" : here ? "3px solid var(--accent-dark, #56423e)" : "2px solid var(--line, #e6ded9)",
                  color: done ? "#fff" : undefined,
                }}
              >
                {done ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : i === current ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-dark" />
                ) : null}
              </span>
              <span
                className={`mt-2 leading-tight ${here ? "text-[12.5px] font-semibold" : "text-[11px] text-muted"}`}
                style={{ transition: "font-size 320ms" }}
              >
                {st.label}
              </span>
            </button>
          );
        })}
        <span className="shrink-0" style={{ width: "34%" }} aria-hidden />
      </div>
    </div>
  );
}
