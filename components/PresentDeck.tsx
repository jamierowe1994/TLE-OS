"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BANNER,
  BRING_ALONG,
  VISIT_STEPS,
  WHY_TLE,
  initialsOf,
  type PresentDeck as Deck,
  type SlideId,
} from "@/lib/present";
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
 * 2. THE PHONE IS THE REAL DEVICE. This arrives by email, two days before a
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
const CLAY = "#de968f";
/** Mist carries the appointment card. Anti Flash White is the other option
 *  and it reads as grey next to the clay banner two slides earlier — the
 *  warm tint keeps the whole deck in one family. */
const MIST = "#ffe4df";
/** Deep enough to carry white type, still in the clay family rather than grey.
 *  Used only for the scrim over the hero photograph. */
const DEEP = "#4a3a35";

/**
 * The flourish hand — see app/layout.tsx for why a script is here at all when
 * the guidelines name Lora Italic. One display word, never body copy.
 */
const FLOW = "var(--font-script), 'Snell Roundhand', cursive";

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

/** Three line icons for the banner. Inline because the deck must render with
 *  no network beyond its own page — a landlord may open this on bad signal. */
function BannerIcon({ name }: { name: "people" | "shield" | "trend" }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "people")
    return (
      <svg {...common} aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6M17 14.4a5.5 5.5 0 0 1 3.5 4.6" />
      </svg>
    );
  if (name === "shield")
    return (
      <svg {...common} aria-hidden>
        <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
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
function Welcome({ deck }: { deck: Deck }) {
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

      <header className="relative flex justify-center px-6 pt-9 sm:pt-12">
        {/* Bigger than everywhere else in the deck. It is stacked artwork —
            a pin over three lines of type — so the height that reads as a
            neat logo in a header renders the words at about ten pixels. */}
        <Mark on="dark" className="h-14 sm:h-16" />
      </header>

      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="w-full max-w-2xl">
          {/* The flowing hand, and the biggest thing on the page.
              A script's letterforms sit inside a fraction of their em box —
              the capital swash reaches high, the x-height is tiny — so it
              needs to be set MUCH larger than a sans to read at the same
              visual weight, and then pulled back in with tight leading and a
              negative margin or it floats half a line above its own baseline. */}
          <p
            className="-ml-1 text-[76px] leading-[0.78] sm:text-[132px]"
            style={{ fontFamily: FLOW, color: CLAY }}
          >
            Welcome
          </p>
          <h1 className="-mt-1 text-[36px] font-light leading-[1.04] tracking-[-0.015em] sm:-mt-4 sm:text-[62px]">
            Let&rsquo;s get started
          </h1>
          <span className="mt-6 block h-[3px] w-[110px] rounded-full" style={{ background: CLAY }} />

          <p className="mt-7 max-w-lg text-[14px] font-light leading-relaxed text-white/90 sm:text-[16.5px]">
            We&rsquo;re excited to show you how we can help you get the most from{" "}
            <span className="text-white">{property.address}</span>.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {whenPretty && (
              <span
                className="rounded-full px-4 py-2 text-[12.5px] font-medium"
                style={{ background: CLAY, color: "#ffffff" }}
              >
                {whenPretty}
              </span>
            )}
            {recipientName && (
              <span className="text-[12.5px] font-light text-white/75">
                Prepared for {recipientName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The banner. Extra bottom padding on a phone so the deck's own dots
          sit inside the clay rather than on the line beneath it. */}
      <div className="relative pb-14 pt-6 lg:pb-8" style={{ background: CLAY }}>
        <div className="mx-auto grid max-w-5xl gap-y-5 px-6 sm:grid-cols-3 sm:gap-x-8 lg:px-10">
          {BANNER.map((b) => (
            <div key={b.title} className="flex items-start gap-3.5">
              <span className="mt-0.5 shrink-0 text-white/90">
                <BannerIcon name={b.icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                  {b.title}
                </span>
                <span className="mt-1 block text-[12px] font-light leading-snug text-white/85">
                  {b.body}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Appointment({ deck }: { deck: Deck }) {
  const { whenPretty, property, agent, minutes } = deck;

  /**
   * The calendar file, built in the browser as a data: URI. No round trip, no
   * endpoint to secure, and it works on the plane — which matters because the
   * single most useful thing this slide does is put the visit in their diary
   * before they put the phone down.
   */
  const ics = deck.startsAt
    ? icsFor({
        landlordName: deck.recipientName,
        address: property.address,
        whenPretty,
        startsAt: deck.startsAt,
        minutes,
        agentName: agent.name,
        agentPhone: agent.phone,
      }, deck.createdAt)
    : null;

  return (
    <Slide id="appointment">
      <div className="mx-auto w-full max-w-5xl">
        <Eyebrow>What happens on the day</Eyebrow>
        <h2 className="mt-3 max-w-2xl text-[26px] font-light leading-[1.15] tracking-[-0.01em] sm:text-[36px]">
          About {minutes} minutes, and you&rsquo;ll know what it lets for
        </h2>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-14">
          {/* The four beats of the visit. Numbered, because the order is the
              reassurance: the number comes after the walk round, not before. */}
          <ol className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {VISIT_STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-black/10 pt-3.5">
                <span className="text-[11px] font-semibold" style={{ color: RED }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1.5 text-[14.5px] font-semibold leading-snug">{s.title}</h3>
                <p className="mt-1.5 text-[12.5px] font-light leading-relaxed text-black/60">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>

          <aside className="rounded-2xl p-6" style={{ background: MIST }}>
            {whenPretty ? (
              <>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">
                  When
                </span>
                <p className="mt-1.5 text-[16px] font-medium leading-snug">{whenPretty}</p>
              </>
            ) : (
              <>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">
                  When
                </span>
                {/* No time in the diary yet. Said plainly rather than left
                    blank — a landlord reading "—" assumes the system is
                    broken; this tells them what to expect instead. */}
                <p className="mt-1.5 text-[13px] font-light leading-relaxed text-black/60">
                  {agent.firstName || "Your agent"} will confirm a time with you directly.
                </p>
              </>
            )}

            <span className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">
              Where
            </span>
            <p className="mt-1.5 text-[13px] font-light leading-snug text-black/75">
              {property.address}
              {property.postcode ? `, ${property.postcode}` : ""}
            </p>

            {agent.name && (
              <>
                <span className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">
                  Who
                </span>
                <p className="mt-1.5 text-[13px] font-light text-black/75">
                  {agent.name}
                  {agent.title ? ` · ${agent.title}` : ""}
                </p>
              </>
            )}

            {ics && (
              <a
                href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
                download="market-appraisal.ics"
                className="mt-6 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: RED }}
              >
                Add it to my calendar
              </a>
            )}

            <span className="mt-6 block text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">
              Handy to have out
            </span>
            <ul className="mt-2 space-y-1.5">
              {BRING_ALONG.map((b) => (
                <li key={b} className="flex gap-2 text-[12px] font-light leading-snug text-black/65">
                  <span style={{ color: RED }}>·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] font-light italic leading-relaxed text-black/45">
              None of it is essential. If you haven&rsquo;t got it, we&rsquo;ll sort it afterwards.
            </p>
          </aside>
        </div>
      </div>
    </Slide>
  );
}

function Agent({ deck }: { deck: Deck }) {
  const a = deck.agent;
  const tel = a.phone.replace(/\s+/g, "");
  /** wa.me wants an international number with no punctuation. UK mobiles are
   *  stored as 07…, so the leading zero becomes 44. */
  const wa = /^0\d{10}$/.test(tel) ? `44${tel.slice(1)}` : null;

  return (
    <Slide id="agent">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[300px_1fr] lg:gap-16">
        {/* On a phone the copy comes FIRST and the portrait sits under it: a
            full-width face pushes the name below the fold, and the name is
            the thing they need. */}
        <div className="order-2 lg:order-1">
          {a.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.photo}
              alt={a.name}
              className="h-[180px] w-[180px] rounded-2xl object-cover object-[center_18%] sm:h-[260px] sm:w-full sm:max-w-[300px]"
            />
          ) : (
            /* No headshot on the REX record. A monogram in the brand red
               reads as a design choice; an empty grey rectangle reads as a
               fault, and about a third of the account has no photo. */
            <div
              className="flex h-[140px] w-[140px] items-center justify-center rounded-2xl text-[38px] font-light text-white sm:h-[220px] sm:w-[220px] sm:text-[56px]"
              style={{ background: RED }}
            >
              {initialsOf(a.name)}
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <Eyebrow>Who you&rsquo;re meeting</Eyebrow>
          <h2 className="mt-3 text-[28px] font-light leading-[1.1] tracking-[-0.01em] sm:text-[40px]">
            {a.name || "Your agent"}
          </h2>
          {a.title && <p className="mt-2 text-[13.5px] font-medium text-black/55">{a.title}</p>}

          {a.bio ? (
            /* Written by them, in their profile. Paragraph breaks preserved —
               it is prose, not a field. */
            <div className="mt-6 max-w-xl space-y-3">
              {a.bio.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="text-[13.5px] font-light leading-relaxed text-black/70">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            /* Nobody on the account has filled a bio in (REX's own field is
               null for all 100 users), so this is the common case, not the
               edge one. It has to stand on its own as a sentence. */
            <p className="mt-6 max-w-xl text-[13.5px] font-light leading-relaxed text-black/70">
              {a.firstName || "Your agent"} looks after lettings across the area and will be the one
              person you deal with — the valuation, the marketing and the call when there&rsquo;s an
              offer.
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-2.5">
            {a.phone && (
              <a
                href={`tel:${tel}`}
                className="rounded-full px-5 py-2.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: RED }}
              >
                Call {a.firstName || "them"} · {a.phone}
              </a>
            )}
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-black/15 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-black/40"
              >
                WhatsApp
              </a>
            )}
            {a.email && (
              <a
                href={`mailto:${a.email}`}
                className="rounded-full border border-black/15 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-black/40"
              >
                Email
              </a>
            )}
          </div>
        </div>
      </div>
    </Slide>
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

  /* Which slide is on screen. An observer rather than a scroll handler: it
     fires once per crossing instead of on every frame of a flick. */
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setAt(i);
          }
        }
      },
      { root, threshold: 0.55 }
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
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

  const body = (id: SlideId) => {
    switch (id) {
      case "welcome":
        return <Welcome deck={deck} />;
      case "appointment":
        return <Appointment deck={deck} />;
      case "agent":
        return <Agent deck={deck} />;
      case "why":
        return <Why />;
      case "questions":
        return <Questions deck={deck} />;
    }
  };

  const here = slides[at]?.id;
  const onDark = here === "welcome" || here === "questions";
  /* What the phone bar fades into. The welcome slide ends in the clay banner,
     not in white or red, and a white fade over it reads as a printing fault. */
  const tint = here === "welcome" ? CLAY : here === "questions" ? RED : "#ffffff";

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
            {body(s.id)}
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
