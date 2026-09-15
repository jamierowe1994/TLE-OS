"use client";

import {
  AGENDA,
  APPROACH,
  BROCHURE_COPY,
  COMPLIANCE,
  LEGAL_CAVEAT,
  LEGAL_ITEMS,
  MANAGEMENT,
  MARKETING_POINTS,
  MAX_PRICE,
  NETWORK,
  PORTALS_COPY,
  PROTECTION,
  REGULATED,
  REGULATED_INTRO,
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
import {
  DEMAND_STATS,
  PORTAL_STATS,
  statFooter,
  type NationalStat,
} from "@/lib/present-stats";
import { useState } from "react";
import { deckKind, feeOnRent, money, type PresentDeck as Deck } from "@/lib/present";
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
  Stage,
  useStage,
  CREAM,
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
      <div className="mx-auto grid w-full max-w-[1340px] items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="max-w-[520px]">
          <HandHead eyebrow="What we&rsquo;ll cover" show={show} lines={2}>
            Here&rsquo;s what
            <br />
            we&rsquo;ll go through{" "}
            <Emphasis show={show}>today</Emphasis>
          </HandHead>

          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[420px] text-[15.5px] font-light leading-[1.6] text-black/60">
              Four simple parts. Stop us at any point and ask anything you like - nothing
              needs deciding today.
            </p>
          </Rise>

          {deck.property.address && (
            <Rise show={show} i={3}>
              <p className="mt-5 text-[13px] font-light text-black/45">
                For <span className="font-normal text-black/70">{deck.property.address}</span>
              </p>
            </Rise>
          )}
        </div>

        {/* The list. Hairlines rather than cards: four boxes would read as four
            things to get through, and the point is that it is one journey with
            four stops.

            ── Set BIG, and given room ────────────────────────────────────────
            James, 7 Sep: this slide "looks a bit thin and very small... we
            might want to pad this out or make some things bigger." He is
            right, and the reason is structural rather than a matter of taste.
            This is the only slide whose whole job is a list of four things, so
            the list has to carry the page on its own - at 17px in a column
            half the width of the screen it read as a footnote to the headline
            beside it. The numbers, the titles and the room between the rows
            all go up together; changing one of the three would just move the
            imbalance somewhere else. */}
        <ol className="lg:pt-2">
          {AGENDA.map((a, n) => (
            <Rise key={a.title} show={show} i={2 + Math.floor(n / 2)}>
              <li
                className="flex gap-5 py-5 sm:gap-7 sm:py-8"
                style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}
              >
                <span
                  className="mt-[6px] shrink-0 text-[19px] leading-none tabular-nums sm:text-[22px]"
                  style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                >
                  {String(n + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[19px] leading-snug sm:text-[24px]"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {a.title}
                  </span>
                  <span className="mt-2 block text-[14px] font-light leading-[1.55] text-black/50 sm:text-[15px]">
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
            A more personal
            <br />
            way to <Emphasis show={show}>let</Emphasis>
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
 * Your property. James, 13 Sep 2026, from his reference: the eyebrow and
 * the heading centred, the address and the facts under it, and then THEIR
 * HOUSE, big - a landscape photograph in a rounded frame on a sage shape,
 * a handwritten "Let's see what it could achieve." beside its foot, and a strapline
 * under it. Laid out on the stage so it frames the same at every size.
 *
 * The photograph is the property's own (`property.image`, from the dossier
 * or Rightmove) and it is often null - half the book has no photo anywhere.
 * With none, the frame shows the drawn street instead, so the slide still
 * reads as deliberate rather than as a hole. The sample carries a stand-in
 * cottage so the slide can be judged with a photograph in it.
 *
 * The arrow-and-note that pointed at the red house in the drawn street is
 * gone with this version: the point of the slide is now the photograph.
 */
export function PropertyDivider({ deck, show }: { deck: Deck; show: boolean }) {
  const p = deck.property;
  const { host, fit } = useStage();
  const fx = fit.staged;
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  const SCRIPT = { fontFamily: "var(--font-shantell), cursive" } as const;
  const SAGE_WASH = "#f1f4ec";
  /* Only the facts we actually hold. A row of dashes under a photograph of
     somebody's home is worse than a shorter row. */
  const facts = [
    p.propertyType,
    p.beds != null ? `${p.beds} bedroom${p.beds === 1 ? "" : "s"}` : null,
    p.baths != null ? `${p.baths} bathroom${p.baths === 1 ? "" : "s"}` : null,
    p.sqft != null ? `${p.sqft.toLocaleString("en-GB")} sq ft` : null,
    p.epc ? `EPC ${p.epc}` : null,
  ].filter(Boolean) as string[];

  const frame = p.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.image} alt={p.address} className="w-full rounded-[40px] object-cover shadow-[0_40px_80px_-40px_rgba(0,0,0,0.4)]" style={{ aspectRatio: "21 / 10" }} />
  ) : (
    <div className="w-full overflow-hidden rounded-[40px]" style={{ aspectRatio: "21 / 10", background: SAGE_WASH }}>
      <Art slot="property" drawing="/illustrations/houses-still.png" ratio="21 / 10" />
    </div>
  );

  const body = (
    <>
      <header className={fx ? "h-[124px]" : "h-[60px]"} />
      <div className={`relative z-[2] flex flex-1 flex-col items-center text-center ${fx ? "px-[100px]" : "px-6 pb-10 pt-4 sm:px-12"}`}>
        <Rise show={show} i={0}>
          <Eyebrow>Your property</Eyebrow>
        </Rise>
        <Rise show={show} i={1}>
          <h2 className={`mt-5 leading-[1.04] ${fx ? "text-[62px]" : "text-[34px] sm:text-[48px]"}`} style={HEAD}>
            Right then. Let&rsquo;s talk about <Emphasis show={show}>yours</Emphasis>.
          </h2>
        </Rise>
        {(p.address || facts.length > 0) && (
          <Rise show={show} i={2}>
            {p.address && (
              <p className="mt-5 text-[17px] text-black/70">{[p.address, p.postcode].filter(Boolean).join(", ")}</p>
            )}
            {facts.length > 0 && (
              <p className="mt-1.5 text-[15px] text-black/50">{facts.join(" · ")}</p>
            )}
          </Rise>
        )}
        <Rise show={show} i={3} className={`relative ${fx ? "mt-8 w-[1000px]" : "mt-6 w-full"}`}>
          {frame}
          {fx && (
            <p className="pointer-events-none absolute -right-[205px] bottom-[140px] w-[185px] text-left text-[26px] leading-[1.1] text-black/60" style={{ ...SCRIPT, transform: "rotate(-12deg)" }}>
              Let&rsquo;s see what
              <br />
              <span className="ml-3">it could achieve.</span>
            </p>
          )}
        </Rise>
        <Rise show={show} i={4}>
          <p className="mt-7 text-[11px] uppercase tracking-[0.3em] text-black/45">Your property. The right plan.</p>
        </Rise>
      </div>
      {fx && (
        /* THE SAGE behind the frame: a long tilted ellipse, wider than the
           photograph, so it shows either side and under the handwriting. */
        <div className="pointer-events-none absolute left-[150px] top-[310px] z-[1] h-[540px] w-[1140px]" style={{ transform: "rotate(-9deg)" }}>
          <div className="h-full w-full rounded-[50%]" style={{ background: SAGE_WASH }} />
        </div>
      )}
    </>
  );
  return (
    <section
      ref={host}
      data-slide="property"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
  );
}

/**
 * Your property details.
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
          <HandHead eyebrow="Your property details" show={show} lines={2}>
            Let&rsquo;s make sure everything
            <br />
            is <Emphasis show={show}>up to date</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[520px] text-[15px] font-light leading-[1.6] text-black/55">
              These are the details we&rsquo;ll use to prepare your property for market. We&rsquo;ll
              check them together before anything goes live.
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
                    to confirm
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
              {missing === 1 ? "One detail" : `${missing} details`} still to confirm. Your agent
              can update {missing === 1 ? "this" : "these"} with you.
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
  /**
   * How many, and which. James, 13 Sep 2026: up to four sit one under
   * another as they always have; more than four go TWO ACROSS, up to eight
   * (a 2x4), with the row shrunk and the rent moved onto the second line
   * so a narrow column is not fighting a right-aligned figure. More than
   * eight and "we filter down per month": only what was advertised in the
   * last month, freshest first, and still eight at most. Ours is never
   * filtered out - the point of the slide is that theirs sits beside ours.
   */
  const MAX = 8;
  const fresh = rows.length > MAX ? rows.filter((r) => r.ours || r.days == null || r.days <= 31) : rows;
  const ordered =
    fresh.length > MAX
      ? [...fresh].sort((a, b) => Number(b.ours) - Number(a.ours) || (a.days ?? 999) - (b.days ?? 999))
      : fresh;
  const shown = ordered.slice(0, MAX);
  const twoUp = shown.length > 4;
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
              These are the properties tenants are currently seeing alongside yours. Tap any
              one to see the photography, asking rent and agent.
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          <ul className={`mt-7 lg:mt-8 ${twoUp ? "grid grid-cols-1 gap-x-12 lg:grid-cols-2" : ""}`}>
            {shown.map((r, n) => {
              const gallery = galleryOf(r);
              const openable = gallery.length > 0;
              /* The hairline: every row but the first - and two across, the
                 first row is two rows wide. */
              const rule = twoUp ? (n < 2 ? "border-t lg:border-t-0" : "border-t") : n === 0 ? "" : "border-t";
              return (
                <li
                  key={`${r.address}-${r.rent}`}
                  className={`${n === 0 ? "" : rule} border-black/[0.07]`}
                >
                  <button
                    type="button"
                    disabled={!openable}
                    onClick={() => setOpenAt(n)}
                    className={`flex w-full items-center gap-4 text-left transition-opacity disabled:cursor-default ${twoUp ? "py-2" : "py-2.5"}`}
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
                        className={`shrink-0 rounded-[7px] object-cover ${twoUp ? "h-[40px] w-[54px]" : "h-[46px] w-[62px]"}`}
                      />
                    ) : (
                      <span
                        className={`shrink-0 rounded-[7px] ${twoUp ? "h-[40px] w-[54px]" : "h-[46px] w-[62px]"}`}
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
                      {twoUp ? (
                        /* Two across: "2-bed terraced house · £1,095 pcm" - the
                           rent on this line, at the left, where the eye is
                           already. The agent and the postcode are in the detail. */
                        <span className="mt-0.5 block truncate text-[12.5px] text-black/50">
                          {[r.beds != null ? `${r.beds}-bed` : null, r.type?.toLowerCase()].filter(Boolean).join(" ")}
                          {(r.beds != null || r.type) && "  ·  "}
                          <span className="font-semibold text-black/75" style={{ fontFamily: HAND }}>{r.rent}</span>
                        </span>
                      ) : (
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
                      )}
                    </span>

                    <span className="flex shrink-0 items-center gap-3">
                      {!twoUp && (
                        <span className="text-[17px]" style={{ fontFamily: HAND, fontWeight: 700 }}>
                          {r.rent}
                        </span>
                      )}
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

        {(ours > 0 || shown.length < rows.length) && (
          <Rise show={show} i={4}>
            <p className="mt-5 text-[14px] text-black/55" style={{ fontFamily: HAND }}>
              {ours > 0 && (
                <>
                  {ours === 1 ? "One of these is ours." : `${ours} of these are ours.`} The others
                  give us a useful view of the local market.
                </>
              )}
              {shown.length < rows.length && (
                <>
                  {ours > 0 && " "}
                  The {shown.length} advertised in the last month, of {rows.length} nearby.
                </>
              )}
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
 * Marketing. James, 13 Sep 2026, from his second reference of the day for
 * this slide ("I think we can do better than this ... a better use of space
 * and design"): the flat on the LEFT, cut into a soft shape with the plant
 * poking out over the edge, on a pink shape that runs off the left of the
 * stage; a handwritten line above it with a small arrow pointing down at it;
 * and the words on the right - eyebrow with a short pink rule, the heading,
 * the paragraph, three discs in a row with hairlines between, a pink review
 * card, and a second handwritten line in the corner.
 *
 * The cut-out is his - the photograph already shaped, plant and all, so it
 * drops in as one transparent image rather than being masked here.
 *
 * THE REVIEW is a real one or none. His mock carried "Tom & Emily Carter",
 * who do not exist, and the deck's first rule is no invented figures - a
 * made-up review on a slide about trust is the worst kind. The card shows
 * the deck's SECOND review when there is one, so the agent slide and this
 * one do not repeat each other, and falls back to the first; with no review
 * on the deck the card is simply not there.
 */
export function MarketingDivider({ deck, show }: { deck: Deck; show: boolean }) {
  const { host, fit } = useStage();
  const fx = fit.staged;
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  const SCRIPT = { fontFamily: "var(--font-shantell), cursive" } as const;
  const SAGE_WASH = "#f1f4ec", SAGE_INK = "#56634a";
  const POINTS = MARKETING_POINTS;
  const review = deck.testimonials?.[1] ?? deck.testimonials?.[0] ?? deck.testimonial ?? null;

  const points = (
    <ul className={`grid ${fx ? "grid-cols-[auto_auto_auto] justify-between" : "grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0"}`}>
      {POINTS.map((b, n) => (
        <li key={b.title} className={`flex flex-col items-center px-1.5 text-center ${n > 0 ? (fx ? "border-l" : "sm:border-l") : ""}`} style={{ borderColor: "rgba(59,59,60,0.12)" }}>
          <span
            className="flex h-[64px] w-[64px] items-center justify-center rounded-full"
            style={n === 1 ? { background: SAGE_WASH, color: SAGE_INK } : { background: TINTS[0], color: INK }}
          >
            <Line name={b.icon} size={22} />
          </span>
          <span className="mt-4 block whitespace-nowrap text-[14.5px] font-semibold leading-snug">{b.title}</span>
          <span className="mt-1.5 block max-w-[170px] text-[13px] leading-[1.5] text-black/55">{b.body}</span>
        </li>
      ))}
    </ul>
  );

  const card = review?.quote && (
    <div className="flex items-start gap-5 rounded-[22px] px-6 py-4" style={{ background: TINTS[0] }}>
      {/* The mark on its own - James, 13 Sep 2026: "just put the quotation
          mark", no circle round it. */}
      <span aria-hidden className="block h-[30px] shrink-0 text-[64px] leading-[0.6]" style={{ color: "var(--p-accent)", fontFamily: HAND, fontWeight: 800 }}>&ldquo;</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] italic leading-[1.55] text-black/75">&ldquo;{review.quote}&rdquo;</span>
        <span className="mt-2 block text-[12px] text-black/45">{review.author}</span>
      </span>
      {review.rating != null && (
        <span className="shrink-0 text-[15px] tracking-[0.15em]" style={{ color: "var(--p-accent)" }} aria-label={`${review.rating} out of 5`}>
          {"★".repeat(Math.max(0, Math.min(5, Math.round(review.rating))))}
        </span>
      )}
    </div>
  );

  const body = (
    <>
      <header className={fx ? "h-[84px]" : "h-[60px]"} />
      <div className={`relative z-[2] flex flex-1 flex-col ${fx ? "justify-start pb-10 pl-[830px] pr-[56px]" : "justify-center px-6 pb-10 pt-4 sm:px-12"}`}>
        <Rise show={show} i={0}>
          <Eyebrow>Marketing</Eyebrow>
          <span aria-hidden className="mt-3 block h-[3px] w-[56px] rounded-full" style={{ background: TINTS[0] }} />
        </Rise>
        <Rise show={show} i={1}>
          <h2 className={`mt-6 leading-[1.02] ${fx ? "text-[68px]" : "text-[36px] sm:text-[50px]"}`} style={HEAD}>
            Now, let&rsquo;s find
            <br />
            the <Emphasis show={show}>right tenant.</Emphasis>
          </h2>
        </Rise>
        <Rise show={show} i={2}>
          <p className="mt-5 max-w-[560px] text-[17px] leading-[1.55] text-black/60">
            We combine local knowledge, strong presentation and targeted marketing to put your
            property in front of the right tenants.
          </p>
        </Rise>
        {!fx && (
          <Rise show={show} i={3} className="mt-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/photo/marketing-flat-cut.webp" alt="" aria-hidden className="w-full" />
          </Rise>
        )}
        <Rise show={show} i={4} className="mt-7">{points}</Rise>
        {card && <Rise show={show} i={5} className="mt-6">{card}</Rise>}
      </div>

      {fx && (
        <>
          {/* THE PINK, behind the flat and off the left edge. */}
          <div className="pointer-events-none absolute -left-[160px] top-[40px] z-[1] h-[880px] w-[960px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
              <path d="M18 8C40 -2 70 2 86 18C100 32 100 60 90 78C80 96 56 102 34 96C12 90 0 72 2 50C3 32 6 14 18 8Z" fill="var(--p-tint)" />
            </svg>
          </div>
          {/* THE FLAT, already cut to its shape, the plant over the edge. */}
          <Rise show={show} i={2} className="absolute left-[30px] top-[196px] z-[2] w-[770px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/photo/marketing-flat-cut.webp" alt="" aria-hidden className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.18)]" />
          </Rise>
          {/* THE HANDWRITTEN LINE above it, and the arrow down to it. */}
          <Rise show={show} i={5} className="absolute left-[600px] top-[84px] z-[3] w-[220px]">
            <p className="text-[24px] leading-[1.15] text-black/70" style={{ ...SCRIPT, transform: "rotate(-8deg)" }}>
              Great tenants
              <br />
              <span className="ml-2">start with great</span>
              <br />
              <span className="ml-5">marketing.</span>
            </p>
          </Rise>
          <svg viewBox="0 0 60 60" aria-hidden className="pointer-events-none absolute left-[538px] top-[118px] z-[3] h-[56px] w-[56px]">
            <path d="M54 6C40 10 26 22 12 46M12 46L14 32M12 46L26 42" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
          </svg>
          {/* THE SECOND LINE, bottom-left on the pink under the flat. The
              reference had it bottom-right, where this deck keeps its Back
              and Next. Three words, as on the entrance - James took "longer"
              out of it there on 13 Sep. */}
          <Rise show={show} i={6} className="absolute left-[64px] top-[818px] z-[3] w-[220px]">
            <p className="text-[19px] leading-[1.15] text-black/65" style={{ ...SCRIPT, transform: "rotate(-8deg)" }}>
              People. Homes.
              <br />
              Relationships.
            </p>
          </Rise>
        </>
      )}
    </>
  );
  return (
    <section
      ref={host}
      data-slide="marketing"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
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
            before a tenant <Emphasis show={show}>moves in</Emphasis>
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
        <div className="max-w-[880px]">
          <HandHead eyebrow={MAX_PRICE.eyebrow} show={show} lines={2}>
            Marketing finds the tenant.
            <br />
            Strategy gets the best <Emphasis show={show}>result.</Emphasis>
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
      {/* Two columns, because one column was a headline and a paragraph on a
          third of the screen. The drawing is not decoration here: the whole
          claim is that somebody dresses the room before anybody photographs
          it, and that is exactly what it shows. */}
      <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[1fr_0.8fr] lg:gap-16">
        <div>
          <HandHead eyebrow="The brochure" show={show} lines={2}>
            We sell the life,
            <br />
            not the <Emphasis show={show}>floorplan</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[560px] text-[15px] font-light leading-[1.8] text-black/65">
              {BROCHURE_COPY.body}
            </p>
          </Rise>
        </div>
        <Rise show={show} i={3} className="hidden lg:block">
          <Art
            slot="brochure"
            drawing="/brand/art/brochure-room.webp"
            /* Rounded, unlike the cut-out illustrations. This one is a whole
               room drawn edge to edge rather than a figure on a blob, so on
               cream it reads as an image and wants a frame; square corners on
               it look like the drawing has been cropped by accident. */
            className="ml-auto max-w-[420px] rounded-[24px]"
            ratio="1 / 1"
          />
        </Rise>
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
/**
 * A row of national figures, with whose they are printed under them.
 *
 * The source line is not fine print to be tucked away - it is the reason the
 * numbers are allowed on the page at all (see lib/present-stats). A landlord
 * who cannot tell one of these from one of ours is being misled even when both
 * are true, so the footer says "National figures, not ours" every time.
 */
function Stats({ stats, show, from, cols = 3 }: { stats: NationalStat[]; show: boolean; from: number; cols?: 2 | 3 }) {
  return (
    <>
      <div className={`grid gap-x-8 gap-y-7 ${cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {stats.map((st, n) => (
          <Rise key={st.value + st.label} show={show} i={from + n}>
            <div className="border-t pt-4" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
              <span
                className="block text-[34px] leading-none sm:text-[40px]"
                style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
              >
                {st.value}
              </span>
              <span className="mt-2.5 block text-[13px] font-light leading-[1.5] text-black/60">
                {st.label}
              </span>
            </div>
          </Rise>
        ))}
      </div>
      <Rise show={show} i={from + stats.length}>
        <p className="mt-6 text-[11px] font-light leading-relaxed text-black/35">
          {statFooter(stats)}
        </p>
      </Rise>
    </>
  );
}

export function Portals({ show }: { show: boolean }) {
  const LOGOS: Record<string, string> = {
    Rightmove: "/brand/rightmove.png",
    Zoopla: "/brand/zoopla.png",
    /* James's, 13 Sep 2026, white ground keyed out. */
    OnTheMarket: "/brand/onthemarket.png",
  };
  return (
    <CreamSlide id="portals">
      {/* James, 13 Sep 2026: the heading and its paragraph on the left, the
          FOUR figures on the right as a two-by-two, and the names underneath
          across the full width. "One of the most important" slides, so the
          evidence gets the right-hand half rather than a strip under the
          paragraph. (7 Sep had the names on the right, stacked; they were
          the thinnest thing in the deck and this gives them the width.) */}
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <HandHead eyebrow="Where it appears" show={show} lines={2}>
              Everywhere a tenant
              <br />
              is <Emphasis show={show}>looking</Emphasis>
            </HandHead>
            <Rise show={show} i={2}>
              <p className="mt-6 max-w-[520px] text-[14.5px] font-light leading-[1.7] text-black/60">
                {PORTALS_COPY.body}
              </p>
            </Rise>
          </div>
          <div className="lg:pt-4">
            <Stats stats={PORTAL_STATS} show={show} from={3} cols={2} />
          </div>
        </div>

        {/* The names, across the foot. The mark AND the name, never the mark
            on its own: the two files we hold are app icons rather than
            wordmarks, and a green square beside three words is not a list. */}
        <Rise show={show} i={8}>
          <ul className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-t pt-8" style={{ borderColor: "rgba(0,0,0,0.09)" }}>
            {PORTALS_COPY.portals.map((p) => (
              <li key={p} className="flex items-center">
                {LOGOS[p] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={LOGOS[p]} alt="" aria-hidden className="mr-3.5 h-7 w-auto shrink-0 opacity-90" />
                )}
                <span className="text-[21px] leading-none text-black/70 sm:text-[24px]" style={{ fontFamily: HAND, fontWeight: 700 }}>
                  {p}
                </span>
              </li>
            ))}
          </ul>
        </Rise>
      </div>
    </CreamSlide>
  );
}

export function Social({ show }: { show: boolean }) {
  return (
    <CreamSlide id="social">
      <div className="mx-auto w-full max-w-[1080px]">
        <div className="max-w-[720px]">
          <HandHead eyebrow="Social advertising" show={show} lines={2}>
            Reaching tenants
            <br />
            beyond the <Emphasis show={show}>portals</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[640px] text-[15px] font-light leading-[1.8] text-black/65">
              {SOCIAL_COPY.body}
            </p>
          </Rise>
        </div>

        {/* THE EVIDENCE, and it is not flattering. Demand at a six-year low and
            a quarter fewer enquiries per property than a year ago is the
            strongest argument on this slide precisely because it is the
            uncomfortable half of the market report: it is why reaching past
            the search results matters in 2026 in a way it did not in 2022.
            Sourced and dated on the page - see lib/present-stats. */}
        <div className="mt-11 border-t pt-9" style={{ borderColor: "rgba(0,0,0,0.09)" }}>
          <Rise show={show} i={3}>
            <p className="mb-7 text-[12.5px] font-light text-black/45">
              Why wider reach matters
            </p>
          </Rise>
          <Stats stats={DEMAND_STATS} show={show} from={4} />
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
        <div className="max-w-[840px]">
          <HandHead eyebrow="Compliance & legislation" show={show} lines={2}>
            Keeping your property ready,
            <br />
            compliant and <Emphasis show={show}>up to date</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.6] text-black/55">
              Lettings comes with a growing number of responsibilities. Our role is to help you
              understand what applies, what needs doing and when.
            </p>
          </Rise>
        </div>

        <div className="mt-9 grid gap-x-14 gap-y-7 sm:grid-cols-2 lg:mt-10">
          {COMPLIANCE.map((c, n) => (
            <Rise key={c.title} show={show} i={3 + Math.floor(n / 2)}>
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
          <HandHead eyebrow="Your landlord responsibilities" show={show} lines={2}>
            The essentials we help
            <br />
            you stay <Emphasis show={show}>on top of</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-5 max-w-[620px] text-[14.5px] font-light leading-[1.6] text-black/55">
              From safety certificates to tenant documentation, we&rsquo;ll help you understand
              what&rsquo;s required and keep the important dates visible.
            </p>
          </Rise>
        </div>

        <div className="mt-7 grid gap-x-14 gap-y-3 sm:grid-cols-2 lg:mt-8">
          {LEGAL_ITEMS.map((l, n) => (
            <Rise key={l.title} show={show} i={3 + Math.floor(n / 4)}>
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
            A thorough process
            <br />
            from the <Emphasis show={show}>start</Emphasis>
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
            Choose how involved
            <br />
            you want to <Emphasis show={show}>be</Emphasis>
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
            Three levels. Choose the
            <br />
            support that <Emphasis show={show}>suits you.</Emphasis>
          </HandHead>
        </div>

        {/* SIDE BY SIDE on a laptop, stacked below it.
            Stacked everywhere, this slide was still 103px too tall - the
            shared block is 132px of height saying "none of this is a
            decision", sitting directly above the part that is. Beside the
            table it costs nothing, and the reading is better for it: standard
            on the left, what more buys you on the right. */}
        {/* The two columns STRETCH to one height. James, 13 Sep 2026: the
            pink box was "about half the height of all of the boxes" beside
            the table - so it fills the row now, with a bigger title and the
            items spaced down it rather than bunched at the top. */}
        <div className="mt-6 grid items-stretch gap-x-12 gap-y-6 lg:mt-7 lg:grid-cols-[0.78fr_1.22fr]">
          {every.length > 0 && (
            <Rise show={show} i={2} className="flex">
              <div className="flex w-full flex-col rounded-2xl px-6 py-6" style={{ background: TINTS[0] }}>
                <p className="text-[19px] leading-snug" style={{ fontFamily: HAND, fontWeight: 700 }}>
                  Included in every service
                </p>
                <p className="mt-1 text-[12.5px] font-light text-black/50">Whichever you choose, you get all of these.</p>
                <ul className="mt-5 grid flex-1 content-around gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-1">
                  {every.map((r) => (
                    <li key={r.service} className="flex items-start gap-2.5">
                      <span className="mt-[3px] shrink-0" style={{ color: CORAL }}>
                        <Line name="check" size={15} />
                      </span>
                      <span className="text-[13.5px] font-light leading-snug">{r.service}</span>
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
                    What each level includes
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
                      Everything above, with the ongoing tenancy remaining with you.
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
            Rent collection,
            <br />
            made <Emphasis show={show}>simple</Emphasis>
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

        <div className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {RENT_LEGAL.points.map((p, n) => (
            <Rise key={p.title} show={show} i={3 + Math.floor(n / 3)}>
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
          <HandHead eyebrow="Professional standards" show={show} lines={2}>
            Professional standards
            <br />
            you can <Emphasis show={show}>rely on</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-5 max-w-[600px] text-[14.5px] font-light leading-[1.6] text-black/55">
              {REGULATED_INTRO}
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

  /* THE FEE ON THIS PROPERTY, once there is a rent to put it against.
     Only on the post-appraisal deck, and that is the point: before the visit
     there is no figure, so the rate card stands on its own; after it, a
     landlord should not have to do 10% of £1,300 in their head while somebody
     is still talking. See feeOnRent for what this deliberately does not say. */
  /* THE KIND DECIDES, not the data - the same rule the slide list follows.
     A deck object carries whatever has been recorded against the appraisal, so
     an agent who took a figure at the visit and then sent the APPRAISAL deck
     rather than the post-appraisal one had "On £1,300 a month" printed on a
     page whose whole premise is that no figure has been agreed yet. Caught in
     the sample, which carries a valuation for every kind on purpose. */
  const rent = deckKind(deck) === "post-appraisal" ? (deck.valuation?.rent ?? 0) : 0;
  const priced = rent
    ? f.rows.map((r) => ({ row: r, cost: feeOnRent(r, rent) })).filter((x) => x.cost)
    : [];

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
            {/* Says what is actually below it. It used to read "everything
                below is what that includes", which described the row notes and
                not the schedule - and once the second column arrived it was
                introducing a price list as a list of inclusions. */}
            <p className="mt-3 text-[14.5px] font-light text-black/55">
              for {f.headlineFor}. Below is the full schedule
              {priced.length > 0 ? ", with examples based on your proposed rent" : ""}
              {f.excluded.length > 0 ? ", and what it does not cover." : "."}
            </p>
          </Rise>
        )}

        <div className="mt-8 grid gap-x-14 gap-y-8 lg:grid-cols-[1.15fr_0.85fr]">
          {f.rows.length > 0 && (
            <Rise show={show} i={3}>
              <ul>
                {f.rows.map((r, n) => (
                  <li
                    key={r.label}
                    className="flex items-baseline justify-between gap-6 py-3.5"
                    style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.07)" }}
                  >
                    <span className="min-w-0">
                      <span
                        className="block text-[16px]"
                        style={{ fontFamily: HAND, fontWeight: 700 }}
                      >
                        {r.label}
                      </span>
                      {r.note && (
                        <span className="block text-[12.5px] font-light text-black/45">{r.note}</span>
                      )}
                    </span>
                    <span
                      className="shrink-0 text-[17px]"
                      style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                    >
                      {r.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </Rise>
          )}

          <div className="flex flex-col gap-6">
            {/* WHAT THAT IS, IN POUNDS, ON THEIR PROPERTY. The rate card above
                is the office's; this column is theirs. A one-off has no
                monthly figure and is never divided into one - a tenant find
                shown as "£62 a month" would be a fee nobody is charging. */}
            {priced.length > 0 && (
              <Rise show={show} i={4}>
                <div className="rounded-2xl px-5 py-5" style={{ background: TINTS[0] }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/45">
                    On {money(rent)} a month
                  </h3>
                  <ul className="mt-3.5">
                    {priced.map(({ row, cost }, n) => (
                      <li
                        key={row.label}
                        className="flex items-baseline justify-between gap-5 py-2.5"
                        style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.09)" }}
                      >
                        <span className="text-[12.5px] font-light text-black/60">{row.label}</span>
                        <span className="shrink-0 text-right">
                          <span
                            className="block text-[15px] leading-none"
                            style={{ fontFamily: HAND, fontWeight: 700 }}
                          >
                            {row.pct != null ? `${money(cost!.month)} a month` : money(cost!.year)}
                          </span>
                          <span className="mt-1 block text-[11px] font-light text-black/40">
                            {row.pct != null ? `${money(cost!.year)} a year` : "one-off"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* VAT is not settled and this slide will not guess at it.
                      Deferring in one line is honest; a net figure computed on
                      the wrong side of it would be out by a fifth. */}
                  <p className="mt-4 text-[11px] font-light leading-relaxed text-black/40">
                    Fees shown include VAT. Any set-up fee is set out in the terms of business.
                  </p>
                </div>
              </Rise>
            )}

            {f.excluded.length > 0 && (
              <Rise show={show} i={5}>
                <div className="rounded-2xl px-5 py-4" style={{ background: TINTS[1] }}>
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
        </div>

        {f.note && (
          <Rise show={show} i={6}>
            <p className="mt-7 border-t border-black/10 pt-4 text-[12px] font-light leading-relaxed text-black/50">
              {f.note}
            </p>
          </Rise>
        )}
      </div>
    </CreamSlide>
  );
}
