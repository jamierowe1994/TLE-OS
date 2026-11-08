"use client";

import { useState } from "react";
import FloatSheet from "@/components/new-look/FloatSheet";

/**
 * One person showing, the rest stacked behind (James, 8 Nov 2026: "99% of
 * people are just going to be the lead person"). The applicant, the
 * guarantor and the landlord each get a column on a let's People tab; the
 * first card shows, any others sit as card edges behind it, and "See all"
 * fans every one of them out across a pop-up.
 *
 * Styled from app/new-look/applications.css, prefix nl-pdeck-.
 */
export default function PeopleDeck({
  title,
  many,
  cards,
  actions,
  empty,
  steve,
}: {
  /** "Applicant". */
  title: string;
  /** "Applicants", for the count and the pop-up. */
  many: string;
  /** Each card with its own key; the first is the one shown. */
  cards: { key: string; node: React.ReactNode }[] | null;
  /** Add buttons and the like, under the deck. */
  actions?: React.ReactNode;
  /** Said when there is nobody yet; a spinner while cards is null. */
  empty?: React.ReactNode;
  steve?: string;
}) {
  const [open, setOpen] = useState(false);
  const n = cards?.length ?? 0;
  const behind = Math.min(Math.max(n - 1, 0), 2);
  return (
    <section className="nl-pdeck" data-steve={steve}>
      <header className="nl-pdeck-head">
        <h3 className="nl-block-title">{n > 1 ? many : title}</h3>
        {n > 1 && <span className="nl-count">{n}</span>}
      </header>
      {cards === null ? (
        <div className="nl-pdeck-empty" role="status">
          <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          <span>Reading {many.toLowerCase()}…</span>
        </div>
      ) : n === 0 ? (
        <div className="nl-pdeck-empty">{empty}</div>
      ) : (
        <div className="nl-pdeck-stack" data-behind={behind}>
          <div className="nl-pdeck-card">{cards[0].node}</div>
          {n > 1 && (
            <button type="button" className="nl-pdeck-more" onClick={() => setOpen(true)} data-steve={steve ? `${steve}.see-all` : undefined}>
              <span>
                +{n - 1} more {n - 1 === 1 ? title.toLowerCase() : many.toLowerCase()}
              </span>
              <span className="nl-pdeck-more-go">See all {n}</span>
            </button>
          )}
        </div>
      )}
      {actions && <div className="nl-pdeck-acts">{actions}</div>}
      {open && cards && n > 1 && (
        <FloatSheet size="xl" title={many} question={`${n} ${many}`} onClose={() => setOpen(false)}>
          <div className="nl-pdeck-fan">
            {cards.map((c, i) => (
              <div key={c.key} className="nl-pdeck-card" style={{ "--i": i } as React.CSSProperties}>
                {c.node}
              </div>
            ))}
          </div>
        </FloatSheet>
      )}
    </section>
  );
}
