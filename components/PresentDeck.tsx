"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_CHIPS,
  BANNER,
  BRING_ALONG,
  deckKind,
  defaultBio,
  sectionLabel,
  VISIT_STEPS,
  WHY_TLE,
  initialsOf,
  type PresentDeck as Deck,
  type SectionId,
  type SlideId,
} from "@/lib/present";
import { icsFor } from "@/lib/appraisal-email";
import HandWord from "@/components/HandWord";

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
  FLOW,
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
  Slide,
  TINTS,
  isCream,
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

  return (
    <section
      data-slide="welcome"
      className="relative flex min-h-full w-full shrink-0 flex-col justify-center px-6 pb-28 pt-20 sm:px-10 lg:px-14 lg:pb-24 lg:pt-14"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/sitting-chair.png"
              alt=""
              aria-hidden
              className="ml-auto w-full max-w-[620px]"
            />
            <Aside show={show} />
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
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

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
                  what it{" "}
                  {/* Written, like the entrance. Sized in em so it tracks the
                      headline at every breakpoint, and a touch bigger than the
                      serif around it - a script's x-height is far smaller, so
                      matched sizes make it look shrunken. */}
                  <HandWord
                    word="lets"
                    written={show}
                    color={RED}
                    size="1.22em"
                    align="-0.30em"
                    ms={1400}
                    delay={420}
                    className="mx-[0.06em] inline-block"
                  />{" "}
                  for
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
              style={{ background: `${RED}80`, color: INK }}
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
              <p className="mt-4 text-[13px] font-light text-black/45">
                {a.name}
                {a.name && a.title ? " · " : ""}
                <span className={a.name ? "" : "text-black/70"}>{a.title}</span>
              </p>
            </Rise>
          )}

          <Rise show={show} i={3}>
            <div className="mt-6 max-w-[520px] space-y-4">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-[14.5px] font-light leading-[1.65] text-black/65">
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
                  src={`${video.embedUrl}?theme=light&accent=${CORAL.replace("#", "")}`}
                  allow="autoplay; fullscreen; picture-in-picture"
                  className="w-full border-0"
                  style={{ aspectRatio: "16 / 9" }}
                  title={`Welcome from ${a.name}`}
                />
              </div>
            </Rise>
          )}

          <Rise show={show} i={5}>
            <div className="mt-7 flex flex-wrap gap-2.5">
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
            <div className="mt-8 grid max-w-[620px] gap-y-5 sm:grid-cols-3 sm:gap-x-0">
              {AGENT_CHIPS.map((c, i) => (
                <div
                  key={c.title}
                  className={`flex items-start gap-2.5 ${i === 0 ? "sm:pr-5" : "sm:border-l sm:px-5"}`}
                  style={{ borderColor: "rgba(59,59,60,0.12)" }}
                >
                  <span className="mt-[1px] shrink-0" style={{ color: CORAL }}>
                    <Line name={c.icon} size={19} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block text-[13px] leading-snug"
                      style={{ fontFamily: HAND, fontWeight: 700 }}
                    >
                      {c.title}
                    </span>
                    <span className="mt-1 block text-[11.5px] font-light leading-snug text-black/50">
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
                className="relative flex w-full items-center justify-center"
                style={{ aspectRatio: "4 / 5" }}
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
 * shown is a guess with a serif on it. Every row here is a real property we
 * are letting, with what it asked and how long it took.
 *
 * Gated at three rows in slidesFor - below that the slide argues AGAINST us,
 * because a landlord counting two properties concludes we do not know their
 * street and re-reads everything else with that in mind.
 */
function Comparables({ deck, show }: { deck: Deck; show: boolean }) {
  const c = deck.comparables;
  if (!c) return null;
  const money = (n: number) => `\u00a3${Math.round(n).toLocaleString("en-GB")}`;

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
              /* Capped at 54, not 62. Six evidence rows plus this headline is the
                  tallest thing in the section, and at 62 the sixth row fell
                  under the fold on a 720px laptop - which on the one slide
                  that exists to show our working reads as us hiding a row. */
              style={{ fontFamily: HAND, fontWeight: 700, fontSize: "clamp(32px, 3.8vw, 54px)" }}
            >
              <span style={{ color: CORAL }}>
                {money(c.guideLow)}&ndash;{money(c.guideHigh)}
              </span>
              <span className="text-[0.42em] font-normal text-black/45"> pcm</span>
            </h2>
          </Rise>
          <Rise show={show} i={2}>
            <p className="mt-4 max-w-[520px] text-[15px] font-light leading-[1.6] text-black/55">
              Based on {c.basedOn} propert{c.basedOn === 1 ? "y" : "ies"} we are letting near you.
              We&rsquo;ll land on the figure together on the day.
            </p>
          </Rise>
        </div>

        <Rise show={show} i={3}>
          <ul className="mt-7 lg:mt-8">
            {c.rows.slice(0, 6).map((r, n) => (
              <li
                key={`${r.name}-${r.rent}`}
                className="flex items-baseline justify-between gap-6 py-2.5"
                style={{ borderTop: n === 0 ? "none" : "1px solid rgba(0,0,0,0.07)" }}
              >
                <span className="min-w-0">
                  <span
                    className="block truncate text-[15px] leading-snug sm:text-[16px]"
                    style={{ fontFamily: HAND, fontWeight: 700 }}
                  >
                    {r.name}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] font-light text-black/45">
                    {r.locality}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-4">
                  {r.days != null && (
                    <span className="text-[12.5px] font-light text-black/45">
                      {r.letAgreed ? `let in ${r.days} days` : `${r.days} days`}
                    </span>
                  )}
                  <span className="text-[17px]" style={{ fontFamily: HAND, fontWeight: 700 }}>
                    {r.rent}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Rise>

        {c.caveat && (
          <Rise show={show} i={4}>
            <p className="mt-6 max-w-[640px] text-[12.5px] font-light leading-relaxed text-black/45">
              {c.caveat}
            </p>
          </Rise>
        )}
      </div>
    </CreamSlide>
  );
}

/**
 * The local market, for the landlord.
 *
 * ── WHY THIS IS NOT THE AGENT'S SCREEN WITH NICER FONTS ───────────────────
 *
 * The Market step in the builder shows an agent everything: five blocks, every
 * sample size, every caveat, two scopes to switch between. That is right for
 * somebody deciding what to say. It is wrong for the person being spoken to —
 * a landlord handed twenty numbers reads none of them.
 *
 * So only the ticked blocks appear, each one is a sentence with a figure in
 * it rather than a chart to be interpreted, and the bars carry counts rather
 * than a y-axis. What survives is what the agent chose to argue with.
 *
 * Everything is a frozen snapshot from `deck.market` — no fetching here. See
 * PresentMarket in lib/present for why.
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
    <li className="flex items-center gap-2.5 py-[3px]">
      <span
        /* Wide enough for "Over 3 months" and "Under 2 weeks" to survive at
           12px - measured, they were clipping to "Over 3 mont…" on the slide a
           landlord reads. Agency names get more still and truncate anyway. */
        className={`${wide ? "w-[152px]" : "w-[104px]"} shrink-0 truncate text-[12px] font-light text-black/60`}
      >
        {label}
      </span>
      <span className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-black/8">
        {/* Softened deliberately. At full strength twelve of these read as a
            warning panel rather than a market - the bar's job is to carry the
            eye down a column, and length already does that. The brand red is
            kept for the headline rule and the one figure that is about us. */}
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: max > 0 && n > 0 ? `${Math.max((n / max) * 100, 3)}%` : "0%",
            background: RED,
            opacity: 0.55,
          }}
        />
      </span>
      <span className="w-[56px] shrink-0 text-right text-[12px]">{right ?? n}</span>
    </li>
  );

  /* A titled block, so the four charts can be laid out two-up without each one
     repeating its own heading markup. */
  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-black/40">{title}</p>
      <ul className="mt-1.5 border-t border-black/8 pt-1">{children}</ul>
    </div>
  );

  const bandMax = Math.max(1, ...(m.bands ?? []).map((b) => b.n));
  const bedMax = Math.max(1, ...(m.rentByBed ?? []).map((b) => b.n));
  const agentMax = Math.max(1, ...(m.agents ?? []).map((a) => a.n));

  return (
    <section
      data-slide="market"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

      {/* pb-24 ON MOBILE IS NOT PADDING TASTE, it is clearance.

          Measured at 375×812 with all five blocks: the slide ran to 998px and
          the last rows sat underneath the deck's own slide-nav dots and the
          assistant bubble. This is the phone-sized collision this project keeps
          shipping, so the last block is given room to end above them. */}
      <div className="flex flex-1 flex-col justify-center px-6 py-8 pb-24 sm:px-12 sm:py-10 sm:pb-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <Rise show={show} i={0}>
            <Eyebrow>Your local market</Eyebrow>
            <h2
              className="mt-3 text-[34px] leading-[1.05] sm:text-[50px]"
              style={{ fontFamily: DISPLAY }}
            >
              {m.advertised} to let
              <span className="text-[18px] font-light sm:text-[24px]"> in {m.area}</span>
            </h2>
            <p className="mt-2 text-[15px] font-light text-black/55">
              {m.medianRent
                ? `The middle asking rent here is ${money(m.medianRent)} pcm.`
                : "Advertised right now, across every size."}
              {m.reduced != null && m.reduced > 0 && (
                <> {m.reduced} of them have already cut their asking rent.</>
              )}
            </p>
            <span className="mt-5 block h-[3px] w-[34px] rounded-full" style={{ background: RED }} />
          </Rise>

          {/* Pace. The two figures are deliberately given different words —
              "has been advertised" against "took to let" - because they are
              different measurements and a landlord who later works that out
              unaided stops believing the rest of the deck. */}
          {(m.marketDays != null || m.ourDays != null) && (
            <Rise show={show} i={1}>
              <div className="mt-5 grid gap-4 sm:mt-7 sm:grid-cols-2">
                {m.marketDays != null && (
                  <div className="border-t border-black/10 pt-3">
                    <p className="text-[28px] font-light leading-none">{m.marketDays} days</p>
                    <p className="mt-1.5 text-[12.5px] font-light leading-snug text-black/55">
                      How long the average property on the market in {m.area} has been advertised.
                    </p>
                  </div>
                )}
                {m.ourDays != null && (
                  <div className="border-t pt-3" style={{ borderColor: RED }}>
                    <p className="text-[28px] font-light leading-none">{m.ourDays} days</p>
                    <p className="mt-1.5 text-[12.5px] font-light leading-snug text-black/55">
                      How long our last {m.ourLets} lets round here actually took, start to finish.
                    </p>
                  </div>
                )}
              </div>
            </Rise>
          )}

          {/* TWO COLUMNS, because one was too tall to be a slide.

              Measured at 1280×720 with all five blocks ticked: the single
              column ran to 1140px inside a 100dvh section, so a landlord on a
              laptop lost the competition chart and the date the figures were
              taken off the bottom edge. A slide that has to be scrolled inside
              a deck that scrolls by slide is a slide nobody reads the end of.
              Stacked on phones, where vertical space is expected. */}
          <Rise show={show} i={2}>
            <div className="mt-5 grid gap-x-10 gap-y-5 sm:mt-7 sm:gap-y-6 sm:grid-cols-2">
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
                  {/* Five is the cap on a slide. The panel shows six; the
                      sixth is always the smallest and costs a row of height
                      the layout does not have. */}
                  {m.agents.slice(0, 5).map((a) => (
                    <Row key={a.agent} label={a.agent} n={a.n} max={agentMax} right={`${pct(a.n)}%`} wide />
                  ))}
                </Block>
              )}
            </div>
          </Rise>

          <Rise show={show} i={3}>
            <p className="mt-6 text-[11px] font-light leading-relaxed text-black/45">
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
      </div>
    </section>
  );
}

/**
 * THE FIGURE, on its own slide.
 *
 * The one thing a landlord opens a post-appraisal deck for. It leads with the
 * rent at full size and puts what it costs underneath, in that order and on
 * one screen — a landlord who has to hunt for the fee assumes it is being
 * hidden, and an agent who has to explain why it wasn't there has lost the
 * conversation before it started.
 *
 * The note is the agent's own words from the visit, shown verbatim. It is
 * usually the conditional bit ("subject to the EPC being redone"), and
 * dropping it would turn a qualified figure into an unqualified promise.
 */
function Valuation({ deck, show }: { deck: Deck; show: boolean }) {
  const v = deck.valuation;
  if (!v?.rent) return null;
  const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

  /* Only the terms that were actually agreed. A row reading "Fee —" invites
     the question the slide exists to answer. */
  const terms = [
    v.serviceLevel ? { k: "Our service", v: v.serviceLevel } : null,
    v.feePct != null ? { k: "Management fee", v: `${v.feePct}% of rent` } : null,
    v.setupFee != null ? { k: "Set-up fee", v: `${money(v.setupFee)} one-off` } : null,
  ].filter((x): x is { k: string; v: string } => x != null);

  return (
    <section
      data-slide="valuation"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <Rise show={show} i={0}>
            <Eyebrow>What we&rsquo;d put it on at</Eyebrow>
            <h2
              className="mt-3 text-[48px] leading-[0.95] sm:text-[76px]"
              style={{ fontFamily: DISPLAY }}
            >
              {money(v.rent)}
              <span className="text-[20px] font-light sm:text-[28px]"> pcm</span>
            </h2>
            <span className="mt-5 block h-[3px] w-[34px] rounded-full" style={{ background: RED }} />
          </Rise>

          {terms.length > 0 && (
            <Rise show={show} i={1}>
              <ul className="mt-8 divide-y divide-black/8 border-y border-black/8">
                {terms.map((t) => (
                  <li key={t.k} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-[14px] font-light text-black/60">{t.k}</span>
                    <span className="text-[15px] font-medium">{t.v}</span>
                  </li>
                ))}
              </ul>
            </Rise>
          )}

          {v.note && (
            <Rise show={show} i={2}>
              <p className="mt-6 max-w-2xl text-[13.5px] font-light leading-relaxed text-black/60">
                {v.note}
              </p>
            </Rise>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * GETTING STARTED — the ask.
 *
 * ── The button is deliberately conditional ────────────────────────────────
 *
 * DocuSeal is not connected yet, so `signUrl` is null on every deck built
 * today. When it is null this slide shows NO button at all and says the
 * paperwork is coming instead. A "Sign now" that goes nowhere, in front of a
 * landlord who has just agreed a rent, is the single worst thing this slide
 * could do — it converts a yes into a support call.
 *
 * When DocuSeal is wired, one field on the deck fills and the button appears.
 * Nothing else here changes.
 */
function Terms({ deck, show }: { deck: Deck; show: boolean }) {
  const t = deck.terms;
  if (!t) return null;
  const first = deck.agent.firstName || deck.agent.name;

  return (
    <section
      data-slide="terms"
      className="relative flex min-h-full w-full shrink-0 flex-col pb-24"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-3xl">
          <Rise show={show} i={0}>
            <Eyebrow>Getting started</Eyebrow>
            <h2
              className="mt-3 text-[30px] leading-[1.1] sm:text-[42px]"
              style={{ fontFamily: DISPLAY }}
            >
              Ready when you are
            </h2>
            <p className="mt-3 max-w-xl text-[15px] font-light leading-relaxed text-black/60">
              {t.summary ??
                "The terms of business set out what we do, what it costs and how either of us can bring it to an end. Nothing starts until they are signed."}
            </p>
            <span className="mt-5 block h-[3px] w-[34px] rounded-full" style={{ background: RED }} />
          </Rise>

          <Rise show={show} i={1}>
            {t.signUrl ? (
              <a
                href={t.signUrl}
                className="mt-8 inline-block rounded-full px-7 py-3.5 text-[15px] font-medium text-white"
                style={{ background: RED }}
              >
                Read and sign the terms
              </a>
            ) : (
              /* No dead button. The sentence does the job the link would. */
              <p className="mt-8 max-w-xl text-[14px] font-light leading-relaxed text-black/70">
                {first} will send the terms of business across to sign
                electronically - it takes a couple of minutes and nothing needs printing.
                Reply to this and we&rsquo;ll get them straight over.
              </p>
            )}
          </Rise>

          <Rise show={show} i={2}>
            <div className="mt-9 border-t border-black/8 pt-5">
              <p className="text-[12px] uppercase tracking-[0.14em] text-black/40">
                What happens next
              </p>
              <ol className="mt-3 space-y-2.5">
                {[
                  "Terms signed, and we get the photographs and details booked in.",
                  "The property goes live on Rightmove and the portals, usually within a week.",
                  "We handle the viewings, the referencing and the paperwork.",
                ].map((s, i) => (
                  <li key={s} className="flex gap-3 text-[14px] font-light leading-relaxed">
                    <span
                      className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ background: RED }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-black/70">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Rise>
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <Slide id="why">
      <div className="mx-auto w-full max-w-5xl">
        <Eyebrow>Why The Letting Experts</Eyebrow>
        <h2 className="mt-3 max-w-2xl text-[26px] font-light leading-[1.15] tracking-[-0.01em] sm:text-[36px]">
          Four things you can hold us to
        </h2>
        <div className="mt-9 grid gap-x-12 gap-y-7 sm:grid-cols-2">
          {WHY_TLE.map((w) => (
            <div key={w.title} className="border-t border-black/10 pt-4">
              <h3 className="text-[15px] font-semibold leading-snug">{w.title}</h3>
              <p className="mt-2 text-[12.5px] font-light leading-relaxed text-black/60">{w.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

/**
 * The close, and it is three different closes.
 *
 * ── Why this slide is kind-aware when almost nothing else is ────────────────
 *
 * James, 4 Sep: the deck that gets SENT to a landlord after the visit "will
 * have an actual call to action at the end of it". Everything above this point
 * is genuinely the same deck in both directions — that was the whole design —
 * but the last screen cannot be, because the three decks are asking for three
 * different things:
 *
 *   pre-appraisal   we have not met. Ask me anything before I arrive.
 *   appraisal       we have just met. I will send the figure across.
 *   post-appraisal  you have the figure and the fee. Sign, or ring me.
 *
 * A single "any questions?" ending would waste the one screen a landlord is
 * guaranteed to reach — and on the post deck it would end the whole argument
 * on a shrug rather than on an ask.
 */
function Questions({ deck }: { deck: Deck }) {
  const a = deck.agent;
  const tel = a.phone.replace(/\s+/g, "");
  const kind = deckKind(deck);
  const post = kind === "post-appraisal";
  const subject = post
    ? `Getting started - ${deck.property.address}`
    : `About my appraisal - ${deck.property.address}`;
  /* Repeated from the terms slide on purpose. A landlord who has scrolled the
     whole deck should not have to scroll back up to act on it, and the button
     is the same button - one signing session, reached from two places. */
  const signUrl = post ? deck.terms?.signUrl ?? null : null;

  const eyebrow = post ? "The next step" : kind === "appraisal" ? "Before we go" : "Before we meet";
  const heading = post
    ? "Shall we get it on the market?"
    : kind === "appraisal"
      ? "Anything we didn’t cover?"
      : "Anything you want to ask first?";

  return (
    <Slide id="questions" dark>
      <div className="mx-auto w-full max-w-3xl">
        <Eyebrow on="dark">{eyebrow}</Eyebrow>
        <h2 className="mt-4 text-[28px] font-light leading-[1.12] tracking-[-0.01em] sm:text-[42px]">
          {heading}
        </h2>
        <p className="mt-5 max-w-xl text-[14px] font-light leading-relaxed text-white/80">
          {post ? (
            <>
              You have the figure, what it costs and what we do for it. Sign the terms and{" "}
              {a.firstName || "your agent"} will get the photographs booked this week - or
              ring first if there is anything you want to go over again.
            </>
          ) : kind === "appraisal" ? (
            <>
              {a.firstName || "Your agent"} will send the figure and the terms across shortly. If
              anything came to mind after we left - about the rent, the timing, or what&rsquo;s
              worth doing first - ask now rather than wondering.
            </>
          ) : (
            <>
              If something comes to mind before {deck.whenPretty ? "we meet" : "the visit"} -
              about the rent, the paperwork, or what the market&rsquo;s doing -{" "}
              {a.firstName || "your agent"} would much rather hear it now than on the doorstep.
            </>
          )}
        </p>

        {signUrl && (
          <a
            href={signUrl}
            className="mt-8 inline-block rounded-full bg-white px-7 py-3.5 text-[15px] font-medium transition-opacity hover:opacity-90"
            style={{ color: RED }}
          >
            Read and sign the terms
          </a>
        )}

        <div className={`${signUrl ? "mt-5" : "mt-9"} flex flex-wrap gap-2.5`}>
          {/* Outlined once the signing button is on the slide. Two solid white
              pills side by side is two primary actions, and the one we are
              actually asking for loses. */}
          {a.phone && (
            <a
              href={`tel:${tel}`}
              className={
                signUrl
                  ? "rounded-full border border-white/35 px-5 py-3 text-[13px] font-medium transition-colors hover:border-white"
                  : "rounded-full bg-white px-5 py-3 text-[13px] font-medium transition-opacity hover:opacity-90"
              }
              style={signUrl ? undefined : { color: RED }}
            >
              {a.phone}
            </a>
          )}
          {a.email && (
            <a
              href={`mailto:${a.email}?subject=${encodeURIComponent(subject)}`}
              className="rounded-full border border-white/35 px-5 py-3 text-[13px] font-medium transition-colors hover:border-white"
            >
              {a.email}
            </a>
          )}
        </div>

        <div className="mt-14 border-t border-white/20 pt-6">
          <Mark on="dark" className="h-8" />
          {/* "See you Tuesday" is right the day before and wrong the day
              after. Once the visit has happened the sign-off has to look
              forwards, not at an appointment already in the past. */}
          <p className="mt-4 text-[12px] font-light text-white/65">
            {post
              ? "Thank you for your time."
              : kind === "appraisal"
                ? "Thanks for having us round."
                : deck.whenPretty
                  ? `See you ${firstWord(deck.whenPretty)}.`
                  : "We look forward to meeting you."}
          </p>
        </div>
      </div>
    </Slide>
  );
}

/** The arrow on the Back and Next controls. Its own component only so the two
 *  buttons cannot drift apart in weight or size. */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={dir === "left" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

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
}: {
  token: string;
  deck: Deck;
  slides: { id: SlideId; title: string; section: SectionId }[];
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
    const t = setTimeout(() => {
      fetch("/api/present/opened", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        keepalive: true,
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [token]);

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
        return <Why />;
      case "questions":
        return <Questions deck={deck} />;

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
  /* Which slides carry white type, so the chrome can invert under them. The
     list shrinks with every slide converted: the entrance went first, then the
     Your Property divider. What is left is the closing screen and the one
     remaining red divider. */
  const onDark = here === "questions" || here === "marketing";
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
    <div className="relative h-[100dvh] w-full overflow-hidden">
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
      <div className="pointer-events-none fixed inset-x-0 top-0 flex items-center justify-end px-6 pt-7 sm:px-10 lg:px-14">
        <div className="flex items-center gap-4">
          {chapter?.label && (
            <span
              className="hidden text-[12.5px] sm:block"
              style={{
                fontFamily: cream ? HAND : undefined,
                color: onDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.5)",
              }}
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

      {/* Bottom: the brand on the left, the two controls on the right. A hard
          rule rather than a fade - the entrance is a flat colour now, and a
          gradient over a flat ground reads as a smudge. */}
      <div
        className="fixed inset-x-0 bottom-0 flex items-center justify-between gap-4 px-6 pb-5 pt-4 sm:px-10 lg:px-16"
        style={{
          background: tint,
          borderTop: `1px solid ${onDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.07)"}`,
        }}
      >
        <span
          className="hidden text-[13px] sm:block"
          style={{
            fontFamily: HAND,
            color: onDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.5)",
          }}
        >
          The Letting Experts
        </span>
        {/* On a phone the brand gives way to the slide's own title — knowing
            where you are beats knowing whose deck it is. */}
        <span
          className="max-w-[45%] truncate text-[12px] sm:hidden"
          style={{
            fontFamily: cream ? HAND : undefined,
            color: onDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.45)",
          }}
        >
          {chapter?.label || slides[at]?.title}
        </span>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => go(at - 1)}
            disabled={at === 0}
            className="flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[13px] transition-opacity disabled:opacity-30 sm:px-5"
            style={{
              borderColor: onDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.15)",
              color: onDark ? "#ffffff" : INK,
            }}
          >
            <Chevron dir="left" />
            Back
          </button>
          <button
            onClick={() => go(at + 1)}
            disabled={at === slides.length - 1}
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-medium transition-opacity disabled:opacity-30 sm:px-6"
            style={{
              background: onDark ? "#ffffff" : INK,
              color: onDark ? accent : "#ffffff",
            }}
          >
            Next
            <Chevron dir="right" />
          </button>
        </div>
      </div>
    </div>
  );
}
