"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
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

const RED = "#e31f36";
const DEEP = "#b3172a";
const INK = "#16181d";
const CREAM = "#f6f4f2";

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

function Welcome({ deck }: { deck: Deck }) {
  const { property, recipientName, whenPretty } = deck;
  return (
    <Slide id="welcome" dark>
      {/* The hero photograph, when there is one. It sits UNDER the type at low
          opacity rather than beside it: dossier images are estate-agent
          photos of wildly different crops and quality, and any layout that
          gives one a defined box looks broken the first time it gets a
          portrait shot of a front door. */}
      {property.image && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={property.image} alt="" className="h-full w-full object-cover opacity-[0.18]" />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, ${RED}cc 0%, ${RED}f2 60%, ${DEEP} 100%)` }}
          />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-3xl">
        <Mark on="dark" className="h-10 sm:h-12" />
        <div className="mt-10 sm:mt-14">
          <Eyebrow on="dark">Your market appraisal</Eyebrow>
          <h1 className="mt-4 text-[30px] font-light leading-[1.12] tracking-[-0.01em] sm:text-[46px]">
            {property.address}
          </h1>
          {recipientName && (
            <p className="mt-5 text-[14px] font-light text-white/85 sm:text-[16px]">
              Prepared for {recipientName}
            </p>
          )}
          {whenPretty && (
            <p className="mt-8 inline-block rounded-full bg-white/15 px-4 py-2 text-[12.5px] font-medium sm:text-[13.5px]">
              {whenPretty}
            </p>
          )}
        </div>
        <p className="mt-12 text-[12px] font-light text-white/70">
          A few things worth knowing before we meet — two minutes, at most.
        </p>
      </div>
    </Slide>
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

          <aside className="rounded-2xl p-6" style={{ background: CREAM }}>
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

  const onDark = slides[at]?.id === "welcome" || slides[at]?.id === "questions";

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
          background: `linear-gradient(to top, ${onDark ? RED : "#ffffff"} 55%, transparent)`,
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
