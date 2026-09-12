"use client";

import Link from "next/link";
import { PRESENT_STYLES, type DeckKind, type PresentStyle } from "@/lib/present";

/**
 * THE SHOWROOM BAR — which deck, and which look, on /present/sample only.
 *
 * ── Why the deck row exists ───────────────────────────────────────────────
 *
 * James, 7 Sep: "I'm pretty sure I sent these out to people to have a look at,
 * and I've just realised that I've probably sent out the wrong ones." He had:
 * `/present/sample` with nothing after it renders the PRE-appraisal deck, which
 * is five slides by design, and there was nothing anywhere on the page saying
 * so. The only way to reach the other two was to know that `?kind=` existed
 * and to spell it correctly.
 *
 * That is the whole bug. A showroom with three decks in it and no sign on any
 * of them will get the wrong one sent, and the person sending it will not find
 * out until somebody says "is that all there is?".
 *
 * So the deck being shown is named, the other two are one click away, and each
 * carries its own slide count — because "five" versus "thirty-three" is the
 * fact that tells you instantly whether you are looking at the sneak peek or
 * the full presentation.
 *
 * ── Only ever on /present/sample ──────────────────────────────────────────
 *
 * A landlord opening a real deck sees the single deck and the single look
 * their agent sent, with no controls anywhere. This component is rendered by
 * the sample branch of the page and by nothing else, which is why it carries
 * no permission check: it is not reachable on a real token.
 *
 * ── Links, not state ──────────────────────────────────────────────────────
 *
 * Each is a real href carrying the current choice on the other row, so a deck
 * or a style can be pasted into a message and it opens on the one being
 * discussed. A React toggle would have made every opinion in the thread
 * ambiguous about which version it was about — which is how this went wrong in
 * the first place.
 */
export default function StylePicker({
  kind,
  style,
  kinds,
}: {
  kind: DeckKind;
  style: PresentStyle;
  /** The three decks with the number of slides each ACTUALLY renders — counted
   *  from the sample deck rather than from the slide list, so a slide dropped
   *  by a missing-data rule is not counted as one somebody will see. */
  kinds: { id: DeckKind; label: string; blurb: string; count: number }[];
}) {
  return (
    <div
      /* Below the logo on a phone, not on top of it. The mark is fixed to the
         top left of every deck now, and a review control printed over the
         brand is the first thing anybody reviewing would report. */
      className="fixed left-1/2 top-[74px] z-40 flex -translate-x-1/2 flex-col gap-1 rounded-[20px] px-1.5 py-1.5 sm:top-4"
      style={{
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.13)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Row label="Deck">
        {kinds.map((k) => (
          <Pick
            key={k.id}
            href={`/present/sample?kind=${k.id}&style=${style}`}
            on={k.id === kind}
            title={k.blurb}
          >
            {k.label}
            <span className="ml-1.5 text-[10.5px] tabular-nums opacity-55">{k.count}</span>
          </Pick>
        ))}
      </Row>
      {/* The style row went on 12 Sep 2026: House is the look. */}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      {/* The row labels go on a phone. Two rows of three pills plus "DECK" and
          "STYLE" wraps at 390px, and a control that wraps over the first words
          of the slide it is there to let you judge is worse than one with no
          labels on it. */}
      <span className="hidden w-[46px] shrink-0 pl-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35 sm:block">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pick({
  href,
  on,
  title,
  children,
}: {
  href: string;
  on: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="flex items-baseline whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
      style={on ? { background: "#1a1a1a", color: "#ffffff" } : { color: "rgba(0,0,0,0.55)" }}
    >
      {children}
    </Link>
  );
}
