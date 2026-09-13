"use client";

import { INK, Line } from "@/components/present-kit";
import { APPRAISAL_PROMISES, defaultBio, type PresentDeck as Deck } from "@/lib/present";
import { AGENDA, APPROACH } from "@/lib/present-copy";

/**
 * THE BOOKLET'S OWN PAGES. James, 13 Sep 2026, from his mock-up of the
 * first inside spread: "I want the inner screen to look exactly like this
 * ... dusky pink, small headlines at the top, and a little thing of the
 * property down below on the left-hand side ... people, homes and
 * relationships on the right."
 *
 * These are the booklet's pages, not the deck's slides: the deck is what
 * the agent presents in the room and keeps its own look; the booklet is
 * what the landlord reads afterwards, and his mock-up sets it in a serif
 * (Lora, which the deck already loads) with the address in the foot of
 * every left-hand page and the line in the foot of every right-hand one.
 * A slide with no page of its own here is drawn as the slide.
 */

export const PAGE_W = 1440;
export const PAGE_H = 900;
const SERIF = { fontFamily: "var(--font-display), Georgia, serif", fontWeight: 500, letterSpacing: "-0.01em" } as const;
const SAGE = "#b3bea5", SAGE_WASH = "#f1f4ec", SAGE_INK = "#56634a";
/* The dusky pink of the mock-up. NOT the kit's CLAY, which is the brown
   accent by another name - the first pass had "your property" in brown. */
const CLAY = "#cfa096";
const PAPER = "#fbf9f6";

/** A short hand-drawn stroke under a word, with a bow in it. */
function Stroke({ width = 380, color = SAGE, className = "" }: { width?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 400 14" aria-hidden className={className} style={{ width, height: 14 }}>
      <path d="M4 11C90 3 220 2 396 8" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.32em] text-black/55">{children}</p>;
}

/** The foot of a left-hand page: a short rule and the address. */
function FootLeft({ deck }: { deck: Deck }) {
  const line = [deck.property.address, deck.property.postcode].filter(Boolean).join(", ");
  return (
    <div className="absolute bottom-[56px] left-[96px]">
      <span aria-hidden className="mb-3 block h-px w-[40px]" style={{ background: CLAY }} />
      <p className="text-[10.5px] uppercase tracking-[0.3em] text-black/55">{line}</p>
    </div>
  );
}

/** The foot of a right-hand page: the line. */
function FootRight() {
  return <p className="absolute bottom-[56px] right-[440px] text-[10.5px] uppercase tracking-[0.3em] text-black/55">People &middot; Homes &middot; Relationships</p>;
}

/** Page: WELCOME. The plan, the three promises, the vase on the sideboard. */
export function BookWelcome({ deck }: { deck: Deck }) {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* The pink disc, behind the frame. */}
      <div className="pointer-events-none absolute -top-[130px] -right-[40px] h-[520px] w-[520px] rounded-full" style={{ background: "var(--p-tint)" }} />
      {/* The vase, the frame and the sideboard, NESTLED into the corner:
          half the frame and some of the plant are off the page - James, 13
          Sep 2026: "we don't need to show the whole thing". (A handwritten
          "Good People Great Moves" was here; he took it out - "a bit too
          feminine".) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-plant-photo.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ height: 980, right: -215, bottom: -150 }} />

      <div className="absolute left-[96px] top-[84px] w-[760px]">
        <Eyebrow>Welcome</Eyebrow>
        <h1 className="mt-8 text-[72px] leading-[1.04]" style={SERIF}>
          Let&rsquo;s make
          <br />
          a plan for
          <br />
          <span style={{ color: CLAY }}>your property.</span>
        </h1>
        <Stroke className="mt-2" />
        <p className="mt-8 max-w-[620px] text-[21px] leading-[1.5] text-black/60">
          We&rsquo;ll walk through the market, what your property could achieve and the clearest route to getting it let.
        </p>
        {/* Three SQUARES, everything centred in them - as the mock-up. */}
        <ul className="mt-10 grid grid-cols-3 gap-5" style={{ width: 760 }}>
          {APPRAISAL_PROMISES.map((b, n) => (
            <li key={b.title} className="flex flex-col items-center justify-center rounded-[22px] border px-5 text-center" style={{ height: 240, borderColor: "rgba(0,0,0,0.07)", background: "rgba(255,255,255,0.6)" }}>
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full" style={n === 1 ? { background: "var(--p-tint)", color: INK } : { background: SAGE_WASH, color: SAGE_INK }}>
                <Line name={b.icon} size={24} />
              </span>
              <span className="mt-5 block text-[17px] font-semibold leading-snug">{b.title}</span>
              <span className="mt-2 block text-[13px] leading-[1.5] text-black/55">{b.body}</span>
            </li>
          ))}
        </ul>
      </div>
      <FootLeft deck={deck} />
    </div>
  );
}

/** Page: WHAT WE'LL COVER. Four parts in a faint grid, the leaves, the keys. */
export function BookAgenda() {
  const cols = [AGENDA.slice(0, 2), AGENDA.slice(2, 4)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* The leaves in from the top-right corner. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-plant-corner.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ width: 300, right: -60, top: -70 }} />
      {/* The marble, the pen and the keys, in from the bottom-right. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-table.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ width: 440, right: -70, bottom: -90 }} />

      <div className="absolute left-[96px] top-[84px] w-[1040px]">
        <Eyebrow>What we&rsquo;ll cover</Eyebrow>
        <h1 className="mt-8 text-[72px] leading-[1.04]" style={SERIF}>
          Here&rsquo;s what
          <br />
          we&rsquo;ll go through
          <br />
          <span style={{ color: CLAY }}>today.</span>
        </h1>
        <Stroke className="mt-2" width={220} color={CLAY} />
        {/* THE GRID: two columns, two parts each, very faint lines between. */}
        <div className="mt-12 grid grid-cols-2" style={{ width: 1000 }}>
          {cols.map((items, c) => (
            <ol key={c} className={`${c === 1 ? "border-l pl-10" : "pr-10"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              {items.map((a, i) => (
                <li key={a.title} className={`flex gap-6 py-6 ${i === 0 ? "border-b" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <span className="w-[44px] shrink-0 text-[24px] leading-none" style={{ ...SERIF, color: CLAY }}>0{c * 2 + i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[18px] font-semibold leading-snug">{a.title}</span>
                    <span className="mt-2 block max-w-[300px] text-[14px] leading-[1.6] text-black/55">{a.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      </div>
      <div className="absolute right-[300px] top-[130px]">
        <p className="text-[11px] uppercase leading-[1.8] tracking-[0.3em] text-black/55">
          A clearer
          <br />
          brighter letting
          <br />
          journey
        </p>
        {/* Not quite the width of "journey". */}
        <span aria-hidden className="mt-3 block h-px w-[56px]" style={{ background: CLAY }} />
      </div>
      <FootRight />
    </div>
  );
}

/** The foot of a left-hand page when it is a strap rather than the address. */
function FootStrap({ lines }: { lines: string[] }) {
  return (
    <div className="absolute bottom-[56px] left-[96px]">
      <span aria-hidden className="mb-3 block h-px w-[40px]" style={{ background: CLAY }} />
      {lines.map((l) => (
        <p key={l} className="text-[10.5px] uppercase leading-[1.9] tracking-[0.3em] text-black/55">{l}</p>
      ))}
    </div>
  );
}

/**
 * Page: MEET YOUR AGENT. The print on a sage disc with the note on its top
 * corner and the review on its bottom corner - and nothing else in the
 * picture. James, 13 Sep 2026: "the last one had three, which is quite a
 * lot. We just want to balance that out." The review is the deck's real
 * one, not the mock-up's.
 */
export function BookAgent({ deck }: { deck: Deck }) {
  const a = deck.agent;
  const first = a.firstName || "";
  const paragraphs = (a.bio.trim() || defaultBio(first)).split(/\n{2,}/);
  const t = deck.testimonial;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* The sage disc behind the print. */}
      <div className="pointer-events-none absolute left-[720px] top-[150px] h-[560px] w-[560px] rounded-full" style={{ background: SAGE_WASH }} />
      {/* THE PRINT, a few degrees off square. Initials when REX has no photo. */}
      <div className="absolute left-[680px] top-[190px] w-[420px] rounded-[10px] bg-white p-[14px] pb-[16px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.4)]" style={{ transform: "rotate(-3deg)" }}>
        {a.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.photo} alt={a.name} className="w-full rounded-[6px] object-cover object-[center_15%]" style={{ aspectRatio: "420 / 480" }} />
        ) : (
          <div className="flex w-full items-center justify-center rounded-[6px]" style={{ aspectRatio: "420 / 480", background: SAGE_WASH }}>
            <span className="text-[110px] leading-none" style={{ ...SERIF, color: SAGE_INK }}>{a.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}</span>
          </div>
        )}
      </div>
      {/* THE NOTE on the print's top corner. */}
      <div className="absolute left-[1000px] top-[120px] w-[210px] rounded-[4px] px-5 py-4 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)]" style={{ background: "#fbf6ec", transform: "rotate(3deg)" }}>
        <p className="text-[21px] leading-[1.15] text-black/75" style={{ fontFamily: "var(--font-shantell), cursive" }}>
          Here to help you get the most from your property. <span style={{ color: CLAY }}>&hearts;</span>
        </p>
      </div>
      {/* THE REVIEW, on the print's bottom corner - James: "move the pink box
          down to the bottom right-hand corner of the Polaroid". */}
      {t?.quote && (
        <div className="absolute left-[1010px] top-[560px] w-[300px] rounded-[16px] px-6 py-5" style={{ background: "var(--p-tint)" }}>
          <span aria-hidden className="block text-[44px] leading-[0.6]" style={{ ...SERIF, color: CLAY }}>&ldquo;</span>
          <p className="mt-3 text-[13.5px] italic leading-[1.55] text-black/75">&ldquo;{t.quote}&rdquo;</p>
          <p className="mt-3 text-[10.5px] uppercase tracking-[0.2em] text-black/45">{t.author}</p>
        </div>
      )}

      <div className="absolute left-[96px] top-[84px] w-[520px]">
        <Eyebrow>Meet your agent</Eyebrow>
        <h1 className="mt-8 text-[72px] leading-[1.04]" style={SERIF}>
          You&rsquo;ll be
          <br />
          dealing with
          <br />
          <span style={{ color: CLAY }}>{first || "us"}.</span>
        </h1>
        <span aria-hidden className="mt-4 block h-[3px] w-[150px] rounded-full" style={{ background: CLAY, opacity: 0.8 }} />
        <p className="mt-8 text-[16px] leading-[1.6] text-black/70">Property isn&rsquo;t just a job to {first || "us"}, it&rsquo;s personal.</p>
        <div className="mt-5 space-y-4">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-[15px] leading-[1.7] text-black/60">{para}</p>
          ))}
        </div>
      </div>
      <FootStrap lines={["Local expertise.", "A more personal approach."]} />
    </div>
  );
}

/** Page: WHY LANDLORDS CHOOSE US. The four points in the faint grid, no pictures. */
export function BookApproach() {
  const cols = [APPROACH.points.slice(0, 2), APPROACH.points.slice(2, 4)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1100px]">
        <Eyebrow>A clearer approach to lettings</Eyebrow>
        <h1 className="mt-8 text-[72px] leading-[1.04]" style={SERIF}>
          Why landlords
          <br />
          choose <span style={{ color: CLAY }}>us.</span>
        </h1>
        <span aria-hidden className="mt-4 block h-[3px] w-[240px] rounded-full" style={{ background: CLAY, opacity: 0.8 }} />
        <p className="mt-7 max-w-[560px] text-[16px] leading-[1.6] text-black/65">{APPROACH.standfirst}</p>
        <div className="mt-10 grid grid-cols-2" style={{ width: 1080 }}>
          {cols.map((items, c) => (
            <ol key={c} className={c === 1 ? "border-l pl-10" : "pr-10"} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              {items.map((a, i) => (
                <li key={a.title} className={`flex gap-6 py-6 ${i === 0 ? "border-b" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <span className="w-[44px] shrink-0 text-[24px] leading-none" style={{ ...SERIF, color: CLAY }}>0{c * 2 + i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[18px] font-semibold leading-snug">{a.title}</span>
                    <span className="mt-2 block max-w-[380px] text-[13.5px] leading-[1.6] text-black/55">{a.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      </div>
      <p className="absolute right-[120px] top-[96px] text-[11px] uppercase leading-[1.8] tracking-[0.3em] text-black/55">
        People
        <br />
        Homes
        <br />
        Relationships
      </p>
      <p className="absolute bottom-[56px] left-1/2 -translate-x-1/2 text-[10.5px] uppercase tracking-[0.3em] text-black/55">More than just a letting agent.</p>
    </div>
  );
}
