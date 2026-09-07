"use client";

import { useEffect, useState } from "react";
import { HAND } from "@/components/present-kit";
import type { SectionId, SlideId } from "@/lib/present";

/**
 * THE CONTENTS — the deck's left-hand side.
 *
 * James, 7 Sep: "build the left-hand side navigation bar where we've got all
 * of the sections, and break it down into subsections."
 *
 * ── What this replaces, and what it does not ──────────────────────────────
 *
 * The deck already had a progress rail: four hairline segments in the top
 * right, sized by how many slides each part holds. That rail answers "how far
 * through am I", which is a good question, and it stays — on anything narrower
 * than a desktop, where a permanent column of names would eat a third of the
 * screen a landlord is reading on.
 *
 * What it could not answer is "what is in this thing, and can I go straight to
 * the fee". Thirty-three slides behind two arrow buttons is a corridor: the
 * only way to find out what is at the end is to walk it. A landlord who opened
 * this for one number and has to swipe past nine slides about brochures to
 * reach it has earned closing the tab.
 *
 * ── The four parts are the ones the agenda promised ───────────────────────
 *
 * Slide 2 tells the landlord this comes in four parts and names them. So this
 * lists those same four, numbered the same way, and nothing else — the opening
 * slides sit above the numbering as an unnamed run, because they are what
 * happens BEFORE the agenda rather than a fifth part of it. If the two ever
 * disagree the landlord is watching one shape and reading another, which is
 * worse than having no contents at all. Both are folded out of the same slide
 * list (lib/present SLIDES.section), so neither can drift.
 *
 * ── Why only one part is open at a time ───────────────────────────────────
 *
 * All thirty-three titles at once is not a contents page, it is the deck again
 * in smaller type. The part being read is open; the rest are a name and a
 * count. It follows the reader by itself — walk into Marketing and Marketing
 * opens — and a landlord who opens a different one keeps it open until they
 * move, because a panel that snapped shut under them would be unusable.
 *
 * ── Tone ──────────────────────────────────────────────────────────────────
 *
 * The rail takes the slide's own ground, exactly as the bottom bar does, so it
 * reads as the left-hand side of the page rather than a panel laid over it.
 * Nothing here is chrome a landlord should have to look past.
 */

export type Chapter = { id: SectionId; label: string; from: number; count: number };

/**
 * 236px, from 1440px up — and FOUR places have to agree about both numbers:
 * the rail itself, the deck's left inset, the bottom bar's left edge, and the
 * things that hide when the rail appears. A contents column that prints over
 * the first word of every slide is worse than no contents column, and a bottom
 * bar that starts underneath it is worse again. So they are written once here,
 * as literal class strings rather than as numbers: Tailwind only sees classes
 * it can read in the source, and a computed `pl-[${w}px]` would silently
 * produce no padding at all.
 *
 * ── Why 1440 and not Tailwind's own xl ────────────────────────────────────
 *
 * MEASURED, not chosen. At 1280 — the narrowest desktop, and a real MacBook —
 * the entrance slide already runs to within a few pixels of the bottom bar
 * with the full width to itself. Taking 236 of it away pushed the last line of
 * all three promises under the bar, and nothing may collide. At 1440 the deck
 * still has 1204px, which is inside the width the slides were built and
 * approved at, and the entrance clears the bar again.
 *
 * Below that the contents is a button and a sheet, which is the same tree and
 * costs the deck no width at all.
 */
export const CONTENTS_AT = "min-[1440px]:flex";
export const CONTENTS_OFF = "min-[1440px]:hidden";
export const CONTENTS_INSET = "min-[1440px]:pl-[236px]";
export const CONTENTS_LEFT = "min-[1440px]:left-[236px]";

type Props = {
  slides: { id: SlideId; title: string; section: SectionId }[];
  chapters: Chapter[];
  at: number;
  go: (i: number) => void;
  /** The slide's own ground, so the rail sits on the page rather than over it. */
  tint: string;
  /** Whether the current slide carries white type. */
  onDark: boolean;
  /** Cream slides are the drawn ones — they set their headings in the hand. */
  cream: boolean;
  accent: string;
  /* Below the desktop breakpoint the same tree opens as a sheet, from a button
     in the deck's bottom bar. The open flag lives with that button rather than
     in here so there is one piece of state and not two to keep in step. */
  sheet: boolean;
  onSheet: (open: boolean) => void;
};

export default function PresentContents({
  slides,
  chapters,
  at,
  go,
  tint,
  onDark,
  cream,
  accent,
  sheet,
  onSheet,
}: Props) {
  const here = chapters.find((c) => at >= c.from && at < c.from + c.count);
  /* Which part is open. Null means "whichever one is being read", which is the
     normal state; a landlord who opens another one overrides it until they
     move, and the effect below hands it back. */
  const [open, setOpen] = useState<SectionId | null>(null);
  useEffect(() => {
    setOpen(null);
  }, [here?.id]);
  const shown = open ?? here?.id;

  /* The opening run is deliberately unnumbered: the agenda promises FOUR parts
     and these slides come before it. Numbering them would make the deck's own
     first promise wrong by one. */
  const numbered = chapters.filter((c) => c.label);

  const list = (
    <Tree
      slides={slides}
      opening={chapters.find((c) => !c.label) ?? null}
      numbered={numbered}
      at={at}
      shown={shown}
      onOpen={setOpen}
      go={(i) => {
        go(i);
        onSheet(false);
      }}
      onDark={onDark}
      cream={cream}
      accent={accent}
    />
  );

  return (
    <>
      {/* ── The rail, on desktop ── */}
      <nav
        aria-label="Contents"
        className={`fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col ${CONTENTS_AT}`}
        style={{
          background: tint,
          borderRight: `1px solid ${onDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.07)"}`,
        }}
      >
        <div className="px-7 pb-5 pt-8">
          <span
            className="text-[10.5px] uppercase tracking-[0.18em]"
            style={{
              fontFamily: cream ? HAND : undefined,
              color: onDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.38)",
            }}
          >
            Contents
          </span>
        </div>
        {/* Its own scroller, and it needs one: the longest part is ten slides
            and a laptop is 720px tall. `scrollbarWidth: none` for the same
            reason the deck hides its own — a browser bar down the inside edge
            of a presentation reads as a document, not a deck. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24" style={{ scrollbarWidth: "none" }}>
          {list}
        </div>
      </nav>

      {/* ── The sheet, on everything else ──
          Full height, over the deck, dismissed by the scrim or by choosing
          something. It is the same tree: a phone gets the whole contents, not
          a cut-down one, because the phone is the real device. */}
      {sheet && (
        <div className={`fixed inset-0 z-50 flex ${CONTENTS_OFF}`}>
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)" }}
            onClick={() => onSheet(false)}
            aria-hidden
          />
          <nav
            aria-label="Contents"
            className="relative flex h-full w-[86%] max-w-[330px] flex-col"
            style={{ background: tint, boxShadow: "0 0 60px rgba(0,0,0,0.22)" }}
          >
            <div className="flex items-center justify-between px-6 pb-4 pt-7">
              <span
                className="text-[10.5px] uppercase tracking-[0.18em]"
                style={{
                  fontFamily: cream ? HAND : undefined,
                  color: onDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.38)",
                }}
              >
                Contents
              </span>
              <button
                onClick={() => onSheet(false)}
                aria-label="Close contents"
                className="-mr-2 rounded-full px-2 py-1 text-[18px] leading-none"
                style={{ color: onDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.45)" }}
              >
                &times;
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10" style={{ scrollbarWidth: "none" }}>
              {list}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

/**
 * The tree itself, shared by the rail and the sheet.
 *
 * Written once and rendered twice rather than duplicated, because the two
 * would drift and the drift would be invisible: nobody opens the deck on a
 * laptop and a phone side by side to check the contents still agree.
 */
function Tree({
  slides,
  opening,
  numbered,
  at,
  shown,
  onOpen,
  go,
  onDark,
  cream,
  accent,
}: {
  slides: { id: SlideId; title: string; section: SectionId }[];
  opening: Chapter | null;
  numbered: Chapter[];
  at: number;
  shown: SectionId | undefined;
  onOpen: (id: SectionId) => void;
  go: (i: number) => void;
  onDark: boolean;
  cream: boolean;
  accent: string;
}) {
  const dim = onDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.42)";
  const ink = onDark ? "#ffffff" : "rgba(0,0,0,0.82)";
  const rule = onDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";

  const titles = (c: Chapter) =>
    Array.from({ length: c.count }, (_, k) => ({ i: c.from + k, title: slides[c.from + k]?.title ?? "" }));

  return (
    <>
      {/* The opening run: no number, no heading of its own. Four short titles
          that are simply there, the way the first page of a book is there. */}
      {opening && (
        <ul className="mb-2 border-b pb-3" style={{ borderColor: rule }}>
          {titles(opening).map((s) => (
            <SlideRow
              key={s.i}
              title={s.title}
              on={at === s.i}
              onClick={() => go(s.i)}
              ink={ink}
              dim={dim}
              accent={accent}
              cream={cream}
            />
          ))}
        </ul>
      )}

      {numbered.map((c, n) => {
        const isOpen = shown === c.id;
        const done = at >= c.from + c.count;
        const now = at >= c.from && !done;
        return (
          <div key={c.id}>
            <button
              onClick={() => (isOpen ? go(c.from) : onOpen(c.id))}
              aria-expanded={isOpen}
              className="flex w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
            >
              {/* The same 01–04 the agenda uses. Tabular so the two digits
                  line up down the column rather than shuffling. */}
              <span
                className="shrink-0 text-[11px] leading-none tabular-nums"
                style={{
                  fontFamily: cream ? HAND : undefined,
                  fontWeight: 700,
                  color: now || isOpen ? accent : dim,
                }}
              >
                {String(n + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13.5px] leading-snug"
                  style={{
                    fontFamily: cream ? HAND : undefined,
                    fontWeight: cream ? 700 : 500,
                    color: now || isOpen ? ink : dim,
                  }}
                >
                  {c.label}
                </span>
              </span>
              {/* How long this part is. A landlord deciding whether to open
                  "The next steps" is entitled to know it is ten slides. */}
              <span
                className="shrink-0 text-[10.5px] tabular-nums"
                style={{ color: done ? accent : dim, opacity: done ? 0.8 : 0.75 }}
              >
                {c.count}
              </span>
            </button>

            {isOpen && (
              <ul className="mb-1 ml-[18px] border-l pl-0.5" style={{ borderColor: rule }}>
                {titles(c).map((s) => (
                  <SlideRow
                    key={s.i}
                    title={s.title}
                    on={at === s.i}
                    onClick={() => go(s.i)}
                    ink={ink}
                    dim={dim}
                    accent={accent}
                    cream={cream}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

/** One slide, in the contents. A marker rather than a bullet: the current
 *  slide has to be findable at a glance from across a kitchen table. */
function SlideRow({
  title,
  on,
  onClick,
  ink,
  dim,
  accent,
  cream,
}: {
  title: string;
  on: boolean;
  onClick: () => void;
  ink: string;
  dim: string;
  accent: string;
  cream: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={on ? "true" : undefined}
        className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-[6px] text-left"
      >
        <span
          className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full transition-colors"
          style={{ background: on ? accent : "transparent" }}
          aria-hidden
        />
        {/* WRAPS, rather than truncating. Seven of the ten titles in "The next
            steps" are longer than a 236px column, and "Compliance and gui…" is
            not a contents entry, it is a puzzle. Two lines is enough for every
            title in the deck and costs the rail nothing it does not have. */}
        <span
          className="min-w-0 flex-1 text-[12.5px] leading-snug"
          style={{
            fontFamily: cream ? HAND : undefined,
            color: on ? ink : dim,
            fontWeight: on ? 600 : 400,
          }}
        >
          {title}
        </span>
      </button>
    </li>
  );
}
