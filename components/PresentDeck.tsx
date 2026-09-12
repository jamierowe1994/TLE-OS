"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_CHIPS,
  BANNER,
  BRING_ALONG,
  asStyle,
  deckKind,
  defaultBio,
  sectionLabel,
  VISIT_STEPS,
  WHY_TLE,
  initialsOf,
  money,
  type PresentDeck as Deck,
  type SectionId,
  type SlideId,
} from "@/lib/present";
import { NEXT_STEPS } from "@/lib/present-copy";
import { icsFor } from "@/lib/appraisal-email";

/**
 * The pre-appraisal deck, as the landlord sees it.
 *
 * ── The three rules the layout follows ──────────────────────────────────────
 *
 * 1. ONE SLIDE, ONE VIEWPORT, ONE MESSAGE. Nothing scrolls inside a slide on
 *    a phone; anything that won't fit is cut rather than shrunk. If a slide
 *    is trying to say two things, one of them is on the wrong slide.
 *
 * 2. THE PHONE IS THE REAL DEVICE. This arrives by email, the day before a
 *    visit, and gets opened standing in a kitchen. Desktop is the courtesy
 *    layout, not the other way round.
 *
 * 3. EVERY VALUE CAN BE MISSING, AND MISSING MUST LOOK DELIBERATE. No photo →
 *    a monogram, not a grey box. No bio → the contact details move up to fill
 *    the space. No appointment time → the slide talks about the visit instead
 *    of the clock. There is no state in here that renders as a broken gap.
 *
 * Full-viewport slides in a scroll-snap column: it is one CSS property rather
 * than a JS carousel, so the phone's own momentum, the scrollbar, and swipe
 * all work without being reimplemented — and the whole thing degrades to a
 * plain scrolling page if the snap never applies.
 */

import {
  BADGE,
  CLAY,
  CORAL,
  CREAM,
  DEEP,
  Emphasis,
  DISPLAY,
  Eyebrow,
  INK,
  Line,
  MIST,
  Mark,
  PAPER,
  RED,
  Rise,
  HAND,
  STEP_ICONS,
  CreamSlide,
  HandHead,
  PropertyDetail,
  Slide,
  TINTS,
  ACCENT_HEX,
  Art,
  DeckStyleCtx,
  useIsPhoto,
  themeVars,
  isCream,
  isDark,
  type IconName,
} from "@/components/present-kit";
import * as S from "@/components/PresentSlides";


/**
 * The entrance screen.
 *
 * Rebuilt 4 Sep from James's mock-up, which moves the opening off a
 * photograph and onto the OS's own house style: warm off-white, the Notioly
 * line, and the marker hand the rest of TLE-OS is set in.
 *
 * ── What the mock-up got right, and is worth writing down ──────────────────
 *
 * The old entrance argued with a photograph and a scrim. This one argues with
 * a drawing of somebody who has already stopped worrying about their rental,
 * which is the actual proposition. It also means the whole slide is OURS —
 * type, line and colour drawn by the same hand — rather than our type sitting
 * on top of a stock interior.
 *
 * ── Two departures from the mock-up ────────────────────────────────────────
 *
 *  • IT STAYS PERSONAL. The mock-up's copy is generic and the deck's third
 *    rule is not: a landlord opens this link because it is about their
 *    property, and a first screen that could have been sent to anybody throws
 *    that away on the one slide guaranteed to be read. So the address and who
 *    it was prepared for sit under the paragraph, quietly, in the mock-up's
 *    own type rather than as a badge bolted onto it.
 *
 *  • THE ILLUSTRATION IS DECORATIVE, AND SAYS SO. It carries no information,
 *    so it is aria-hidden and it is the first thing to go when the viewport
 *    cannot hold both columns. A phone gets the argument, not the artwork.
 */
function Welcome({ deck, show }: { deck: Deck; show: boolean }) {
  const { property, recipientName } = deck;
  const isPhoto = useIsPhoto();
  if (isPhoto) return <WelcomeHouse deck={deck} show={show} />;
  return (
    <section
      data-slide="welcome"
      className="relative flex min-h-full w-full shrink-0 flex-col justify-center px-6 pb-20 pt-20 sm:px-10 lg:px-14"
      style={{ background: CREAM, color: INK }}
    >
      <div className="mx-auto grid w-full max-w-[1340px] items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
        {/* ── the argument ── */}
        <div className="max-w-[720px]">
          <Rise show={show} i={0}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
              Welcome
            </span>
          </Rise>

          <Rise show={show} i={1}>
            {/* Set in the marker hand at a size the drawing can stand up to.
                clamp rather than breakpoints, and the ceiling is set by the
                LONGEST line rather than by what looks biggest: "from your
                property." is nineteen characters, and the first size that let
                it wrap to a fourth line pushed the three promises underneath
                the bottom bar on a laptop. The headline is the one thing here
                that must hold three lines at every width. */}
            <h1
              className="mt-4 leading-[1.04] tracking-[-0.015em]"
              style={{
                fontFamily: HAND,
                fontWeight: 700,
                fontSize: "clamp(34px, 4.35vw, 66px)",
              }}
            >
              Let&rsquo;s get
              <br />
              you <Emphasis show={show}>more</Emphasis>
              <br />
              from your property.
            </h1>
          </Rise>

          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[470px] text-[15.5px] font-light leading-[1.6] text-black/60">
              We&rsquo;re The Letting Experts. A local team with the tools, experience and market
              insight to help you get the most from your investment.
            </p>
          </Rise>

          {/* The personalisation the mock-up leaves out. Small, because it is
              a fact rather than a claim - but present, because it is the whole
              reason this link got opened. */}
          {(property.address || recipientName) && (
            <Rise show={show} i={3}>
              <p className="mt-3.5 text-[12.5px] font-light text-black/45">
                Prepared for{recipientName ? ` ${recipientName}` : " you"}
                {property.address && (
                  <>
                    {" · "}
                    <span className="font-normal text-black/70">{property.address}</span>
                  </>
                )}
              </p>
            </Rise>
          )}

          <Rise show={show} i={4}>
            <ul className="mt-8 grid grid-cols-3 gap-x-5 sm:gap-x-7">
              {BANNER.map((b, n) => (
                <li key={b.title}>
                  <span
                    className="flex h-[52px] w-[52px] items-center justify-center rounded-full sm:h-[58px] sm:w-[58px]"
                    style={{ background: TINTS[n % TINTS.length], color: INK }}
                  >
                    <Line name={b.icon} size={23} />
                  </span>
                  <span
                    className="mt-3.5 block text-[14px] font-semibold leading-snug sm:text-[15px]"
                    style={{ fontFamily: HAND }}
                  >
                    {b.title}
                  </span>
                  <span className="mt-1 block text-[12.5px] font-light leading-[1.5] text-black/50">
                    {b.body}
                  </span>
                </li>
              ))}
            </ul>
          </Rise>
        </div>

        {/* ── the drawing ──
            Hidden below lg rather than stacked. Stacked, it pushes the three
            promises off a phone screen, and the promises are the argument. */}
        <Rise show={show} i={2} className="relative hidden lg:block">
          <div className="relative">
            <Art
              slot="welcome"
              drawing="/brand/sitting-chair.png"
              className="ml-auto max-w-[620px]"
              photoClassName="!max-w-[420px]"
            />
            {/* The margin note is a DRAWN flourish - handwriting with a
                pen-stroke arrow, pointing into artwork. Over a photograph it
                is illegible and looks like a mistake, so the photographic
                style does without it. */}
            {!isPhoto && <Aside show={show} />}
          </div>
        </Rise>
      </div>
    </section>
  );
}

/**
 * The margin note, in the same hand as the headline.
 *
 * Positioned against the illustration rather than the column, so it always
 * lands in the artwork's empty top-right corner however the picture scales.
 * The arrow is drawn separately and points at the woman, not at the words —
 * it is her the note is about.
 */
/**
 * The welcome, house look. James, 12 Sep 2026, from his reference: the
 * heading in the grotesque with "more" underlined, the intro and the
 * "prepared for" line, the three promises along the foot with pink and
 * sage discs and hairlines between them; on the right the door photograph
 * in a rounded frame on a pink shape that runs off the top corner, a thin
 * brown stroke curling out of it, and a handwritten line underneath. Laid
 * out on the stage so it frames the same way at every window size.
 */
function WelcomeHouse({ deck, show }: { deck: Deck; show: boolean }) {
  const { property, recipientName } = deck;
  const { host, fit } = useStage();
  const fx = fit.staged;
  const SAGE_WASH = "#f1f4ec", SAGE_INK = "#56634a";
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  const body = (
    <>
      <header className="h-[60px]" />
      <div className={`relative z-[2] flex flex-1 flex-col justify-center ${fx ? "px-16 pb-16 pr-[700px]" : "px-6 pb-10 pt-4 sm:px-12"}`}>
        <div className="relative">
          <Rise show={show} i={0}>
            <Eyebrow>Welcome</Eyebrow>
          </Rise>
          <Rise show={show} i={1}>
            {/* Three lines, always: "from your property." must not wrap to a
                fourth, so it is held on one line and the size is set to fit
                the column at that width. */}
            <h1 className={`mt-5 leading-[1.04] ${fx ? "text-[62px]" : "text-[40px] sm:text-[56px]"}`} style={HEAD}>
              Let&rsquo;s get
              <br />
              you <Emphasis show={show}>more</Emphasis>
              <br />
              <span className={fx ? "whitespace-nowrap" : ""}>from your property.</span>
            </h1>
          </Rise>
          <Rise show={show} i={2}>
            <p className="mt-7 max-w-[560px] text-[17px] leading-[1.6] text-black/60">
              We&rsquo;re The Letting Experts. A local team with the tools, experience and market
              insight to help you get the most from your investment.
            </p>
          </Rise>
          {(property.address || recipientName) && (
            <Rise show={show} i={3}>
              <p className="mt-4 text-[13px] text-black/45">
                Prepared for{recipientName ? ` ${recipientName}` : " you"}
                {property.address && (
                  <>
                    {" · "}
                    <span className="text-black/70">{property.address}</span>
                  </>
                )}
              </p>
            </Rise>
          )}
          <Rise show={show} i={4}>
            <ul className={`mt-12 grid grid-cols-3 ${fx ? "max-w-[760px]" : ""}`}>
              {BANNER.map((b, n) => (
                <li key={b.title} className={`pr-6 ${n > 0 ? "border-l pl-6" : ""}`} style={{ borderColor: "rgba(59,59,60,0.14)" }}>
                  {/* Pink, sage, pink: the green sits in the middle of the row. */}
                  <span
                    className="flex h-[76px] w-[76px] items-center justify-center rounded-full"
                    style={n === 1 ? { background: SAGE_WASH, color: SAGE_INK } : { background: TINTS[0], color: INK }}
                  >
                    <Line name={b.icon} size={26} />
                  </span>
                  <span className="mt-5 block text-[17px] font-semibold leading-snug">{b.title}</span>
                  <span className="mt-1.5 block text-[13.5px] leading-[1.5] text-black/50">{b.body}</span>
                </li>
              ))}
            </ul>
          </Rise>
        </div>
      </div>

      {fx && (
        <>
          {/* THE SHAPE, running off the top-right corner of the stage. */}
          <div className="pointer-events-none absolute -right-[80px] -top-[60px] z-[1] h-[820px] w-[760px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
              <path d="M52 2C78 -2 100 10 100 34L100 86C96 98 84 102 70 100C48 96 30 88 20 72C8 54 6 30 18 16C26 6 40 4 52 2Z" fill="#fbeae6" />
            </svg>
          </div>
          {/* THE DOOR. A rounded frame, portrait, at the reference's proportions. */}
          <Rise show={show} i={2} className="absolute right-[64px] top-[112px] z-[2] w-[560px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/photo/welcome-door.webp" alt="" aria-hidden className="w-full rounded-[28px] object-cover shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]" style={{ aspectRatio: "560 / 580" }} />
          </Rise>
          {/* THE HANDWRITTEN LINE, under the photograph, with its own stroke. */}
          <Rise show={show} i={5} className="absolute right-[150px] top-[752px] z-[2] w-[300px]">
            <p className="text-[27px] leading-[1.1] text-black/70" style={{ fontFamily: "var(--font-shantell), cursive", transform: "rotate(-6deg)" }}>
              A smarter
              <br />
              <span className="ml-10">letting experience</span>
            </p>
            <svg viewBox="0 0 200 12" aria-hidden className="ml-12 mt-1 h-[12px] w-[200px]" style={{ transform: "rotate(-6deg)" }}>
              <path d="M2 8C50 2 120 2 198 6" fill="none" stroke="var(--p-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            </svg>
          </Rise>
        </>
      )}
    </>
  );
  return (
    <section
      ref={host}
      data-slide="welcome"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
  );
}


/**
 * Meet the agent, house look. James, 12 Sep 2026, from his reference: the
 * heading with the first name underlined, title and patch, the bio, a
 * brown call button with an outlined email beside it and a WhatsApp
 * circle, the testimonial card when the deck carries one, and the three
 * chips along the foot. On the right the portrait in a tall rounded frame
 * on a pink shape, a thin clay loop behind it, and two handwritten lines -
 * one over the photograph, one under it. On the stage, like the others.
 */
function AgentHouse({ deck, show }: { deck: Deck; show: boolean }) {
  const a = deck.agent;
  const { host, fit } = useStage();
  const fx = fit.staged;
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  const SCRIPT = { fontFamily: "var(--font-shantell), cursive" } as const;
  const first = a.firstName || "";
  const tel = a.phone.replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const paragraphs = (a.bio.trim() || defaultBio(first)).split(/\n{2,}/);
  const t = deck.testimonial;
  const body = (
    <>
      <header className={fx ? "h-[124px]" : "h-[60px]"} />
      <div className={`relative z-[2] flex flex-1 flex-col ${fx ? "justify-start px-16 pb-10 pr-[720px]" : "justify-center px-6 pb-10 pt-4 sm:px-12"}`}>
        <Rise show={show} i={0}>
          <Eyebrow>Who you&rsquo;ll be meeting</Eyebrow>
        </Rise>
        <Rise show={show} i={1}>
          <h2 className={`mt-4 leading-[1.04] ${fx ? "text-[62px]" : "text-[36px] sm:text-[50px]"}`} style={HEAD}>
            You&rsquo;ll be dealing
            <br />
            with <Emphasis show={show}>{first || "us"}</Emphasis>.
          </h2>
          {(a.title || deck.property.postcode) && (
            <p className="mt-4 text-[15px] text-black/45">
              {a.title || "Lettings Expert"}
              {deck.property.postcode && (
                <>
                  {" · "}
                  <span style={{ color: "#c9847a" }}>{deck.property.postcode.split(" ")[0]}</span>
                </>
              )}
            </p>
          )}
        </Rise>
        <Rise show={show} i={2}>
          <div className="mt-6 max-w-[560px] space-y-4">
            {paragraphs.map((para, i) => (
              <p key={i} className="text-[15.5px] leading-[1.65] text-black/65">{para}</p>
            ))}
          </div>
        </Rise>
        <Rise show={show} i={3}>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {a.phone && (
              <a href={`tel:${tel}`} className="flex items-center gap-2.5 rounded-[12px] px-6 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "var(--p-accent)" }}>
                <Line name="phone" size={16} />
                Call {first || "us"}
              </a>
            )}
            {a.email && (
              <a href={`mailto:${a.email}`} className="flex items-center gap-2.5 rounded-[12px] border bg-white px-6 py-3.5 text-[14px] font-semibold transition-colors hover:border-black/40" style={{ borderColor: "rgba(59,59,60,0.2)" }}>
                <Line name="mail" size={16} />
                Email {first || "us"}
              </a>
            )}
            {a.phone && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-black/10" style={{ background: "#f1f4ec", color: "#56634a" }}>
                <Line name="whatsapp" size={18} />
              </a>
            )}
          </div>
        </Rise>
        {t?.quote && (
          <Rise show={show} i={4}>
            <div className="mt-6 flex max-w-[660px] items-start gap-5 rounded-[18px] px-6 py-5" style={{ background: TINTS[0] }}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[26px] leading-none" style={{ color: "var(--p-accent)", fontFamily: HAND }}>&ldquo;</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] leading-[1.6] text-black/75">&ldquo;{t.quote}&rdquo;</span>
                <span className="mt-2 block text-[12px] text-black/45">{t.author}</span>
              </span>
              {t.rating != null && (
                <span className="shrink-0 text-[15px] tracking-[0.15em]" style={{ color: "var(--p-accent)" }} aria-label={`${t.rating} out of 5`}>
                  {"★".repeat(Math.max(0, Math.min(5, Math.round(t.rating))))}
                </span>
              )}
            </div>
          </Rise>
        )}
        <Rise show={show} i={5}>
          <ul className="mt-8 grid max-w-[660px] grid-cols-3 border-t pt-6" style={{ borderColor: "rgba(59,59,60,0.14)" }}>
            {AGENT_CHIPS.map((c, i) => (
              <li key={c.title} className={`flex gap-3 pr-4 ${i > 0 ? "border-l pl-5" : ""}`} style={{ borderColor: "rgba(59,59,60,0.14)" }}>
                <span className="mt-0.5 shrink-0" style={{ color: "var(--p-accent)" }}>
                  <Line name={c.icon} size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold leading-snug">{c.title}</span>
                  <span className="mt-1 block text-[12.5px] leading-[1.5] text-black/50">{c.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Rise>
      </div>

      {fx && (
        <>
          {/* THE SHAPE, off the top and right edges, and the loop behind. */}
          <div className="pointer-events-none absolute -right-[40px] top-[20px] z-[1] h-[800px] w-[720px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
              {/* The line first, the shape over it: both ends of the loop
                  start inside the pink, so only the curve that swings out
                  past the bottom-left edge is seen - no loose ends. */}
              {/* Ends well inside the box, so the line is never cut by the
                  stage's edge at any scale. */}
              <path d="M30 30C8 40 -2 62 10 80C20 92 40 96 60 92" fill="none" stroke="#c9847a" strokeWidth="0.35" strokeLinecap="round" opacity="0.85" />
              <path d="M46 4C70 -2 96 8 100 30L100 72C98 90 86 100 66 100C46 100 30 92 20 78C6 60 0 40 12 22C20 10 32 8 46 4Z" fill="#fbeae6" />
            </svg>
          </div>
          {/* THE PORTRAIT: a tall rounded frame. Initials on sage when REX
              has no photograph, which is the same rule as the drawn look. */}
          {/* Wider than the reference's frame (James, 12 Sep 2026: "a bit
              thin... we're going to have to adjust based on the type of
              photo"). 500 x 680 gives a portrait, a head-and-shoulders or a
              landscape shot room to sit; object-cover crops whichever it is
              to the frame, keeping the top fifth in view for faces. */}
          <Rise show={show} i={2} className="absolute right-[150px] top-[96px] z-[2] w-[500px]">
            {a.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photo} alt={a.name} className="w-full rounded-[28px] object-cover object-[center_15%] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]" style={{ aspectRatio: "500 / 680" }} />
            ) : (
              <div className="flex w-full items-center justify-center rounded-[28px]" style={{ aspectRatio: "500 / 680", background: "#f1f4ec" }}>
                <span className="text-[120px] leading-none" style={{ fontFamily: HAND, fontWeight: 800, color: "#56634a" }}>{initialsOf(a.name)}</span>
              </div>
            )}
          </Rise>
          <Rise show={show} i={5} className="absolute right-[100px] top-[792px] z-[2] w-[220px]">
            <p className="text-[27px] leading-[1.1] text-black/70" style={{ ...SCRIPT, transform: "rotate(-6deg)" }}>
              Let&rsquo;s make
              <br />
              <span className="ml-8">a plan.</span>
            </p>
            <svg viewBox="0 0 160 12" aria-hidden className="ml-10 mt-1 h-[12px] w-[160px]" style={{ transform: "rotate(-6deg)" }}>
              <path d="M2 8C40 2 100 2 158 6" fill="none" stroke="var(--p-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            </svg>
          </Rise>
        </>
      )}
    </>
  );
  return (
    <section
      ref={host}
      data-slide="agent"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
  );
}

function Aside({ show }: { show: boolean }) {
  return (
    <div
      className="pointer-events-none absolute right-[2%] top-[6%] w-[190px] text-right"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(10px)",
        transition: "opacity 620ms ease-out 620ms, transform 620ms cubic-bezier(0.22,1,0.36,1) 620ms",
      }}
    >
      <p
        className="text-[16px] leading-[1.45] text-black/70"
        style={{ fontFamily: HAND, transform: "rotate(-3.5deg)" }}
      >
        Less stress.
        <br />
        More from
        <br />
        your investment.
      </p>
      <svg viewBox="0 0 60 46" aria-hidden className="mt-1 ml-auto mr-6 h-[42px] w-[54px]">
        <path
          d="M54 3C50 18 41 31 26 38"
          fill="none"
          stroke={CORAL}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <path
          d="M33 39.5L24.5 38.5L28.5 31"
          fill="none"
          stroke={CORAL}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Appointment({ deck, show }: { deck: Deck; show: boolean }) {
  /* The house look has its own composition (James, 12 Sep 2026, from his
     reference): the building on a pink shape, the four beats as a row of
     cards, a "nothing to prepare" band, and the details panel on the right.
     The drawn looks keep the slide they had. */
  const house = useIsPhoto();
  if (house) return <AppointmentHouse deck={deck} show={show} />;
  return <AppointmentDrawn deck={deck} show={show} />;
}

/** The facts on the right, and the calendar file — shared by both looks. */
function appointmentFacts(deck: Deck) {
  const { whenPretty, property, agent, minutes } = deck;
  const ics = deck.startsAt
    ? icsFor(
        {
          landlordName: deck.recipientName,
          address: property.address,
          whenPretty,
          startsAt: deck.startsAt,
          minutes,
          agentName: agent.name,
          agentPhone: agent.phone,
        },
        deck.createdAt
      )
    : null;
  const facts: { icon: IconName; label: string; value: string; soft?: boolean }[] = [
    {
      icon: "calendar",
      label: "When",
      value: whenPretty || `${agent.firstName || "Your agent"} will confirm a time with you directly`,
      soft: !whenPretty,
    },
    {
      icon: "pin",
      label: "Where",
      value: `${property.address}${property.postcode && !property.address.toUpperCase().includes(property.postcode.toUpperCase()) ? `, ${property.postcode}` : ""}`,
    },
    ...(agent.name
      ? [
          {
            icon: "person" as IconName,
            label: "Who",
            value: `${agent.name}${agent.title ? ` · ${agent.title}` : ""}`,
          },
        ]
      : []),
  ];
  return { ics, facts };
}

/**
 * A STAGE, NOT A FLUID PAGE. James, 12 Sep 2026: "make sure this doesn't
 * move too much when we scale the page... keep everything in the same
 * place and give sidebars, otherwise we lose the framing." From tablet
 * width up a house-look slide is laid out once, at 1440 x 900, and scaled
 * as one piece to fit the window - the ground fills the sides. Below that
 * width it stacks, because a phone cannot frame anything.
 */
function useStage() {
  const host = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<{ staged: boolean; scale: number }>({ staged: false, scale: 1 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const staged = w >= 1024;
      setFit({ staged, scale: staged ? Math.min(w / 1440, h / 900) : 1 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { host, fit };
}

/** The stage wrapper: absolute, so its 900px never sets the slide's height. */
function Stage({ fit, children }: { fit: { staged: boolean; scale: number }; children: React.ReactNode }) {
  return fit.staged ? (
    /* `zoom`, not a transform. A transform scales a rasterised layer, and
       the Rise wrappers are composited layers, so at any scale but 1 every
       word went soft - James, 12 Sep 2026: "the whole deck seems a bit
       blurry". Zoom lays the stage out again at the new size, so text and
       edges are drawn crisp; the centring translate is unaffected. */
    <div
      className="absolute left-1/2 top-1/2 flex h-[900px] w-[1440px] -translate-x-1/2 -translate-y-1/2 flex-col"
      style={{ zoom: fit.scale }}
    >
      {children}
    </div>
  ) : (
    <div className="relative flex min-h-full w-full flex-col">{children}</div>
  );
}

function AppointmentHouse({ deck, show }: { deck: Deck; show: boolean }) {
  const { minutes } = deck;
  const { ics, facts } = appointmentFacts(deck);
  /* Sage, the one pop of green on the slide: the icon discs and the ticks. */
  const SAGE = "#b3bea5", SAGE_WASH = "#f1f4ec", SAGE_INK = "#56634a";
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;

  const { host, fit } = useStage();
  const fx = fit.staged;

  const body = (
    <>
      {/* Taller than the other slides' spacer: the logo is fixed to the
          window, outside the stage, so on a small window (stage at 0.75)
          the eyebrow needs the extra room to clear it. */}
      <header className={fx ? "h-[124px]" : "h-[60px]"} />

      {/* THE BUILDING. Positioned against the stage: it runs under the
          panel's left edge and the panel cuts it off; the picture is
          cropped into its top corner; and a short mask at the foot fades
          it to nothing just before the cards - "a tight, small fade,
          really only towards the bottom" (James). */}
      {fx && (
        <Rise
          show={show}
          i={1}
          className="pointer-events-none absolute right-[320px] top-[60px] z-[1] h-[400px] w-[640px] overflow-hidden"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, #000 88%, rgba(0,0,0,0) 100%)",
            maskImage: "linear-gradient(to bottom, #000 88%, rgba(0,0,0,0) 100%)",
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
            <path d="M44 0C70 -4 96 8 100 30L100 100L22 100C6 94 -4 74 4 50C10 28 24 4 44 0Z" fill="#f6dcd7" />
          </svg>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/photo/appointment.webp" alt="" aria-hidden className="absolute left-[7%] -top-[2%] h-[134%] w-auto max-w-none" />
        </Rise>
      )}

      {/* Anchored from the top on the stage rather than centred, so the
          eyebrow always clears the fixed logo whatever the window's shape. */}
      <div className={`relative z-[2] flex flex-1 flex-col ${fx ? "justify-start pl-16 pr-[500px] pb-8 pt-2" : "justify-center px-6 pb-10 pt-4 sm:px-12"}`}>
        <div className="relative w-full">
          <div className="relative max-w-[500px]">
            <Rise show={show} i={0}>
              <Eyebrow>What happens on the day</Eyebrow>
            </Rise>
            <Rise show={show} i={1}>
              <h2 className={`mt-4 leading-[1.06] ${fx ? "text-[48px]" : "text-[34px] sm:text-[44px]"}`} style={HEAD}>
                <span className="block">About {minutes} minutes,</span>
                <span className="block">and you&rsquo;ll know</span>
                <span className="block whitespace-nowrap">
                  what it <Emphasis show={show}>lets</Emphasis> for.
                </span>
              </h2>
            </Rise>
            {/* The intro line is gone (James, 12 Sep 2026) but its space is
                kept, so the cards stay exactly where they were. */}
            <p aria-hidden className="invisible mt-5 max-w-[440px] text-[15px] leading-relaxed">
              We&rsquo;ll walk you through the property, take a few key details and handle the
              rest. No prep stress. No jargon. Just clear advice from people who do this every day.
            </p>
          </div>

          {/* THE FOUR BEATS, as cards in a row with arrows between. On the
              stage they are always four across - that is the framing. */}
          <ol className={`relative grid gap-5 ${fx ? "mt-10 grid-cols-4" : "mt-12 sm:grid-cols-2"}`}>
            {VISIT_STEPS.map((st, i) => (
              <li key={st.title} className="relative">
                <Rise show={show} i={3 + i} className="h-full">
                  <div className="relative flex h-full flex-col rounded-[18px] border bg-white p-6 pt-7 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.25)]" style={{ borderColor: "rgba(59,59,60,0.1)" }}>
                    <span
                      className="absolute -left-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
                      style={{ background: "var(--p-accent)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="ml-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                      <Line name={STEP_ICONS[i]} size={22} />
                    </span>
                    <h3 className="mt-4 text-[17px] leading-tight" style={HEAD}>{st.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-black/55">{st.body}</p>
                  </div>
                </Rise>
                {fx && i < VISIT_STEPS.length - 1 && (
                  <span aria-hidden className="absolute -right-[17px] top-1/2 z-[1] -translate-y-1/2 text-[16px]" style={{ color: "var(--p-accent)" }}>
                    &rarr;
                  </span>
                )}
              </li>
            ))}
          </ol>

          {/* NOTHING TO PREPARE. One band, the pink wash, so the four cards
              above it read as the thing to know and this as the reassurance. */}
          <Rise show={show} i={7}>
            <div className={`flex flex-col gap-4 rounded-[18px] px-6 py-5 sm:flex-row sm:items-center ${fx ? "mt-5" : "mt-6"}`} style={{ background: TINTS[0] }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white" style={{ background: SAGE }}>
                <Line name="check" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">You don&rsquo;t need to prepare anything</span>
                <span className="mt-0.5 block text-[12.5px] text-black/55">Just make sure we can get in, and have any paperwork to hand if you already have it.</span>
              </span>
              <span className="hidden text-[12.5px] leading-snug text-black/50 sm:block sm:max-w-[240px] sm:border-l sm:pl-4" style={{ fontFamily: DISPLAY, fontStyle: "italic", borderColor: "rgba(59,59,60,0.14)" }}>
                None of it is essential. If you haven&rsquo;t got it, we&rsquo;ll sort it afterwards.
              </span>
            </div>
          </Rise>
        </div>
      </div>

      {/* THE PANEL. Full height on the right of the stage, flush to its
          edge; stacked and rounded below tablet width. */}
      {/* Short of the top and the foot, with a margin on the right too, so it
          sits inside the page rather than being the page's edge (James, 12 Sep
          2026): its top lines up with the logo, its foot with the band. */}
      <Rise show={show} i={2} className={fx ? "absolute bottom-[32px] right-[40px] top-[36px] z-[3] w-[420px]" : "z-[3] px-6 pb-10 sm:px-12"}>
        <aside
          className={fx ? "flex h-full flex-col justify-center rounded-[22px] px-12 py-10" : "rounded-[18px] p-6 sm:p-8"}
          style={{ background: "var(--p-panel)", color: INK }}
        >
          <ul>
            {facts.map((f) => (
              <li key={f.label} className="flex gap-4 border-b py-4 first:pt-0 last:border-b-0" style={{ borderColor: "rgba(59,59,60,0.12)" }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: "var(--p-accent)" }}>
                  <Line name={f.icon} size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">{f.label}</span>
                  <span className={`mt-1 block leading-snug ${f.soft ? "text-[13px] text-black/65" : "text-[15.5px] font-medium"}`}>{f.value}</span>
                </span>
              </li>
            ))}
          </ul>
          {ics && (
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
              download="market-appraisal.ics"
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-[12px] px-5 py-3.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--p-accent)" }}
            >
              <Line name="calendar" size={16} />
              Add it to my calendar
            </a>
          )}
          <span className="mt-7 block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">Handy to have out</span>
          <ul className="mt-3 space-y-2.5">
            {BRING_ALONG.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[13.5px] leading-snug text-black/75">
                <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: SAGE }}>
                  <Line name="check" size={12} />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12.5px] leading-relaxed text-black/50" style={{ fontFamily: DISPLAY, fontStyle: "italic" }}>
            None of it is essential. If you haven&rsquo;t got it, we&rsquo;ll sort it afterwards.
          </p>
        </aside>
      </Rise>
    </>
  );

  return (
    <section
      ref={host}
      data-slide="appointment"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
  );
}

function AppointmentDrawn({ deck, show }: { deck: Deck; show: boolean }) {
  const { whenPretty, property, agent, minutes } = deck;

  /**
   * The calendar file, built in the browser as a data: URI. No round trip, no
   * endpoint to secure, and it works on the plane — which matters because the
   * single most useful thing this slide does is put the visit in their diary
   * before they put the phone down.
   */
  const ics = deck.startsAt
    ? icsFor(
        {
          landlordName: deck.recipientName,
          address: property.address,
          whenPretty,
          startsAt: deck.startsAt,
          minutes,
          agentName: agent.name,
          agentPhone: agent.phone,
        },
        deck.createdAt
      )
    : null;

  /** WHEN / WHERE / WHO. Built as data so the empty rules live in one place:
   *  a row with nothing to say is dropped, never printed as a dash. */
  const facts: { icon: IconName; label: string; value: string; soft?: boolean }[] = [
    {
      icon: "calendar",
      label: "When",
      // No time in the diary yet. Said plainly rather than left blank — a
      // landlord reading "—" assumes the system is broken; this tells them
      // what happens next instead.
      value: whenPretty || `${agent.firstName || "Your agent"} will confirm a time with you directly`,
      soft: !whenPretty,
    },
    {
      icon: "pin",
      label: "Where",
      value: `${property.address}${property.postcode ? `, ${property.postcode}` : ""}`,
    },
    ...(agent.name
      ? [
          {
            icon: "person" as IconName,
            label: "Who",
            value: `${agent.name}${agent.title ? ` · ${agent.title}` : ""}`,
          },
        ]
      : []),
  ];

  return (
    <section
      data-slide="appointment"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-20"
      style={{ background: PAPER, color: INK }}
    >
      {/* The mark used to sit here, in this slide's own header. It is chrome
          now — fixed top left for the whole deck — so all that is left is the
          space it stood in, which the headline still wants. */}
      <header className="h-[52px] sm:h-[60px]" />

      {/* THE RIGHT PADDING IS LOAD-BEARING, not spacing taste.

          The panel below is absolutely positioned so it can run the full
          height of the slide, which takes it out of the grid - and the moment
          it did, the left column stretched underneath it and the last words of
          two of the four beats ("...to win the instruction", "...we'll tell
          you which") were printed under pink. Nothing may collide.

          So the text column is stopped short by hand: 400px of panel, 192px of
          gutter beyond it, and room to breathe between the two. On lg the grid
          is ONE column for the same reason - a reserved 400px track for a
          child that is no longer in flow would narrow the text twice over.

          THE 192px GUTTER IS MEASURED, not chosen. The contents rail is fixed
          32px from the right and runs 156px wide, so its labels reach 188px in
          - at the 96px this started on, "Welcome" printed on top of the pink.
          Because both are anchored to the right edge, 192 clears it at every
          viewport width rather than only at the one I happened to test. */}
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 lg:py-8 lg:pr-[616px]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-1 lg:gap-16">
          {/* ── left: the headline and the four beats ── */}
          <div className="min-w-0">
            <Rise show={show} i={0}>
              <Eyebrow>What happens on the day</Eyebrow>
            </Rise>

            <Rise show={show} i={1}>
              {/* Three lines, broken by hand rather than left to wrap. The
                  reference sets it this way and it reads better: each line is
                  a phrase, and the script word lands at the end where the eye
                  finishes. Block display on the spans so the breaks hold at
                  every width instead of reflowing on a narrow screen. */}
              <h2
                className="mt-4 text-[32px] leading-[1.14] sm:text-[50px]"
                style={{ fontFamily: DISPLAY }}
              >
                <span className="block">About {minutes} minutes,</span>
                <span className="block">and you&rsquo;ll know</span>
                <span className="block whitespace-nowrap">
                  {/* The last handwritten word in the deck, gone. It was drawn
                      letterforms filling in along a pen path, and it was the
                      one word on this slide nobody could read at a glance.
                      Emphasis instead: same face as the sentence around it,
                      coral, and the rule still draws itself in. */}
                  what it <Emphasis show={show}>lets</Emphasis> for
                </span>
              </h2>
            </Rise>

            {/* The four beats, ruled into quarters. The lines are drawn per
                cell rather than with a grid divider so they stop at the
                block's edge instead of running out into the margin. */}
            <ol className="mt-9 grid sm:grid-cols-2">
              {VISIT_STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className={[
                    "flex gap-4 py-5 sm:py-6",
                    i % 2 === 0 ? "sm:border-r sm:pr-8" : "sm:pl-8",
                    i < 2 ? "border-b" : "",
                    i > 0 ? "border-t sm:border-t-0" : "",
                  ].join(" ")}
                  style={{ borderColor: "rgba(59,59,60,0.12)" }}
                >
                  <Rise show={show} i={2 + i} className="shrink-0">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ background: BADGE, color: RED }}
                    >
                      <Line name={STEP_ICONS[i]} size={22} />
                    </span>
                  </Rise>
                  <Rise show={show} i={2 + i} className="min-w-0">
                    <span className="text-[12px] font-semibold" style={{ color: RED }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-1 text-[15px] font-semibold leading-snug">{s.title}</h3>
                    <p className="mt-1.5 text-[13px] font-light leading-relaxed text-black/55">
                      {s.body}
                    </p>
                  </Rise>
                </li>
              ))}
            </ol>
          </div>

          {/* ── right: the appointment itself ── */}
          {/* THE POSITIONING LIVES ON THE RISE WRAPPER, not on the card inside
              it, and that is not a style preference.

              .present-rise carries `will-change: transform`, which makes it a
              containing block for anything absolutely positioned inside it. So
              an `inset-y-0` card in here measured its "full height" against
              this 80px wrapper and landed as an 80px strip halfway down the
              slide. Positioning the wrapper instead makes the section the
              containing block, which is what full-height meant. */}
          <Rise
            show={show}
            i={3}
            className="lg:absolute lg:inset-y-0 lg:right-48 lg:w-[400px]"
          >
            {/* The card carries the red rather than accenting with it — the
                one block big enough to set the page's temperature.
                
                At HALF strength: full red was shouting, and at 50% over the
                paper it still reads unmistakably red while leaving the type
                black and the button somewhere to go. Squarer corners than the
                26px it started at, which suits the flatter colour. */}
            {/* FULL HEIGHT ON DESKTOP, top to bottom — James, 31 Aug. It was a
                rounded card floating in the middle of the right column with
                paper above and below it; run to both edges it stops being a
                box on the page and becomes the page's right-hand side.

                Square corners follow from that: a radius on an edge that
                touches nothing is decoration, and on an edge that touches the
                frame it reads as a mistake.

                It stops SHORT of the right edge rather than bleeding off it.
                The contents rail floats over every slide down that side, and a
                panel running underneath it would put dark nav labels on pink.
                Stacked and rounded as before on phones, where full-bleed
                colour behind a whole screen of text is oppressive. */}
            <aside
              className="rounded-[16px] p-6 sm:p-8 lg:flex lg:h-full lg:flex-col lg:justify-center lg:rounded-none lg:p-10"
              style={{ background: "var(--p-panel)", color: INK }}
            >
              <ul>
                {facts.map((f) => (
                  <li
                    key={f.label}
                    className="flex gap-4 border-b py-4 first:pt-0 last:border-b-0 last:pb-1"
                    style={{ borderColor: "rgba(59,59,60,0.16)" }}
                  >
                    {/* White discs on the half-red: the icons need to sit on
                        something lighter than the card, and white is the only
                        thing on this page that is. */}
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white"
                      style={{ color: RED }}
                    >
                      <Line name={f.icon} size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/50">
                        {f.label}
                      </span>
                      <span
                        className={`mt-1 block leading-snug ${
                          f.soft ? "text-[13px] font-light text-black/65" : "text-[15px] font-medium"
                        }`}
                      >
                        {f.value}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {ics && (
                <a
                  href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
                  download="market-appraisal.ics"
                  // Full-strength red now that the card is at half. It is the
                  // only saturated thing on the slide, which is exactly what
                  // you want of the one button on it.
                  className="mt-6 flex w-full items-center justify-center rounded-[12px] px-5 py-3.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: RED }}
                >
                  Add it to my calendar
                </a>
              )}

              <span className="mt-7 block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/50">
                Handy to have out
              </span>
              <ul className="mt-3 space-y-2.5">
                {BRING_ALONG.map((b) => (
                  <li key={b} className="flex gap-2.5 text-[13px] font-light leading-snug text-black/75">
                    <span className="mt-[1px] shrink-0 text-white">
                      <Line name="check" size={16} />
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <p
                className="mt-5 text-[12.5px] leading-relaxed text-black/55"
                style={{ fontFamily: DISPLAY, fontStyle: "italic" }}
              >
                None of it is essential. If you haven&rsquo;t got it, we&rsquo;ll sort it afterwards.
              </p>
            </aside>
          </Rise>
        </div>
      </div>

      {/* THE THREE PROMISES USED TO REPEAT HERE and James took them off on
          31 Aug. They open the deck on the welcome slide, where they are the
          pitch; saying them again under the appointment made this slide about
          us at the moment it is supposed to be about the landlord's Tuesday
          afternoon. Still on the welcome slide, once, which is where a promise
          keeps its force. */}
    </section>
  );
}

/**
 * Who you will be meeting.
 *
 * The third slide in the cream style, and the first one where the style has to
 * carry a PHOTOGRAPH rather than a drawing. The entrance and the agenda are
 * both ink and line; a headshot dropped onto cream between them would read as
 * a passport photo stapled to a sketchbook.
 *
 * The answer is the blob. The entrance illustration sits on a soft pink
 * organic shape, and putting the portrait on the same shape — overlapping it,
 * not centred in it — makes the photograph part of the drawing rather than an
 * object placed on top of it. Same trick the artwork already uses, applied to
 * something that is not artwork.
 *
 * ── What survives from the red version ─────────────────────────────────────
 *
 * Every empty rule, because none of them was cosmetic. Four of the fourteen
 * TLE people have no photo on their REX record, nobody on the account has
 * written a bio, half have no job title, and the welcome video is usually
 * absent. All four still have to look deliberate.
 */
function Agent({ deck, show }: { deck: Deck; show: boolean }) {
  /* The house look has no blob behind the portrait (James, 12 Sep 2026). */
  const isPhoto = useIsPhoto();
  if (isPhoto) return <AgentHouse deck={deck} show={show} />;
  const a = deck.agent;
  const video = deck.welcomeVideo ?? null;
  const tel = a.phone.replace(/\s+/g, "");
  /** wa.me wants an international number with no punctuation. UK mobiles are
   *  stored as 07…, so the leading zero becomes 44. */
  const wa = /^0\d{10}$/.test(tel) ? `44${tel.slice(1)}` : null;
  const first = a.firstName || "";

  /* Their own words when they've written them; otherwise a real introduction
     rather than a placeholder - see defaultBio, and note that nobody on the
     REX account has a bio, so this is the usual case. */
  const paragraphs = (a.bio.trim() || defaultBio(first)).split(/\n{2,}/);

  const OUTLINE =
    "flex items-center gap-2 rounded-full border px-4.5 py-2.5 text-[13px] font-medium transition-colors hover:border-black/35";

  return (
    <CreamSlide id="agent">
      {/* Indented on wide screens, James 4 Sep. Flush to the left margin the
          column sat against the edge of the page with a lake of cream between
          it and the portrait; pushing it in closes the gap and gives the two
          halves something to sit between rather than at either end of. */}
      <div className="mx-auto grid w-full max-w-[1300px] items-center gap-10 lg:grid-cols-[1fr_0.82fr] lg:gap-16 lg:pl-16 xl:pl-24">
        <div className="max-w-[620px]">
          <HandHead eyebrow="Who you&rsquo;ll be meeting" show={show} lines={2}>
            {first ? (
              <>
                You&rsquo;ll be dealing
                <br />
                with <Emphasis show={show}>{first}</Emphasis>
              </>
            ) : (
              <>
                One person,
                <br />
                <Emphasis show={show}>start to finish</Emphasis>
              </>
            )}
          </HandHead>

          {(a.name || a.title) && (
            <Rise show={show} i={2}>
              <p className="mt-5 text-[13.5px] font-light text-black/45 sm:mt-6">
                {a.name}
                {a.name && a.title ? " · " : ""}
                <span className={a.name ? "" : "text-black/70"}>{a.title}</span>
              </p>
            </Rise>
          )}

          <Rise show={show} i={3}>
            {/* ONE MEASURE FOR THE WHOLE COLUMN. The bio ran to 520 and the
                row of three to 620, so their right edges missed each other by
                a hundred pixels and the column read as two columns that had
                slipped. James, 7 Sep: "we need to make sure everything
                aligns."

                620 AND NOT LESS, and the row of three is what sets it: three
                columns need about 150px of text each to hold their body copy
                to two lines, and below that "Honest guidance at every step"
                breaks to three while the other two stay at two - ragged in
                exactly the way the one-line titles were fixed to avoid. The
                bio takes the wider measure and a little more leading with it. */}
            <div className="mt-6 max-w-[620px] space-y-4 sm:mt-7">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-[14.5px] font-light leading-[1.72] text-black/65">
                  {p}
                </p>
              ))}
            </div>
          </Rise>

          {/* The agent's own welcome, if they recorded one. Only ever rendered
              when it is genuinely playable: a recording still processing shows
              NOTHING, because a landlord has no idea a video was coming and an
              empty player can only read as something broken. */}
          {video?.status === "ready" && video.embedUrl && (
            <Rise show={show} i={4}>
              <div className="mt-7 max-w-[440px] overflow-hidden rounded-[18px]">
                <iframe
                  src={`${video.embedUrl}?theme=light&accent=${ACCENT_HEX[asStyle(deck.style)].replace("#", "")}`}
                  allow="autoplay; fullscreen; picture-in-picture"
                  className="w-full border-0"
                  style={{ aspectRatio: "16 / 9" }}
                  title={`Welcome from ${a.name}`}
                />
              </div>
            </Rise>
          )}

          <Rise show={show} i={5}>
            {/* THE ROW OF THREE, given room. James, 7 Sep: "the buttons are
                too close together", and the whole column wanted stretching -
                a headshot 460px tall beside four blocks stacked at 24px
                intervals left the type looking crammed into the top half of
                its own half of the slide. */}
            {/* The extra room is a DESKTOP stretch. On a phone this slide is
                already taller than the screen and scrolls inside itself, so
                the same margins there would only push the row of three further
                out of sight. */}
            <div className="mt-8 flex flex-wrap gap-3 sm:mt-10 sm:gap-3.5">
              {a.phone && (
                <a
                  href={`tel:${tel}`}
                  className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: CORAL }}
                >
                  <Line name="phone" size={16} />
                  Call {first || "them"}
                </a>
              )}
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className={OUTLINE}
                  style={{ borderColor: "rgba(59,59,60,0.18)" }}
                >
                  <Line name="whatsapp" size={16} />
                  WhatsApp
                </a>
              )}
              {a.email && (
                <a
                  href={`mailto:${a.email}`}
                  className={OUTLINE}
                  style={{ borderColor: "rgba(59,59,60,0.18)" }}
                >
                  <Line name="mail" size={16} />
                  Email
                </a>
              )}
            </div>
          </Rise>

          {/* Three promises about conduct, never statistics. Rules rather than
              a tinted panel: the dividing line does the separating a fill was
              doing, and without the fill they sit on the page as part of what
              the agent is saying rather than as a widget bolted underneath. */}
          <Rise show={show} i={6}>
            <div className="mt-8 grid max-w-[620px] gap-y-5 sm:mt-11 sm:grid-cols-3 sm:gap-x-0 sm:gap-y-6">
              {AGENT_CHIPS.map((c, i) => (
                <div
                  key={c.title}
                  className={`flex items-start gap-3 ${i === 0 ? "sm:pr-6" : "sm:border-l sm:pl-6 sm:pr-6"}`}
                  style={{ borderColor: "rgba(59,59,60,0.12)" }}
                >
                  <span className="mt-[1px] shrink-0" style={{ color: CORAL }}>
                    <Line name={c.icon} size={20} />
                  </span>
                  <span className="min-w-0">
                    {/* whitespace-nowrap holds the promise the copy makes: each
                        title is one line, so the three bodies start on the same
                        baseline and the row reads as one row. */}
                    <span
                      className="block whitespace-nowrap text-[14px] leading-snug"
                      style={{ fontFamily: HAND, fontWeight: 700 }}
                    >
                      {c.title}
                    </span>
                    <span className="mt-1.5 block text-[12.5px] font-light leading-[1.45] text-black/50">
                      {c.body}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Rise>
        </div>

        {/* ── the portrait ── */}
        <Rise show={show} i={2} className="relative hidden lg:block">
          <div className="relative mx-auto w-full max-w-[380px]">
            {/* The blob, borrowed from the entrance artwork. Deliberately
                bigger than the portrait and off-centre, so the photograph sits
                ON it rather than inside it. */}
            {/* preserveAspectRatio="none" on purpose. Uniform scaling made the
                path resolve to a near-circle inside the 4:5 box, which reads
                as a coloured disc rather than as a shape somebody drew. Let it
                distort to the container and it becomes a blob again. */}
            {!isPhoto && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
              className="absolute -left-[8%] -top-[6%] h-[112%] w-[112%]"
            >
              <path
                d="M52 4C74 2 96 18 98 42C100 66 88 84 66 93C44 102 20 96 8 78C-4 60 2 34 18 18C30 6 40 5 52 4Z"
                fill={TINTS[0]}
              />
            </svg>
            )}

            {a.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.photo}
                alt={a.name}
                className="relative w-full rounded-[26px] object-cover object-[center_18%]"
                style={{ aspectRatio: "4 / 5" }}
              />
            ) : (
              /* Four of the fourteen have no photo on their REX record
                 (measured). Initials in the marker hand on the blob reads as
                 a drawing; an empty rectangle reads as a fault. */
              <div
                className={`relative flex w-full items-center justify-center ${isPhoto ? "rounded-[26px]" : ""}`}
                style={{ aspectRatio: "4 / 5", ...(isPhoto ? { background: TINTS[1] } : {}) }}
              >
                <span
                  className="text-[86px] leading-none"
                  style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                >
                  {initialsOf(a.name)}
                </span>
              </div>
            )}
          </div>
        </Rise>
      </div>
    </CreamSlide>
  );
}


/**
 * What has let nearby, and the range it puts this property in.
 *
 * The one slide in this section where a NUMBER is the argument, so the number
 * is the headline - set in the marker hand at the size the address gets on the
 * divider, rather than as a figure introduced by a heading. A landlord opened
 * this deck for a rent; when we finally have one to show them it should not be
 * the second thing on the page.
 *
 * The evidence sits underneath it, and it has to: a range with no working
 * shown is a guess with a serif on it. Every row is a real property we let,
 * with what it asked and how long it took - and, where our book has them, the
 * photographs behind a click. James, 4 Sep: a row that is only an address and
 * a number is not something a landlord can weigh against their own house.
 *
 * Gated at three rows in slidesFor - below that the slide argues AGAINST us,
 * because a landlord counting two properties concludes we do not know their
 * street and re-reads everything else with that in mind.
 */
function Comparables({ deck, show }: { deck: Deck; show: boolean }) {
  const c = deck.comparables;
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (!c) return null;
  const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
  const shown = c.rows.slice(0, 6);
  const galleryOf = (r: (typeof shown)[number]) =>
    (r.photos?.length ? r.photos : r.image ? [r.image] : []).filter(Boolean) as string[];
  const active = openAt != null ? shown[openAt] : null;

  return (
    <CreamSlide id="comparables">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="max-w-[680px]">
          <Rise show={show} i={0}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
              What&rsquo;s letting nearby
            </span>
          </Rise>
          <Rise show={show} i={1}>
            <h2
              className="mt-4 leading-[1.02] tracking-[-0.015em]"
              style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(32px, 3.8vw, 54px)" }}
            >
              <span style={{ color: CORAL }}>
                {money(c.guideLow)}&ndash;{money(c.guideHigh)}
              </span>
              <span className="text-[0.42em] font-normal text-black/45"> pcm</span>
            </h2>
          </Rise>
          <Rise show={show} i={2}>
            <p className="mt-4 max-w-[540px] text-[15px] font-light leading-[1.6] text-black/55">
              Based on {c.basedOn} propert{c.basedOn === 1 ? "y" : "ies"} we are letting near you.
              Tap any of them to see it. We&rsquo;ll land on the figure together on the day.
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
                  key={`${r.name}-${r.rent}`}
                  style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.07)" }}
                >
                  <button
                    type="button"
                    disabled={!openable}
                    onClick={() => setOpenAt(n)}
                    className="flex w-full items-center gap-4 py-2 text-left disabled:cursor-default"
                  >
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image}
                        alt=""
                        aria-hidden
                        className="h-[42px] w-[58px] shrink-0 rounded-[7px] object-cover"
                      />
                    ) : (
                      <span
                        className="h-[42px] w-[58px] shrink-0 rounded-[7px]"
                        style={{ background: TINTS[0] }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[15px] leading-snug sm:text-[16px]"
                        style={{ fontFamily: HAND, fontWeight: 700 }}
                      >
                        {r.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] font-light text-black/45">
                        {[r.locality, r.beds != null ? `${r.beds} bed` : null, r.type]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4">
                      {r.days != null && (
                        <span className="hidden text-[12.5px] font-light text-black/45 sm:inline">
                          {r.letAgreed ? `let in ${r.days} days` : `${r.days} days`}
                        </span>
                      )}
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

        {c.caveat && (
          <Rise show={show} i={4}>
            <p className="mt-5 max-w-[640px] text-[12.5px] font-light leading-relaxed text-black/45">
              {c.caveat}
            </p>
          </Rise>
        )}
      </div>

      <PropertyDetail
        open={active != null}
        onClose={() => setOpenAt(null)}
        title={active?.name ?? ""}
        locality={active?.locality ?? ""}
        rent={active?.rent ?? ""}
        photos={active ? galleryOf(active) : []}
        facts={
          active
            ? ([
                active.beds != null ? { label: "Bedrooms", value: String(active.beds) } : null,
                active.type ? { label: "Type", value: active.type } : null,
                { label: "Status", value: active.letAgreed ? "Let agreed" : "Advertised" },
                active.days != null
                  ? {
                      label: active.letAgreed ? "Took to let" : "Advertised",
                      value: `${active.days} days`,
                    }
                  : null,
                { label: "With", value: "The Letting Experts" },
              ].filter(Boolean) as { label: string; value: string }[])
            : []
        }
      />
    </CreamSlide>
  );
}

/**
 * The local market, for the landlord.
 *
 * ── Why this is not the agent's screen with nicer fonts ────────────────────
 *
 * The Market step in the builder shows an agent everything: five blocks, every
 * sample size, every caveat, two scopes to switch between. That is right for
 * somebody deciding what to say. It is wrong for the person being spoken to -
 * a landlord handed twenty numbers reads none of them.
 *
 * So only the ticked blocks appear, each is a sentence with a figure in it
 * rather than a chart to interpret, and the bars carry counts rather than an
 * axis. What survives is what the agent chose to argue with. Everything is a
 * frozen snapshot from `deck.market` - see PresentMarket in lib/present.
 *
 * ── Converted to cream, and shorter by 146px ───────────────────────────────
 *
 * It was the tallest data slide in the deck and overflowed a 720px laptop, so
 * the conversion was also a trim: the pace figures moved up beside the
 * headline rather than sitting in their own band under it, and the bar rows
 * lost two pixels each. Nothing was removed - a slide that argues from
 * evidence cannot answer being too long by showing less of it.
 */
function Market({ deck, show }: { deck: Deck; show: boolean }) {
  const m = deck.market;
  if (!m) return null;
  const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
  const pct = (n: number) => (m.advertised > 0 ? Math.round((n / m.advertised) * 100) : 0);

  /* One bar row. Width is a share of the biggest bar in its own group, so a
     group of small numbers still reads - but a genuine zero draws nothing
     rather than a stub, because a stub reads as "a few". */
  const Row = ({
    label,
    n,
    max,
    right,
    wide,
  }: {
    label: string;
    n: number;
    max: number;
    right?: string;
    /** Agency names need the room; band and size labels do not. */
    wide?: boolean;
  }) => (
    <li className="flex items-center gap-2.5 py-[2px]">
      <span
        /* Wide enough for "Over 3 months" and "Under 2 weeks" to survive at
           12px - measured, they were clipping on the slide a landlord reads.
           Agency names get more still and truncate anyway. */
        className={`${wide ? "w-[152px]" : "w-[104px]"} shrink-0 truncate text-[12px] font-light text-black/55`}
      >
        {label}
      </span>
      <span className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-black/[0.07]">
        {/* Coral, and softened. At full strength twelve of these read as a
            warning panel rather than a market - the bar's job is to carry the
            eye down a column, and length already does that. */}
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: max > 0 && n > 0 ? `${Math.max((n / max) * 100, 3)}%` : "0%",
            background: CORAL,
            opacity: 0.75,
          }}
        />
      </span>
      <span
        className="w-[56px] shrink-0 text-right text-[12.5px]"
        style={{ fontFamily: HAND, fontWeight: 700 }}
      >
        {right ?? n}
      </span>
    </li>
  );

  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-black/35">
        {title}
      </p>
      <ul className="mt-1.5 border-t border-black/8 pt-1">{children}</ul>
    </div>
  );

  const bandMax = Math.max(1, ...(m.bands ?? []).map((b) => b.n));
  const bedMax = Math.max(1, ...(m.rentByBed ?? []).map((b) => b.n));
  const agentMax = Math.max(1, ...(m.agents ?? []).map((a) => a.n));

  return (
    <CreamSlide id="market">
      <div className="mx-auto w-full max-w-[1180px]">
        {/* Headline LEFT, pace RIGHT. They used to stack, which cost 90px of
            height on the tallest slide in the deck for two figures that are
            each one line of type. */}
        <div className="grid items-end gap-x-14 gap-y-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Rise show={show} i={0}>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
                Your local market
              </span>
            </Rise>
            <Rise show={show} i={1}>
              <h2
                className="mt-4 leading-[1.04] tracking-[-0.015em]"
                style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(30px, 3.6vw, 50px)" }}
              >
                <span style={{ color: CORAL }}>{m.advertised} to let</span> in {m.area}
              </h2>
            </Rise>
            <Rise show={show} i={2}>
              <p className="mt-3 max-w-[440px] text-[14.5px] font-light leading-[1.6] text-black/55">
                {m.medianRent
                  ? `The middle asking rent here is ${money(m.medianRent)} pcm.`
                  : "Advertised right now, across every size."}
                {m.reduced != null && m.reduced > 0 && (
                  <> {m.reduced} of them have already cut their asking rent.</>
                )}
              </p>
            </Rise>
          </div>

          {/* The two figures are deliberately given different words - "has been
              advertised" against "took to let" - because they are different
              measurements, and a landlord who works that out unaided later
              stops believing the rest of the deck. */}
          {(m.marketDays != null || m.ourDays != null) && (
            <Rise show={show} i={2}>
              <div className="grid gap-5 sm:grid-cols-2">
                {m.marketDays != null && (
                  <div className="border-t border-black/10 pt-3">
                    <p className="text-[26px] leading-none" style={{ fontFamily: HAND, fontWeight: 700 }}>
                      {m.marketDays} days
                    </p>
                    <p className="mt-1.5 text-[12px] font-light leading-snug text-black/50">
                      How long the average property on the market in {m.area} has been advertised.
                    </p>
                  </div>
                )}
                {m.ourDays != null && (
                  <div className="border-t pt-3" style={{ borderColor: CORAL }}>
                    <p
                      className="text-[26px] leading-none"
                      style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}
                    >
                      {m.ourDays} days
                    </p>
                    <p className="mt-1.5 text-[12px] font-light leading-snug text-black/50">
                      How long our last {m.ourLets} lets round here actually took, start to finish.
                    </p>
                  </div>
                )}
              </div>
            </Rise>
          )}
        </div>

        {/* TWO COLUMNS, because one was too tall to be a slide. Measured at
            1280x720 with all five blocks ticked: a single column ran to 1140px
            and a landlord on a laptop lost the competition chart and the date
            off the bottom. Stacked on phones, where vertical space is
            expected. */}
        <Rise show={show} i={3}>
          <div className="mt-7 grid gap-x-12 gap-y-5 sm:grid-cols-2">
            {m.bands && m.bands.length > 0 && (
              <Block title="How long it has been on the market">
                {m.bands.map((b) => (
                  <Row key={b.label} label={b.label} n={b.n} max={bandMax} right={`${pct(b.n)}%`} />
                ))}
              </Block>
            )}

            {m.rentByBed && m.rentByBed.length > 0 && (
              <Block title="Asking rent by size">
                {m.rentByBed.map((b) => (
                  <Row
                    key={b.label}
                    label={b.label}
                    n={b.n}
                    max={bedMax}
                    right={b.rent ? money(b.rent) : "-"}
                  />
                ))}
              </Block>
            )}

            {m.mix && (
              <Block title="What is competing">
                <Row
                  label="Houses"
                  n={m.mix.houses}
                  max={Math.max(1, m.mix.houses, m.mix.flats)}
                  right={`${pct(m.mix.houses)}%`}
                />
                <Row
                  label="Flats"
                  n={m.mix.flats}
                  max={Math.max(1, m.mix.houses, m.mix.flats)}
                  right={`${pct(m.mix.flats)}%`}
                />
              </Block>
            )}

            {m.agents && m.agents.length > 0 && (
              <Block title={`Who is letting in ${m.area}`}>
                {/* Five is the cap on a slide. The panel shows six; the sixth
                    is always the smallest and costs a row of height the layout
                    does not have. */}
                {m.agents.slice(0, 5).map((a) => (
                  <Row key={a.agent} label={a.agent} n={a.n} max={agentMax} right={`${pct(a.n)}%`} wide />
                ))}
              </Block>
            )}
          </div>
        </Rise>

        <Rise show={show} i={4}>
          <p className="mt-5 text-[11px] font-light leading-relaxed text-black/40">
            Figures for {m.area} taken on{" "}
            {new Date(m.pulledAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            , from the live record of what is advertised. Withdrawn listings are not counted.
          </p>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * THE FIGURE, on its own slide.
 *
 * The one thing a landlord opens a post-appraisal deck for. It leads with the
 * rent at full size and the terms of it underneath, in that order and on one
 * screen - a landlord who has to hunt for the figure assumes it is being
 * hidden, and an agent who has to explain why it was not there has lost the
 * conversation before it started.
 *
 * Everything except the rent is optional and the slide reads without it. See
 * PresentValuation: an agent who agreed a rent and left the fee to the office
 * must still be able to send the figure, or they will send nothing.
 */
function Valuation({ deck, show }: { deck: Deck; show: boolean }) {
  const v = deck.valuation;
  if (!v?.rent) return null;
  const c = deck.comparables;
  const m = deck.market;

  /* Only the terms actually agreed. A row reading "Fee -" invites the
     question it fails to answer. */
  const terms = [
    v.serviceLevel ? { label: "Our service", value: v.serviceLevel } : null,
    v.feePct != null ? { label: "Management fee", value: `${v.feePct}% of rent` } : null,
    v.setupFee != null ? { label: "Set-up fee", value: `${money(v.setupFee)} one-off` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  /**
   * THE THREE FIGURES AROUND THE FIGURE.
   *
   * The slide was one number and three terms - 31% of a laptop screen,
   * measured, and the emptiest page in the deck. It is also the page a
   * landlord opened the whole thing for, so the answer is not decoration: it
   * is the context that makes one number mean something.
   *
   * Every one is either arithmetic on the agreed rent or a figure already
   * snapshotted onto the deck. Nothing is estimated, and nothing here is a
   * net-of-fee number - see feeOnRent for why VAT rules that out.
   *
   * The year figure carries its own condition in the label. "£15,600 a year"
   * on its own is a promise about occupancy nobody can make; "if it is let for
   * a full year" is the same arithmetic with the assumption said out loud.
   */
  const context = [
    { value: money(v.rent * 12), label: "a year, if it is let for a full year" },
    m?.medianRent
      ? {
          value: money(m.medianRent),
          label: `the middle asking rent in ${m.area}`,
        }
      : null,
    c && c.rows.length
      ? {
          value: String(c.basedOn || c.rows.length),
          label: "comparable lets nearby behind the figure",
        }
      : null,
  ].filter(Boolean) as { value: string; label: string }[];

  /**
   * THE WORKING, drawn.
   *
   * The comparables slide already lists the evidence; this puts the agreed
   * figure ON it, which is the one thing a landlord actually wants to check.
   *
   * The scale spans the evidence AND the rent rather than just the evidence,
   * because the agreed figure is genuinely sometimes above the range - a
   * better property than the ones that let, or a range built from mixed sizes.
   * A bar the marker fell off the end of would be worse than no bar: it would
   * look like a rendering fault rather than a number with a reason behind it,
   * and the reason belongs in the note the agent writes.
   */
  const band = c && c.guideLow && c.guideHigh ? { low: c.guideLow, high: c.guideHigh } : null;
  const lo = band ? Math.min(band.low, v.rent) : 0;
  const hi = band ? Math.max(band.high, v.rent) : 0;
  const pad = band ? Math.max(40, (hi - lo) * 0.12) : 0;
  const from = lo - pad;
  const span = hi + pad - from || 1;
  const at = (n: number) => `${((n - from) / span) * 100}%`;

  return (
    <CreamSlide id="valuation">
      <div className="mx-auto w-full max-w-[1040px]">
        <Rise show={show} i={0}>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
            What we&rsquo;d put it on at
          </span>
        </Rise>
        <Rise show={show} i={1}>
          <h2
            className="mt-4 leading-[1] tracking-[-0.015em]"
            style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(48px, 6.4vw, 96px)" }}
          >
            <span style={{ color: CORAL }}>{money(v.rent)}</span>
            <span className="text-[0.3em] font-normal text-black/45"> pcm</span>
          </h2>
        </Rise>

        <div className="mt-8 grid gap-x-14 gap-y-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            {context.length > 0 && (
              <Rise show={show} i={2}>
                <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-3">
                  {context.map((x) => (
                    <div key={x.label} className="border-t pt-3.5" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                      <dt className="text-[24px] leading-none" style={{ fontFamily: HAND, fontWeight: 700 }}>
                        {x.value}
                      </dt>
                      <dd className="mt-2 text-[12px] font-light leading-[1.45] text-black/50">
                        {x.label}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Rise>
            )}

            {terms.length > 0 && (
              <Rise show={show} i={3}>
                <dl className="mt-9 flex flex-wrap gap-x-14 gap-y-5 border-t border-black/10 pt-5">
                  {terms.map((t) => (
                    <div key={t.label}>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                        {t.label}
                      </dt>
                      <dd className="mt-1 text-[17px]" style={{ fontFamily: HAND, fontWeight: 700 }}>
                        {t.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Rise>
            )}
          </div>

          {band && (
            <Rise show={show} i={4}>
              <div className="rounded-2xl px-6 py-6" style={{ background: TINTS[0] }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  Where it sits against the evidence
                </p>
                <div className="relative mt-9 h-[3px] rounded-full" style={{ background: "rgba(0,0,0,0.12)" }}>
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{ left: at(band.low), right: `calc(100% - ${at(band.high)})`, background: "rgba(0,0,0,0.28)" }}
                  />
                  {/* The agreed figure, sitting on its own working. */}
                  <span
                    className="absolute -top-[5px] h-[13px] w-[13px] -translate-x-1/2 rounded-full"
                    style={{ left: at(v.rent), background: CORAL, boxShadow: "0 0 0 4px var(--p-tint)" }}
                  />
                  <span
                    className="absolute -top-[30px] -translate-x-1/2 whitespace-nowrap text-[13px]"
                    style={{ left: at(v.rent), fontFamily: HAND, fontWeight: 700, color: CORAL }}
                  >
                    {money(v.rent)}
                  </span>
                </div>
                <div className="mt-3.5 flex justify-between text-[11.5px] font-light text-black/45">
                  <span>{money(band.low)}</span>
                  <span>{money(band.high)}</span>
                </div>
                {/* WHERE IT SITS, said in words as well as drawn.
                    The marker genuinely lands outside the band sometimes - a
                    better property than the ones that let, or a range built
                    from mixed sizes - and a dot floating past the end of a bar
                    with no sentence next to it reads as a rendering fault
                    rather than as a figure with a reason. The reason itself is
                    the agent's note at the foot of the slide; this only states
                    the relationship, which is a fact rather than a defence. */}
                <p className="mt-4 text-[11.5px] font-light leading-[1.5] text-black/45">
                  The range that {c!.basedOn || c!.rows.length} comparable properties nearby actually let
                  at.{" "}
                  {v.rent > band.high
                    ? "Your figure sits above it."
                    : v.rent < band.low
                      ? "Your figure sits below it."
                      : "Your figure sits inside it."}
                  {c?.caveat ? ` ${c.caveat}` : ""}
                </p>
              </div>
            </Rise>
          )}
        </div>

        {v.note && (
          <Rise show={show} i={5}>
            <p className="mt-8 max-w-[720px] border-t border-black/10 pt-4 text-[13px] font-light leading-relaxed text-black/55">
              {v.note}
            </p>
          </Rise>
        )}
      </div>
    </CreamSlide>
  );
}

/**
 * The terms, and the button that signs them.
 *
 * `signUrl` is NULL until DocuSeal is connected, and that is the normal state
 * rather than a defect. The slide still renders - it says what happens next
 * and who to reply to - because a landlord reading "here is your figure" and
 * then nothing is worse than one reading "your agent will send the paperwork
 * over". What it must never do is show a button that goes nowhere: a dead
 * "Sign now" in front of a landlord is the one outcome worth avoiding.
 */
function Terms({ deck, show }: { deck: Deck; show: boolean }) {
  const t = deck.terms;
  if (!t) return null;
  const first = deck.agent.firstName || deck.agent.name;

  return (
    <CreamSlide id="terms">
      <div className="mx-auto w-full max-w-[1040px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow="Getting started" show={show} lines={2}>
            Ready when
            <br />
            <Emphasis show={show}>you are</Emphasis>
          </HandHead>
          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[560px] text-[15px] font-light leading-[1.65] text-black/60">
              {t.summary ??
                "The terms of business set out what we do, what it costs and how either of us can bring it to an end. Nothing starts until they are signed."}
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          {t.signUrl ? (
            <a
              href={t.signUrl}
              className="mt-7 inline-block rounded-full px-7 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CORAL }}
            >
              Read and sign the terms
            </a>
          ) : (
            /* No dead button. The sentence does the job the link would. */
            <p className="mt-7 max-w-[560px] text-[14px] font-light leading-relaxed text-black/65">
              {first} will send the terms of business across to sign electronically - it takes a
              couple of minutes and nothing needs printing. Reply to this and we&rsquo;ll get them
              straight over.
            </p>
          )}
        </Rise>

        <Rise show={show} i={4}>
          <ol className="mt-9 grid gap-x-12 gap-y-5 border-t border-black/10 pt-6 sm:grid-cols-3">
            {NEXT_STEPS.map((n, i) => (
              <li key={n.title} className="flex gap-4">
                <span
                  className="shrink-0 text-[22px] leading-none"
                  style={{ fontFamily: HAND, fontWeight: 700, color: CORAL, opacity: 0.32 }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span
                    className="block text-[14.5px] leading-snug"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {n.title}
                  </span>
                  <span className="mt-1.5 block text-[12.5px] font-light leading-[1.55] text-black/55">
                    {n.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Rise>
      </div>
    </CreamSlide>
  );
}

/**
 * Why us. Arguments, not statistics - see decision 3 at the top of lib/present.
 *
 * Four promises, each one something the office can be held to on the day. It
 * sits here rather than near the front on purpose: by this point a landlord
 * has seen the evidence, the marketing and the fee, so these read as a summary
 * of what they have just been shown rather than as claims made in advance.
 */
function Why({ deck, show }: { deck: Deck; show: boolean }) {
  const house = useIsPhoto();
  if (house) return <WhyHouse deck={deck} show={show} />;
  return (
    <CreamSlide id="why">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="max-w-[680px]">
          <HandHead eyebrow="Why The Letting Experts" show={show} lines={2}>
            Four things you can
            <br />
            <Emphasis show={show}>hold us to</Emphasis>
          </HandHead>
        </div>
        <div className="mt-9 grid gap-x-14 gap-y-7 sm:grid-cols-2 lg:mt-10">
          {WHY_TLE.map((w, n) => (
            <Rise key={w.title} show={show} i={2 + Math.floor(n / 2)}>
              <div className="border-t border-black/10 pt-4">
                <h3
                  className="text-[15.5px] leading-snug sm:text-[16px]"
                  style={{ fontFamily: HAND, fontWeight: 700 }}
                >
                  {w.title}
                </h3>
                <p className="mt-2 text-[13px] font-light leading-[1.6] text-black/60">{w.body}</p>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </CreamSlide>
  );
}

/**
 * The close, and it is three different closes.
 *
 * James, 4 Sep: the deck that gets SENT after the visit "will have an actual
 * call to action at the end of it". Everything above this point is genuinely
 * the same deck in both directions - that was the design - but the last screen
 * cannot be, because the three decks are asking for three different things:
 *
 *   pre-appraisal   we have not met. Ask me anything before I arrive.
 *   appraisal       we have just met. I will send the figure across.
 *   post-appraisal  you have the figure and the fee. Sign, or ring me.
 *
 * A single "any questions?" ending would waste the one screen a landlord is
 * guaranteed to reach, and on the post deck it would end the whole argument on
 * a shrug rather than on an ask.
 *
 * The drawing is the third and last in the deck - James, on the artwork: "the
 * odd occasion". Keys changing hands is the only picture that belongs on the
 * page where somebody decides.
 */
/* THE FOUR PROMISES, SHORT. WHY_TLE's bodies run to three or four lines in
   a card this wide and the fourth item fell off the stage. Same four
   titles, same claims, each cut to a line and a half. */
const FROM_US: { title: string; body: string }[] = [
  { title: "Lettings is all we do", body: "Not a sales agency with a lettings desk at the back. Rented property, all day, every day." },
  { title: "One person, start to finish", body: "The agent who values it markets it, and rings you when there's an offer." },
  { title: "Priced on evidence", body: "What let nearby, at what rent, and how long it took - you'll see exactly why." },
  { title: "Straight about the fee", body: "One percentage, what it covers and what it doesn't. Quoted before, never after." },
];

/** What we ask of the landlord in return - the right-hand card. */
const FROM_YOU: { title: string; body: string }[] = [
  { title: "Access and information", body: "A way in when we need one, and anything you already know about the property." },
  { title: "Timely decisions", body: "A quick yes or no on offers and tenants keeps the momentum, and the rent." },
  { title: "Honesty", body: "What you want from it, and anything that worries you, so we can plan round it." },
  { title: "A trusted partnership", body: "Work with us openly - the best lets come when we are on the same side." },
];

/**
 * Four things you can hold us to, house look. James, 12 Sep 2026, from his
 * reference: the heading with "hold us to." underlined, a line of intro,
 * then two cards side by side - ours in the pink wash, theirs in the sage -
 * each a numbered list of four; a white band along the foot with the
 * "happy to go ahead" line and a brown button; and the shelf photograph
 * cut into a large rounded shape that runs off the right of the stage.
 */
function WhyHouse({ deck, show }: { deck: Deck; show: boolean }) {
  const a = deck.agent;
  const first = a.firstName || "";
  const { host, fit } = useStage();
  const fx = fit.staged;
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  const SAGE_WASH = "#f1f4ec", SAGE_INK = "#56634a";
  const card = (
    tone: "pink" | "sage",
    icon: IconName,
    title: React.ReactNode,
    rows: { title: string; body: string }[],
    i: number
  ) => (
    <Rise show={show} i={i} className="h-full">
      <div className="flex h-full flex-col rounded-[20px] px-6 pb-3 pt-5" style={{ background: tone === "pink" ? TINTS[0] : SAGE_WASH }}>
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: tone === "pink" ? "var(--p-accent)" : SAGE_INK }}>
            <Line name={icon} size={22} />
          </span>
          <h3 className="text-[19px] leading-[1.15]" style={HEAD}>{title}</h3>
        </div>
        <ol className="mt-2 flex flex-1 flex-col">
          {rows.map((r, n) => (
            <li key={r.title} className={`flex items-start gap-3.5 py-3 ${n > 0 ? "border-t" : ""}`} style={{ borderColor: "rgba(59,59,60,0.08)" }}>
              <span
                className="figures flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={tone === "pink" ? { background: "#f6dcd7", color: "var(--p-accent)" } : { background: "#e2e8d9", color: SAGE_INK }}
              >
                {String(n + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold leading-snug">{r.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[1.45] text-black/55">{r.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Rise>
  );
  const body = (
    <>
      <header className={fx ? "h-[92px] shrink-0" : "h-[60px]"} />
      <div className={`relative z-[2] flex flex-1 flex-col ${fx ? "justify-start pl-16 pr-[580px] pb-[150px]" : "justify-center px-6 pb-10 pt-4 sm:px-12"}`}>
        <Rise show={show} i={0}>
          <Eyebrow>Our commitment</Eyebrow>
        </Rise>
        <Rise show={show} i={1}>
          <h2 className={`mt-3 leading-[1.06] ${fx ? "text-[48px]" : "text-[34px] sm:text-[46px]"}`} style={HEAD}>
            Four things you can
            <br />
            <Emphasis show={show}>hold us to</Emphasis>.
          </h2>
        </Rise>
        <Rise show={show} i={2}>
          <p className="mt-3 max-w-[620px] text-[14.5px] leading-relaxed text-black/60">
            A clear, honest service from start to finish. Here&rsquo;s what you can expect from us,
            and what we&rsquo;ll need from you.
          </p>
        </Rise>
        <div className={`mt-5 grid gap-5 ${fx ? "grid-cols-2" : "sm:grid-cols-2"}`}>
          {card("pink", "heart", <>What to expect<br />from us</>, FROM_US, 3)}
          {card("sage", "person", <>What we need<br />from you</>, FROM_YOU, 4)}
        </div>
      </div>

      {/* THE FOOT: one white band across the stage, under the photograph. */}
      <Rise show={show} i={5} className={fx ? "absolute inset-x-16 bottom-8 z-[3]" : "px-6 pb-10 sm:px-12"}>
        <div className="flex flex-col gap-5 rounded-[20px] border bg-white px-7 py-4 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.25)] sm:flex-row sm:items-center" style={{ borderColor: "rgba(59,59,60,0.1)" }}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: TINTS[0], color: "var(--p-accent)" }}>
            <Line name="check" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px]" style={HEAD}>If you&rsquo;re happy to go ahead</span>
            <span className="mt-0.5 block max-w-[640px] text-[13px] leading-relaxed text-black/55">
              Once you&rsquo;re happy with everything we&rsquo;ve covered, we&rsquo;ll confirm the details, agree the next steps and get everything in motion. It&rsquo;s that simple.
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-center gap-2.5 sm:border-l sm:pl-7" style={{ borderColor: "rgba(59,59,60,0.12)" }}>
            {a.email ? (
              <a href={`mailto:${a.email}`} className="flex items-center gap-3 rounded-[12px] px-9 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "var(--p-accent)" }}>
                Get in touch{first ? ` with ${first}` : ""} <span aria-hidden>&rarr;</span>
              </a>
            ) : null}
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/40">Your property. Our priority.</span>
          </span>
        </div>
      </Rise>

      {fx && (
        /* THE PHOTOGRAPH, cut into a large rounded shape off the right of
           the stage, on the pink so the cut-out's edges have something to
           sit on. Stops above the band. */
        <div className="pointer-events-none absolute -right-[40px] -top-[60px] z-[1] h-[820px] w-[600px] overflow-hidden" style={{ clipPath: "path('M600 0 L600 820 L120 820 C40 760 0 640 0 420 C0 200 60 60 200 0 Z')" }}>
          <div className="absolute inset-0" style={{ background: "#fbeae6" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/photo/commitment.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[60%_center]" />
        </div>
      )}
    </>
  );
  return (
    <section
      ref={host}
      data-slide="why"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
  );
}

function Questions({ deck, show }: { deck: Deck; show: boolean }) {
  const house = useIsPhoto();
  if (house) return <QuestionsHouse deck={deck} show={show} />;
  return <QuestionsDrawn deck={deck} show={show} />;
}

/**
 * The close, house look (James, 12 Sep 2026: "the last page... make sure
 * you're matching the theme to the rest of it"). The same bones as the
 * agent slide - eyebrow, the heading with its underlined words, one
 * paragraph, the brown call button with the outlined email and the sage
 * WhatsApp circle - then the mark and the sign-off line. On the right the
 * handover drawing, the one illustration kept in this deck, sits in a
 * rounded pink frame at the photographs' proportions, with a handwritten
 * line under it. Post-appraisal keeps its signing button first.
 */
function QuestionsHouse({ deck, show }: { deck: Deck; show: boolean }) {
  const a = deck.agent;
  const first = a.firstName || "";
  const tel = a.phone.replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const kind = deckKind(deck);
  const post = kind === "post-appraisal";
  const subject = post
    ? `Getting started — ${deck.property.address}`
    : `About my appraisal — ${deck.property.address}`;
  const signUrl = post ? deck.terms?.signUrl ?? null : null;
  const eyebrow = post ? "The next step" : kind === "appraisal" ? "Before we go" : "Before we meet";
  const { host, fit } = useStage();
  const fx = fit.staged;
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  const SCRIPT = { fontFamily: "var(--font-shantell), cursive" } as const;
  /* This slide goes green (James, 12 Sep 2026: "make this last one green...
     textured, just to give some life to it, and maybe the writing as well").
     The sage for the shape and the WhatsApp button, its ink for the words. */
  const SAGE = "#b3bea5", SAGE_INK = "#56634a";
  const body = (
    <>
      <header className={fx ? "h-[80px] shrink-0" : "h-[60px]"} />
      {/* Centred in the height, not hung from the top (James, 12 Sep 2026). */}
      <div className={`relative z-[2] flex flex-1 flex-col justify-center ${fx ? "pl-16 pr-[700px] pb-16" : "px-6 pb-10 pt-4 sm:px-12"}`}>
        <Rise show={show} i={0}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Rise>
        <Rise show={show} i={1}>
          <h2 className={`mt-4 leading-[1.04] ${fx ? "text-[62px]" : "text-[36px] sm:text-[50px]"}`} style={HEAD}>
            {post ? (
              <>
                Shall we get it on
                <br />
                the <Emphasis show={show}>market</Emphasis>?
              </>
            ) : kind === "appraisal" ? (
              <>
                Anything we
                <br />
                didn&rsquo;t <Emphasis show={show}>cover</Emphasis>?
              </>
            ) : (
              <>
                Anything you want
                <br />
                to <Emphasis show={show}>ask first</Emphasis>?
              </>
            )}
          </h2>
        </Rise>
        <Rise show={show} i={2}>
          <p className="mt-6 max-w-[540px] text-[15.5px] leading-[1.65] text-black/65">
            {post ? (
              <>
                You have the figure, what it costs and what we do for it. Sign the terms and{" "}
                {first || "your agent"} will get the photographs booked this week - or ring
                first if there is anything you want to go over again.
              </>
            ) : kind === "appraisal" ? (
              <>
                {first || "Your agent"} will send the figure and the terms across shortly. If
                anything came to mind after we left - about the rent, the timing, or what&rsquo;s
                worth doing first - ask now rather than wondering.
              </>
            ) : (
              <>
                If something comes to mind before {deck.whenPretty ? "we meet" : "the visit"} -
                about the rent, the paperwork, or what the market&rsquo;s doing -{" "}
                {first || "your agent"} would much rather hear it now than on the doorstep.
              </>
            )}
          </p>
        </Rise>
        {signUrl && (
          <Rise show={show} i={3}>
            <a href={signUrl} className="mt-7 inline-flex items-center gap-3 rounded-[12px] px-7 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "var(--p-accent)" }}>
              Read and sign the terms <span aria-hidden>&rarr;</span>
            </a>
          </Rise>
        )}
        <Rise show={show} i={4}>
          <div className={`${signUrl ? "mt-5" : "mt-8"} flex flex-wrap items-center gap-3`}>
            {/* Two ways in, side by side (James: "WhatsApp or email"), and
                the phone as a quiet third. */}
            {a.phone && (
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(subject)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-[12px] px-6 py-3.5 text-[14px] font-semibold transition-opacity hover:opacity-90" style={{ background: TINTS[0], color: "var(--p-accent)" }}>
                <Line name="whatsapp" size={17} />
                WhatsApp {first || "us"}
              </a>
            )}
            {a.email && (
              <a href={`mailto:${a.email}?subject=${encodeURIComponent(subject)}`} className="flex items-center gap-2.5 rounded-[12px] border bg-white px-6 py-3.5 text-[14px] font-semibold transition-colors hover:border-black/40" style={{ borderColor: "rgba(59,59,60,0.2)" }}>
                <Line name="mail" size={16} />
                Email {first || "us"}
              </a>
            )}
            {a.phone && (
              <a href={`tel:${tel}`} aria-label={`Call ${first || "us"}`} title={a.phone} className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-black/10" style={{ background: "#f1f4ec", color: SAGE_INK }}>
                <Line name="phone" size={17} />
              </a>
            )}
          </div>
        </Rise>
        <Rise show={show} i={5}>
          <div className="mt-10 flex max-w-[540px] items-center gap-4 border-t pt-5" style={{ borderColor: "rgba(59,59,60,0.14)" }}>
            <Mark className="h-7" />
            <p className="text-[14px] text-black/55">
              {post
                ? "Thank you for your time."
                : kind === "appraisal"
                  ? "Thanks for having us round."
                  : deck.whenPretty
                    ? `See you ${firstWord(deck.whenPretty)}.`
                    : "We look forward to meeting you."}
            </p>
          </div>
        </Rise>
      </div>

      {fx && (
        <>
          {/* THE SHAPE, sage and textured: a grain filter over the fill so it
              reads as paper rather than a flat swatch - "green and textured,
              just to give some life to it". Runs off the top-right corner. */}
          <div className="pointer-events-none absolute -right-[40px] top-[70px] z-[1] h-[740px] w-[720px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
              <defs>
                <filter id="close-grain" x="0" y="0" width="100%" height="100%">
                  <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n" />
                  <feColorMatrix in="n" type="saturate" values="0" result="g" />
                  <feComponentTransfer in="g" result="t">
                    <feFuncA type="linear" slope="0.16" intercept="0" />
                  </feComponentTransfer>
                  <feBlend in="SourceGraphic" in2="t" mode="multiply" result="b" />
                  {/* Clipped back to the shape: without this the grain showed
                      as a faint rectangle across the whole filter box. */}
                  <feComposite in="b" in2="SourceGraphic" operator="in" />
                </filter>
              </defs>
              {/* Kept inside the box on every side, so no edge of it is ever
                  cut flat - the earlier path ran past the bottom and left a
                  hard corner. */}
              <path d="M50 2C76 -4 100 8 100 32L100 78C99 90 90 96 74 96C50 96 26 88 16 72C4 54 6 30 18 16C28 5 38 4 50 2Z" fill={SAGE} opacity="0.55" filter="url(#close-grain)" />
            </svg>
          </div>
          {/* THE PHOTOGRAPH: the hallway, in a rounded frame at the same
              proportions as the welcome's door. */}
          <Rise show={show} i={2} className="absolute right-[100px] top-[150px] z-[2] w-[540px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/photo/close-door.webp" alt="" aria-hidden className="w-full rounded-[28px] object-cover shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]" style={{ aspectRatio: "540 / 580" }} />
          </Rise>
          <Rise show={show} i={5} className="absolute right-[120px] top-[776px] z-[2] w-[320px]">
            <p className="text-[28px] leading-[1.1]" style={{ ...SCRIPT, color: SAGE_INK, transform: "rotate(-6deg)" }}>
              {post ? "Let\u2019s get going." : "Bring your questions."}
            </p>
            <svg viewBox="0 0 240 12" aria-hidden className="ml-6 mt-1 h-[12px] w-[240px]" style={{ transform: "rotate(-6deg)" }}>
              <path d="M2 8C60 2 150 2 238 6" fill="none" stroke={SAGE_INK} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            </svg>
          </Rise>
        </>
      )}
    </>
  );
  return (
    <section
      ref={host}
      data-slide="questions"
      className="relative flex min-h-full w-full shrink-0 items-center justify-center overflow-hidden"
      style={{ background: CREAM, color: INK }}
    >
      <Stage fit={fit}>{body}</Stage>
    </section>
  );
}

function QuestionsDrawn({ deck, show }: { deck: Deck; show: boolean }) {
  const a = deck.agent;
  const tel = a.phone.replace(/\s+/g, "");
  const kind = deckKind(deck);
  const post = kind === "post-appraisal";
  const subject = post
    ? `Getting started — ${deck.property.address}`
    : `About my appraisal — ${deck.property.address}`;
  /* Repeated from the terms slide on purpose. A landlord who has scrolled the
     whole deck should not have to go back up to act on it, and it is the same
     signing session reached from two places. */
  const signUrl = post ? deck.terms?.signUrl ?? null : null;

  const eyebrow = post ? "The next step" : kind === "appraisal" ? "Before we go" : "Before we meet";

  return (
    <CreamSlide id="questions">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="max-w-[600px]">
          <HandHead eyebrow={eyebrow} show={show} lines={2}>
            {post ? (
              <>
                Shall we get it on
                <br />
                the <Emphasis show={show}>market</Emphasis>
              </>
            ) : kind === "appraisal" ? (
              <>
                Anything we
                <br />
                didn&rsquo;t <Emphasis show={show}>cover</Emphasis>
              </>
            ) : (
              <>
                Anything you want
                <br />
                to <Emphasis show={show}>ask first</Emphasis>
              </>
            )}
          </HandHead>

          <Rise show={show} i={2}>
            <p className="mt-6 max-w-[520px] text-[14.5px] font-light leading-[1.7] text-black/60">
              {post ? (
                <>
                  You have the figure, what it costs and what we do for it. Sign the terms and{" "}
                  {a.firstName || "your agent"} will get the photographs booked this week - or ring
                  first if there is anything you want to go over again.
                </>
              ) : kind === "appraisal" ? (
                <>
                  {a.firstName || "Your agent"} will send the figure and the terms across shortly.
                  If anything came to mind after we left - about the rent, the timing, or
                  what&rsquo;s worth doing first - ask now rather than wondering.
                </>
              ) : (
                <>
                  If something comes to mind before {deck.whenPretty ? "we meet" : "the visit"} -
                  about the rent, the paperwork, or what the market&rsquo;s doing -{" "}
                  {a.firstName || "your agent"} would much rather hear it now than on the doorstep.
                </>
              )}
            </p>
          </Rise>

          {signUrl && (
            <Rise show={show} i={3}>
              <a
                href={signUrl}
                className="mt-7 inline-block rounded-full px-7 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: CORAL }}
              >
                Read and sign the terms
              </a>
            </Rise>
          )}

          <Rise show={show} i={4}>
            <div className={`${signUrl ? "mt-5" : "mt-8"} flex flex-wrap gap-2.5`}>
              {a.phone && (
                <a
                  href={`tel:${tel}`}
                  className={
                    signUrl
                      ? "rounded-full border px-5 py-2.5 text-[13px] font-medium transition-colors hover:border-black/40"
                      : "rounded-full px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  }
                  style={signUrl ? { borderColor: "rgba(59,59,60,0.18)" } : { background: CORAL }}
                >
                  {a.phone}
                </a>
              )}
              {a.email && (
                <a
                  href={`mailto:${a.email}?subject=${encodeURIComponent(subject)}`}
                  className="rounded-full border px-5 py-2.5 text-[13px] font-medium transition-colors hover:border-black/40"
                  style={{ borderColor: "rgba(59,59,60,0.18)" }}
                >
                  {a.email}
                </a>
              )}
            </div>
          </Rise>

          <Rise show={show} i={5}>
            <div className="mt-9 flex items-center gap-4 border-t border-black/10 pt-5">
              <Mark className="h-7" />
              {/* "See you Tuesday" is right the day before and wrong the day
                  after. Once the visit has happened the sign-off has to look
                  forwards, not at an appointment already in the past. */}
              <p className="text-[12.5px] text-black/50" style={{ fontFamily: HAND }}>
                {post
                  ? "Thank you for your time."
                  : kind === "appraisal"
                    ? "Thanks for having us round."
                    : deck.whenPretty
                      ? `See you ${firstWord(deck.whenPretty)}.`
                      : "We look forward to meeting you."}
              </p>
            </div>
          </Rise>
        </div>

        <Rise show={show} i={3} className="hidden lg:block">
          <Art
            slot="close"
            drawing="/brand/art/keys-handover.png"
            className="ml-auto max-w-[470px]"
            photoClassName="!max-w-[380px]"
          />
        </Rise>
      </div>
    </CreamSlide>
  );
}

/** The arrow on the Back and Next controls. Its own component only so the two
 *  buttons cannot drift apart in weight or size. */
/** "Tuesday 19 August at 2:00pm" → "Tuesday". Used only to sign off warmly;
 *  if the string isn't shaped like that it still reads as a word, not a bug.
 *  Case is left alone — the day is a proper noun and "see you tuesday" reads
 *  like a typo. */
const firstWord = (s: string) => s.trim().split(/\s+/)[0];

/* ───────────────────────── the viewer ───────────────────────── */

export default function PresentDeck({
  token,
  deck,
  slides,
  embedded = false,
}: {
  token: string;
  deck: Deck;
  slides: { id: SlideId; title: string; section: SectionId }[];
  /** Inside the builder's preview box (11 Sep 2026): fills its parent
   *  rather than the viewport, and never counts itself as an open. */
  embedded?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  /**
   * Which slides have been reached, and are therefore revealed.
   *
   * A SET rather than "is this the current slide", so a slide that has played
   * its reveal stays put. Re-running the stagger every time somebody scrolls
   * back past a slide turns a nice touch into a tic.
   *
   * It starts empty on purpose: server and client both render hidden, and the
   * effect below flips slide 0 on a frame later — which is what makes the
   * FIRST screen rise in rather than simply being there.
   */
  const [seen, setSeen] = useState<number[]>([]);
  const show = (i: number) => seen.includes(i);

  /* The first screen rises on arrival: server and client both paint it
     hidden, then this flips it a frame later. Everything after it is the
     reveal observer's job. */
  useEffect(() => {
    setSeen((prev) => (prev.length ? prev : [0]));
  }, []);

  /* Count the open, once. See app/api/present/opened for why it isn't done
     in the page render. */
  useEffect(() => {
    if (embedded) return;
    const t = setTimeout(() => {
      fetch("/api/present/opened", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        keepalive: true,
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [token, embedded]);

  /**
   * Two observers, because two different questions are being asked and one
   * answer cannot serve both.
   *
   * WHICH SLIDE IS CURRENT is a precise question: exactly one at a time. A
   * band down the middle of the scrollport answers it for a slide of ANY
   * size — which a percentage threshold cannot. This was originally
   * `threshold: 0.55`, and on a phone the appointment slide is taller than
   * the screen, so 55% of it could never be visible: the slide never became
   * current, and once the reveal depended on that it rendered BLANK. A
   * visibility rule that can be mathematically impossible to satisfy is a
   * rule that will eventually hide the page.
   *
   * The margins moved from the vertical axis to the horizontal one when the
   * deck went across instead of down (4 Sep). Left on the y-axis they would
   * have shrunk the band to nothing on a slide that scrolls inside itself.
   *
   * WHETHER TO REVEAL is a generous question: as soon as any part of a slide
   * has been on screen, its content should be there. Never gate content on a
   * precise measurement — the failure mode is an empty page.
   */
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const cells = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));

    const current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number(e.target.getAttribute("data-index"));
          if (!Number.isNaN(i)) setAt(i);
        }
      },
      { root, rootMargin: "0px -45% 0px -45%", threshold: 0 }
    );

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number(e.target.getAttribute("data-index"));
          if (Number.isNaN(i)) continue;
          setSeen((prev) => (prev.includes(i) ? prev : [...prev, i]));
        }
      },
      // A screen of lead-in, so a slide has already begun to settle by the
      // time it is properly in view rather than starting its rise then. On
      // the horizontal axis now — the lead-in is to the RIGHT, which is the
      // direction the deck is read in.
      { root, rootMargin: "0px 15% 0px 0px", threshold: 0 }
    );

    cells.forEach((el) => {
      current.observe(el);
      reveal.observe(el);
    });
    return () => {
      current.disconnect();
      reveal.disconnect();
    };
  }, [slides.length]);

  const go = useCallback((i: number) => {
    const root = scroller.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-index="${i}"]`);
    /* `inline`, not `block`: the deck moves across. `block: "nearest"` as
       well, so a slide that scrolls inside itself is not yanked back to its
       own top just because somebody pressed Next. */
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);

  /**
   * The keys, for whoever opens it on a laptop.
   *
   * LEFT AND RIGHT ONLY, since the deck went across. Up and Down used to move
   * between slides and must not any more: a slide can be taller than the
   * window and scrolls inside itself, so Down has to mean "read further down
   * this one". Leaving it bound to Next would make the densest slides — the
   * service table, the legal list — the ones a keyboard cannot read.
   *
   * Space is deliberately not bound either. It is Page Down's job on a web
   * page and it is a presenter remote's Next button, and those two now
   * disagree; the remote sends Right anyway.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(Math.min(at + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(Math.max(at - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, go, slides.length]);

  const body = (id: SlideId, i: number) => {
    switch (id) {
      case "welcome":
        return <Welcome deck={deck} show={show(i)} />;
      case "appointment":
        return <Appointment deck={deck} show={show(i)} />;
      case "agent":
        return <Agent deck={deck} show={show(i)} />;
      case "comparables":
        return <Comparables deck={deck} show={show(i)} />;
      case "valuation":
        return <Valuation deck={deck} show={show(i)} />;
      case "market":
        return <Market deck={deck} show={show(i)} />;
      case "terms":
        return <Terms deck={deck} show={show(i)} />;
      case "why":
        return <Why deck={deck} show={show(i)} />;
      case "questions":
        return <Questions deck={deck} show={show(i)} />;

      /* The market-appraisal middle. See components/PresentSlides. */
      case "agenda":
        return <S.Agenda deck={deck} show={show(i)} />;
      case "approach":
        return <S.Approach show={show(i)} />;
      case "property":
        return <S.PropertyDivider deck={deck} show={show(i)} />;
      case "material":
        return <S.Material deck={deck} show={show(i)} />;
      case "listings":
        return <S.Listings deck={deck} show={show(i)} />;
      case "history":
        return <S.History deck={deck} show={show(i)} />;
      case "marketing":
        return <S.MarketingDivider show={show(i)} />;
      case "offer":
        return <S.Offer show={show(i)} />;
      case "maxprice":
        return <S.MaxPrice show={show(i)} />;
      case "video":
        return <S.Video deck={deck} show={show(i)} />;
      case "brochure":
        return <S.Brochure show={show(i)} />;
      case "portals":
        return <S.Portals show={show(i)} />;
      case "social":
        return <S.Social show={show(i)} />;
      case "compliance":
        return <S.Compliance show={show(i)} />;
      case "legal":
        return <S.Legal show={show(i)} />;
      case "screening":
        return <S.Screening show={show(i)} />;
      case "management":
        return <S.Management show={show(i)} />;
      case "levels":
        return <S.Levels show={show(i)} />;
      case "collection":
        return <S.Collection show={show(i)} />;
      case "protection":
        return <S.Protection show={show(i)} />;
      case "rentlegal":
        return <S.RentLegal show={show(i)} />;
      case "regulated":
        return <S.Regulated show={show(i)} />;
      case "network":
        return <S.Network show={show(i)} />;
      case "testimonial":
        return <S.Testimonial deck={deck} show={show(i)} />;
      case "fees":
        return <S.Fees deck={deck} show={show(i)} />;
    }
  };

  const here = slides[at]?.id;
  /* Which slides carry white type, so the chrome can invert under them. Read
     from the list beside CREAM_SLIDES rather than named here — see DARK_SLIDES
     for what naming them here cost. */
  const onDark = isDark(here);
  /* The ground the bottom bar sits on: whatever the slide's own ground is, so
     the bar reads as the foot of the page rather than a panel laid over it.
     Driven by CREAM_SLIDES rather than a second list of ids here - see the
     note on it in present-kit. */
  const cream = isCream(here);
  const tint = cream ? CREAM : onDark ? RED : PAPER;
  /* The accent the chrome uses. Coral belongs to the converted slides; the
     rest of the deck is still Expert Red. */
  const accent = cream ? CORAL : RED;

  /* The chapters, folded out of the slide list rather than kept as a second
     list. Consecutive slides sharing a section become one segment, so a
     section that loses every one of its slides to a missing-data rule simply
     never appears - no empty chapter, and nothing to keep in step by hand. */
  const chapters = useMemo(() => {
    const out: { id: SectionId; label: string; from: number; count: number }[] = [];
    slides.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.id === s.section) last.count += 1;
      else out.push({ id: s.section, label: sectionLabel(s.section), from: i, count: 1 });
    });
    return out;
  }, [slides]);
  const chapter = chapters.find((c) => at >= c.from && at < c.from + c.count);


  /**
   * THE TRANSITION SEAM. Nothing renders here yet, and that is deliberate.
   *
   * The first attempt was coral motion streaks crossing the screen, borrowed
   * from the three dashes above the woman's head in the entrance artwork.
   * James, 4 Sep: "I like the animation. I don't like the lines. It's very
   * off-putting, and it doesn't look like whooshing." He is finding a
   * reference for what it should be instead.
   *
   * What is kept is the hard part — knowing that a move happened, and which
   * way. `dir` matters more than it looks: a transition that always played
   * forwards would make Back feel like Next, which is worse than none.
   *
   * `tick` is the replay trigger, meant to be used as a React key so an effect
   * remounts and restarts rather than needing to be reset. A boolean would
   * need a timer to clear it, and a timer that fires while somebody is swiping
   * fast leaves a stuck overlay on screen.
   *
   * A ref for the previous index rather than state, because this must not
   * cause its own render: the effect runs after `at` has painted, and a second
   * render at that moment lands in the middle of the browser's scroll.
   *
   * Whatever goes here must be pointer-events-none, must render nothing at all
   * under `prefers-reduced-motion` (not a slower version — a full-width object
   * crossing the field of view is the pattern that makes people ill), and must
   * not change the colour mid-move: the deck is one continuous page and James
   * asked for the colour to stay constant across it.
   */
  const was = useRef(at);
  const [move, setMove] = useState({ tick: 0, dir: 1 as 1 | -1 });
  useEffect(() => {
    if (at === was.current) return;
    const dir: 1 | -1 = at > was.current ? 1 : -1;
    was.current = at;
    setMove((m) => ({ tick: m.tick + 1, dir }));
  }, [at]);
  void move;

  return (
    /* THE THEME LIVES HERE and nowhere else. Every slide asks for
       `var(--p-display)` or `var(--p-accent)` without knowing a choice exists,
       so switching look is one attribute on one element - no remount, nothing
       to keep in step. See themeVars in present-kit. */
    <DeckStyleCtx.Provider value={asStyle(deck.style)}>
    <div
      className={`relative w-full overflow-hidden ${embedded ? "h-full" : "h-[100dvh]"}`}
      style={themeVars(asStyle(deck.style))}
      data-present-style={asStyle(deck.style)}
    >
      {/**
       * THE DECK MOVES ACROSS, NOT DOWN. James, 4 Sep: "more like a
       * presentation".
       *
       * A row of full-width cells with mandatory snapping on the x-axis. It is
       * still one CSS property rather than a JS carousel, so a trackpad swipe,
       * a touch drag and a presenter remote all work without being
       * reimplemented — and with no JS it degrades to a page you can still
       * read end to end.
       *
       * ── Mandatory everywhere, which it could not be going down ─────────────
       *
       * Vertically this was `snap-proximity` on phones, because mandatory
       * snapping fights a slide taller than the window: the browser keeps
       * tugging you back to the slide edge as you try to read the middle.
       * Across, that conflict disappears — the axis you page on and the axis a
       * long slide grows on are different ones. So the firm snap is free at
       * every width, and a presentation should always land ON a slide.
       *
       * ── Each cell scrolls itself ───────────────────────────────────────────
       *
       * `overflow-y-auto` per cell rather than on the row. Seven slides are
       * taller than a laptop window (the service table by 379px), and without
       * this they would simply be cut off — which is the one failure this deck
       * has always refused. Now: swipe across for the next slide, scroll down
       * inside the dense one.
       *
       * `overscroll-contain` stops a flick at the end of a tall slide handing
       * the gesture to the row and skipping a slide sideways.
       */}
      <div
        ref={scroller}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
        // The counter and the two buttons are the navigation; the browser's
        // own bars are noise across the foot of a slide.
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            data-index={i}
            className="h-full w-full shrink-0 snap-start overflow-y-auto overscroll-contain"
            style={{ scrollbarWidth: "none" }}
          >
            {body(s.id, i)}
          </div>
        ))}
      </div>

      {/* ── The chapter rail ──
          There is no "1 / 29" here and there deliberately never will be again.
          James, 4 Sep: it "is making me depressed" - which is the correct
          reaction to being told, on the first screen, that you have
          twenty-eight more to go. The number was answering a question nobody
          asked; what a reader actually wants to know is WHICH PART they are
          in and how long that part is.

          So: the section's name, and one segment per section sized by how many
          slides it holds. Past chapters are filled, the current one fills as
          you move through it, the rest are waiting. The same seven chapters
          the agenda promised on slide 2 - so the landlord is watching a shape
          they were shown, rather than being counted down.

          The segments are buttons. A landlord who wants the fee and not the
          brochure should be able to get there, and a deck that makes them
          swipe past nine slides they did not ask for has earned being
          closed. */}
      {/* ── The mark, top left ──
          James, 7 Sep. One logo, in one place, for the whole deck rather than
          reprinted on every slide. With the contents column gone this and the
          position indicator opposite it are the only chrome the deck has. */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 px-6 pt-6 sm:px-10 sm:pt-7 lg:px-14">
        <Mark className="h-9 sm:h-10" />
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 flex items-center justify-end px-6 pt-7 sm:px-10 lg:px-14">
        <div className="flex items-center gap-4">
          {/* WHERE WE ARE, in the top right. James, 7 Sep. It is the part's
              name and not a count, which is the same rule as before: "1 / 29"
              on the first screen tells a landlord how much is left rather than
              what they are looking at. Shown at every width now — a phone is
              the device that most needs telling. */}
          {/* The words go on a phone. The mark is ~130px wide in the opposite
              corner and the segments take another 90, which at 390px leaves
              the label nowhere to go but underneath the logo - and nothing may
              collide. The segments alone still answer "how far in am I". */}
          {chapter?.label && (
            <span
              className="hidden max-w-[45vw] truncate text-[12.5px] sm:block"
              style={{ color: onDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.5)" }}
            >
              {chapter.label}
            </span>
          )}
          <div className="pointer-events-auto flex items-center gap-1">
            {chapters
              .filter((c) => c.label)
              .map((c) => {
                const done = at >= c.from + c.count;
                const now = at >= c.from && !done;
                /* Width by slide count, so a nine-slide chapter LOOKS longer
                   than a three-slide one. A row of equal segments would tell
                   the landlord the deck is evenly paced, which it is not. */
                return (
                  <button
                    key={c.id}
                    onClick={() => go(c.from)}
                    aria-label={c.label}
                    title={c.label}
                    className="h-[3px] overflow-hidden rounded-full transition-opacity hover:opacity-100"
                    style={{
                      width: c.count * 9,
                      background: onDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.11)",
                      opacity: now ? 1 : 0.75,
                    }}
                  >
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: done ? "100%" : now ? `${((at - c.from + 1) / c.count) * 100}%` : "0%",
                        background: onDark ? "#ffffff" : accent,
                      }}
                    />
                  </button>
                );
              })}
          </div>
        </div>
      </div>

    </div>
    </DeckStyleCtx.Provider>
  );
}
