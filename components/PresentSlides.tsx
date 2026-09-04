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
  Mark,
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

/**
 * A section divider.
 *
 * Full-bleed red with the property photograph behind it where there is one.
 * It carries no argument — it exists so that the landlord knows the subject
 * has changed, which is the one thing a long deck cannot say in words without
 * sounding like a filing system.
 */
function Divider({
  id,
  eyebrow,
  title,
  lead,
  image,
  show,
}: {
  id: "property" | "marketing";
  eyebrow: string;
  title: string;
  lead: string;
  image: string | null;
  show: boolean;
}) {
  return (
    <section
      data-slide={id}
      className="relative flex min-h-full w-full shrink-0 flex-col justify-center overflow-hidden px-6 pb-28 pt-20 sm:px-10 lg:px-20 lg:pb-24"
      style={{ background: RED, color: "#ffffff" }}
    >
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          {/* Left-to-right rather than a flat dim: the type sits left, and
              darkening the whole frame throws away the half of the photograph
              worth showing. Same reasoning as the entrance screen. */}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(100deg, ${RED} 30%, rgba(227,31,54,0.72) 62%, rgba(227,31,54,0.35) 100%)` }}
          />
        </>
      )}
      <div className="relative mx-auto w-full max-w-5xl">
        <Rise show={show} i={0}>
          <Eyebrow on="dark">{eyebrow}</Eyebrow>
          <h2
            className="mt-4 max-w-2xl text-[38px] leading-[1.02] sm:text-[62px]"
            style={{ fontFamily: DISPLAY }}
          >
            {title}
          </h2>
          <p className="mt-5 max-w-lg text-[14px] font-light leading-relaxed text-white/80">{lead}</p>
        </Rise>
      </div>
    </section>
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
          <div className="relative mx-auto mt-6 w-full max-w-[660px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/houses-still.png"
              alt=""
              aria-hidden
              className="w-full"
            />

            {/* The note, and the point of the slide. Positioned against the
                DRAWING rather than the slide, so it keeps pointing at the red
                house however the picture scales. */}
            {short && (
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
 */
export function Listings({ deck, show }: { deck: Deck; show: boolean }) {
  const rows = deck.listings ?? [];
  if (!rows.length) return null;
  const ours = rows.filter((r) => r.ours).length;

  return (
    <CreamSlide id="listings">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[660px]">
          <HandHead eyebrow="What&rsquo;s on the market" show={show} lines={2}>
            Who you&rsquo;re up
            <br />
            against <Emphasis show={show}>today</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[540px] text-[15px] font-light leading-[1.6] text-black/55">
              A tenant looking at your street is looking at these at the same time. What they
              choose between is the price, the photographs, and how quickly somebody answers the
              phone.
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          <ul className="mt-7 lg:mt-8">
            {rows.slice(0, 6).map((r, n) => (
              <li
                key={`${r.address}-${r.rent}`}
                className="flex items-baseline justify-between gap-6 py-2.5"
                style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.07)" }}
              >
                <span className="min-w-0">
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
                  </span>
                  <span className="mt-0.5 block text-[12.5px] font-light text-black/45">
                    {[r.locality, r.beds != null ? `${r.beds} bed` : null, r.agent]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[17px]"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {r.rent}
                </span>
              </li>
            ))}
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
    </CreamSlide>
  );
}

/**
 * How the area has moved, month by month.
 *
 * Counts, not a y-axis. A landlord reading a chart with a scale on it has to
 * do arithmetic to get to the point, and the point here is a shape: whether
 * more is coming to the market than is letting. So the bars carry their own
 * numbers and the axis is gone.
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
    <section
      data-slide="history"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <Head
            eyebrow={`How ${h.area} has moved`}
            title={
              letted >= listed
                ? "More has let than has come to the market"
                : "More is coming to the market than is letting"
            }
            lead={`${listed} advertised and ${letted} let across the last ${points.length} months. What matters to you is the gap between the two: it decides whether you are pricing into a queue or into a choice.`}
            show={show}
          />
          <Rise show={show} i={1}>
            <div className="mt-9 flex items-end justify-between gap-2 border-b border-black/10 pb-3 sm:gap-5">
              {points.map((p) => (
                <div key={p.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-[132px] w-full items-end justify-center gap-[3px] sm:gap-1.5">
                    <span
                      className="w-1/2 max-w-[22px] rounded-t-[3px]"
                      style={{ height: `${(p.listed / peak) * 100}%`, background: "rgba(0,0,0,0.14)" }}
                      title={`${p.listed} advertised`}
                    />
                    <span
                      className="w-1/2 max-w-[22px] rounded-t-[3px]"
                      style={{ height: `${(p.let / peak) * 100}%`, background: RED }}
                      title={`${p.let} let`}
                    />
                  </div>
                  <span className="text-[11px] font-light text-black/50">{monthLabel(p.month)}</span>
                </div>
              ))}
            </div>
          </Rise>
          <Rise show={show} i={2}>
            <div className="mt-4 flex gap-6 text-[12px] font-light text-black/55">
              <span className="flex items-center gap-2">
                <span className="h-[9px] w-[9px] rounded-[2px]" style={{ background: "rgba(0,0,0,0.14)" }} />
                Came to the market
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[9px] w-[9px] rounded-[2px]" style={{ background: RED }} />
                Let
              </span>
            </div>
          </Rise>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── marketing ───────────────────────── */

export function MarketingDivider({ show }: { show: boolean }) {
  return (
    <Divider
      id="marketing"
      eyebrow="Marketing"
      title="Getting it in front of the right tenant"
      lead="The best rent and the shortest void come from the same thing: reaching people who would move for your property, not just the ones already searching."
      image={null}
      show={show}
    />
  );
}

export function Offer({ show }: { show: boolean }) {
  return (
    <Slide id="offer">
      <div className="mx-auto w-full max-w-5xl">
        <Head
          eyebrow="What we do"
          title="Everything that happens before a tenant arrives"
          show={show}
        />
        <ul className="mt-9 grid gap-x-12 gap-y-3 sm:grid-cols-2">
          {WHAT_WE_OFFER.map((w, n) => (
            <Rise key={w} show={show} i={1 + Math.floor(n / 4)}>
              <li className="flex items-start gap-3 border-t border-black/10 pt-3">
                <span className="mt-[3px] shrink-0" style={{ color: RED }}>
                  <Line name="check" size={16} />
                </span>
                <span className="text-[13.5px] font-light leading-relaxed">{w}</span>
              </li>
            </Rise>
          ))}
        </ul>
      </div>
    </Slide>
  );
}

/**
 * The film.
 *
 * `propertyVideoUrl` is the agent's own walk-through of THIS property when one
 * exists. It usually will not, at which point the slide argues for the film
 * rather than pretending to be one — a player with nothing behind it is worse
 * than a paragraph.
 */
/**
 * How the marketing becomes a number.
 *
 * Five points and they are the argument, so they get the room a paragraph
 * would have had: a numbered column rather than a grid of cards. The order is
 * chronological - price, present, launch, view, review - because it is a
 * sequence a landlord will live through, not a menu.
 */
export function MaxPrice({ show }: { show: boolean }) {
  return (
    <Slide id="maxprice">
      <div className="mx-auto w-full max-w-5xl">
        <Head eyebrow={MAX_PRICE.eyebrow} title={MAX_PRICE.heading} show={show} />
        <ol className="mt-8 grid gap-x-12 gap-y-4 sm:grid-cols-2">
          {MAX_PRICE.points.map((p, n) => (
            <Rise key={p.title} show={show} i={1 + Math.floor(n / 2)}>
              <li className="flex gap-4 border-t border-black/10 pt-3.5">
                <span
                  className="mt-[2px] shrink-0 text-[12px] font-semibold tabular-nums"
                  style={{ color: RED }}
                >
                  {String(n + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold leading-snug">{p.title}</span>
                  <span className="mt-1.5 block text-[12.5px] font-light leading-relaxed text-black/60">
                    {p.body}
                  </span>
                </span>
              </li>
            </Rise>
          ))}
        </ol>
      </div>
    </Slide>
  );
}

export function Video({ deck, show }: { deck: Deck; show: boolean }) {
  const url = deck.propertyVideoUrl;
  return (
    <Slide id="video">
      <div className="mx-auto w-full max-w-5xl">
        <Head eyebrow="Your property on film" title={VIDEO_COPY.heading} show={show} />
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <Rise show={show} i={1}>
            <p className="text-[13.5px] font-light leading-[1.75] text-black/70">{VIDEO_COPY.body}</p>
          </Rise>
          <Rise show={show} i={2}>
            {url ? (
              <div
                className="aspect-video w-full overflow-hidden rounded-2xl"
                style={{ background: MIST }}
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
              <div
                className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center"
                style={{ background: MIST }}
              >
                <span style={{ color: RED }}>
                  <Line name="home" size={26} />
                </span>
                <p className="text-[12.5px] font-light text-black/60">
                  Your film is made once the property is ready to photograph. It goes here, and out
                  across the portals and social on the same day.
                </p>
              </div>
            )}
          </Rise>
        </div>
      </div>
    </Slide>
  );
}

export function Brochure({ show }: { show: boolean }) {
  return (
    <Slide id="brochure">
      <div className="mx-auto w-full max-w-4xl">
        <Head eyebrow="The brochure" title={BROCHURE_COPY.heading} show={show} />
        <Rise show={show} i={1}>
          <p className="mt-8 max-w-2xl text-[14px] font-light leading-[1.8] text-black/70">
            {BROCHURE_COPY.body}
          </p>
        </Rise>
      </div>
    </Slide>
  );
}

/**
 * Where it appears.
 *
 * Only Rightmove and Zoopla have artwork in the repo, so the other two are set
 * in type rather than shown as broken tiles. A named portal in the brand's own
 * face reads as deliberate; a missing logo never does.
 */
export function Portals({ show }: { show: boolean }) {
  const LOGOS: Record<string, string> = {
    Rightmove: "/brand/rightmove.png",
    Zoopla: "/brand/zoopla.png",
  };
  return (
    <Slide id="portals">
      <div className="mx-auto w-full max-w-5xl">
        <Head eyebrow="Where it appears" title={PORTALS_COPY.heading} show={show} />
        <Rise show={show} i={1}>
          <p className="mt-8 max-w-2xl text-[13.5px] font-light leading-[1.75] text-black/70">
            {PORTALS_COPY.body}
          </p>
        </Rise>
        <Rise show={show} i={2}>
          <div className="mt-9 flex flex-wrap items-center gap-x-10 gap-y-6 border-t border-black/10 pt-7">
            {PORTALS_COPY.portals.map((p) =>
              LOGOS[p] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p} src={LOGOS[p]} alt={p} className="h-6 w-auto opacity-75 sm:h-7" />
              ) : (
                <span key={p} className="text-[15px] font-medium text-black/45">
                  {p}
                </span>
              )
            )}
          </div>
        </Rise>
      </div>
    </Slide>
  );
}

export function Social({ show }: { show: boolean }) {
  return (
    <Slide id="social">
      <div className="mx-auto w-full max-w-4xl">
        <Head eyebrow="Social advertising" title={SOCIAL_COPY.heading} show={show} />
        <Rise show={show} i={1}>
          <p className="mt-8 max-w-2xl text-[14px] font-light leading-[1.8] text-black/70">
            {SOCIAL_COPY.body}
          </p>
        </Rise>
      </div>
    </Slide>
  );
}

/* ───────────────────────── compliance ───────────────────────── */

export function Compliance({ show }: { show: boolean }) {
  return (
    <Slide id="compliance">
      <div className="mx-auto w-full max-w-5xl">
        <Head
          eyebrow="Compliance and guidance"
          title="The part that catches landlords out"
          show={show}
        />
        <Blocks items={COMPLIANCE} show={show} />
      </div>
    </Slide>
  );
}

/**
 * The obligations.
 *
 * Eight of them and they have to fit one screen, so this is the deck's densest
 * slide by design: a two-column list at a smaller size rather than eight cards
 * that scroll. The caveat about England is on the slide and not in a footnote,
 * because an agent showing this in Cardiff needs the landlord to have seen it.
 */
export function Legal({ show }: { show: boolean }) {
  return (
    <Slide id="legal">
      <div className="mx-auto w-full max-w-5xl">
        <Head
          eyebrow="What the law asks of you"
          title="Eight things, and who keeps track of each one"
          show={show}
        />
        <div className="mt-8 grid gap-x-12 gap-y-4 sm:grid-cols-2">
          {LEGAL_ITEMS.map((l, n) => (
            <Rise key={l.title} show={show} i={1 + Math.floor(n / 4)}>
              <div className="flex gap-3 border-t border-black/10 pt-3">
                <span className="mt-[3px] shrink-0" style={{ color: RED }}>
                  <Line name="shield" size={16} />
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold leading-snug">{l.title}</span>
                  <span className="mt-1 block text-[12px] font-light leading-relaxed text-black/60">
                    {l.body}
                  </span>
                </span>
              </div>
            </Rise>
          ))}
        </div>
        <Rise show={show} i={3}>
          <p className="mt-7 max-w-3xl border-t border-black/10 pt-4 text-[11.5px] font-light leading-relaxed text-black/50">
            {LEGAL_CAVEAT}
          </p>
        </Rise>
      </div>
    </Slide>
  );
}

export function Screening({ show }: { show: boolean }) {
  return (
    <Slide id="screening">
      <div className="mx-auto w-full max-w-5xl">
        <Head eyebrow={SCREENING.eyebrow} title={SCREENING.heading} show={show} />
        <div className="mt-9 grid gap-x-14 gap-y-6 sm:grid-cols-2">
          {SCREENING.paragraphs.map((p, n) => (
            <Rise key={p.slice(0, 24)} show={show} i={1 + Math.floor(n / 2)}>
              <p className="text-[13.5px] font-light leading-[1.75] text-black/70">{p}</p>
            </Rise>
          ))}
        </div>
      </div>
    </Slide>
  );
}

/* ───────────────────────── service and management ───────────────────────── */

export function Management({ show }: { show: boolean }) {
  return (
    <Slide id="management">
      <div className="mx-auto w-full max-w-5xl">
        <Head
          eyebrow="Management and support"
          title="How much of it you want to run yourself"
          show={show}
        />
        <Blocks items={MANAGEMENT} show={show} />
      </div>
    </Slide>
  );
}

/**
 * The three levels, side by side.
 *
 * Fourteen rows and three columns will not fit a phone as a table, so it is
 * two layouts rather than one that shrinks: a table above `sm`, and below it
 * a card per level listing what that level includes. The same data read two
 * ways, because a fourteen-row table at 9px is not a compromise, it is an
 * unreadable slide with a good excuse.
 */
export function Levels({ show }: { show: boolean }) {
  const cols = SERVICE_LEVELS.length;
  /* Positional pairing between SERVICE_LEVELS and each row's `included` is
     the one fragile thing in lib/present-copy. Checked rather than trusted:
     a mismatch shifts every tick silently, which on a page about what a
     landlord is buying is the worst kind of wrong. */
  const rows = SERVICE_ROWS.filter((r) => r.included.length === cols);

  return (
    <section
      data-slide="levels"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <Head
            eyebrow="Service levels"
            title="What each level covers"
            lead={SERVICE_LEVELS_INTRO}
            show={show}
          />

          {/* Table, from sm up. */}
          <Rise show={show} i={1} className="hidden sm:block">
            <table className="mt-8 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/12">
                  <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/45">
                    Included
                  </th>
                  {SERVICE_LEVELS.map((s, n) => (
                    <th
                      key={s}
                      className="w-[104px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase leading-tight tracking-[0.1em]"
                      style={n === 0 ? { color: RED } : { color: "rgba(0,0,0,0.45)" }}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.service} className="border-b border-black/8">
                    <td className="py-[9px] pr-4 text-[12.5px] font-light">{r.service}</td>
                    {r.included.map((on, n) => (
                      <td key={`${r.service}-${n}`} className="px-2 py-[9px] text-center">
                        <Tick on={on} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Rise>

          {/* Cards, on a phone. */}
          <div className="mt-8 space-y-4 sm:hidden">
            {SERVICE_LEVELS.map((s, n) => {
              const has = rows.filter((r) => r.included[n]);
              return (
                <Rise key={s} show={show} i={1 + n}>
                  <div className="rounded-2xl border border-black/10 bg-white p-5">
                    <h3 className="text-[14px] font-semibold" style={n === 0 ? { color: RED } : undefined}>
                      {s}
                    </h3>
                    <p className="mt-1 text-[11.5px] font-light text-black/50">
                      {has.length} of {rows.length} included
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {has.map((r) => (
                        <li key={r.service} className="flex items-start gap-2">
                          <span className="mt-[3px] shrink-0" style={{ color: RED }}>
                            <Line name="check" size={13} />
                          </span>
                          <span className="text-[12px] font-light leading-snug">{r.service}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Rise>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Collection({ show }: { show: boolean }) {
  return (
    <Slide id="collection">
      <div className="mx-auto w-full max-w-4xl">
        <Head
          eyebrow="Rent collection"
          title={RENT_COLLECTION.heading}
          lead={RENT_COLLECTION.body}
          show={show}
        />
        <ul className="mt-8 grid gap-x-12 gap-y-3 sm:grid-cols-2">
          {RENT_COLLECTION.points.map((p, n) => (
            <Rise key={p} show={show} i={1 + Math.floor(n / 2)}>
              <li className="flex items-start gap-3 border-t border-black/10 pt-3">
                <span className="mt-[3px] shrink-0" style={{ color: RED }}>
                  <Line name="check" size={16} />
                </span>
                <span className="text-[13.5px] font-light leading-relaxed">{p}</span>
              </li>
            </Rise>
          ))}
        </ul>
      </div>
    </Slide>
  );
}

/* ───────────────────────── protecting the income ───────────────────────── */

export function Protection({ show }: { show: boolean }) {
  return (
    <Slide id="protection">
      <div className="mx-auto w-full max-w-4xl">
        <Head eyebrow="Protecting your income" title={PROTECTION.heading} show={show} />
        <div className="mt-8 max-w-2xl space-y-5">
          {PROTECTION.paragraphs.map((p, n) => (
            <Rise key={p.slice(0, 24)} show={show} i={1 + n}>
              <p className="text-[14px] font-light leading-[1.8] text-black/70">{p}</p>
            </Rise>
          ))}
        </div>
      </div>
    </Slide>
  );
}

/**
 * Rent & Legal Protection.
 *
 * The one slide in the deck that makes a financial promise, which is why the
 * disclaimer is on it rather than at the end. Nine points is too many to read
 * as prose, so they are a grid of short pairs — and the standfirst does the
 * arguing so that the grid only has to do the listing.
 */
export function RentLegal({ show }: { show: boolean }) {
  return (
    <Slide id="rentlegal">
      <div className="mx-auto w-full max-w-5xl">
        <Head
          eyebrow={RENT_LEGAL.eyebrow}
          title={RENT_LEGAL.heading}
          lead={RENT_LEGAL.standfirst}
          show={show}
        />
        <div className="mt-8 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {RENT_LEGAL.points.map((p, n) => (
            <Rise key={p.title} show={show} i={1 + Math.floor(n / 4)}>
              <div className="border-t border-black/10 pt-3">
                <h3 className="text-[13px] font-semibold leading-snug">{p.title}</h3>
                <p className="mt-1.5 text-[11.5px] font-light leading-relaxed text-black/60">
                  {p.body}
                </p>
              </div>
            </Rise>
          ))}
        </div>
        <Rise show={show} i={3}>
          <p className="mt-7 max-w-3xl border-t border-black/10 pt-4 text-[11.5px] font-light leading-relaxed text-black/50">
            {RENT_LEGAL.disclaimer}
          </p>
        </Rise>
      </div>
    </Slide>
  );
}

/**
 * The schemes we answer to.
 *
 * None of the artwork is in the repo, so every tile renders as a name in the
 * brand's own type with its caption under it. That is not a placeholder — a
 * regulator's name set properly says the same thing its logo does, and eight
 * broken image boxes on the slide about being accountable would say the
 * opposite. Drop the files into /public/brand and set `logo` in
 * lib/present-copy to switch any one of them over.
 */
export function Regulated({ show }: { show: boolean }) {
  return (
    <Slide id="regulated">
      <div className="mx-auto w-full max-w-5xl">
        <Head
          eyebrow="Regulated and protected"
          title="Who we answer to when you have a complaint"
          lead="Every one of these is somebody you can go to about us, or a scheme that holds your money where we cannot reach it."
          show={show}
        />
        <div className="mt-9 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {REGULATED.map((r, n) => (
            <Rise key={r.name} show={show} i={1 + Math.floor(n / 4)}>
              <div className="border-t border-black/10 pt-3">
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} alt={r.name} className="h-7 w-auto" />
                ) : (
                  <span className="block text-[13px] font-semibold leading-snug">{r.name}</span>
                )}
                <span className="mt-1.5 block text-[11.5px] font-light leading-relaxed text-black/55">
                  {r.caption}
                </span>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function Network({ show }: { show: boolean }) {
  return (
    <Slide id="network">
      <div className="mx-auto w-full max-w-4xl">
        <Head eyebrow="The Experts Group" title={NETWORK.heading} lead={NETWORK.body} show={show} />
        <Rise show={show} i={1}>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {NETWORK.brands.map((b) => (
              <li
                key={b}
                className="rounded-full px-4 py-2 text-[12.5px] font-medium"
                style={{ background: MIST, color: INK }}
              >
                {b}
              </li>
            ))}
          </ul>
        </Rise>
      </div>
    </Slide>
  );
}

/* ───────────────────────── the close ───────────────────────── */

/** One review, with a real name on it. Never a composite. */
export function Testimonial({ deck, show }: { deck: Deck; show: boolean }) {
  const t = deck.testimonial;
  if (!t?.quote) return null;
  return (
    <Slide id="testimonial">
      <div className="mx-auto w-full max-w-3xl">
        <Rise show={show} i={0}>
          <Eyebrow>What landlords say</Eyebrow>
        </Rise>
        <Rise show={show} i={1}>
          <blockquote
            className="mt-6 text-[22px] leading-[1.35] sm:text-[30px]"
            style={{ fontFamily: DISPLAY }}
          >
            &ldquo;{t.quote}&rdquo;
          </blockquote>
        </Rise>
        <Rise show={show} i={2}>
          <div className="mt-7 flex items-center gap-3 border-t border-black/10 pt-4">
            {t.rating != null && (
              <span className="flex gap-[3px]" style={{ color: RED }} aria-label={`${t.rating} out of 5`}>
                {Array.from({ length: Math.max(0, Math.min(5, Math.round(t.rating))) }).map((_, n) => (
                  <Line key={n} name="star" size={15} />
                ))}
              </span>
            )}
            <span className="text-[13px] font-medium">{t.author}</span>
          </div>
        </Rise>
      </div>
    </Slide>
  );
}

/**
 * WHAT IT COSTS.
 *
 * James, 4 Sep: the fee gets a page of its own. The agreed source deck showed
 * a landlord a fourteen-row service comparison with no price anywhere on it,
 * which does not read as discretion — it reads as something being held back,
 * and it leaves them doing sums instead of listening.
 *
 * So: the headline first and large, the levels under it, and then what is NOT
 * included. The exclusions are the reason to trust the headline. A fee page
 * that only lists what you get is the one a landlord re-reads later feeling
 * misled, and every deck before this one on the "straight about the fee"
 * promise has to actually be straight about the fee.
 */
export function Fees({ deck, show }: { deck: Deck; show: boolean }) {
  const f = deck.fees;
  if (!f || (!f.rows.length && !f.headline)) return null;

  return (
    <section
      data-slide="fees"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <Rise show={show} i={0}>
            <Eyebrow>What it costs</Eyebrow>
            {f.headline && (
              <h2
                className="mt-3 text-[38px] leading-[1.02] sm:text-[58px]"
                style={{ fontFamily: DISPLAY }}
              >
                {f.headline}
              </h2>
            )}
            {f.headlineFor && (
              <p className="mt-2 text-[15px] font-light text-black/55">
                on {f.headlineFor}. Everything below is what that includes, and what it does not.
              </p>
            )}
            <span className="mt-6 block h-[3px] w-[34px] rounded-full" style={{ background: RED }} />
          </Rise>

          {f.rows.length > 0 && (
            <Rise show={show} i={1}>
              <ul className="mt-8 divide-y divide-black/8 border-y border-black/8">
                {f.rows.map((r) => (
                  <li key={r.label} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">{r.label}</span>
                      {r.note && (
                        <span className="block text-[12px] font-light text-black/50">{r.note}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[16px] font-medium" style={{ color: RED }}>
                      {r.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </Rise>
          )}

          {f.excluded.length > 0 && (
            <Rise show={show} i={2}>
              <div className="mt-7">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  Not included
                </h3>
                <ul className="mt-3 grid gap-x-12 gap-y-1.5 sm:grid-cols-2">
                  {f.excluded.map((e) => (
                    <li key={e} className="flex items-start gap-2.5">
                      <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-black/30" />
                      <span className="text-[12.5px] font-light leading-relaxed text-black/60">{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Rise>
          )}

          {f.note && (
            <Rise show={show} i={3}>
              <p className="mt-6 border-t border-black/10 pt-4 text-[12px] font-light leading-relaxed text-black/55">
                {f.note}
              </p>
            </Rise>
          )}
        </div>
      </div>
    </section>
  );
}
