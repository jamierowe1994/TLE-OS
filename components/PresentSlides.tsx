"use client";

import {
  AGENDA,
  APPROACH,
  BROCHURE_COPY,
  COMPLIANCE,
  LEGAL_CAVEAT,
  LEGAL_ITEMS,
  MANAGEMENT,
  MAX_PRICE,
  NETWORK,
  PORTALS_COPY,
  PROTECTION,
  REGULATED,
  RENT_COLLECTION,
  RENT_LEGAL,
  SCREENING,
  SERVICE_LEVELS,
  SERVICE_LEVELS_INTRO,
  SERVICE_ROWS,
  SOCIAL_COPY,
  VIDEO_COPY,
  WHAT_WE_OFFER,
} from "@/lib/present-copy";
import { useState } from "react";
import type { PresentDeck as Deck } from "@/lib/present";
import {
  CORAL,
  CreamSlide,
  DISPLAY,
  Emphasis,
  Eyebrow,
  HAND,
  HandHead,
  INK,
  Line,
  Art,
  Mark,
  PropertyDetail,
  useIsPhoto,
  MIST,
  PAPER,
  RED,
  Rise,
  Slide,
  TINTS,
} from "@/components/present-kit";

/**
 * The market-appraisal slides — the long middle of the deck.
 *
 * PresentDeck.tsx keeps the slides that render LIVE data about this landlord
 * and this property: the entrance, the appointment, the agent, the comparables
 * and the market. These are the ones built on standing copy from
 * lib/present-copy, plus the handful that shape a data set into a picture.
 *
 * The split is by what changes, not by what looks similar. A paragraph Susan
 * rewrites and a chart that has to survive a null both live somewhere obvious.
 *
 * ── Rhythm, and why two more slides are allowed to go dark ──────────────────
 *
 * The six-slide deck used its dark ground exactly twice, opening and closing,
 * "so the deck has a shape rather than a rhythm of alternating panels nobody
 * asked for". At thirty slides that rule inverts: a landlord scrolling twenty
 * consecutive white pages has no idea how far through they are. The two
 * section dividers are therefore dark, and they are the only additions — four
 * dark slides across thirty, each one marking a change of subject.
 */

/* ───────────────────────── shared parts ───────────────────────── */

/**
 * Eyebrow, heading, rule. Written once because twenty slides open this way and
 * a heading that is 34px on one of them and 32px on the next is the kind of
 * thing nobody can name but everybody sees.
 */
function Head({
  eyebrow,
  title,
  lead,
  show,
  on = "light",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  show: boolean;
  on?: "light" | "dark";
}) {
  const dark = on === "dark";
  return (
    <Rise show={show} i={0}>
      <Eyebrow on={on}>{eyebrow}</Eyebrow>
      <h2
        className="mt-3 max-w-2xl text-[26px] font-light leading-[1.15] tracking-[-0.01em] sm:text-[36px]"
        style={dark ? undefined : { color: INK }}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-4 max-w-2xl text-[14px] font-light leading-relaxed ${
            dark ? "text-white/80" : "text-black/60"
          }`}
        >
          {lead}
        </p>
      )}
      <span
        className="mt-6 block h-[3px] w-[34px] rounded-full"
        style={{ background: dark ? "rgba(255,255,255,0.8)" : RED }}
      />
    </Rise>
  );
}

/** The tick and the dash on the service table. A dash, never a cross — a cross
 *  reads as a failure and these are simply levels somebody did not buy. */
function Tick({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex" style={{ color: RED }} aria-label="Included">
      <Line name="check" size={17} />
    </span>
  ) : (
    // An en dash, not a hyphen. A table glyph rather than punctuation in a
    // sentence, so the house rule about dashes in copy does not reach it, and
    // a hyphen at this size reads as a speck of dust.
    <span className="text-black/22" aria-label="Not included">
      &ndash;
    </span>
  );
}

/** A titled block on a two-column grid — the deck's most common shape. */
function Blocks({
  items,
  show,
  from = 1,
  columns = 2,
}: {
  items: { title: string; body: string }[];
  show: boolean;
  from?: number;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={`mt-9 grid gap-x-12 gap-y-7 ${
        columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
      }`}
    >
      {items.map((w, n) => (
        <Rise key={w.title} show={show} i={from + Math.floor(n / columns)}>
          <div className="border-t border-black/10 pt-4">
            <h3 className="text-[15px] font-semibold leading-snug">{w.title}</h3>
            <p className="mt-2 text-[12.5px] font-light leading-relaxed text-black/60">{w.body}</p>
          </div>
        </Rise>
      ))}
    </div>
  );
}

/* ───────────────────────── opening ───────────────────────── */

/**
 * What the deck covers.
 *
 * A contents page is a promise that this ends, which at thirty slides is the
 * single most useful thing on it. Each line carries a sentence rather than a
 * bare noun, because "Compliance" tells a landlord nothing they want and
 * "what the law asks of you, and how we keep you the right side of it" tells
 * them why they should keep reading.
 *
 * ── The second slide in the cream style ────────────────────────────────────
 *
 * Same ground, same hand and the same one coral word as the entrance. What it
 * does NOT borrow is the illustration: a contents page has a picture already,
 * which is the shape of the list, and a drawing beside it would be decoration
 * competing with the only thing on the slide worth reading.
 *
 * The list runs in ONE column of seven rather than two of four. Two columns
 * make a reader choose a reading order — across or down — and a contents page
 * is the one page where the order IS the content.
 */
export function Agenda({ deck, show }: { deck: Deck; show: boolean }) {
  return (
    <CreamSlide id="agenda">
      <div className="mx-auto grid w-full max-w-[1340px] items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
        <div className="max-w-[520px]">
          <HandHead eyebrow="What we&rsquo;ll cover" show={show} lines={2}>
            Here&rsquo;s what
            <br />
            we&rsquo;ll go through{" "}
            <Emphasis show={show}>today</Emphasis>
          </HandHead>

          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[420px] text-[15.5px] font-light leading-[1.6] text-black/60">
              Four parts, and you can stop us at any of them. Nothing here needs deciding
              today - the last one is the only one with a question in it.
            </p>
          </Rise>

          {deck.property.address && (
            <Rise show={show} i={3}>
              <p className="mt-4 text-[12.5px] font-light text-black/45">
                For <span className="font-normal text-black/70">{deck.property.address}</span>
              </p>
            </Rise>
          )}
        </div>

        {/* The list. Hairlines rather than cards: seven boxes would read as
            seven things to get through, and the point is that it is one
            journey with seven stops. */}
        <ol className="lg:pt-2">
          {AGENDA.map((a, n) => (
            <Rise key={a.title} show={show} i={2 + Math.floor(n / 2)}>
              <li
                className="flex gap-4 py-3.5 sm:gap-5"
                style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}
              >
                <span
                  className="mt-[3px] shrink-0 text-[15px] leading-none tabular-nums"
                  style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                >
                  {String(n + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[16px] leading-snug sm:text-[17px]"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {a.title}
                  </span>
                  <span className="mt-1 block text-[13px] font-light leading-[1.5] text-black/50">
                    {a.body}
                  </span>
                </span>
              </li>
            </Rise>
          ))}
        </ol>
      </div>
    </CreamSlide>
  );
}

/**
 * Why us, before any of the evidence.
 *
 * The fourth slide in the cream style, and the first one that does NOT put the
 * text left with something down the right. Three slides running have used that
 * shape and a fourth would start to read as a template. This one drops the
 * headline across the top and sets the four arguments as a 2x2 beneath it,
 * which is also the honest shape for the content: four things of equal weight,
 * no one of them the point.
 *
 * The pale numerals are the only ornament. They are set in the marker hand at
 * a size where they read as drawn page numbers rather than as a list somebody
 * has to work through in order - which matters, because the four arguments do
 * not build on each other and a landlord who reads only the third has lost
 * nothing.
 */
export function Approach({ show }: { show: boolean }) {
  return (
    <CreamSlide id="approach">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow={APPROACH.eyebrow} show={show} lines={2}>
            Why landlords
            <br />
            choose <Emphasis show={show}>us</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.6] text-black/55">
              {APPROACH.standfirst}
            </p>
          </Rise>
        </div>

        <div className="mt-10 grid gap-x-14 gap-y-8 sm:grid-cols-2 lg:mt-12">
          {APPROACH.points.map((p, n) => (
            <Rise key={p.title} show={show} i={3 + Math.floor(n / 2)}>
              <div className="flex gap-5">
                {/* Coral at a third rather than the badge tint: #fbe7e2 on
                    #faf7f3 is two points of contrast, which is not "quiet", it
                    is invisible. Faint enough to stay ornament, present enough
                    to be worth drawing. */}
                <span
                  className="shrink-0 text-[26px] leading-none"
                  style={{ fontFamily: HAND, fontWeight: 700, color: CORAL, opacity: 0.32 }}
                >
                  {String(n + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3
                    className="text-[16px] leading-snug sm:text-[17px]"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {p.title}
                  </h3>
                  <p className="mt-2 text-[13.5px] font-light leading-[1.65] text-black/60">
                    {p.body}
                  </p>
                </div>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </CreamSlide>
  );
}

/* ───────────────────────── your property ───────────────────────── */

/**
 * YOUR PROPERTY — the section divider, and the one slide allowed to be fun.
 *
 * James, 4 Sep: "in a perfect world we need to create something that will
 * capture people's attention and make it so it's not another boring slide".
 * A divider is the right place to spend that: it carries no argument, so
 * nothing is lost by making it a moment, and it is the exact point where a
 * landlord's own property enters a deck that has so far been about us.
 *
 * ── The idea is one word ───────────────────────────────────────────────────
 *
 * A hand-drawn street with one house picked out in red — already in the repo,
 * already in the OS's line — and their own address written beside it in the
 * marker hand with an arrow. Not "your property" as a heading. THAT one. The
 * whole slide is a person pointing at a house and saying "this is the one we
 * are talking about", which is what the section is.
 *
 * It is centred, and it is the only centred slide in the deck. Everything else
 * is a left-aligned page of argument; this is a breath between two of them,
 * and the change of axis is what makes it read as a pause rather than as more
 * of the same.
 *
 * ── The photograph, when there is one ──────────────────────────────────────
 *
 * Roughly half the records have no image, so the drawing is the ground and the
 * photograph is a guest: pinned over the right of the street, tilted, in a
 * white print border. A snapshot laid on a drawing. Absent, the drawing is a
 * finished composition on its own — which is the test every empty state in
 * this deck has to pass.
 */
export function PropertyDivider({ deck, show }: { deck: Deck; show: boolean }) {
  const p = deck.property;
  /* Only the facts we actually hold. A row of dashes under a photograph of
     somebody's home is worse than a shorter row. */
  const facts = [
    p.propertyType,
    p.beds != null ? `${p.beds} bedroom${p.beds === 1 ? "" : "s"}` : null,
    p.baths != null ? `${p.baths} bathroom${p.baths === 1 ? "" : "s"}` : null,
    p.sqft != null ? `${p.sqft.toLocaleString("en-GB")} sq ft` : null,
    p.epc ? `EPC ${p.epc}` : null,
  ].filter(Boolean) as string[];

  /* The street name on its own for the annotation. The full address is on the
     line above it already, and a handwritten note is a note — repeating the
     town and the postcode in it turns a scribble into a label. */
  const short = (p.address || "").split(",")[0].trim();
  const isPhoto = useIsPhoto();

  return (
    <CreamSlide id="property">
      <div className="mx-auto w-full max-w-[1080px] text-center">
        <Rise show={show} i={0}>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
            Your property
          </span>
        </Rise>
        <Rise show={show} i={1}>
          <h2
            className="mt-4 leading-[1.04] tracking-[-0.015em]"
            style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(30px, 3.4vw, 50px)" }}
          >
            Right then. Let&rsquo;s talk about <Emphasis show={show}>yours</Emphasis>
          </h2>
        </Rise>

        {(p.address || facts.length > 0) && (
          <Rise show={show} i={2}>
            <p className="mt-5 text-[13.5px] font-light text-black/50">
              {[p.address, p.postcode].filter(Boolean).join(", ")}
              {facts.length > 0 && (
                <span className="block pt-1 text-[12.5px] text-black/40">
                  {facts.join("  ·  ")}
                </span>
              )}
            </p>
          </Rise>
        )}

        {/* ── the street ── */}
        <Rise show={show} i={3}>
          <div className="relative mx-auto mt-6 w-full max-w-[720px]">
            <Art slot="property" drawing="/illustrations/houses-still.png" ratio="16 / 7" />

            {/* The note, and the point of the slide. Positioned against the
                DRAWING rather than the slide, so it keeps pointing at the red
                house however the picture scales.

                GONE in the photographic style, and it has to be: the joke is
                an arrow pointing at the one house picked out in red, and there
                is no red house in a photograph. An arrow aimed at a random
                window is not a quieter version of the joke, it is a mistake.
                The address is already on the line above. */}
            {short && !isPhoto && (
              <div
                className="pointer-events-none absolute left-[6%] top-[-6%] w-[46%] text-left"
                style={{
                  opacity: show ? 1 : 0,
                  transform: show ? "none" : "translateY(8px)",
                  transition:
                    "opacity 600ms ease-out 700ms, transform 600ms cubic-bezier(0.22,1,0.36,1) 700ms",
                }}
              >
                <p
                  className="text-[15px] leading-[1.35] text-black/70 sm:text-[17px]"
                  style={{ fontFamily: HAND, transform: "rotate(-3deg)" }}
                >
                  {short}
                </p>
                {/* Long enough to actually reach the red house. Measured, not
                    guessed: the first version's tip landed on the tree two
                    doors down, which makes the whole joke fall over. */}
                <svg viewBox="0 0 190 80" aria-hidden className="mt-1 h-[58px] w-[172px]">
                  <path
                    d="M7 6C22 36 62 62 152 70"
                    fill="none"
                    stroke={CORAL}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                  <path
                    d="M138 73L153 70.5L145 57"
                    fill="none"
                    stroke={CORAL}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}

            {/* Their own photograph, pinned over the street. */}
            {p.image && (
              <div
                className="absolute right-[-2%] top-[6%] w-[34%] rounded-[6px] bg-white p-[6px] pb-[18px] shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
                style={{
                  transform: "rotate(2.5deg)",
                  opacity: show ? 1 : 0,
                  transition: "opacity 600ms ease-out 820ms",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt={p.address}
                  className="w-full rounded-[3px] object-cover"
                  style={{ aspectRatio: "4 / 3" }}
                />
              </div>
            )}
          </div>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * What we have on record.
 *
 * The slide exists to be CORRECTED, which is why the empty values are shown as
 * empty rather than quietly dropped. Material information is the landlord's to
 * confirm and ours to publish, and a portal listing built on a guessed tenure
 * or a wrong council tax band is a problem that surfaces at the worst possible
 * moment - after somebody has offered.
 *
 * ── In the cream style, the blanks became the design ───────────────────────
 *
 * The red version listed a value or a dash. Here a missing one says "we need
 * this" in coral, in the marker hand, so the gaps read as a short list of
 * questions rather than as holes in our homework. Same information, opposite
 * feeling: a landlord who sees four dashes thinks we have not done the work,
 * and a landlord who sees four questions answers them.
 */
export function Material({ deck, show }: { deck: Deck; show: boolean }) {
  const rows = deck.material ?? [];
  if (!rows.length) return null;
  const blank = (v: string) => !v || v === "\u2014" || v === "-";
  const missing = rows.filter((r) => blank(r.value)).length;

  return (
    <CreamSlide id="material">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[640px]">
          <HandHead eyebrow="What we have on record" show={show} lines={2}>
            Have a look. Tell us
            <br />
            what we have <Emphasis show={show}>wrong</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[520px] text-[15px] font-light leading-[1.6] text-black/55">
              This is what goes on the listing, so it is quicker to correct now than after a
              tenant has read it.
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          <dl className="mt-9 grid gap-x-16 sm:grid-cols-2 lg:mt-10">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-baseline justify-between gap-6 border-b py-3"
                style={{ borderColor: "rgba(0,0,0,0.07)" }}
              >
                <dt className="text-[13px] font-light text-black/45">{r.label}</dt>
                {blank(r.value) ? (
                  <dd
                    className="text-right text-[14px]"
                    style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                  >
                    we need this
                  </dd>
                ) : (
                  <dd className="text-right text-[14.5px] font-medium">{r.value}</dd>
                )}
              </div>
            ))}
          </dl>
        </Rise>

        {missing > 0 && (
          <Rise show={show} i={4}>
            <p
              className="mt-6 text-[14px] text-black/55"
              style={{ fontFamily: HAND }}
            >
              {missing === 1 ? "One thing" : `${missing} things`} we still need from you. Tell
              your agent and we will fill {missing === 1 ? "it" : "them"} in.
            </p>
          </Rise>
        )}
      </div>
    </CreamSlide>
  );
}

/* ───────────────────────── the market ───────────────────────── */

/**
 * What is advertised near them right now.
 *
 * Distinct from comparables, which is what has LET. This is the competition -
 * the properties a tenant is choosing between when they find yours - and it is
 * what turns an asking rent from an opinion into an argument.
 *
 * Ours are marked, and there are deliberately others on the list. A slide
 * carrying only our own stock is a brochure, and a landlord can tell.
 *
 * ── The rows open ──────────────────────────────────────────────────────────
 *
 * James, 4 Sep. A row that is only an address and a number is not evidence a
 * landlord can weigh: they cannot tell whether the flat at £1,150 is better or
 * worse than theirs. The photographs, the agent, the status and how long it
 * has sat are what make it weighable, and they sit behind a click rather than
 * on the slide because twelve properties cannot each have a slide.
 *
 * Only rows with photographs open. A row without them stays a row - a gallery
 * that opens empty looks broken, where a list that does not respond just looks
 * like a list.
 */
export function Listings({ deck, show }: { deck: Deck; show: boolean }) {
  const rows = deck.listings ?? [];
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (!rows.length) return null;
  const ours = rows.filter((r) => r.ours).length;
  const shown = rows.slice(0, 6);
  const galleryOf = (r: (typeof rows)[number]) =>
    (r.photos?.length ? r.photos : r.image ? [r.image] : []).filter(Boolean);
  const active = openAt != null ? shown[openAt] : null;

  return (
    <CreamSlide id="listings">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[660px]">
          <HandHead eyebrow="What&rsquo;s on the market" show={show} lines={2}>
            What&rsquo;s on the market
            <br />
            near you <Emphasis show={show}>today</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.6] text-black/55">
              A tenant looking at your street is looking at these at the same time. Tap any of
              them for the photographs, the asking rent and who it is with.
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          <ul className="mt-7 lg:mt-8">
            {shown.map((r, n) => {
              const gallery = galleryOf(r);
              const openable = gallery.length > 0;
              return (
                <li
                  key={`${r.address}-${r.rent}`}
                  style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.07)" }}
                >
                  <button
                    type="button"
                    disabled={!openable}
                    onClick={() => setOpenAt(n)}
                    className="flex w-full items-center gap-4 py-2.5 text-left transition-opacity disabled:cursor-default"
                  >
                    {/* The thumbnail is the invitation. Without it the row is a
                        line of text that happens to be clickable, which nobody
                        discovers. */}
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image}
                        alt=""
                        aria-hidden
                        className="h-[46px] w-[62px] shrink-0 rounded-[7px] object-cover"
                      />
                    ) : (
                      <span
                        className="h-[46px] w-[62px] shrink-0 rounded-[7px]"
                        style={{ background: TINTS[0] }}
                      />
                    )}

                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[15px] leading-snug sm:text-[16px]"
                        style={{ fontFamily: HAND, fontWeight: 700 }}
                      >
                        {r.address}
                        {r.ours && (
                          <span
                            className="ml-2.5 rounded-full px-2.5 py-[3px] align-middle text-[10px] font-semibold uppercase tracking-[0.12em]"
                            style={{ background: TINTS[0], color: CORAL, fontFamily: "inherit" }}
                          >
                            Ours
                          </span>
                        )}
                        {r.status === "let agreed" && (
                          <span className="ml-2 align-middle text-[11px] font-normal text-black/40">
                            let agreed
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] font-light text-black/45">
                        {[
                          r.locality,
                          r.beds != null ? `${r.beds} bed` : null,
                          r.type,
                          r.agent,
                        ]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[17px]" style={{ fontFamily: HAND, fontWeight: 700 }}>
                        {r.rent}
                      </span>
                      {openable && (
                        <span className="text-black/25" aria-hidden>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Rise>

        {ours > 0 && (
          <Rise show={show} i={4}>
            <p className="mt-5 text-[14px] text-black/55" style={{ fontFamily: HAND }}>
              {ours === 1 ? "One of these is ours." : `${ours} of these are ours.`} The rest are
              what a tenant sees beside yours.
            </p>
          </Rise>
        )}
      </div>

      <PropertyDetail
        open={active != null}
        onClose={() => setOpenAt(null)}
        title={active?.address ?? ""}
        locality={active?.locality ?? ""}
        rent={active?.rent ?? ""}
        photos={active ? galleryOf(active) : []}
        advert={active?.advert ?? null}
        facts={
          active
            ? ([
                active.beds != null ? { label: "Bedrooms", value: String(active.beds) } : null,
                active.type ? { label: "Type", value: active.type } : null,
                active.status
                  ? { label: "Status", value: active.status === "let agreed" ? "Let agreed" : "On the market" }
                  : null,
                active.days != null
                  ? { label: "Advertised", value: `${active.days} days` }
                  : null,
                active.agent ? { label: "With", value: active.agent } : null,
              ].filter(Boolean) as { label: string; value: string }[])
            : []
        }
      />
    </CreamSlide>
  );
}

/**
 * How the area has moved, month by month.
 *
 * Counts, not a y-axis. A landlord reading a chart with a scale on it has to
 * do arithmetic to reach the point, and the point is a SHAPE: whether more is
 * coming to the market than is letting. So the bars carry their own numbers
 * and the axis is gone.
 *
 * The headline states the answer rather than leaving it to be inferred. A
 * chart that makes somebody work out the conclusion is a chart half the room
 * gets wrong, and this one decides how confidently we price.
 */
export function History({ deck, show }: { deck: Deck; show: boolean }) {
  const h = deck.history;
  if (!h?.points?.length) return null;
  const points = h.points.slice(-8);
  const peak = Math.max(1, ...points.map((p) => Math.max(p.listed, p.let)));
  const listed = points.reduce((n, p) => n + p.listed, 0);
  const letted = points.reduce((n, p) => n + p.let, 0);
  const monthLabel = (m: string) => {
    const d = new Date(`${m}-01T00:00:00Z`);
    return Number.isNaN(d.getTime())
      ? m
      : d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  };

  return (
    <CreamSlide id="history">
      <div className="mx-auto w-full max-w-[1080px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow={`How ${h.area} has moved`} show={show} lines={2}>
            {/* Two lines, and the second one has to be SHORT. The first draft
                read "to the market than is letting", which wrapped to a third
                line and pushed the chart down the page. The full sentence is
                in the standfirst underneath; this is the conclusion. */}
            {letted >= listed ? (
              <>
                More is <Emphasis show={show}>letting</Emphasis>
                <br />
                than arriving
              </>
            ) : (
              <>
                More is <Emphasis show={show}>arriving</Emphasis>
                <br />
                than letting
              </>
            )}
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.6] text-black/55">
              {listed} advertised and {letted} let across the last {points.length} months. What
              matters to you is the gap between the two: it decides whether you are pricing into
              a queue or into a choice.
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          <div className="mt-9 flex items-end justify-between gap-2 border-b border-black/10 pb-3 sm:gap-6">
            {points.map((p) => (
              <div key={p.month} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-[128px] w-full items-end justify-center gap-[3px] sm:gap-1.5">
                  <span
                    className="w-1/2 max-w-[22px] rounded-t-[3px]"
                    style={{ height: `${(p.listed / peak) * 100}%`, background: "rgba(0,0,0,0.13)" }}
                    title={`${p.listed} advertised`}
                  />
                  <span
                    className="w-1/2 max-w-[22px] rounded-t-[3px]"
                    style={{ height: `${(p.let / peak) * 100}%`, background: CORAL }}
                    title={`${p.let} let`}
                  />
                </div>
                <span
                  className="text-[12px] text-black/50"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {monthLabel(p.month)}
                </span>
              </div>
            ))}
          </div>
        </Rise>

        <Rise show={show} i={4}>
          <div className="mt-4 flex gap-7 text-[12.5px] font-light text-black/50">
            <span className="flex items-center gap-2">
              <span className="h-[9px] w-[9px] rounded-[2px]" style={{ background: "rgba(0,0,0,0.13)" }} />
              Came to the market
            </span>
            <span className="flex items-center gap-2">
              <span className="h-[9px] w-[9px] rounded-[2px]" style={{ background: CORAL }} />
              Let
            </span>
          </div>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/* ───────────────────────── marketing ───────────────────────── */

/**
 * MARKETING - the second section divider, and the last red slide to go.
 *
 * Built on the same idea as Your Property: a divider carries no argument, so
 * it can afford to be a moment. Where that one pointed at a house and said
 * "that one", this one is about reach, so the drawing is a street of them and
 * the type sits over it rather than beside it.
 *
 * Centred like its sibling. Two dividers, one shape, so a landlord recognises
 * the second as the same kind of pause as the first rather than reading it as
 * a new sort of page.
 */
export function MarketingDivider({ show }: { show: boolean }) {
  return (
    <CreamSlide id="marketing">
      <div className="mx-auto w-full max-w-[1080px] text-center">
        <Rise show={show} i={0}>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
            Marketing
          </span>
        </Rise>
        <Rise show={show} i={1}>
          <h2
            className="mt-4 leading-[1.04] tracking-[-0.015em]"
            style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(30px, 3.4vw, 50px)" }}
          >
            Now, how we find <Emphasis show={show}>the one</Emphasis>
          </h2>
        </Rise>
        <Rise show={show} i={2}>
          <p className="mx-auto mt-5 max-w-[520px] text-[15px] font-light leading-[1.6] text-black/55">
            The best rent and the shortest void come from the same thing: reaching people who
            would move for your property, not just the ones already searching for one.
          </p>
        </Rise>

        <Rise show={show} i={3}>
          <div className="relative mx-auto mt-7 w-full max-w-[720px]">
            <Art
              slot="marketing"
              drawing="/illustrations/buildings-street.png"
              ratio="16 / 7"
            />
          </div>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * Everything that happens before a tenant arrives.
 *
 * Eight items, and deliberately a LIST rather than eight little arguments with
 * headings. This is the inventory slide - what you get for the fee - and an
 * inventory that explains itself item by item stops being scannable, which is
 * the only thing an inventory is for.
 *
 * The slide that does the arguing is the next one.
 */
export function Offer({ show }: { show: boolean }) {
  return (
    <CreamSlide id="offer">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow="What we do" show={show} lines={2}>
            Everything that happens
            <br />
            before a tenant <Emphasis show={show}>arrives</Emphasis>
          </HandHead>
        </div>

        <ul className="mt-9 grid gap-x-14 gap-y-3 sm:grid-cols-2 lg:mt-10">
          {WHAT_WE_OFFER.map((w, n) => (
            <Rise key={w} show={show} i={2 + Math.floor(n / 4)}>
              <li
                className="flex items-start gap-3"
                style={{
                  borderTop: n < 2 ? "none" : "1px solid rgba(0,0,0,0.07)",
                  paddingTop: n < 2 ? 0 : 12,
                }}
              >
                <span className="mt-[3px] shrink-0" style={{ color: CORAL }}>
                  <Line name="check" size={16} />
                </span>
                <span className="text-[14px] font-light leading-[1.5]">{w}</span>
              </li>
            </Rise>
          ))}
        </ul>
      </div>
    </CreamSlide>
  );
}

/**
 * How the marketing becomes a number.
 *
 * The half of Marketing every agency leaves out. A landlord shown photography,
 * portals and social has been told we will find A tenant; none of it explains
 * why they should get MORE rent than the flat down the road, which is the only
 * question they are really asking.
 *
 * Five points in the order a landlord lives through them - price, present,
 * launch, view, review - so it reads as a sequence rather than a menu.
 * Numbered for that reason, and the numerals sit at a third opacity: they mark
 * the order without becoming the loudest thing on the slide.
 */
export function MaxPrice({ show }: { show: boolean }) {
  return (
    <CreamSlide id="maxprice">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow={MAX_PRICE.eyebrow} show={show} lines={2}>
            Marketing finds a tenant.
            <br />
            This is what sets the <Emphasis show={show}>rent</Emphasis>
          </HandHead>
        </div>

        <ol className="mt-9 grid gap-x-14 gap-y-6 sm:grid-cols-2 lg:mt-10">
          {MAX_PRICE.points.map((p, n) => (
            <Rise key={p.title} show={show} i={2 + Math.floor(n / 2)}>
              <li className="flex gap-5">
                <span
                  className="shrink-0 text-[24px] leading-none"
                  style={{ fontFamily: HAND, fontWeight: 700, color: CORAL, opacity: 0.32 }}
                >
                  {String(n + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[15.5px] leading-snug sm:text-[16px]"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {p.title}
                  </span>
                  <span className="mt-1.5 block text-[13px] font-light leading-[1.6] text-black/60">
                    {p.body}
                  </span>
                </span>
              </li>
            </Rise>
          ))}
        </ol>
      </div>
    </CreamSlide>
  );
}

/**
 * The film.
 *
 * `propertyVideoUrl` is the agent's own walk-through of THIS property when one
 * exists, and it usually will not - the film is made after the instruction,
 * and this deck is what wins the instruction.
 *
 * So the slide is NOT gated on having one, and it used to be. That was wrong:
 * the argument for filming a property is worth making to somebody who has not
 * signed yet, which is exactly who is reading. With no film the frame says
 * what will go in it and when; with one, it plays.
 */
export function Video({ deck, show }: { deck: Deck; show: boolean }) {
  const url = deck.propertyVideoUrl;
  return (
    <CreamSlide id="video">
      <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div className="max-w-[520px]">
          <HandHead eyebrow="Your property on film" show={show} lines={2}>
            The bit a photograph
            <br />
            cannot <Emphasis show={show}>do</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 text-[14.5px] font-light leading-[1.7] text-black/60">
              {VIDEO_COPY.body}
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          {url ? (
            <div
              className="aspect-video w-full overflow-hidden rounded-[20px]"
              style={{ background: TINTS[0] }}
            >
              <iframe
                src={url}
                title="Your property"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            /* Not a broken player and not a spinner. A frame that says what
               goes in it, which is a promise rather than a gap. */
            <div
              className="flex aspect-video w-full flex-col items-center justify-center gap-3.5 rounded-[20px] px-10 text-center"
              style={{ background: TINTS[0] }}
            >
              <span style={{ color: CORAL }}>
                <Line name="home" size={30} />
              </span>
              <p className="text-[15px] leading-snug" style={{ fontFamily: HAND, fontWeight: 700 }}>
                Your film goes here
              </p>
              <p className="max-w-[300px] text-[12.5px] font-light leading-relaxed text-black/50">
                Filmed once the property is ready to photograph, and out across the portals and
                social on the same day.
              </p>
            </div>
          )}
        </Rise>
      </div>
    </CreamSlide>
  );
}


/**
 * The brochure.
 *
 * The lifestyle interview is the argument, and it is a genuinely unusual one -
 * most agencies photograph a property and write the rooms. Saying out loud
 * that we interview the OWNER about living there is the thing a landlord
 * repeats to whoever else decides.
 *
 * It had a drawing beside it and lost it (James, 4 Sep: "these mostly need to
 * be text-based"). A desk with a laptop on it said nothing this paragraph does
 * not, and an illustration that only fills space spends the licence the four
 * that earn it are relying on.
 */
export function Brochure({ show }: { show: boolean }) {
  return (
    <CreamSlide id="brochure">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow="The brochure" show={show} lines={2}>
            We sell the life,
            <br />
            not the <Emphasis show={show}>floorplan</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[640px] text-[15px] font-light leading-[1.8] text-black/65">
              {BROCHURE_COPY.body}
            </p>
          </Rise>
        </div>
      </div>
    </CreamSlide>
  );
}

/**
 * Where it appears.
 *
 * Only Rightmove and Zoopla have artwork in the repo, so the other two are set
 * in the brand's own type rather than shown as broken tiles. A named portal in
 * type reads as deliberate; a missing logo never does.
 */
export function Portals({ show }: { show: boolean }) {
  const LOGOS: Record<string, string> = {
    Rightmove: "/brand/rightmove.png",
    Zoopla: "/brand/zoopla.png",
  };
  return (
    <CreamSlide id="portals">
      <div className="mx-auto w-full max-w-[1080px]">
        <div className="max-w-[700px]">
          <HandHead eyebrow="Where it appears" show={show} lines={2}>
            Everywhere a tenant
            <br />
            is <Emphasis show={show}>looking</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[600px] text-[14.5px] font-light leading-[1.7] text-black/60">
              {PORTALS_COPY.body}
            </p>
          </Rise>
        </div>
        <Rise show={show} i={3}>
          <div className="mt-9 flex flex-wrap items-center gap-x-12 gap-y-6 border-t border-black/10 pt-7">
            {PORTALS_COPY.portals.map((p) =>
              LOGOS[p] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p} src={LOGOS[p]} alt={p} className="h-6 w-auto opacity-70 sm:h-7" />
              ) : (
                <span
                  key={p}
                  className="text-[16px] text-black/40"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {p}
                </span>
              )
            )}
          </div>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * Reaching the tenants who are not looking yet.
 *
 * The claim that used to carry this slide - "only 2-3% are actively looking" -
 * had no source and is gone. The argument stands without it: portal search
 * catches people already hunting, paid social reaches people who would move
 * for the right property and have not started.
 */
export function Social({ show }: { show: boolean }) {
  return (
    <CreamSlide id="social">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow="Social advertising" show={show} lines={2}>
            The tenants who are
            <br />
            not looking <Emphasis show={show}>yet</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[640px] text-[15px] font-light leading-[1.8] text-black/65">
              {SOCIAL_COPY.body}
            </p>
          </Rise>
        </div>
      </div>
    </CreamSlide>
  );
}


/* ───────────────────────── compliance ───────────────────────── */

/**
 * The part that catches landlords out.
 *
 * Four blocks, and the ORDER is the argument: what we do, what the law wants,
 * how we check a tenant, what we put in writing. Each is a thing that goes
 * wrong quietly and expensively when nobody owns it, which is the whole case
 * for handing the property over rather than letting it yourself.
 */
export function Compliance({ show }: { show: boolean }) {
  return (
    <CreamSlide id="compliance">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow="Compliance and guidance" show={show} lines={2}>
            The part that catches
            <br />
            landlords <Emphasis show={show}>out</Emphasis>
          </HandHead>
        </div>

        <div className="mt-9 grid gap-x-14 gap-y-7 sm:grid-cols-2 lg:mt-10">
          {COMPLIANCE.map((c, n) => (
            <Rise key={c.title} show={show} i={2 + Math.floor(n / 2)}>
              <div className="border-t border-black/10 pt-4">
                <h3
                  className="text-[15.5px] leading-snug sm:text-[16px]"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {c.title}
                </h3>
                <p className="mt-2 text-[13px] font-light leading-[1.6] text-black/60">{c.body}</p>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </CreamSlide>
  );
}

/**
 * The obligations, each paired with what we actually do about it.
 *
 * The PAIRING is the point. A list of legal duties on its own is a list of
 * reasons to worry; the same list with our half attached is the argument for
 * handing it over. Neither half works alone, which is why this is the deck's
 * densest slide and stays that way.
 *
 * The England caveat is ON the slide, not in a footnote. An agent showing this
 * in Cardiff or Glasgow needs the landlord to have seen it at the time, and a
 * note nobody reads is a note nobody was told.
 */
export function Legal({ show }: { show: boolean }) {
  return (
    <CreamSlide id="legal">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[700px]">
          <HandHead eyebrow="What the law asks of you" show={show} lines={2}>
            Eight things, and who
            <br />
            keeps <Emphasis show={show}>track</Emphasis> of each
          </HandHead>
        </div>

        <div className="mt-7 grid gap-x-14 gap-y-3 sm:grid-cols-2 lg:mt-8">
          {LEGAL_ITEMS.map((l, n) => (
            <Rise key={l.title} show={show} i={2 + Math.floor(n / 4)}>
              <div
                className="flex gap-3"
                style={{
                  borderTop: n < 2 ? "none" : "1px solid rgba(0,0,0,0.07)",
                  paddingTop: n < 2 ? 0 : 11,
                }}
              >
                <span className="mt-[3px] shrink-0" style={{ color: CORAL }}>
                  <Line name="shield" size={16} />
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[13.5px] leading-snug"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {l.title}
                  </span>
                  <span className="mt-1 block text-[12px] font-light leading-[1.5] text-black/55">
                    {l.body}
                  </span>
                </span>
              </div>
            </Rise>
          ))}
        </div>

        <Rise show={show} i={4}>
          <p className="mt-6 max-w-[820px] border-t border-black/10 pt-4 text-[11.5px] font-light leading-relaxed text-black/45">
            {LEGAL_CAVEAT}
          </p>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * How we find and screen every tenant.
 *
 * The strongest argument in the deck, and it used to be slide 21 where nobody
 * reached it. Four paragraphs rather than bullets on purpose: this is the one
 * place a landlord wants to know HOW, in sentences, and a list of six words
 * would read as a claim rather than as a process.
 */
export function Screening({ show }: { show: boolean }) {
  return (
    <CreamSlide id="screening">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="max-w-[700px]">
          <HandHead eyebrow={SCREENING.eyebrow} show={show} lines={2}>
            Checked before they are
            <br />
            through your <Emphasis show={show}>door</Emphasis>
          </HandHead>
        </div>

        <div className="mt-9 grid gap-x-16 gap-y-5 sm:grid-cols-2 lg:mt-10">
          {SCREENING.paragraphs.map((p, n) => (
            <Rise key={p.slice(0, 24)} show={show} i={2 + Math.floor(n / 2)}>
              <p className="text-[13.5px] font-light leading-[1.7] text-black/65">{p}</p>
            </Rise>
          ))}
        </div>
      </div>
    </CreamSlide>
  );
}

/* ───────────────────────── service and management ───────────────────────── */

/**
 * How much of the tenancy you want to run yourself.
 *
 * Sets up the comparison on the next slide, so it argues in prose rather than
 * repeating it as a table. Four blocks, and none of them is a feature list -
 * each names a thing that has to happen whether or not anybody is paid to do
 * it, which is the question the three levels then answer.
 */
export function Management({ show }: { show: boolean }) {
  return (
    <CreamSlide id="management">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow="Management and support" show={show} lines={2}>
            How much of it you
            <br />
            want to run <Emphasis show={show}>yourself</Emphasis>
          </HandHead>
        </div>

        <div className="mt-9 grid gap-x-14 gap-y-7 sm:grid-cols-2 lg:mt-10">
          {MANAGEMENT.map((c, n) => (
            <Rise key={c.title} show={show} i={2 + Math.floor(n / 2)}>
              <div className="border-t border-black/10 pt-4">
                <h3
                  className="text-[15.5px] leading-snug sm:text-[16px]"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {c.title}
                </h3>
                <p className="mt-2 text-[13px] font-light leading-[1.6] text-black/60">{c.body}</p>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </CreamSlide>
  );
}

/**
 * THE THREE LEVELS — the shared half stated once, then only the differences.
 *
 * ── Why this is not a fourteen-row table any more ──────────────────────────
 *
 * It was, and it was 379px taller than a 720px laptop: the single tallest
 * slide in the deck, on a phone three stacked cards of fourteen items each.
 * James chose this shape on 4 Sep over letting it scroll or splitting it in
 * two, and it is the right one for a reason beyond height.
 *
 * Seven of the fourteen rows are ticked on all three levels. Printed as a
 * table those seven are twenty-one identical ticks that say nothing, and they
 * push the seven rows that DO differ to the bottom of the slide - so the part
 * a landlord is actually choosing between is the part they read last and
 * least. Stating the shared half once as a floor, then showing only what
 * separates the levels, is shorter AND it is the argument: everything here is
 * standard, and this is what more buys you.
 *
 * ── The split is derived, never hand-maintained ───────────────────────────
 *
 * `every` and `differs` are computed from SERVICE_ROWS. A row added to
 * lib/present-copy lands in whichever half it belongs to without anybody
 * remembering to file it, which is the failure this would otherwise invite:
 * two lists that drift are worse than one long table.
 */
export function Levels({ show }: { show: boolean }) {
  const cols = SERVICE_LEVELS.length;
  /* Positional pairing between SERVICE_LEVELS and each row's `included` is the
     one fragile thing in lib/present-copy. Checked rather than trusted: a
     mismatch shifts every tick silently, which on a page about what somebody
     is buying is the worst kind of wrong. */
  const rows = SERVICE_ROWS.filter((r) => r.included.length === cols);
  const every = rows.filter((r) => r.included.every(Boolean));
  const differs = rows.filter((r) => !r.included.every(Boolean));

  return (
    <CreamSlide id="levels">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[700px]">
          <HandHead eyebrow="Service levels" show={show} lines={2}>
            Three levels. This is
            <br />
            what <Emphasis show={show}>separates</Emphasis> them
          </HandHead>
        </div>

        {/* SIDE BY SIDE on a laptop, stacked below it.
            Stacked everywhere, this slide was still 103px too tall - the
            shared block is 132px of height saying "none of this is a
            decision", sitting directly above the part that is. Beside the
            table it costs nothing, and the reading is better for it: standard
            on the left, what more buys you on the right. */}
        <div className="mt-6 grid gap-x-12 gap-y-6 lg:mt-7 lg:grid-cols-[0.78fr_1.22fr]">
          {every.length > 0 && (
            <Rise show={show} i={2}>
              <div className="rounded-2xl px-5 py-4" style={{ background: TINTS[0] }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  On all three levels
                </p>
                <ul className="mt-2.5 grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {every.map((r) => (
                    <li key={r.service} className="flex items-start gap-2.5">
                      <span className="mt-[3px] shrink-0" style={{ color: CORAL }}>
                        <Line name="check" size={14} />
                      </span>
                      <span className="text-[12.5px] font-light leading-snug">{r.service}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Rise>
          )}

          {/* The differences. A table from sm up; a card per level below it,
              because seven rows across three columns at 375px is a grid of
              ticks nobody can line up with its own label. */}
          <Rise show={show} i={3} className="hidden sm:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/12">
                  <th className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
                    What more buys you
                  </th>
                  {SERVICE_LEVELS.map((s, n) => (
                    <th
                      key={s}
                      className="w-[104px] px-2 py-2 text-center text-[11px] leading-tight"
                      style={{
                        fontFamily: HAND,
                        fontWeight: 700,
                        color: n === 0 ? CORAL : "rgba(0,0,0,0.45)",
                      }}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {differs.map((r) => (
                  <tr key={r.service} className="border-b border-black/8">
                    <td className="py-[7px] pr-4 text-[12.5px] font-light">{r.service}</td>
                    {r.included.map((on, n) => (
                      <td key={`${r.service}-${n}`} className="px-2 py-[7px] text-center">
                        <Tick on={on} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Rise>
        </div>

        <div className="mt-6 space-y-3 sm:hidden">
          {SERVICE_LEVELS.map((s, n) => {
            const adds = differs.filter((r) => r.included[n]);
            return (
              <Rise key={s} show={show} i={3 + n}>
                <div className="rounded-2xl border border-black/10 p-4">
                  <h3
                    className="text-[14.5px]"
                    style={{ fontFamily: HAND, fontWeight: 700, color: n === 0 ? CORAL : undefined }}
                  >
                    {s}
                  </h3>
                  {adds.length === 0 ? (
                    <p className="mt-1 text-[12px] font-light text-black/50">
                      The seven above, and nothing further.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {adds.map((r) => (
                        <li key={r.service} className="flex items-start gap-2">
                          <span className="mt-[3px] shrink-0" style={{ color: CORAL }}>
                            <Line name="check" size={13} />
                          </span>
                          <span className="text-[12px] font-light leading-snug">{r.service}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Rise>
            );
          })}
        </div>
      </div>
    </CreamSlide>
  );
}

/**
 * Rent collection, without the chasing.
 *
 * The one slide that names a supplier. PayProp is on it because "we reconcile
 * the day it lands" is a claim, and the name of the system that does it is the
 * evidence - a landlord who has heard of it stops needing to take our word,
 * and one who has not can look it up.
 */
export function Collection({ show }: { show: boolean }) {
  return (
    <CreamSlide id="collection">
      <div className="mx-auto w-full max-w-[1080px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow="Rent collection" show={show} lines={2}>
            Rent collection, without
            <br />
            the <Emphasis show={show}>chasing</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.6] text-black/55">
              {RENT_COLLECTION.body}
            </p>
          </Rise>
        </div>

        <ul className="mt-9 grid gap-x-14 gap-y-3 sm:grid-cols-2 lg:mt-10">
          {RENT_COLLECTION.points.map((p, n) => (
            <Rise key={p} show={show} i={3 + Math.floor(n / 2)}>
              <li
                className="flex items-start gap-3"
                style={{
                  borderTop: n < 2 ? "none" : "1px solid rgba(0,0,0,0.07)",
                  paddingTop: n < 2 ? 0 : 12,
                }}
              >
                <span className="mt-[3px] shrink-0" style={{ color: CORAL }}>
                  <Line name="check" size={16} />
                </span>
                <span className="text-[14px] font-light leading-[1.5]">{p}</span>
              </li>
            </Rise>
          ))}
        </ul>
      </div>
    </CreamSlide>
  );
}


/* ───────────────────────── protecting the income ───────────────────────── */

/**
 * Protecting you and your rental income.
 *
 * The one slide in this block that gets an illustration, and it gets it
 * because of what the block is ABOUT: everything either side of it is a list
 * of things that can go wrong, and this is the page that says the point of all
 * of it is that you stop thinking about the property. A drawing of somebody
 * not worrying makes that argument faster than the paragraph does.
 *
 * James, 4 Sep: the artwork is for "the odd occasion", not every slide. This
 * is the occasion - three of the four slides around it stay plain.
 */
export function Protection({ show }: { show: boolean }) {
  return (
    <CreamSlide id="protection">
      <div className="mx-auto grid w-full max-w-[1260px] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="max-w-[600px]">
          <HandHead eyebrow="Protecting your income" show={show} lines={2}>
            The point is that you
            <br />
            stop <Emphasis show={show}>thinking</Emphasis> about it
          </HandHead>
          <div className="mt-7 space-y-4">
            {PROTECTION.paragraphs.map((p, n) => (
              <Rise key={p.slice(0, 24)} show={show} i={2 + n}>
                <p className="text-[14px] font-light leading-[1.7] text-black/65">{p}</p>
              </Rise>
            ))}
          </div>
        </div>

        {/* Hidden below lg, like the entrance. Stacked it pushes three
            paragraphs off a phone, and the paragraphs are the argument. */}
        <Rise show={show} i={2} className="hidden lg:block">
          <Art
            slot="protection"
            drawing="/brand/art/landlord-sofa.png"
            className="ml-auto max-w-[500px]"
            photoClassName="!max-w-[400px]"
          />
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * Rent & Legal Protection.
 *
 * The one slide in the deck that makes a FINANCIAL promise, which is why the
 * disclaimer is on it rather than at the end. Nine points is too many to read
 * as prose, so they are short pairs on a grid and the standfirst does the
 * arguing - the grid only has to do the listing.
 */
export function RentLegal({ show }: { show: boolean }) {
  return (
    <CreamSlide id="rentlegal">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[760px]">
          <HandHead eyebrow={RENT_LEGAL.eyebrow} show={show} lines={2}>
            More than management.
            <br />
            Real <Emphasis show={show}>protection</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-5 max-w-[680px] text-[14.5px] font-light leading-[1.6] text-black/55">
              {RENT_LEGAL.standfirst}
            </p>
          </Rise>
        </div>

        <div className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {RENT_LEGAL.points.map((p, n) => (
            <Rise key={p.title} show={show} i={3 + Math.floor(n / 4)}>
              <div className="border-t border-black/10 pt-3">
                <h3
                  className="text-[13.5px] leading-snug"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {p.title}
                </h3>
                <p className="mt-1.5 text-[11.5px] font-light leading-[1.55] text-black/55">
                  {p.body}
                </p>
              </div>
            </Rise>
          ))}
        </div>

        <Rise show={show} i={5}>
          <p className="mt-6 max-w-[860px] border-t border-black/10 pt-3.5 text-[11.5px] font-light leading-relaxed text-black/45">
            {RENT_LEGAL.disclaimer}
          </p>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * The schemes we answer to.
 *
 * None of the artwork is in the repo, so every tile is the regulator's NAME in
 * the brand's own type with its caption under it. That is not a placeholder: a
 * regulator's name set properly says what its logo says, and eight broken
 * image boxes on the slide about being accountable would say the opposite.
 * Drop the files into /public/brand and set `logo` in lib/present-copy to
 * switch any one of them over.
 *
 * The heading is the honest framing of what these are. "Regulated and
 * protected" is a boast; "who we answer to when you have a complaint" is the
 * thing a landlord actually wants to know, and it is the same fact.
 */
export function Regulated({ show }: { show: boolean }) {
  return (
    <CreamSlide id="regulated">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow="Regulated and protected" show={show} lines={2}>
            Who we answer to when
            <br />
            you have a <Emphasis show={show}>complaint</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-5 max-w-[600px] text-[14.5px] font-light leading-[1.6] text-black/55">
              Every one of these is somebody you can go to about us, or a scheme that holds your
              money where we cannot reach it.
            </p>
          </Rise>
        </div>

        <div className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {REGULATED.map((r, n) => (
            <Rise key={r.name} show={show} i={3 + Math.floor(n / 4)}>
              <div className="border-t border-black/10 pt-3">
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} alt={r.name} className="h-7 w-auto" />
                ) : (
                  <span
                    className="block text-[13.5px] leading-snug"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {r.name}
                  </span>
                )}
                <span className="mt-1.5 block text-[11.5px] font-light leading-[1.55] text-black/50">
                  {r.caption}
                </span>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </CreamSlide>
  );
}

export function Network({ show }: { show: boolean }) {
  return (
    <CreamSlide id="network">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow="The Experts Group" show={show} lines={2}>
            Letting it is one part
            <br />
            of <Emphasis show={show}>owning</Emphasis> it
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[620px] text-[14.5px] font-light leading-[1.7] text-black/60">
              {NETWORK.body}
            </p>
          </Rise>
        </div>
        <Rise show={show} i={3}>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {NETWORK.brands.map((b) => (
              <li
                key={b}
                className="rounded-full px-4 py-2 text-[13px]"
                style={{ background: TINTS[0], color: INK, fontFamily: HAND, fontWeight: 700 }}
              >
                {b}
              </li>
            ))}
          </ul>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/* ───────────────────────── the close ───────────────────────── */

/**
 * One review, with a real name on it. Never a composite.
 *
 * The only slide where somebody other than us is talking, which is exactly why
 * it is set large and given the page to itself. It had a drawing beside it and
 * lost it: a picture next to a quotation competes with the one voice on the
 * slide that is not ours, and that voice is the entire reason the slide is
 * here.
 */
export function Testimonial({ deck, show }: { deck: Deck; show: boolean }) {
  const t = deck.testimonial;
  if (!t?.quote) return null;
  return (
    <CreamSlide id="testimonial">
      <div className="mx-auto w-full max-w-[900px]">
        <Rise show={show} i={0}>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
            What landlords say
          </span>
        </Rise>
        <Rise show={show} i={1}>
          <blockquote
            className="mt-6 leading-[1.28]"
            style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(24px, 3.2vw, 42px)" }}
          >
            &ldquo;{t.quote}&rdquo;
          </blockquote>
        </Rise>
        <Rise show={show} i={2}>
          <div className="mt-8 flex items-center gap-3 border-t border-black/10 pt-4">
            {t.rating != null && (
              <span
                className="flex gap-[3px]"
                style={{ color: CORAL }}
                aria-label={`${t.rating} out of 5`}
              >
                {Array.from({ length: Math.max(0, Math.min(5, Math.round(t.rating))) }).map(
                  (_, n) => (
                    <Line key={n} name="star" size={16} filled />
                  )
                )}
              </span>
            )}
            <span className="text-[14px]" style={{ fontFamily: HAND, fontWeight: 700 }}>
              {t.author}
            </span>
          </div>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * WHAT IT COSTS.
 *
 * James, 4 Sep: the fee gets a page of its own. The agreed source deck showed
 * a landlord a fourteen-row service comparison with no price anywhere on it,
 * which does not read as discretion - it reads as something held back, and it
 * leaves them doing sums instead of listening.
 *
 * The headline first and large, the levels under it, and then what is NOT
 * included. The exclusions are the reason to trust the headline: a fee page
 * that only lists what you get is the one a landlord re-reads later feeling
 * misled, and every slide before this one promising we are "straight about the
 * fee" has to be paid for here.
 *
 * It was the last slide in the deck to overflow a laptop - 127px - so the
 * exclusions sit BESIDE the levels rather than under them.
 */
export function Fees({ deck, show }: { deck: Deck; show: boolean }) {
  const f = deck.fees;
  if (!f || (!f.rows.length && !f.headline)) return null;

  return (
    <CreamSlide id="fees">
      <div className="mx-auto w-full max-w-[1160px]">
        <Rise show={show} i={0}>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
            What it costs
          </span>
        </Rise>
        {f.headline && (
          <Rise show={show} i={1}>
            <h2
              className="mt-4 leading-[1.02] tracking-[-0.015em]"
              style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(32px, 3.8vw, 54px)" }}
            >
              <span style={{ color: CORAL }}>{f.headline}</span>
            </h2>
          </Rise>
        )}
        {f.headlineFor && (
          <Rise show={show} i={2}>
            {/* The second clause is CONDITIONAL on there being exclusions.
                It used to promise "and what it does not" unconditionally, and
                with the invented exclusions removed that was a promise the
                slide no longer kept - on the one page where being straight
                about the fee is the entire argument. */}
            <p className="mt-3 text-[14.5px] font-light text-black/55">
              on {f.headlineFor}. Everything below is what that includes
              {f.excluded.length > 0 ? ", and what it does not." : "."}
            </p>
          </Rise>
        )}

        <div className="mt-7 grid gap-x-14 gap-y-7 lg:grid-cols-[1.15fr_0.85fr]">
          {f.rows.length > 0 && (
            <Rise show={show} i={3}>
              <ul>
                {f.rows.map((r, n) => (
                  <li
                    key={r.label}
                    className="flex items-baseline justify-between gap-6 py-2.5"
                    style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.07)" }}
                  >
                    <span className="min-w-0">
                      <span
                        className="block text-[14.5px]"
                        style={{ fontFamily: HAND, fontWeight: 700 }}
                      >
                        {r.label}
                      </span>
                      {r.note && (
                        <span className="block text-[12px] font-light text-black/45">{r.note}</span>
                      )}
                    </span>
                    <span
                      className="shrink-0 text-[16px]"
                      style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                    >
                      {r.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </Rise>
          )}

          {f.excluded.length > 0 && (
            <Rise show={show} i={4}>
              <div className="rounded-2xl px-5 py-4" style={{ background: TINTS[0] }}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  Not included
                </h3>
                <ul className="mt-2.5 space-y-1.5">
                  {f.excluded.map((e) => (
                    <li key={e} className="flex items-start gap-2.5">
                      <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-black/30" />
                      <span className="text-[12.5px] font-light leading-[1.5] text-black/60">
                        {e}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Rise>
          )}
        </div>

        {f.note && (
          <Rise show={show} i={5}>
            <p className="mt-6 border-t border-black/10 pt-3.5 text-[12px] font-light leading-relaxed text-black/50">
              {f.note}
            </p>
          </Rise>
        )}
      </div>
    </CreamSlide>
  );
}
