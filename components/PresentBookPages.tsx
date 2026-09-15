"use client";

import { INK, Line } from "@/components/present-kit";
import { APPRAISAL_PROMISES, defaultBio, type PresentDeck as Deck } from "@/lib/present";
import { AGENDA, APPROACH, COMPLIANCE, LEGAL_CAVEAT, LEGAL_ITEMS, MANAGEMENT, MARKETING_POINTS, MAX_PRICE, NEXT_STEPS, PORTALS_COPY, REGULATED, REGULATED_INTRO, RENT_COLLECTION, RENT_LEGAL, SCREENING, SERVICE_LEVELS, SERVICE_LEVELS_INTRO, SERVICE_ROWS, WHAT_WE_OFFER } from "@/lib/present-copy";
import { FROM_US, FROM_YOU } from "@/components/PresentDeck";
import { createContext, useContext } from "react";

/** What a page can ask the pop-out to do. The modal provides it. */
export const BookActionsCtx = createContext<{ sign: () => void } | null>(null);
import { DEMAND_STATS, PORTAL_STATS, statFooter } from "@/lib/present-stats";

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
          We&rsquo;ll look at the market, what your property could achieve and the clearest route to getting it let.
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
        <Eyebrow>A different approach to lettings</Eyebrow>
        <h1 className="mt-8 text-[72px] leading-[1.04]" style={SERIF}>
          A more personal
          <br />
          way to <span style={{ color: CLAY }}>let.</span>
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

/** An eyebrow with the short rule after it, as on the property spread. */
function EyebrowRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <Eyebrow>{children}</Eyebrow>
      <span aria-hidden className="block h-px w-[36px]" style={{ background: CLAY }} />
    </div>
  );
}

/** A word in the pink italic, with the bowed stroke under it. */
function Ital({ children, width = 200 }: { children: React.ReactNode; width?: number }) {
  return (
    <span className="relative inline-block">
      <span style={{ color: CLAY, fontStyle: "italic", fontWeight: 400 }}>{children}</span>
      <Stroke width={width} color={CLAY} className="absolute -bottom-[10px] left-0" />
    </span>
  );
}

/**
 * Page: YOUR PROPERTY. James's mock-up, 13 Sep 2026: the heading on one
 * line with "yours" in the pink italic, the address and the facts under
 * it, the house in its own soft shape (his cut-out) on a sage shape, the
 * handwritten "Let's see what it could achieve." with an arrow, the strap in the
 * foot. The house is the property's own photograph on a real deck; the
 * sample's is the stand-in cottage.
 */
export function BookProperty({ deck }: { deck: Deck }) {
  const p = deck.property;
  const facts = [
    p.propertyType,
    p.beds != null ? `${p.beds} bedroom${p.beds === 1 ? "" : "s"}` : null,
    p.baths != null ? `${p.baths} bathroom${p.baths === 1 ? "" : "s"}` : null,
    p.sqft != null ? `${p.sqft.toLocaleString("en-GB")} sq ft` : null,
    p.epc ? `EPC ${p.epc}` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* THE SAGE behind the house, low and to the right. */}
      <div className="pointer-events-none absolute" style={{ left: 560, top: 400, width: 820, height: 480, borderRadius: "48% 52% 46% 54% / 58% 44% 56% 42%", background: SAGE_WASH }} />
      {/* THE HOUSE, in its own soft shape. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-property-cut.webp" alt={p.address} className="pointer-events-none absolute max-w-none" style={{ width: 1000, left: 96, bottom: 112 }} />
      {/* The handwritten aside, and the arrow down to the house. */}
      <div className="pointer-events-none absolute left-[1110px] top-[330px] w-[200px]">
        <p className="text-[24px] leading-[1.15] text-black/60" style={{ fontFamily: "var(--font-shantell), cursive", transform: "rotate(-14deg)" }}>
          Let&rsquo;s see
          <br />
          <span className="ml-3">what it could</span>
          <br />
          <span className="ml-1">achieve.</span>
        </p>
        <svg viewBox="0 0 60 60" aria-hidden className="ml-[70px] mt-2 h-[52px] w-[52px]">
          <path d="M40 4C44 20 36 36 16 50M16 50L20 36M16 50L30 46" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </div>

      <div className="absolute left-[96px] top-[84px] w-[1200px]">
        <EyebrowRule>Your property</EyebrowRule>
        <h1 className="mt-6 text-[64px] leading-[1.1]" style={SERIF}>
          Right then. Let&rsquo;s talk about <Ital width={190}>yours</Ital>.
        </h1>
        {(p.address || p.postcode) && (
          <p className="mt-6 text-[24px] leading-[1.3]" style={SERIF}>{[p.address, p.postcode].filter(Boolean).join(", ")}</p>
        )}
        {facts.length > 0 && <p className="mt-2 text-[15px] tracking-[0.02em] text-black/50">{facts.join("  ·  ")}</p>}
      </div>
      <FootStrap lines={["Your property. The right plan."]} />
    </div>
  );
}

/**
 * Page: WHAT WE HAVE ON RECORD. The facts in two columns with hairlines,
 * a missing one marked "to confirm" in the pink, and the line under
 * the table that says how many we still need - the deck's own rule.
 */
export function BookMaterial({ deck }: { deck: Deck }) {
  const rows = deck.material ?? [];
  const blank = (v: string) => !v || v.trim() === "" || v.trim() === "-";
  const missing = rows.filter((r) => blank(r.value)).length;
  const half = Math.ceil(rows.length / 2);
  const cols = [rows.slice(0, half), rows.slice(half)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* THE PINK, off the top-right corner. */}
      <div className="pointer-events-none absolute -right-[260px] -top-[240px] h-[560px] w-[560px] rounded-full" style={{ background: "var(--p-tint)", opacity: 0.9 }} />
      <div className="absolute left-[96px] top-[84px] w-[1040px]">
        <EyebrowRule>Your property details</EyebrowRule>
        <h1 className="mt-6 text-[64px] leading-[1.1]" style={SERIF}>
          Let&rsquo;s make sure everything
          <br />
          is <Ital width={230}>up to date</Ital>
        </h1>
        <p className="mt-8 max-w-[640px] text-[17px] leading-[1.6] text-black/65">
          These are the details we&rsquo;ll use to prepare your property for market. We&rsquo;ll check them together before anything goes live.
        </p>
        <div className="mt-8 grid grid-cols-2" style={{ width: 1000 }}>
          {cols.map((items, c) => (
            <dl key={c} className={c === 1 ? "border-l pl-10" : "pr-10"} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              {items.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-6 border-b py-4" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <dt className="text-[14px] text-black/50">{r.label}</dt>
                  <dd className="text-right text-[15px]" style={blank(r.value) ? { color: CLAY, fontWeight: 600 } : undefined}>
                    {blank(r.value) ? "to confirm" : r.value}
                  </dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
        {missing > 0 && (
          <div className="mt-8 flex items-center gap-4 border-t pt-6" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: "rgba(0,0,0,0.35)" }}>i</span>
            <p className="text-[14px] text-black/60">
              {missing === 1 ? "One detail" : `${missing} details`} still to confirm. Your agent can update {missing === 1 ? "this" : "these"} with you.
            </p>
          </div>
        )}
      </div>
      <div className="absolute right-[120px] top-[96px]">
        <p className="text-[11px] uppercase leading-[1.8] tracking-[0.3em] text-black/55">
          People
          <br />
          Places
          <br />
          Potential
        </p>
        <span aria-hidden className="mt-3 block h-px w-[36px]" style={{ background: CLAY }} />
      </div>
      <div className="absolute bottom-[80px] right-[120px]">
        <p className="text-[11px] uppercase leading-[1.8] tracking-[0.3em] text-black/55">
          The
          <br />
          Letting
          <br />
          Experts
        </p>
        <span aria-hidden className="mt-3 block h-px w-[36px]" style={{ background: CLAY }} />
      </div>
    </div>
  );
}

const gbp = (n: number) => `\u00a3${n.toLocaleString("en-GB")}`;

/** A thumbnail, or a tinted square when the listing has no photograph. */
function Thumb({ src, tint }: { src: string | null | undefined; tint?: boolean }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden className="h-[64px] w-[88px] shrink-0 rounded-[8px] object-cover" />
  ) : (
    <span className="h-[64px] w-[88px] shrink-0 rounded-[8px]" style={{ background: tint ? "rgba(255,255,255,0.7)" : "var(--p-tint)" }} />
  );
}

/**
 * Page: WHAT'S ON THE MARKET. The homes a tenant sees beside theirs, one
 * to a row - thumbnail, address in the serif with OURS on ours, the
 * postcode, beds and type under it, the rent on the right - and ours on a
 * pink band. The same rows and the same cap as the deck's slide.
 */
export function BookListings({ deck }: { deck: Deck }) {
  /* Four in the booklet - James, 13 Sep 2026: "What's on the market should be
     limited to 4". The deck keeps its own cap. */
  const rows = (deck.listings ?? []).slice(0, 4);
  const ours = rows.filter((r) => r.ours).length;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>What&rsquo;s on the market</EyebrowRule>
        <h1 className="mt-6 text-[64px] leading-[1.1]" style={SERIF}>
          What&rsquo;s on the market
          <br />
          near you <Ital width={190}>today</Ital>
        </h1>
        <p className="mt-7 max-w-[820px] text-[17px] leading-[1.6] text-black/65">
          These are the properties tenants are currently seeing alongside yours.
        </p>
        <ul className="mt-6" style={{ width: 1200 }}>
          {rows.map((r, n) => (
            <li
              key={`${r.address}-${r.rent}`}
              className={`flex items-center gap-6 px-5 ${r.ours ? "rounded-[18px] py-4" : "py-4"} ${n > 0 && !r.ours && !rows[n - 1]?.ours ? "border-t" : ""}`}
              style={{ background: r.ours ? "var(--p-tint)" : undefined, borderColor: "rgba(0,0,0,0.08)" }}
            >
              <Thumb src={r.image} tint={r.ours} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-3">
                  <span className="truncate text-[22px] leading-tight" style={SERIF}>{r.address}</span>
                  {r.ours && <span className="rounded-full px-3 py-[3px] text-[10px] font-semibold uppercase tracking-[0.16em] text-white" style={{ background: "var(--p-accent)" }}>Ours</span>}
                  {r.status === "let agreed" && <span className="text-[12px] text-black/45">let agreed</span>}
                </span>
                <span className="mt-1 block text-[14px] text-black/50">{[r.locality, r.beds != null ? `${r.beds} bed` : null, r.type].filter(Boolean).join("  \u00b7  ")}</span>
              </span>
              <span className="text-[22px]" style={SERIF}>{r.rent}</span>
              <span aria-hidden className="text-[18px] text-black/30">&rsaquo;</span>
            </li>
          ))}
        </ul>
        {ours > 0 && (
          <div className="mt-6 flex items-center gap-6" style={{ width: 1200 }}>
            <p className="text-[15px] text-black/65">{ours === 1 ? "One of these is ours." : `${ours} of these are ours.`} The others give us a useful view of the local market.</p>
            <span aria-hidden className="block h-px flex-1" style={{ background: "rgba(0,0,0,0.12)" }} />
          </div>
        )}
      </div>
      <FootStrap lines={["Your property. The right plan."]} />
    </div>
  );
}

/**
 * Page: WHAT'S LETTING NEARBY. The range first, big, in the brown; how
 * many it rests on; then the lets themselves in a white card - address,
 * where, how long it took, the rent. The figures are the deck's snapshot.
 */
export function BookComparables({ deck }: { deck: Deck }) {
  const c = deck.comparables;
  if (!c) return <div style={{ width: PAGE_W, height: PAGE_H, background: PAPER }} />;
  /* Five in the booklet; the deck shows more. */
  const rows = c.rows.slice(0, 5);
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="pointer-events-none absolute -right-[260px] -top-[240px] h-[560px] w-[560px] rounded-full" style={{ background: "var(--p-tint)", opacity: 0.9 }} />
      <div className="absolute left-[96px] top-[84px] w-[1100px]">
        <EyebrowRule>What&rsquo;s letting nearby</EyebrowRule>
        <p className="mt-6 leading-none">
          <span className="text-[84px]" style={{ ...SERIF, color: "var(--p-accent)" }}>{gbp(c.guideLow)}&ndash;{gbp(c.guideHigh)}</span>
          <span className="ml-4 text-[28px] text-black/60" style={SERIF}>pcm</span>
        </p>
        <p className="mt-6 max-w-[760px] text-[17px] leading-[1.6] text-black/65">
          Based on {c.basedOn} comparable {c.basedOn === 1 ? "property" : "properties"} letting nearby. We&rsquo;ll use the evidence to agree the right figure together.
        </p>
        <ul className="mt-7 rounded-[18px] border bg-white/70 px-5" style={{ width: 1080, borderColor: "rgba(0,0,0,0.07)" }}>
          {rows.map((r, n) => (
            <li key={`${r.name}-${r.rent}`} className={`flex items-center gap-6 py-3.5 ${n > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <Thumb src={r.image} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold leading-tight">{r.name}</span>
                <span className="mt-1 block text-[13.5px] text-black/50">{[r.locality, r.beds != null ? `${r.beds} bed` : null, r.type].filter(Boolean).join("  \u00b7  ")}</span>
              </span>
              {r.days != null && <span className="shrink-0 text-[13.5px] text-black/45">{r.letAgreed ? "let" : "advertised"} in {r.days} days</span>}
              <span className="w-[130px] shrink-0 text-right text-[20px]" style={SERIF}>{r.rent}</span>
              <span aria-hidden className="text-[18px] text-black/30">&rsaquo;</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute right-[120px] top-[96px]">
        <p className="text-[11px] uppercase leading-[1.8] tracking-[0.3em] text-black/55">
          People
          <br />
          Places
          <br />
          Potential
        </p>
        <span aria-hidden className="mt-3 block h-px w-[36px]" style={{ background: CLAY }} />
      </div>
      <div className="absolute bottom-[80px] right-[120px]">
        <p className="text-[11px] uppercase leading-[1.8] tracking-[0.3em] text-black/55">
          The
          <br />
          Letting
          <br />
          Experts
        </p>
        <span aria-hidden className="mt-3 block h-px w-[36px]" style={{ background: CLAY }} />
      </div>
    </div>
  );
}

/** A bar in a track, sage by default, with its figure on the right. */
function Bar({ label, frac, value, color = SAGE, icon }: { label: React.ReactNode; frac: number; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-[5px]">
      {icon}
      <span className="w-[170px] shrink-0 truncate text-[13.5px] text-black/70">{label}</span>
      <span className="h-[11px] flex-1 overflow-hidden rounded-[3px]" style={{ background: "rgba(0,0,0,0.05)" }}>
        <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, Math.round(frac * 100))}%`, background: color }} />
      </span>
      <span className="w-[64px] shrink-0 text-right text-[13.5px] font-semibold">{value}</span>
    </div>
  );
}

function Panel({ title, tint, children, style }: { title: string; tint?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="rounded-[14px] border px-6 py-4" style={{ borderColor: "rgba(0,0,0,0.07)", background: tint ? "var(--p-tint)" : "rgba(255,255,255,0.6)", ...style }}>
      <p className="text-[10.5px] uppercase tracking-[0.22em] text-black/55">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Page: YOUR LOCAL MARKET. The deck's market snapshot as the mock-up lays
 * it out: the count and the middle rent as the heading, the average time
 * on the market in a sage tile, then four panels - how long things have
 * been advertised, asking rent by size, houses against flats, who is
 * letting - and the date the figures were read, in the foot.
 */
export function BookMarket({ deck }: { deck: Deck }) {
  const m = deck.market;
  if (!m) return <div style={{ width: PAGE_W, height: PAGE_H, background: PAPER }} />;
  const pct = (n: number) => (m.advertised > 0 ? Math.round((n / m.advertised) * 100) : 0);
  const bandMax = Math.max(1, ...(m.bands ?? []).map((b) => b.n));
  const rentMax = Math.max(1, ...(m.rentByBed ?? []).map((b) => b.rent ?? 0));
  const agentMax = Math.max(1, ...(m.agents ?? []).map((a) => a.n));
  const mixTotal = m.mix ? Math.max(1, m.mix.houses + m.mix.flats) : 1;
  const when = (() => {
    const d = new Date(m.pulledAt);
    return Number.isNaN(d.getTime()) ? m.pulledAt : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  })();
  const disc = (name: "home" | "pin") => (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
      <Line name={name} size={15} />
    </span>
  );
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[80px] top-[80px]" style={{ width: 1280 }}>
        {/* The tile that held the days went (James, 13 Sep 2026: "drop the
            top right-hand box ... keep the 31-day average"); it is a line
            under the rent now, and the panels come up into the frame. */}
        <div className="flex items-end justify-between gap-8">
          <div>
            <Eyebrow>Your local market</Eyebrow>
            <h1 className="mt-4 text-[56px] leading-[1.05]" style={SERIF}>
              {m.advertised} to let in {m.area}
            </h1>
            {m.medianRent != null && (
              <p className="mt-3 text-[22px] text-black/70" style={SERIF}>The middle asking rent here is {gbp(m.medianRent)} pcm.</p>
            )}
          </div>
          {m.marketDays != null && (
            <div className="flex shrink-0 items-center gap-4 pb-2">
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                <Line name="calendar" size={22} />
              </span>
              <div>
                <p className="text-[34px] leading-none" style={SERIF}>{m.marketDays} days</p>
                <p className="mt-1.5 text-[10.5px] uppercase tracking-[0.22em] text-black/60">Average time on the market in {m.area}</p>
              </div>
            </div>
          )}
        </div>
        <span aria-hidden className="mt-3 block h-[3px] w-[48px] rounded-full" style={{ background: CLAY }} />

        <div className="mt-4 grid grid-cols-2 gap-4" data-market-panels>
          {m.bands && m.bands.length > 0 && (
            <Panel title="How long it has been on the market">
              {m.bands.map((b) => (
                <Bar key={b.label} label={b.label} frac={b.n / bandMax} value={`${pct(b.n)}%`} />
              ))}
            </Panel>
          )}
          {m.rentByBed && m.rentByBed.length > 0 && (
            <Panel title="Asking rent by size">
              {m.rentByBed.map((b) => (
                <Bar key={b.label} label={b.label} frac={(b.rent ?? 0) / rentMax} value={b.rent != null ? gbp(b.rent) : "-"} color="#e8c4b8" />
              ))}
            </Panel>
          )}
          {m.mix && (
            <Panel title="What is competing" tint>
              <Bar label="Houses" frac={m.mix.houses / mixTotal} value={`${Math.round((m.mix.houses / mixTotal) * 100)}%`} icon={disc("home")} />
              <Bar label="Flats" frac={m.mix.flats / mixTotal} value={`${Math.round((m.mix.flats / mixTotal) * 100)}%`} icon={disc("pin")} />
            </Panel>
          )}
          {m.agents && m.agents.length > 0 && (
            <Panel title={`Who is letting in ${m.area}`}>
              {m.agents.slice(0, 5).map((a) => (
                <Bar key={a.agent} label={<span className={a.ours ? "font-semibold" : ""}>{a.agent}</span>} frac={a.n / agentMax} value={`${pct(a.n)}%`} />
              ))}
            </Panel>
          )}
        </div>
      </div>
      <div className="absolute bottom-[40px] left-[80px] flex items-center gap-4" data-market-foot style={{ width: 1280 }}>
        <span style={{ color: SAGE_INK }}><Line name="chart" size={18} /></span>
        <p className="text-[12.5px] text-black/55">Figures for {m.area} taken on {when}, from the live record of what is advertised.</p>
        <span aria-hidden className="block h-px flex-1" style={{ background: "rgba(0,0,0,0.12)" }} />
        <p className="text-[10.5px] uppercase tracking-[0.3em] text-black/55">The Letting Experts</p>
      </div>
    </div>
  );
}

/**
 * Page: MARKETING. "Now, let's find the right tenant." with the three points and
 * the real review on the left; the flat in its soft shape on the right,
 * the handwritten line above it with an arrow, and the mark below.
 */
export function BookMarketing() {
  const POINTS = MARKETING_POINTS;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* THE FLAT in its soft shape, off the right. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/marketing-flat-cut.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ height: 590, right: -130, top: 190 }} />
      <div className="pointer-events-none absolute right-[70px] top-[70px] w-[200px]">
        <p className="text-[21px] leading-[1.15] text-black/70" style={{ fontFamily: "var(--font-shantell), cursive", transform: "rotate(-8deg)" }}>
          Great tenants
          <br />
          start with great
          <br />
          marketing.
        </p>
        <svg viewBox="0 0 60 60" aria-hidden className="ml-[120px] mt-1 h-[48px] w-[48px]">
          <path d="M6 6C26 12 40 26 44 50M44 50L34 42M44 50L48 38" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </div>

      <div className="absolute left-[96px] top-[84px] w-[600px]">
        <Eyebrow>Marketing</Eyebrow>
        <h1 className="mt-6 text-[64px] leading-[1.08]" style={SERIF}>
          Now, let&rsquo;s find
          <br />
          the <span style={{ color: SAGE_INK, fontStyle: "italic", fontWeight: 400 }}>right tenant.</span>
        </h1>
        <p className="mt-6 max-w-[540px] text-[17px] leading-[1.55] text-black/65">
          We combine local knowledge, strong presentation and targeted marketing to put your property in front of the right tenants.
        </p>
        {/* Three boxes, one height, the same air in each. The review that
            sat under them and the mark in the corner both went (James, 13
            Sep 2026). */}
        <ul className="mt-9 grid grid-cols-3 gap-4" style={{ width: 600 }}>
          {POINTS.map((b, n) => (
            <li key={b.title} className="flex flex-col items-center rounded-[20px] border px-4 pb-6 pt-7 text-center" style={{ height: 236, borderColor: "rgba(0,0,0,0.07)", background: "rgba(255,255,255,0.6)" }}>
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full" style={n === 1 ? { background: "var(--p-tint)", color: INK } : { background: SAGE_WASH, color: SAGE_INK }}>
                <Line name={b.icon} size={22} />
              </span>
              <span className="mt-5 block text-[15px] font-semibold leading-snug">{b.title}</span>
              <span className="mt-2 block text-[12.5px] leading-[1.55] text-black/55">{b.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Page: WHAT WE DO. The eight things, ticked, in two columns with a
 * hairline under each; the keys on the marble in the bottom-left corner
 * on a sage shape; the mark in the foot.
 */
export function BookOffer() {
  const half = Math.ceil(WHAT_WE_OFFER.length / 2);
  const cols = [WHAT_WE_OFFER.slice(0, half), WHAT_WE_OFFER.slice(half)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* THE SAGE, off the bottom-left corner, and the keys on the marble
          over it - the agenda's marble, mirrored into this corner - with
          the handwritten line on the slab. */}
      <div className="pointer-events-none absolute" style={{ left: -260, bottom: -300, width: 760, height: 620, borderRadius: "50%", background: SAGE_WASH }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* James's picture carries its own handwritten note, so nothing is
          written over it here. */}
      <img src="/brand/photo/book-keys.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ width: 520, left: -60, bottom: -80 }} />

      <div className="absolute left-[96px] top-[84px] w-[1200px]">
        <EyebrowRule>What we do</EyebrowRule>
        <h1 className="mt-6 text-[64px] leading-[1.1]" style={SERIF}>
          Everything that happens
          <br />
          before a tenant <Ital width={200}>moves in</Ital>
        </h1>
        <div className="mt-10 grid grid-cols-2 gap-x-14" style={{ width: 1160 }}>
          {cols.map((items, c) => (
            <ul key={c}>
              {items.map((t) => (
                <li key={t} className="flex items-start gap-4 border-b py-4" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <span className="mt-[2px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                    <Line name="check" size={13} />
                  </span>
                  <span className="text-[16px] leading-[1.5] text-black/75">{t}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <div className="absolute bottom-[56px] right-[120px] flex items-center gap-4">
        <p className="text-[10.5px] uppercase tracking-[0.3em] text-black/55">The Letting Experts</p>
        <span aria-hidden className="block h-px w-[60px]" style={{ background: CLAY }} />
      </div>
    </div>
  );
}

/**
 * Page: GETTING THE BEST RENT. The five points, numbered, in two columns
 * with hairlines; the front door in a soft shape off the top-right with
 * "The right tenant changes everything" beside it; the sage off the
 * bottom-right; the mark and the line in the foot.
 */
export function BookMaxPrice() {
  const pts = MAX_PRICE.points;
  const cols = [[pts[0], pts[2], pts[4]].filter(Boolean), [pts[1], pts[3]].filter(Boolean)];
  const num = (i: number) => `0${i + 1}`;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* THE SAGE, off the bottom-right corner - its edge an S: in from the
          right, a swoop down and out to the bottom-left. James, 13 Sep
          2026: "a nice, almost subtle S shape to it, going down from the
          top right-hand corner to the bottom left-hand corner." */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute" style={{ right: 0, bottom: 0, width: 620, height: 420 }}>
        <path d="M100 18 C 84 16, 76 30, 66 42 C 56 54, 44 58, 30 66 C 16 74, 8 84, 0 100 L 100 100 Z" fill={SAGE_WASH} />
      </svg>
      {/* THE DOOR: James's "10", already cut to its shape, off the top-right. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-door.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ width: 500, right: -30, top: -30 }} />
      {/* The caption on its own cream card over the door's corner, as the
          mock-up has it, or it is lost against the photograph. */}
      <div className="pointer-events-none absolute right-[36px] top-[96px] w-[176px] px-4 py-4" style={{ background: PAPER }}>
        <p className="text-right text-[17px] italic leading-[1.45] text-black/70" style={{ ...SERIF, fontWeight: 400 }}>
          The right tenant changes everything
        </p>
        <span aria-hidden className="ml-auto mt-3 block h-px w-[40px]" style={{ background: CLAY }} />
      </div>

      <div className="absolute left-[96px] top-[84px] w-[1100px]">
        <EyebrowRule>{MAX_PRICE.eyebrow}</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Marketing finds the tenant.
          <br />
          Strategy gets the best <Ital width={190}>result.</Ital>
        </h1>
        <div className="mt-9 grid grid-cols-2 gap-x-12" style={{ width: 1120 }}>
          {cols.map((items, c) => (
            <ol key={c}>
              {items.map((pt, i) => {
                const n = c === 0 ? i * 2 : i * 2 + 1;
                return (
                  <li key={pt.title} className={`flex gap-5 py-5 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                    <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full text-[15px]" style={{ ...SERIF, background: "var(--p-tint)", color: "var(--p-accent)" }}>{num(n)}</span>
                    <span className="min-w-0">
                      <span className="block text-[18px] leading-snug" style={SERIF}>{pt.title}</span>
                      <span className="mt-2 block max-w-[440px] text-[13.5px] leading-[1.6] text-black/60">{pt.body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ))}
        </div>
      </div>
      <div className="absolute bottom-[56px] right-[120px] text-right">
        <p className="text-[10.5px] uppercase tracking-[0.3em] text-black/60">The Letting Experts</p>
      </div>
    </div>
  );
}

/** The clay line that runs along the foot of the portals spread, page to page. */
function Swoosh({ side }: { side: "left" | "right" }) {
  /* Drawn in the page's own units. Left: in from the outer edge low down,
     a loop in the middle, out through the spine. Right: in from the spine,
     a loop, then up and out through the top of the outer edge - James, 13
     Sep 2026: "loopsy loops and more curves, and flows up the side". */
  /* Drawn FIRST, so the shapes and the pictures sit over it: it runs
     behind the sage on the left, behind the pink on the right, and ends
     under the phone - James, 13 Sep 2026: "dip down, go underneath, hit
     the red box, disappear under the red box, come back through, and
     finish at the phone." Nowhere does it cross a word. */
  const d =
    side === "left"
      /* Left: low, under the handwriting (which sits at 640-735), looping
         at the right and running out under the picture. Right: in below
         the source line (about 610), looping under the figures, under the
         pink, up the gap left of the "20 days" column to the phone. */
      /* The two halves meet at the spine at the same height and the curve
         runs straight through it: the left rises going left, so the right
         falls going right. */
      ? "M1440 780 C 1320 750, 1250 860, 1120 830 C 1060 815, 1040 760, 1090 750 C 1140 740, 1130 820, 1080 810 C 980 790, 880 860, 760 850 C 660 840, 600 860, 520 860"
      : "M0 780 C 120 810, 380 830, 560 780 C 660 750, 700 690, 760 720 C 820 750, 740 830, 700 780 C 660 730, 800 680, 940 730 C 1080 790, 1150 870, 1250 840 C 1330 810, 1360 700, 1350 620 C 1340 560, 1360 500, 1380 470";
  return (
    <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} aria-hidden className="pointer-events-none absolute left-0 top-0 z-0" style={{ width: PAGE_W, height: PAGE_H }}>
      <path d={d} fill="none" stroke="var(--p-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/** A national figure: the number big, what it counts under it. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t pt-5" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
      <p className="text-[48px] leading-none" style={{ ...SERIF, color: "var(--p-accent)" }}>{value}</p>
      <p className="mt-3.5 text-[14px] leading-[1.55] text-black/60">{label}</p>
    </div>
  );
}

/**
 * Page: WHERE IT APPEARS. The heading and the paragraph on the left, the
 * four audited figures as a two-by-two on the right, the portal names in a
 * row under a rule, the sage shape and the handwritten line in the bottom
 * corner. The figures are the deck's PORTAL_STATS - the mock-up's own
 * lines under the numbers were not ours and are not here.
 */
export function BookPortals() {
  const LOGOS: Record<string, string> = { Rightmove: "/brand/rightmove.png", Zoopla: "/brand/zoopla.png", OnTheMarket: "/brand/onthemarket.png" };
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <Swoosh side="left" />
      {/* THE SAGE: the bottom-left corner only, its edge a ski-slope - steep
          off the left side, concave, easing out along the foot - James, 13
          Sep 2026: "a steeper, ski-slope kind of bump ... a concave kind of
          shape in that corner, coming across rather than just going across
          the whole width of the page." */}
      <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: PAGE_W, height: PAGE_H }}>
        <path d="M-20 430 C 30 590, 110 700, 240 770 C 380 840, 540 880, 760 920 L-20 920 Z" fill={SAGE_WASH} />
      </svg>
      {/* THE MUG, THE BOOKS AND THE PAD, James's cut-out, whole, in the
          bottom-left corner - he tried it with the mug off the page and
          put it back. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-plant-books.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ width: 820, left: -40, bottom: -30 }} />

      <div className="absolute left-[96px] top-[100px]" style={{ width: 1250 }}>
        <div className="grid grid-cols-[1fr_1fr] gap-x-16">
          <div>
            <Eyebrow>Where it appears</Eyebrow>
            <h1 className="mt-6 text-[60px] leading-[1.08]" style={SERIF}>
              Everywhere a
              <br />
              tenant is <Ital width={210}>looking</Ital>
            </h1>
            <p className="mt-8 max-w-[480px] text-[17px] leading-[1.6] text-black/65">
              {PORTALS_COPY.body}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-10 pt-4">
            {PORTAL_STATS.map((st) => (
              <Stat key={st.value + st.label} value={st.value} label={st.label} />
            ))}
          </div>
        </div>
        <ul className="mt-10 flex items-center justify-between border-t pt-8" style={{ width: 1160, borderColor: "rgba(0,0,0,0.12)" }}>
          {PORTALS_COPY.portals.map((name) => (
            <li key={name} className="flex items-center">
              {LOGOS[name] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={LOGOS[name]} alt="" aria-hidden className="mr-3 h-7 w-auto shrink-0 opacity-90" />
              )}
              <span className="text-[21px] font-semibold leading-none text-black/75">{name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[11px] text-black/40">{statFooter(PORTAL_STATS)}</p>
      </div>
    </div>
  );
}

/**
 * Page: SOCIAL ADVERTISING. The heading and the paragraph, then WHY SOCIAL
 * WORKS with the three national figures and their source line; the pink
 * shape and the clay line in the bottom corner, the handwritten line in
 * the top one. The figures are DEMAND_STATS with their real labels - the
 * mock-up put other words under the same numbers.
 */
export function BookSocial() {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <Swoosh side="right" />
      <div className="pointer-events-none absolute" style={{ right: -220, bottom: -280, width: 720, height: 520, borderRadius: "50%", background: "var(--p-tint)" }} />
      {/* THE PHONE on the sofa, in a circle off the top-right - James's
          cut-out, cropped to a disc so its blank ground never shows. */}
      <div className="pointer-events-none absolute overflow-hidden rounded-full" style={{ right: -60, top: 20, width: 470, height: 470, background: SAGE_WASH }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/photo/book-phone.webp" alt="" aria-hidden className="h-full w-full object-cover" />
      </div>
      <div className="pointer-events-none absolute right-[470px] top-[76px] w-[200px] text-right">
        <p className="text-[21px] leading-[1.2] text-black/70" style={{ fontFamily: "var(--font-shantell), cursive", transform: "rotate(-8deg)" }}>
          Right people.
          <br />
          Right places.
          <br />
          Right time.
        </p>
        <svg viewBox="0 0 60 60" aria-hidden className="ml-auto mr-[10px] mt-1 h-[44px] w-[44px]">
          <path d="M14 6C22 22 30 34 48 46M48 46L34 44M48 46L44 32" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </div>

      <div className="absolute left-[96px] top-[100px]" style={{ width: 1100 }}>
        <Eyebrow>Social advertising</Eyebrow>
        <h1 className="mt-6 text-[60px] leading-[1.08]" style={SERIF}>
          Reaching tenants
          <br />
          beyond the <Ital width={175}>portals</Ital>
        </h1>
        <p className="mt-8 max-w-[560px] text-[17px] leading-[1.6] text-black/65">
          Portal search reaches people already actively looking. Paid social helps us extend that reach locally and introduce your property to potential tenants beyond the traditional property portals.
        </p>
        <p className="mt-14 text-[11px] uppercase tracking-[0.32em] text-black/55">Why wider reach matters</p>
        <div className="mt-8 grid grid-cols-3 gap-x-14" style={{ width: 1060 }}>
          {DEMAND_STATS.map((st, n) => (
            <div key={st.value} className={n > 0 ? "border-l pl-12" : ""} style={{ borderColor: "rgba(0,0,0,0.12)" }}>
              <p className="text-[56px] leading-none" style={{ ...SERIF, color: "var(--p-accent)" }}>{st.value}</p>
              <p className="mt-4 max-w-[250px] text-[14.5px] leading-[1.55] text-black/60">{st.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-[11px] text-black/40">{statFooter(DEMAND_STATS)}</p>
      </div>
    </div>
  );
}

/**
 * Page: COMPLIANCE AND GUIDANCE. James's mock-up, 13 Sep 2026: plain -
 * the heading with "out" in the pink, then the four things in a 2x2 with
 * a hairline over each, no numbers, no pictures, no shapes. The copy is
 * the deck's.
 */
export function BookCompliance({ deck }: { deck: Deck }) {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[150px] w-[1180px]">
        <EyebrowRule>Compliance &amp; legislation</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Keeping your property ready,
          <br />
          compliant and <Ital width={240}>up to date</Ital>
        </h1>
        <p className="mt-7 max-w-[720px] text-[17px] leading-[1.6] text-black/65">
          Lettings comes with a growing number of responsibilities. Our role is to help you understand what applies, what needs doing and when.
        </p>
        <div className="mt-9 grid grid-cols-2 gap-x-14 gap-y-9" style={{ width: 1160 }}>
          {COMPLIANCE.map((c) => (
            <div key={c.title} className="border-t pt-6" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              <p className="text-[19px] font-semibold leading-snug">{c.title}</p>
              <p className="mt-3 max-w-[480px] text-[15px] leading-[1.6] text-black/60">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
      <FootLeft deck={deck} />
    </div>
  );
}

/**
 * Page: YOUR LANDLORD RESPONSIBILITIES. The mock-up's "Eight things, and who
 * keeps track of each": the eight numbered in the pink discs, two columns
 * with hairlines, and the closing line under a rule. The obligations are
 * the deck's, each with our half attached; the caveat that half the book
 * is under different law stays, small.
 */
export function BookLegal() {
  const half = Math.ceil(LEGAL_ITEMS.length / 2);
  const cols = [LEGAL_ITEMS.slice(0, half), LEGAL_ITEMS.slice(half)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>Your landlord responsibilities</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          The essentials we help
          <br />
          you stay <Ital width={210}>on top of</Ital>
        </h1>
        <p className="mt-6 max-w-[780px] text-[16px] leading-[1.55] text-black/65">
          From safety certificates to tenant documentation, we&rsquo;ll help you understand what&rsquo;s required and keep the important dates visible.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-x-14" style={{ width: 1240 }}>
          {cols.map((items, c) => (
            <ol key={c}>
              {items.map((it, i) => (
                <li key={it.title} className={`flex items-start gap-4 py-[12px] ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" style={{ background: "var(--p-tint)", color: "var(--p-accent)" }}>0{c * half + i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[15.5px] font-semibold leading-snug">{it.title}</span>
                    <span className="mt-1 block text-[12.5px] leading-[1.55] text-black/55">{it.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
        <div className="mt-6 border-t pt-5" style={{ width: 1240, borderColor: "rgba(0,0,0,0.1)" }}>
          <p className="max-w-[1000px] text-[14px] leading-[1.6] text-black/65">
            We take care of the detail, so you can enjoy the rewards. From documentation to deadlines, we&rsquo;ll keep you compliant and give you peace of mind.
          </p>
          <p className="mt-3 max-w-[1000px] text-[10.5px] leading-[1.6] text-black/40">{LEGAL_CAVEAT}</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── the back half ─────────────────────────
   Spreads 9-14, built to the booklet's own system without mock-ups (James,
   13 Sep 2026: "tear through the last couple of pages on your own ... the
   same kind of feel"). A different shape or picture on each, none of the
   pictures used earlier in the booklet - the OS's own photographs instead. */

/** A free-drawn shape in the page's own units, sage or pink. */
function Blob({ d, tint = "sage" }: { d: string; tint?: "sage" | "pink" }) {
  return (
    <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: PAGE_W, height: PAGE_H }}>
      <path d={d} fill={tint === "sage" ? SAGE_WASH : "var(--p-tint)"} />
    </svg>
  );
}

/** A photograph in a soft shape, positioned by the caller. */
function Soft({ src, style, radius = "62% 38% 54% 46% / 48% 56% 44% 52%" }: { src: string; style: React.CSSProperties; radius?: string }) {
  return (
    <div className="pointer-events-none absolute overflow-hidden" style={{ borderRadius: radius, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="h-full w-full object-cover" />
    </div>
  );
}

function Hand({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <p className={`pointer-events-none absolute text-[21px] leading-[1.2] text-black/70 ${className}`} style={{ fontFamily: "var(--font-shantell), cursive", ...style }}>
      {children}
    </p>
  );
}

/** Page 9L: HOW WE FIND AND SCREEN EVERY TENANT - the four paragraphs, two a side. */
export function BookScreening() {
  const [a, b] = [SCREENING.paragraphs.slice(0, 2), SCREENING.paragraphs.slice(2)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* The sage as a wave along the foot: down off the left, back up, and
          down again to finish over the strap - James, 13 Sep 2026. */}
      <Blob d="M-20 520 C 40 620, 90 720, 200 700 C 290 684, 320 600, 400 630 C 470 656, 500 740, 620 780 C 700 806, 760 860, 780 920 L-20 920 Z" />
      <div className="absolute left-[96px] top-[84px] w-[1200px]">
        <EyebrowRule>{SCREENING.eyebrow}</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          A thorough process
          <br />
          from the <Ital width={130}>start</Ital>
        </h1>
        <div className="mt-10 grid grid-cols-2 gap-x-12" style={{ width: 1140 }}>
          {[a, b].map((col, c) => (
            <div key={c} className={`space-y-6 ${c === 1 ? "border-l pl-12" : "pr-4"}`} style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              {col.map((t) => (
                <p key={t.slice(0, 20)} className="text-[15px] leading-[1.7] text-black/65">{t}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <FootStrap lines={["People \u00b7 Properties \u00b7 Longer futures"]} />
    </div>
  );
}

/** Page 9R: MANAGEMENT AND SUPPORT - the four services with their discs. */
export function BookManagement() {
  const icons: ("check" | "shield" | "chart" | "home")[] = ["check", "shield", "chart", "home"];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <Blob d="M1460 600 C 1400 560, 1340 660, 1260 650 C 1180 640, 1150 580, 1070 610 C 990 640, 980 740, 900 780 C 840 810, 800 860, 780 920 L1460 920 Z" />
      <Hand className="right-[130px] top-[700px] w-[220px] text-right" style={{ transform: "rotate(-10deg)" }}>
        Your property
        <br />
        in safe hands.
      </Hand>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>Management and support</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Choose how involved
          <br />
          you want to <Ital width={70}>be</Ital>
        </h1>
        <div className="mt-10 grid grid-cols-2 gap-x-14" style={{ width: 1200 }}>
          {MANAGEMENT.map((m, i) => (
            <div key={m.title} className={`flex gap-5 py-6 ${i >= 2 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--p-tint)", color: "var(--p-accent)" }}>
                <Line name={icons[i]} size={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-[18px] font-semibold leading-snug">{m.title}</span>
                <span className="mt-2 block max-w-[420px] text-[14px] leading-[1.6] text-black/60">{m.body}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Page 10L: SERVICE LEVELS - the three, and what separates them, as a table. */
export function BookLevels({ deck }: { deck: Deck }) {
  const rows = SERVICE_ROWS.filter((r) => r.included.length === 3);
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[76px] w-[1250px]">
        <EyebrowRule>Service levels</EyebrowRule>
        <h1 className="mt-4 text-[46px] leading-[1.1]" style={SERIF}>
          Three levels. Choose the support that <Ital width={190}>suits you.</Ital>
        </h1>
        <p className="mt-3 max-w-[760px] text-[13.5px] leading-[1.55] text-black/60">{SERVICE_LEVELS_INTRO}</p>
        <table className="mt-4 w-full border-collapse text-left" style={{ width: 1240 }}>
          <thead>
            <tr className="border-b" style={{ borderColor: "rgba(0,0,0,0.14)" }}>
              <th className="pb-3 pr-4 text-[10.5px] font-normal uppercase tracking-[0.22em] text-black/50">What each level includes</th>
              {SERVICE_LEVELS.map((l, n) => (
                <th key={l} className="w-[150px] pb-3 text-center text-[12.5px] font-semibold" style={{ color: n === 0 ? "var(--p-accent)" : "rgba(0,0,0,0.6)" }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.service} className="border-b" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
                <td className="py-[4px] pr-4 text-[12.5px] text-black/75">{r.service}</td>
                {r.included.map((on, n) => (
                  <td key={n} className="py-[4px] text-center">
                    {on ? (
                      <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                        <Line name="check" size={10} />
                      </span>
                    ) : (
                      <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: "rgba(0,0,0,0.15)" }} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FootLeft deck={deck} />
    </div>
  );
}

/** Page 10R: RENT COLLECTION - the four points, and a home. */
export function BookCollection() {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* The pink, big, off the top-right corner; the building standing in
          front of it and rising off the top of the page - James, 13 Sep 2026. */}
      <div className="pointer-events-none absolute -right-[260px] -top-[360px] h-[760px] w-[760px] rounded-full" style={{ background: "var(--p-tint)" }} />
      {/* The right-hand terrace from the presentation's entrance, standing
          on the bottom line of the page with its foliage off the edge and its
          chimneys rising into the pink - James, 13 Sep 2026. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/art/entrance-right.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ height: 740, right: -70, bottom: 0 }} />
      <div className="absolute left-[96px] top-[84px] w-[760px]">
        <EyebrowRule>Rent collection</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Rent collection,
          <br />
          made <Ital width={140}>simple</Ital>
        </h1>
        <p className="mt-8 max-w-[600px] text-[16px] leading-[1.6] text-black/65">{RENT_COLLECTION.body}</p>
        <ul className="mt-8" style={{ width: 620 }}>
          {RENT_COLLECTION.points.map((t, i) => (
            <li key={t} className={`flex items-start gap-4 py-4 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <span className="mt-[2px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                <Line name="check" size={13} />
              </span>
              <span className="text-[15.5px] leading-[1.5] text-black/75">{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[10.5px] uppercase tracking-[0.3em] text-black/55">People &middot; Homes &middot; Relationships</p>
      </div>
    </div>
  );
}

/** Page 11L: RENT & LEGAL PROTECTION - six points, compact, the disclaimer under. */
export function BookRentLegal({ deck }: { deck: Deck }) {
  const half = Math.ceil(RENT_LEGAL.points.length / 2);
  const cols = [RENT_LEGAL.points.slice(0, half), RENT_LEGAL.points.slice(half)];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>{RENT_LEGAL.eyebrow}</EyebrowRule>
        <h1 className="mt-6 text-[52px] leading-[1.1]" style={SERIF}>
          Extra reassurance,
          <br />
          <Ital width={190}>included</Ital>
        </h1>
        <p className="mt-6 max-w-[900px] text-[14.5px] leading-[1.6] text-black/65">{RENT_LEGAL.standfirst}</p>
        <div className="mt-6 grid grid-cols-2 gap-x-12" style={{ width: 1200 }}>
          {cols.map((items, c) => (
            <ul key={c}>
              {items.map((pt, i) => (
                <li key={pt.title} className={`flex items-start gap-4 py-[10px] ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <span className="mt-[3px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--p-tint)", color: "var(--p-accent)" }}>
                    <Line name="shield" size={12} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold leading-snug">{pt.title}</span>
                    <span className="mt-1 block text-[12.5px] leading-[1.5] text-black/55">{pt.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
        <p className="mt-5 max-w-[1000px] text-[10.5px] leading-[1.6] text-black/40">{RENT_LEGAL.disclaimer}</p>
      </div>
      <FootLeft deck={deck} />
    </div>
  );
}

/** Page 11R: PROFESSIONAL STANDARDS - the eight bodies, and a roofline. */
export function BookRegulated() {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/book-plant-corner.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ width: 360, right: -50, top: -60 }} />
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>Professional standards</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Professional standards
          <br />
          you can <Ital width={210}>rely on</Ital>
        </h1>
        <p className="mt-6 max-w-[760px] text-[15px] leading-[1.6] text-black/65">{REGULATED_INTRO}</p>
        <div className="mt-7 grid grid-cols-2 gap-x-12" style={{ width: 1100 }}>
          {REGULATED.map((r, i) => (
            <div key={r.name} className={`py-3 ${i >= 2 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <p className="text-[14.5px] font-semibold leading-snug">{r.name}</p>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-black/55">{r.caption}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="absolute bottom-[56px] left-[96px] text-[10.5px] uppercase tracking-[0.3em] text-black/55">The Letting Experts</p>
    </div>
  );
}

/** Page 12L: OUR COMMITMENT - centred, the two lists as coloured cards, no button. */
export function BookWhy() {
  const card = (title: string, items: { title: string; body: string }[], bg: string) => (
    <div className="rounded-[22px] px-8 py-7" style={{ background: bg }}>
      <p className="text-[11px] uppercase tracking-[0.3em] text-black/55">{title}</p>
      <ol className="mt-4">
        {items.map((it, i) => (
          <li key={it.title} className={`flex gap-4 py-3 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <span className="w-[30px] shrink-0 text-[18px] leading-none" style={{ ...SERIF, color: "var(--p-accent)" }}>0{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-snug">{it.title}</span>
              <span className="mt-1 block text-[12.5px] leading-[1.5] text-black/55">{it.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute inset-x-0 top-[84px] flex flex-col items-center text-center">
        <Eyebrow>Our commitment</Eyebrow>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Four things you can
          <br />
          <Ital width={280}>expect from us</Ital>
        </h1>
        <div className="mt-12 grid grid-cols-2 gap-6 text-left" style={{ width: 1160 }}>
          {card("What to expect from us", FROM_US, "var(--p-tint)")}
          {card("What helps us deliver the best result", FROM_YOU, SAGE_WASH)}
        </div>
      </div>
      <p className="absolute bottom-[56px] left-1/2 -translate-x-1/2 text-[10.5px] uppercase tracking-[0.3em] text-black/55">Clear advice, good communication, a service built round your property</p>
    </div>
  );
}

/** Page 12R: WHAT LANDLORDS SAY - the real review, centred, on a pink disc. */
export function BookTestimonial({ deck }: { deck: Deck }) {
  const t = deck.testimonials?.[0] ?? deck.testimonial ?? null;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute inset-x-0 top-[84px] flex flex-col items-center text-center">
        <Eyebrow>What landlords say</Eyebrow>
        {t?.quote ? (
          <div className="relative mt-6 w-[1060px]">
            <span aria-hidden className="block text-[150px] leading-[0.55]" style={{ ...SERIF, color: CLAY }}>&ldquo;</span>
            <p className="mt-6 text-[36px] italic leading-[1.4] text-black/85" style={{ ...SERIF, fontWeight: 400 }}>{t.quote}</p>
            {t.rating != null && <p className="mt-8 text-[26px] tracking-[0.25em]" style={{ color: CLAY }}>{"\u2605".repeat(Math.max(0, Math.min(5, Math.round(t.rating))))}</p>}
            <p className="mt-4 text-[14px] uppercase tracking-[0.3em] text-black/60">{t.author}</p>
            <div className="mx-auto mt-8 h-[150px] w-[150px] overflow-hidden rounded-full shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/photo/close.jpg" alt="" aria-hidden className="h-full w-full object-cover" />
            </div>
          </div>
        ) : (
          <p className="mt-10 text-[17px] text-black/55">What our landlords say about us will sit here.</p>
        )}
      </div>
      <p className="absolute bottom-[56px] left-1/2 -translate-x-1/2 text-[10.5px] uppercase tracking-[0.3em] text-black/55">People &middot; Homes &middot; Relationships</p>
    </div>
  );
}

/** Page 13L: THE FIGURE - the rent we would put it on at, big, with the terms it comes with. */
export function BookValuation({ deck }: { deck: Deck }) {
  const v = deck.valuation;
  /* Which of the three levels the agreed service is, by its name. */
  const levelIndex = (name: string | null) => {
    const n = (name ?? "").toLowerCase();
    if (/manag/.test(n)) return 0;
    if (/collect/.test(n)) return 1;
    if (/find/.test(n)) return 2;
    return -1;
  };
  const li = v ? levelIndex(v.serviceLevel) : -1;
  const included = li >= 0 ? SERVICE_ROWS.filter((r) => r.included[li as 0 | 1 | 2]).map((r) => r.service) : [];
  const lines = v
    ? ([
        v.serviceLevel ? ["Service", v.serviceLevel] : null,
        v.feePct != null ? ["Fee", `${v.feePct}% of rent, ${gbp(Math.round((v.rent * v.feePct) / 100))} a month at this rent`] : null,
        v.setupFee != null ? ["Set-up", `${gbp(v.setupFee)} one-off`] : null,
      ].filter(Boolean) as [string, string][])
    : [];
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>What we&rsquo;d put it on at</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          The figure, and
          <br />
          what comes <Ital width={180}>with it</Ital>
        </h1>
        {v ? (
          <div className="mt-8 grid grid-cols-[520px_1fr] gap-x-16">
            <div>
              <p className="leading-none">
                <span className="text-[104px]" style={{ ...SERIF, color: "var(--p-accent)" }}>{gbp(v.rent)}</span>
                <span className="ml-3 text-[26px] text-black/60" style={SERIF}>pcm</span>
              </p>
              <dl className="mt-8">
                {lines.map(([k, val]) => (
                  <div key={k} className="flex items-baseline gap-6 border-t py-4" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                    <dt className="w-[90px] shrink-0 text-[10.5px] uppercase tracking-[0.22em] text-black/50">{k}</dt>
                    <dd className="text-[20px]" style={SERIF}>{val}</dd>
                  </div>
                ))}
              </dl>
              {v.note && <p className="mt-6 max-w-[500px] text-[14px] italic leading-[1.6] text-black/60" style={{ ...SERIF, fontWeight: 400 }}>{v.note}</p>}
            </div>
            {included.length > 0 && (
              <div className="rounded-[22px] px-8 py-7" style={{ background: SAGE_WASH }}>
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/55">Included in {v.serviceLevel}</p>
                <ul className="mt-4 grid grid-cols-1 gap-y-[6px]">
                  {included.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white" style={{ color: SAGE_INK }}>
                        <Line name="check" size={10} />
                      </span>
                      <span className="text-[13px] leading-[1.45] text-black/75">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-10 text-[17px] text-black/55">The figure we agreed at the visit will sit here.</p>
        )}
      </div>
      <FootLeft deck={deck} />
    </div>
  );
}

/** Page 13R: WHAT IT COSTS - the one fee, what it covers, and what is not in it. */
export function BookFees({ deck }: { deck: Deck }) {
  const f = deck.fees;
  const rent = deck.valuation?.rent ?? null;
  const monthly = (r: { pct?: number | null; oneOff?: number | null }) =>
    r.pct != null && rent != null ? `${gbp(Math.round((rent * r.pct) / 100))} a month` : r.oneOff != null ? `${gbp(r.oneOff)} one-off` : null;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>What it costs</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          One fee.
          <br />
          Here&rsquo;s what it <Ital width={180}>covers</Ital>
        </h1>
        {f ? (
          <>
            <div className="mt-8 grid grid-cols-[1fr_440px] items-start gap-x-14">
              <div>
                {f.headline && (
                  <p className="leading-none">
                    <span className="text-[56px]" style={{ ...SERIF, color: "var(--p-accent)" }}>{f.headline}</span>
                    {f.headlineFor && <span className="ml-4 text-[18px] text-black/55">{f.headlineFor}</span>}
                  </p>
                )}
                <dl className="mt-8">
                  {f.rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-8 border-t py-4" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
                      <dt>
                        <span className="text-[22px]" style={SERIF}>{r.label}</span>
                        {r.note && <span className="ml-3 text-[13px] text-black/50">{r.note}</span>}
                      </dt>
                      <dd className="text-right">
                        <span className="block text-[22px] font-semibold">{r.amount}</span>
                        {monthly(r) && <span className="block text-[13px] text-black/50">{monthly(r)}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="pt-3 text-[16px] leading-[1.65] text-black/65">
                One percentage of the rent we collect, and it covers the tenancy from start to finish. Nothing is added later that is not on this page, and what is not included is written here too.
              </p>
            </div>
            {rent != null && (
              <div className="mt-8 rounded-[22px] px-8 py-6" style={{ background: "var(--p-tint)", width: 1200 }}>
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/55">At {gbp(rent)} a month, that is</p>
                <p className="mt-3 text-[19px] leading-[1.6] text-black/80" style={SERIF}>
                  {f.rows
                    .map((r) => {
                      const m = monthly(r);
                      return m ? `${r.label}: ${m}` : null;
                    })
                    .filter(Boolean)
                    .join("  \u00b7  ")}
                </p>
              </div>
            )}
            {f.excluded.length > 0 && (
              <div className="mt-6">
                <p className="text-[10.5px] uppercase tracking-[0.22em] text-black/50">Not included</p>
                <p className="mt-2 max-w-[800px] text-[14px] leading-[1.6] text-black/60">{f.excluded.join("  \u00b7  ")}</p>
              </div>
            )}
            {f.note && <p className="mt-5 max-w-[800px] text-[13px] leading-[1.6] text-black/50">{f.note}</p>}
          </>
        ) : (
          <p className="mt-10 text-[17px] text-black/55">Our fee schedule will sit here.</p>
        )}
      </div>
      <FootRight />
    </div>
  );
}

/** Page 14L: GETTING STARTED - three steps, numbered, and where to sign. */
export function BookTerms({ deck }: { deck: Deck }) {
  const actions = useContext(BookActionsCtx);
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      <div className="absolute left-[96px] top-[84px] w-[1250px]">
        <EyebrowRule>Getting started</EyebrowRule>
        <h1 className="mt-6 text-[64px] leading-[1.1]" style={SERIF}>
          Ready when
          <br />
          <Ital width={190}>you are</Ital>
        </h1>
        <ol className="mt-10" style={{ width: 1000 }}>
          {NEXT_STEPS.map((st, i) => (
            <li key={st.title} className={`flex items-start gap-7 py-7 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[17px]" style={{ ...SERIF, background: "var(--p-tint)", color: "var(--p-accent)" }}>0{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[24px] leading-snug" style={SERIF}>{st.title}</span>
                <span className="mt-2 block max-w-[640px] text-[16px] leading-[1.6] text-black/60">{st.body}</span>
              </span>
              {i === 0 && (
                /* Above the turn zones (z-7), so the press reaches it. */
                <button
                  type="button"
                  onClick={() => actions?.sign()}
                  className="relative z-[8] mt-1 inline-flex h-[54px] shrink-0 items-center gap-3 rounded-full px-7 text-[15px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.03]"
                  style={{ background: "#cfa096", pointerEvents: "auto" }}
                >
                  Sign the terms
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px]">
                    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-[760px] text-[15px] leading-[1.6] text-black/60">
          {deck.terms?.summary ?? (deck.terms?.signUrl ? "Your terms are ready - press Sign the terms whenever you are." : `Your terms are being prepared. ${deck.agent.firstName || "Your agent"} will send them across, and Sign the terms will take you straight to them.`)}
        </p>
      </div>
      <FootLeft deck={deck} />
    </div>
  );
}

/** Page 14R: ANY QUESTIONS - the door, the ask, and how to reach them. */
export function BookQuestions({ deck }: { deck: Deck }) {
  const a = deck.agent;
  const first = a.firstName || "us";
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: PAPER, color: INK }}>
      {/* The sage with loose edges, and the deck's own closing picture in
          its rounded frame in front - styled after the presentation's last
          page, as James asked - with the line under it. */}
      <Blob d="M860 -20 C 900 60, 840 140, 880 230 C 920 320, 860 400, 900 500 C 940 600, 870 700, 920 800 C 950 860, 1000 900, 1040 920 L1460 920 L1460 -20 Z" />
      <div className="pointer-events-none absolute overflow-hidden rounded-[28px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]" style={{ right: 110, top: 130, width: 470, height: 505 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/photo/close-door.webp" alt="" aria-hidden className="h-full w-full object-cover" />
      </div>
      <Hand className="right-[150px] top-[680px] w-[300px]" style={{ transform: "rotate(-6deg)", color: SAGE_INK, fontSize: 27 }}>
        Let&rsquo;s get going.
      </Hand>
      {/* The words, centred on the page's height. */}
      <div className="absolute left-[96px] top-0 flex h-full w-[760px] flex-col justify-center">
        <EyebrowRule>Any questions</EyebrowRule>
        <h1 className="mt-6 text-[60px] leading-[1.1]" style={SERIF}>
          Anything we
          <br />
          didn&rsquo;t <Ital width={150}>cover</Ital>?
        </h1>
        <p className="mt-8 max-w-[560px] text-[16px] leading-[1.65] text-black/65">
          If anything came to mind after we left - about the rent, the paperwork, or what the market&rsquo;s doing - ask {first}. There is no such thing as a small question at this stage.
        </p>
        <div className="mt-10 border-t pt-6" style={{ width: 520, borderColor: "rgba(0,0,0,0.1)" }}>
          <p className="text-[19px]" style={SERIF}>{a.name}</p>
          {a.title && <p className="mt-1 text-[12.5px] text-black/55">{a.title}</p>}
          {a.phone && <p className="mt-4 text-[15px] text-black/75">{a.phone}</p>}
          {a.email && <p className="mt-1 text-[15px] text-black/75">{a.email}</p>}
        </div>
        <div className="mt-10 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className="h-[40px] w-auto" />
          <p className="text-[14px] text-black/55">Thank you for your time.</p>
        </div>
      </div>
    </div>
  );
}
