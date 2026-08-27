"use client";

import { useEffect, useState } from "react";
import ResearchPanel from "@/components/ResearchPanel";
import PresentationBuilder from "@/components/PresentationBuilder";
import { Pill } from "@/components/Wire";
import { MA_STAGES, effectiveStage, needsValuation, type MarketAppraisal } from "@/lib/market-appraisal";

/**
 * An appraisal, opened out — the same full pop-out leads, viewings and
 * applications already use, so a record behaves the same way wherever you meet
 * it in the OS.
 *
 * Laid out around the question an agent actually has, which is never "what are
 * this appraisal's attributes" but **"what have I done, and what is next"**:
 *   left  — where it is on the spine, and the one thing to do now
 *   right — the evidence: the best-price guide and the comparables behind it
 *
 * The research only loads once the drawer is open. It is a real sweep of the
 * book, and firing it for every row on the list would spend a lot of time
 * answering questions nobody asked.
 */

/** What the appraisal is waiting on at each stage. */
const NEXT: Record<string, { do: string; who: string }> = {
  booked: { do: "Send the pre-appraisal deck — two days before, with a welcome video if you can.", who: "Us" },
  pre_appraisal: { do: "Pull the comparables together and agree your opening figure before you go.", who: "Us" },
  appraisal: { do: "The visit. Walk it, then record the valuation while it is fresh.", who: "Us" },
  post_appraisal: { do: "Send the deck back with the figure, set the follow-up, and get the terms out for signature.", who: "Us" },
  takeon: { do: "Book the take-on visit — this is where the photographs and the description come from.", who: "Us" },
  aml: { do: "ID and proof of ownership, AML on the landlord, and the property's certificates.", who: "Us" },
  won: { do: "Everything clear — push it through to a listing.", who: "Us" },
  lost: { do: "Nothing outstanding. Worth recording why, while anyone remembers.", who: "—" },
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function AppraisalDrawer({
  appraisal,
  onClose,
}: {
  appraisal: MarketAppraisal;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const live = effectiveStage(appraisal);
  const at = MA_STAGES.findIndex((s) => s.id === live);
  const next = NEXT[live];
  /* Overrides whatever the stage would otherwise suggest. A visit that has
     happened with no figure written down is the most urgent thing on the file,
     wherever the file happens to be sitting. */
  const missingFigure = needsValuation(appraisal);

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-label={`Market appraisal — ${appraisal.address}`}
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Market appraisal — stage {at + 1} of {MA_STAGES.length}
            </p>
            <p className="hand mt-1 truncate text-[20px] leading-tight">{appraisal.address}</p>
            <p className="mt-1 truncate text-[12px] text-muted">
              {appraisal.landlord} · {appraisal.postcode}
              {appraisal.agent ? ` · with ${appraisal.agent}` : " · no agent recorded"}
            </p>
            {appraisal.appointmentAt && (
              <p className="truncate text-[12px] text-muted">
                {new Date(appraisal.appointmentAt).toLocaleString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {appraisal.valuation ? ` · valued ${gbp(appraisal.valuation)} pcm` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[18px] leading-none text-muted transition-colors hover:text-ink"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-5 p-6 xl:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-5">
              {(next || missingFigure) && (
                <div className="rounded-2xl border border-line/80 bg-panel p-5">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Needs doing now
                  </p>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed">
                    {missingFigure
                      ? "The visit has been and gone with no figure recorded. Do that first — everything after it waits on the valuation."
                      : next?.do}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                    Waiting on <Pill tone="accent">{missingFigure ? "Us" : (next?.who ?? "Us")}</Pill>
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-line/80 bg-panel p-5">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  Where it&apos;s up to
                </p>
                <ol className="mt-3.5 space-y-2.5">
                  {MA_STAGES.filter((s) => s.id !== "lost").map((s, i) => {
                    const done = i < at;
                    const here = s.id === live;
                    return (
                      <li key={s.id} className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            done
                              ? "border-accent-dark bg-accent-soft text-accent-dark"
                              : here
                                ? "border-accent-dark bg-accent-dark text-white"
                                : "border-line text-muted"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-[12.5px] leading-tight ${here ? "font-semibold" : "text-muted"}`}
                          >
                            {s.label}
                          </span>
                          {here && (
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                              {s.blurb}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {/* Where it goes next. The spine does not end here — a won
                    appraisal becomes a listing, and saying so stops the tab
                    feeling like a dead end. */}
                <p className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
                  Once terms are signed this stops being an appraisal and becomes a{" "}
                  <span className="font-semibold">listing</span>.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {/* Named for the OUTPUT, not the activity. An agent at 8am is not
                  browsing data, they are making the thing they will put in
                  front of a landlord — "Research" made them work that out. */}
              <button
                type="button"
                onClick={() => setBuilding(true)}
                className="rounded-2xl bg-accent-dark px-4 py-3 text-[13px] font-semibold text-white"
              >
                Build the presentation
              </button>
              <ResearchPanel address={appraisal.address} postcode={appraisal.postcode} beds={2} />
            </div>
          </div>
        </div>
      </aside>

      {building && (
        <PresentationBuilder
          address={appraisal.address}
          postcode={appraisal.postcode}
          landlord={appraisal.landlord}
          refId={appraisal.leadId ?? appraisal.id}
          onClose={() => setBuilding(false)}
        />
      )}
    </div>
  );
}
