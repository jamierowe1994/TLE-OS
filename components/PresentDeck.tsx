"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENT_CHIPS,
  BANNER,
  BRING_ALONG,
  defaultBio,
  VISIT_STEPS,
  WHY_TLE,
  initialsOf,
  type PresentDeck as Deck,
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

/**
 * Straight out of TLE Branding 3 — no approximations, no eyedroppered guesses.
 *
 *   Expert Red      #E31F36   the brand
 *   Expert Grey     #3B3B3C   type on light
 *   Anti Flash White #F1F1F1  the quiet surface
 *   Warm Clay       #DE968F   the darker of the two pinks — the banner
 *   Mist            #FFE4DF   the lighter pink
 *
 * The guidelines list "White #000000", which is a typo in the deck rather
 * than an instruction; white is white.
 */
const RED = "#e31f36";
const INK = "#3b3b3c";

/**
 * ── THE COLOURWAY SWITCH ────────────────────────────────────────────────────
 *
 * The deck was first built on the guidelines' warm colourway — Warm Clay
 * banners and Mist cards. It looked good and read FEMININE (James, 13 Aug),
 * which for a landlord audience is the wrong signal however pretty it is.
 *
 * So it now runs on the guidelines' other sanctioned pairing: Expert Red ×
 * White, grounded on Anti Flash White. Same brand, different temperature —
 * the pinks were doing all the softening, and red does none of it.
 *
 * Both sets are kept side by side rather than one being deleted, because
 * this is a judgement about tone that may well be revisited. Swapping the
 * two blocks below puts the warm version back in one edit.
 */
const CLAY = RED;
/** WAS Warm Clay #de968f — the entrance banner, the chips, the card badges. */
const MIST = "#f1f1f1";
/** WAS Mist #ffe4df — the appointment card and the footer band. */
/** Deep enough to carry white type, still in the clay family rather than grey.
 *  Used only for the scrim over the hero photograph. */
const DEEP = "#4a3a35";

/**
 * The flourish hand — see app/layout.tsx for why a script is here at all when
 * the guidelines name Lora Italic. One display word, never body copy.
 */
const FLOW = "var(--font-script), 'Snell Roundhand', cursive";

/** Lora — the guidelines' own serif, carrying the display headings. */
const DISPLAY = "var(--font-display), Georgia, serif";

/** The interior page ground. Neutral now rather than warm-cast: a grey card
 *  on pink paper reads as a mistake, and the paper was half the softness. */
const PAPER = "#fbfbfb";
/** The step badges. Red at a whisper — enough to hold an icon, not enough to
 *  compete with the card. */
const BADGE = "#fdeaec";

/* ───────────────────────── the reveal ───────────────────────── */

/**
 * Slides don't arrive, they surface.
 *
 * James's note: landing on a slide "feels like getting jolted into a bunch of
 * information". True, and it was structural rather than cosmetic — every
 * element of a slide painted at the same instant, so a heading, four numbered
 * steps and a card all demanded attention simultaneously and the eye had
 * nowhere to start.
 *
 * So each block rises in turn, top down, and the order IS the reading order.
 * Roughly 90ms apart: enough to feel choreographed, not enough that anyone
 * waits for it.
 *
 * Two details that matter more than they look:
 *
 *  • The easing is a strong ease-OUT (fast, then settling). Anything with
 *    acceleration in it reads as a slide transition; this reads as focus.
 *
 *  • It respects prefers-reduced-motion — for some people this kind of thing
 *    is genuinely unpleasant, and a landlord can't ask us to turn it off.
 */
function Rise({
  show,
  i = 0,
  className = "",
  style,
  children,
}: {
  show: boolean;
  /** Position in the stagger, not in the DOM. */
  i?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`present-rise ${className}`}
      style={{
        ...style,
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(18px)",
        transitionDelay: `${i * 90}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ───────────────────────── small parts ───────────────────────── */

function Eyebrow({ children, on = "light" }: { children: React.ReactNode; on?: "light" | "dark" }) {
  return (
    <span
      className="block text-[10px] font-semibold uppercase tracking-[0.22em]"
      style={{ color: on === "dark" ? "rgba(255,255,255,0.72)" : RED }}
    >
      {children}
    </span>
  );
}

/** The wordmark. Two files exist because one of them has to sit on red. */
function Mark({ on = "light", className = "h-9" }: { on?: "light" | "dark"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={on === "dark" ? "/brand/tle-logo-white.png" : "/brand/tle-logo.png"}
      alt="The Letting Experts"
      className={`${className} w-auto`}
    />
  );
}

/**
 * A slide. `dark` flips the whole thing to red, which is used exactly twice —
 * the opening and the closing — so the deck has a shape rather than a rhythm
 * of alternating panels nobody asked for.
 */
function Slide({
  id,
  dark = false,
  children,
}: {
  id: SlideId;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-slide={id}
      // min-h rather than h, and no overflow-hidden on the section itself.
      //
      // This was h-[100dvh] with the overflow clipped, which is the right
      // shape for a deck and the wrong one for a phone: the appointment slide
      // is genuinely taller than 812px, and clipping meant the heading was
      // cut off the top and the calendar button off the bottom with nothing
      // to say so. A slide that quietly loses half its content is worse than
      // one that scrolls.
      //
      // pb-24 on small screens keeps the last line clear of the bottom bar.
      // pr-44 on desktop keeps the copy clear of the contents rail, which
      // floats over the slide — without it a hovered title prints straight
      // across a paragraph.
      className="relative flex min-h-[100dvh] w-full shrink-0 snap-start flex-col justify-center px-6 pb-24 pt-16 sm:px-10 lg:px-20 lg:pb-16 lg:pr-44"
      style={{ background: dark ? RED : "#ffffff", color: dark ? "#ffffff" : INK }}
    >
      {children}
    </section>
  );
}

/* ───────────────────────── the slides ───────────────────────── */

/**
 * The line icons.
 *
 * Inline SVG rather than a font or a sprite: the deck must render with no
 * network beyond its own page, because a landlord opens this standing in a
 * kitchen on one bar of signal, and an icon set that arrives late is worse
 * than one that never existed.
 *
 * One stroke weight, one grid, currentColor throughout — so a badge sets the
 * colour once and every icon inside it obeys.
 */
type IconName =
  | "people"
  | "shield"
  | "trend"
  | "home"
  | "chart"
  | "star"
  | "calendar"
  | "pin"
  | "person"
  | "check"
  | "phone"
  | "chat"
  | "heart"
  | "whatsapp"
  | "mail";

/** Which icon belongs to which beat of the visit, in order. */
const STEP_ICONS: IconName[] = ["home", "chart", "people", "star"];

const PATHS: Record<IconName, React.ReactNode> = {
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17 14.4a5.5 5.5 0 0 1 3.5 4.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.8V20h12V9.8" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20V12M10 20V6M15 20v-5M20 20v-9" />
    </>
  ),
  star: (
    <path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9 5.5-.8z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  phone: (
    <path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z" />
  ),
  chat: (
    <path d="M20 12.5a7 7 0 0 1-7 7H8l-4 2.5.9-3.6A7 7 0 0 1 4 12.5a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7z" />
  ),
  heart: (
    <path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7-2.7c0 4.9-7 14.7-7 14.7z" />
  ),
  whatsapp: (
    <>
      <path d="M20 11.6a8 8 0 0 1-11.9 7L3.5 20.5l2-4.5A8 8 0 1 1 20 11.6z" />
      <path d="M9 8.7c.3-.1.6 0 .8.3l.7 1.2c.1.3.1.6-.1.8l-.5.5a5.4 5.4 0 0 0 2.6 2.6l.5-.5c.2-.2.5-.2.8-.1l1.2.7c.3.2.4.5.3.8-.2.7-.9 1.2-1.7 1.1a7.6 7.6 0 0 1-5.7-5.7c-.1-.8.4-1.5 1.1-1.7z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3.6 7L12 13l8.4-6" />
    </>
  ),
};

function Line({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The entrance screen.
 *
 * Built from James's mock-up rather than from the pattern of the other
 * slides, which is why it doesn't use <Slide>: the photograph and the clay
 * banner both go edge to edge, and a slide that centres its content inside
 * padding can't do that.
 *
 * Two departures from the mock-up, both deliberate:
 *
 *  • The scrim runs LEFT to RIGHT rather than darkening the whole frame. The
 *    photograph's left third is a bare wall — it was composed for type — and
 *    dimming the whole room to carry white text throws away the light coming
 *    through the window, which is the best thing in the picture.
 *
 *  • It stays personal. The mock-up's headline is generic; this one still
 *    names the property and who it was prepared for, because that is the
 *    entire reason a landlord opens the link rather than closing it.
 */
function Welcome({ deck, show }: { deck: Deck; show: boolean }) {
  const { property, recipientName, whenPretty } = deck;
  /* Their own property when the dossier found a photograph of it, the styled
     room otherwise. A stock interior is a far better opening than a badly
     cropped estate-agent shot of a front door — but their house, when we have
     it, beats both. */
  const hero = property.image ?? "/brand/living-room.jpg";

  return (
    <section
      data-slide="welcome"
      className="relative flex min-h-[100dvh] w-full shrink-0 snap-start flex-col overflow-hidden text-white"
    >
      <div className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt="" className="h-full w-full object-cover" />
        {/* Warm, not grey. A neutral black scrim over this photograph turns
            the clay and terracotta in it to mud. */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(100deg, ${DEEP}e0 0%, ${DEEP}b8 40%, ${DEEP}47 72%, transparent 100%)`,
          }}
        />
      </div>

      {/* Top left, on the same left margin as the headline, so the logo and
          the type share one edge rather than floating independently. Smaller
          than a centred mark can afford to be: off to the side it reads as a
          signature on the page instead of a title above it. */}
      <header className="relative flex px-6 pt-8 sm:px-12 sm:pt-10 lg:px-20">
        <Rise show={show} i={0}>
          <Mark on="dark" className="h-11 sm:h-12" />
        </Rise>
      </header>

      <div className="relative flex flex-1 flex-col justify-center px-6 py-6 sm:px-12 sm:py-12 lg:px-20">
        <div className="w-full max-w-3xl">
          {/* The flowing hand, and the biggest thing on the page.
              A script's letterforms sit inside a fraction of their em box —
              the capital swash reaches high, the x-height is tiny — so it
              needs to be set MUCH larger than a sans to read at the same
              visual weight, and then pulled back in with tight leading and a
              negative margin or it floats half a line above its own baseline. */}
          {/* Not a Rise — this one is WRITTEN. See components/WelcomeMark:
              the letterforms clip a fat stroke that travels the pen path, so
              the word fills in the order a hand would form it. Sized by width
              rather than font-size because it is artwork now, not text. */}
          <HandWord
            word="welcome"
            written={show}
            color={CLAY}
            size="clamp(69px, 13vw, 134px)"
          />

          <Rise show={show} i={2}>
            {/* Serif, matching the reference and the interior slides — one
                document, not two. */}
            <h1
              className="-mt-2 text-[52px] leading-[1.0] tracking-[-0.01em] sm:-mt-5 sm:text-[104px]"
              style={{ fontFamily: DISPLAY }}
            >
              Let&rsquo;s get started
            </h1>
            <span className="mt-6 block h-[3px] w-[110px] rounded-full" style={{ background: CLAY }} />
          </Rise>

          {/* Brought up with the headline. Against 92px type a 14px line reads
              as a caption rather than a sentence, and this one carries the
              only personalised words on the slide. */}
          <Rise show={show} i={3}>
            <p className="mt-7 max-w-xl text-[15px] font-light leading-relaxed text-white/90 sm:text-[18px]">
              We&rsquo;re excited to show you how we can help you get the most from{" "}
              <span className="text-white">{property.address}</span>.
            </p>
          </Rise>

          <Rise show={show} i={4} className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {whenPretty && (
              <span
                className="rounded-full px-5 py-2.5 text-[13px] font-medium"
                style={{ background: CLAY, color: "#ffffff" }}
              >
                {whenPretty}
              </span>
            )}
            {recipientName && (
              <span className="text-[13px] font-light text-white/75">
                Prepared for {recipientName}
              </span>
            )}
          </Rise>
        </div>
      </div>

      {/* The three promises, sitting ON the photograph rather than on a bar.
          A solid band cut the room off at the knees; a fade keeps the sofa
          and the rug in the picture and still carries white type.

          The blur is doing real work, not decoration: the gradient alone is
          fine over the flat rug and fails over the busy patterned edge, and
          legibility can't depend on which part of a photograph a word lands
          on. It is deliberately slight — enough to quiet the texture, not
          enough to read as frosted glass. */}
      <Rise
        show={show}
        i={5}
        className="relative pb-14 pt-10 backdrop-blur-[3px] sm:pb-24 sm:pt-24 lg:pb-20 lg:pt-20"
        style={{
          background: `linear-gradient(to top, ${DEEP}f2 0%, ${DEEP}d9 42%, ${DEEP}66 76%, transparent 100%)`,
          maskImage: "linear-gradient(to top, #000 76%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, #000 76%, transparent 100%)",
        }}
      >
        <div className="mx-auto grid max-w-6xl gap-y-4 px-6 sm:grid-cols-3 sm:gap-x-10 sm:gap-y-6 lg:px-12">
          {BANNER.map((b) => (
            <div key={b.title} className="flex items-center gap-4">
              {/* Full height of the pair it sits beside — an icon scaled to
                  the title alone reads as a bullet point. */}
              <span className="shrink-0 text-white/85">
                <Line name={b.icon} size={40} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold uppercase tracking-[0.12em] text-white">
                  {b.title}
                </span>
                {/* One line, always. The copy was shortened to fit rather
                    than the type shrunk — a promise that wraps to two lines
                    stops looking like a promise. */}
                <span className="mt-1 block whitespace-nowrap text-[12.5px] font-light leading-snug text-white/85">
                  {b.body}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Rise>
    </section>
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
      className="relative flex min-h-[100dvh] w-full shrink-0 snap-start flex-col"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

      {/* pr-40 on desktop keeps the card clear of the contents rail, which
          floats over every slide. */}
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 lg:py-12 lg:pr-40">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1fr_400px] lg:gap-16">
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
                      serif around it — a script's x-height is far smaller, so
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
          <Rise show={show} i={3}>
            {/* The card carries the red rather than accenting with it — the
                one block big enough to set the page's temperature.
                
                At HALF strength: full red was shouting, and at 50% over the
                paper it still reads unmistakably red while leaving the type
                black and the button somewhere to go. Squarer corners than the
                26px it started at, which suits the flatter colour. */}
            <aside
              className="rounded-[16px] p-6 sm:p-8"
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

      {/* The three promises again, in mist rather than clay. Repeating them
          is the point: it is the one band that appears on every page of the
          reference, and it ties the deck together the way a footer does. */}
      <Rise show={show} i={5}>
        {/* No fill. With the card at half strength the page has enough colour
            in it; a tinted band underneath made the whole slide read as one
            pink block. A hairline is all the separation it needs. */}
        <div className="border-t pb-16 pt-7 lg:pb-8" style={{ borderColor: "rgba(59,59,60,0.10)" }}>
          <div className="mx-auto grid max-w-5xl gap-y-5 px-6 sm:grid-cols-3 sm:gap-x-0 lg:px-10">
            {BANNER.map((b, i) => (
              <div
                key={b.title}
                className={`flex items-center gap-4 sm:px-7 ${i > 0 ? "sm:border-l" : ""}`}
                style={{ borderColor: "rgba(59,59,60,0.14)" }}
              >
                <span className="shrink-0" style={{ color: RED }}>
                  <Line name={b.icon} size={28} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em]">
                    {b.title}
                  </span>
                  <span className="mt-1 block text-[12.5px] font-light leading-snug text-black/60">
                    {b.body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Rise>
    </section>
  );
}

function Agent({ deck, show }: { deck: Deck; show: boolean }) {
  const a = deck.agent;
  const video = deck.welcomeVideo ?? null;
  const tel = a.phone.replace(/\s+/g, "");
  /** wa.me wants an international number with no punctuation. UK mobiles are
   *  stored as 07…, so the leading zero becomes 44. */
  const wa = /^0\d{10}$/.test(tel) ? `44${tel.slice(1)}` : null;

  /* Their own words when they've written them; otherwise a real introduction
     rather than a placeholder — see defaultBio, and note that nobody on the
     REX account has a bio, so this is the usual case. */
  const paragraphs = (a.bio.trim() || defaultBio(a.firstName)).split(/\n{2,}/);

  const OUTLINE =
    "flex items-center gap-2.5 rounded-full border px-5 py-3 text-[13px] font-medium transition-colors";

  return (
    <section
      data-slide="agent"
      className="relative flex min-h-[100dvh] w-full shrink-0 snap-start flex-col"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 lg:py-12 lg:pr-40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-9 lg:grid-cols-[420px_1fr] lg:gap-14">
          {/* The portrait leads, and it is the point of the slide — this is
              the one moment before the visit where the landlord sees a face.
              Capped on a phone so the name still lands above the fold. */}
          <Rise show={show} i={0}>
            {a.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.photo}
                alt={a.name}
                className="max-h-[38vh] w-full rounded-[18px] object-cover object-[center_18%] lg:max-h-none lg:aspect-[3/4]"
              />
            ) : (
              /* Four of the fourteen TLE people have no photo on their REX
                 record (measured). A monogram in the brand red reads as a
                 design choice; an empty rectangle reads as a fault. */
              <div
                className="flex h-[38vh] w-full items-center justify-center rounded-[18px] text-[68px] font-light text-white lg:aspect-[3/4] lg:h-auto"
                style={{ background: RED }}
              >
                {initialsOf(a.name)}
              </div>
            )}
          </Rise>

          <div className="min-w-0">
            <Rise show={show} i={1}>
              <Eyebrow>Who you&rsquo;ll be meeting</Eyebrow>
              <h2
                className="mt-3 text-[34px] leading-[1.05] sm:text-[50px]"
                style={{ fontFamily: DISPLAY }}
              >
                {a.name || "Your agent"}
              </h2>
              {a.title && (
                <p className="mt-2 text-[15px] font-light text-black/55">{a.title}</p>
              )}
              <span
                className="mt-5 block h-[3px] w-[34px] rounded-full"
                style={{ background: RED }}
              />
            </Rise>

            <Rise show={show} i={2}>
              <div className="mt-6 max-w-xl space-y-4">
                {paragraphs.map((p, i) => (
                  <p key={i} className="text-[14px] font-light leading-relaxed text-black/70">
                    {p}
                  </p>
                ))}
              </div>
            </Rise>

            {/* The agent's own welcome, if they recorded one.
                Here rather than on the opening slide: this is the slide about
                the person, and a video of them talking belongs beside their
                face and their words, not over the hero photograph.

                Only ever rendered when it is genuinely playable. A recording
                that is still processing shows NOTHING — a landlord opening
                this page has no idea a video was coming, so an empty player or
                a spinner can only read as something broken. */}
            {video?.status === "ready" && video.embedUrl && (
              <Rise show={show} i={3}>
                <div className="mt-8 max-w-xl">
                  <Eyebrow>A message from {a.firstName || "your agent"}</Eyebrow>
                  <iframe
                    src={`${video.embedUrl}?theme=light&accent=${RED.replace("#", "")}`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    className="mt-3 w-full rounded-[14px] border-0"
                    style={{ aspectRatio: "16 / 9" }}
                    title={`Welcome from ${a.name}`}
                  />
                </div>
              </Rise>
            )}

            <Rise show={show} i={3}>
              <div className="mt-8 flex flex-wrap gap-3">
                {a.phone && (
                  <a
                    href={`tel:${tel}`}
                    className="flex items-center gap-2.5 rounded-full px-5 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: RED }}
                  >
                    <Line name="phone" size={17} />
                    Call {a.firstName || "them"} · {a.phone}
                  </a>
                )}
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`${OUTLINE} hover:border-black/40`}
                    style={{ borderColor: "rgba(59,59,60,0.20)" }}
                  >
                    <Line name="whatsapp" size={17} />
                    WhatsApp
                  </a>
                )}
                {a.email && (
                  <a
                    href={`mailto:${a.email}`}
                    className={`${OUTLINE} hover:border-black/40`}
                    style={{ borderColor: "rgba(59,59,60,0.20)" }}
                  >
                    <Line name="mail" size={17} />
                    Email
                  </a>
                )}
              </div>
            </Rise>

            <Rise show={show} i={4}>
              <div
                className="mt-8 grid max-w-2xl gap-y-5 rounded-[14px] px-6 py-5 sm:grid-cols-3 sm:gap-x-0"
                style={{ background: MIST }}
              >
                {AGENT_CHIPS.map((c, i) => (
                  <div
                    key={c.title}
                    className={`flex items-start gap-3 sm:px-5 ${i > 0 ? "sm:border-l" : ""}`}
                    style={{ borderColor: "rgba(59,59,60,0.14)" }}
                  >
                    <span className="mt-0.5 shrink-0" style={{ color: RED }}>
                      <Line name={c.icon} size={21} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold leading-snug">
                        {c.title}
                      </span>
                      <span className="mt-1 block text-[11.5px] font-light leading-snug text-black/55">
                        {c.body}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Rise>
          </div>
        </div>
      </div>
    </section>
  );
}


/**
 * What's letting nearby — the working, not just the answer.
 *
 * A landlord's first question about a valuation is "says who". So the range
 * comes with the properties it was built from, named, with how long they took
 * to let. That is the difference between a number and an argument.
 *
 * The caveat, when the research produced one, is shown HERE TOO. A range we
 * would qualify to our own agent is a range we must qualify to the landlord —
 * quoting it unqualified to the person it affects is the dishonest half of a
 * disclosure.
 *
 * Snapshotted at send, never live. The figure a landlord opens on Sunday must
 * be the figure the agent approved on Friday.
 */
function Comparables({ deck, show }: { deck: Deck; show: boolean }) {
  const c = deck.comparables;
  if (!c) return null;
  const money = (n: number) => `\u00a3${Math.round(n).toLocaleString("en-GB")}`;

  return (
    <section
      data-slide="comparables"
      className="relative flex min-h-[100dvh] w-full shrink-0 snap-start flex-col"
      style={{ background: PAPER, color: INK }}
    >
      <header className="px-6 pt-8 sm:px-12 sm:pt-10 lg:px-16">
        <Mark className="h-10 sm:h-11" />
      </header>

      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <Rise show={show} i={0}>
            <Eyebrow>What&rsquo;s letting nearby</Eyebrow>
            <h2 className="mt-3 text-[34px] leading-[1.05] sm:text-[50px]" style={{ fontFamily: DISPLAY }}>
              {money(c.guideLow)}&ndash;{money(c.guideHigh)}
              <span className="text-[18px] font-light sm:text-[24px]"> pcm</span>
            </h2>
            <p className="mt-2 text-[15px] font-light text-black/55">
              Based on {c.basedOn} propert{c.basedOn === 1 ? "y" : "ies"} we are letting near you.
              We&rsquo;ll land on the figure together on the day.
            </p>
            <span className="mt-5 block h-[3px] w-[34px] rounded-full" style={{ background: RED }} />
          </Rise>

          <Rise show={show} i={1}>
            <ul className="mt-7 divide-y divide-black/8 border-y border-black/8">
              {c.rows.slice(0, 6).map((r) => (
                <li key={`${r.name}-${r.rent}`} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px]">{r.name}</span>
                    <span className="block text-[12px] font-light text-black/50">{r.locality}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    {r.days != null && (
                      <span className="text-[12px] font-light text-black/50">
                        {r.letAgreed ? `let in ${r.days} days` : `${r.days} days`}
                      </span>
                    )}
                    <span className="text-[15px] font-medium">{r.rent}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Rise>

          {c.caveat && (
            <Rise show={show} i={2}>
              <p className="mt-5 max-w-2xl text-[12.5px] font-light leading-relaxed text-black/55">
                {c.caveat}
              </p>
            </Rise>
          )}
        </div>
      </div>
    </section>
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
     group of small numbers still reads — but a genuine zero draws nothing
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
           12px — measured, they were clipping to "Over 3 mont…" on the slide a
           landlord reads. Agency names get more still and truncate anyway. */
        className={`${wide ? "w-[152px]" : "w-[104px]"} shrink-0 truncate text-[12px] font-light text-black/60`}
      >
        {label}
      </span>
      <span className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-black/8">
        {/* Softened deliberately. At full strength twelve of these read as a
            warning panel rather than a market — the bar's job is to carry the
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
      className="relative flex min-h-[100dvh] w-full shrink-0 snap-start flex-col"
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
              "has been advertised" against "took to let" — because they are
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
                      right={b.rent ? money(b.rent) : "—"}
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

function Questions({ deck }: { deck: Deck }) {
  const a = deck.agent;
  const tel = a.phone.replace(/\s+/g, "");
  const subject = `About my appraisal — ${deck.property.address}`;
  return (
    <Slide id="questions" dark>
      <div className="mx-auto w-full max-w-3xl">
        <Eyebrow on="dark">Before we meet</Eyebrow>
        <h2 className="mt-4 text-[28px] font-light leading-[1.12] tracking-[-0.01em] sm:text-[42px]">
          Anything you want to ask first?
        </h2>
        <p className="mt-5 max-w-xl text-[14px] font-light leading-relaxed text-white/80">
          If something comes to mind before {deck.whenPretty ? "we meet" : "the visit"} — about the
          rent, the paperwork, or what the market&rsquo;s doing — {a.firstName || "your agent"} would
          much rather hear it now than on the doorstep.
        </p>

        <div className="mt-9 flex flex-wrap gap-2.5">
          {a.phone && (
            <a
              href={`tel:${tel}`}
              className="rounded-full bg-white px-5 py-3 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ color: RED }}
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
          <p className="mt-4 text-[12px] font-light text-white/65">
            {deck.whenPretty ? `See you ${firstWord(deck.whenPretty)}.` : "We look forward to meeting you."}
          </p>
        </div>
      </div>
    </Slide>
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
  slides: { id: SlideId; title: string }[];
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
   * WHICH DOT IS LIT is a precise question: exactly one slide at a time. A
   * band across the middle of the scrollport answers it for a slide of ANY
   * height — which a percentage threshold cannot. This was originally
   * `threshold: 0.55`, and on a phone the appointment slide is taller than
   * the screen, so 55% of it could never be visible: the slide never became
   * current, and once the reveal depended on that it rendered BLANK. A
   * visibility rule that can be mathematically impossible to satisfy is a
   * rule that will eventually hide the page.
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
      { root, rootMargin: "-45% 0px -45% 0px", threshold: 0 }
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
      // time it is properly in view rather than starting its rise then.
      { root, rootMargin: "0px 0px 15% 0px", threshold: 0 }
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
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* Arrow keys and space, for whoever opens it on a laptop. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(Math.min(at + 1, slides.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
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
      case "market":
        return <Market deck={deck} show={show(i)} />;
      case "why":
        return <Why />;
      case "questions":
        return <Questions deck={deck} />;
    }
  };

  const here = slides[at]?.id;
  const onDark = here === "welcome" || here === "questions";
  /* What the phone bar fades into — the colour the slide actually ENDS in.
     The entrance used to end in a solid banner and now ends in a fade over
     the photograph, so it takes the scrim colour; a red strip under it read
     as a stray band across the picture. */
  const tint = here === "welcome" ? DEEP : here === "questions" ? RED : PAPER;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div
        ref={scroller}
        // PROXIMITY on a phone, MANDATORY on a laptop. Mandatory snapping
        // fights any slide taller than the viewport — the browser keeps
        // pulling you back to the slide edge as you try to read the middle of
        // it. On desktop every slide fits, so the firmer snap is free.
        className="h-full w-full snap-y snap-proximity overflow-y-auto scroll-smooth lg:snap-mandatory"
        // The rail and the dots are the navigation; the browser's own bar is
        // noise over a full-bleed red slide.
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((s, i) => (
          <div key={s.id} data-index={i}>
            {body(s.id, i)}
          </div>
        ))}
      </div>

      {/* Desktop: the contents down the right, so the landlord can see how
          long this is. Four dots is a promise that it ends. */}
      <nav className="pointer-events-none fixed right-8 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-3 lg:flex">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => go(i)}
            className="pointer-events-auto group flex items-center gap-3 text-right"
            aria-label={s.title}
          >
            <span
              className={`text-[11px] font-medium transition-opacity ${
                i === at ? "opacity-100" : "opacity-0 group-hover:opacity-60"
              }`}
              style={{ color: onDark ? "#ffffff" : INK }}
            >
              {s.title}
            </span>
            <span
              className="block h-1.5 rounded-full transition-all"
              style={{
                width: i === at ? 22 : 6,
                background: onDark
                  ? i === at
                    ? "#ffffff"
                    : "rgba(255,255,255,0.45)"
                  : i === at
                    ? RED
                    : "rgba(0,0,0,0.2)",
              }}
            />
          </button>
        ))}
      </nav>

      {/* Phone: a thin bar. Title, dots, one arrow — nothing that competes
          with the slide for the bottom of a small screen. */}
      <div
        className="fixed inset-x-0 bottom-0 flex items-center justify-between px-5 pb-3.5 pt-8 lg:hidden"
        // A fade to the slide's own colour rather than a bar. Content now
        // scrolls under this on the taller slides, and a label floating over
        // a paragraph is unreadable; a panel across the bottom of a phone
        // costs a line of copy on every slide that didn't need one.
        style={{
          background: `linear-gradient(to top, ${tint} 55%, transparent)`,
        }}
      >
        <span
          className="text-[11px] font-medium tracking-wide"
          style={{ color: onDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.5)" }}
        >
          {slides[at]?.title}
        </span>
        <div className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              aria-label={s.title}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === at ? 16 : 6,
                background: onDark
                  ? i === at
                    ? "#ffffff"
                    : "rgba(255,255,255,0.4)"
                  : i === at
                    ? RED
                    : "rgba(0,0,0,0.18)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
