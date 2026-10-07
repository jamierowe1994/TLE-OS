"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BRING_ALONG,
  VISIT_STEPS,
  defaultBio,
  initialsOf,
  type PresentDeck as Deck,
  type SlideId,
} from "@/lib/present";
import { icsFor } from "@/lib/appraisal-email";
import { Line, Stage, useStage, STEP_ICONS, WelcomeVideoButton, welcomeReady, type IconName } from "@/components/present-kit";
import { FROM_US, FROM_YOU } from "@/components/PresentDeck";
import { caveat, figtree } from "@/lib/brochure-fonts";

/**
 * THE PRE-APPRAISAL IN THE BROCHURE LOOK. James, 7 Oct 2026, from a design
 * he made on a canvas (claude.ai/artifact/LgtofCXr6ga8yjFVzK2kfK, "Pre-
 * appraisal brochure"): "I actually quite like the aesthetic... replicate
 * this to the best of our degree." Then, seeing it built as a scrolling page:
 * "don't build it on a scroll. It still needs to go from left to right as
 * per normal. It's just that that's how they built the artefact."
 *
 * So: the canvas's look laid out as slides on the 1440x900 stage, moved
 * through with Back and Next like the other looks. Rebuilt the same day from
 * James's second canvas: the welcome's photograph became the appointment
 * ticket with the key facts under it, "before we arrive" became one dark
 * panel, the agent's portrait moved left with a name badge on a clip, and
 * the accent moved from clay to sage with near-black buttons.
 *
 * THE PRE-APPRAISAL since 7 Oct 2026 ("we're going to use the brochure ...
 * and make that the new version"): every pre-appraisal link, the showroom
 * sample and the builder's preview render this. Seven slides, because the
 * canvas has seven sections: welcome, the day, before we arrive, the agent, the
 * commitments, quick answers, the close.
 *
 * Departures from the canvas: the real logo; every name, date and link from
 * the deck; the deck's approved wording wherever the canvas re-worded a line
 * the deck already carries (the four beats, the two lists, the checklist,
 * the reassurance under "prepare anything", the handwritten captions); no em
 * dashes; and no dark footer, which on a slide would sit under Back and Next.
 */

const INK = "#2B2523";
const BODY = "#6B6360";
const BROWN = "#4A3631";
const CLAY = "#B97A70";
const CLAY_DEEP = "#9C5A50";
const PINK = "#F4E6E3";
const PINK_SOFT = "#FBF5F3";
const SAGE = "#E7EADF";
const SAGE_INK = "#5E6B4E";
const SAGE_DEEP = "#3E4734";
const RULE = "#EFE6E3";
/* The second canvas (7 Oct 2026) moved the accent to sage and the dark
   fills to a near-black; James the same evening: "make the black brown". So
   every dark fill - the ticket, the panel, the badge, the buttons - is the
   brochure's brown. Headings stay ink. */
const DARK = "#4A3631";
const SAGE_MID = "#8E9B7B";
/* Anything set ON the brown is pink, never sage (James, 7 Oct 2026). */
const ON_BROWN = "#F4E6E3";
const HAIR = "#ECE8E5";

const DISPLAY = "var(--font-bricolage), sans-serif";
const HAND = "var(--font-caveat), cursive";
const X = 80;
/* How much of the window the 1440x900 stage fills (James, 7 Oct 2026: "a
   bit more margin... maybe 10% smaller, maybe 15% at most"). The stage still
   fits itself to the window first, so this holds at every screen size. */
const STAGE_FILL = 0.88;
/* Corner rounding (James, 7 Oct 2026: "slightly less rounded over"). Cards
   and answers take BOX, the two big panels PANEL. The ticket and the agent's
   portrait keep their 28 - he asked for those two to stay as they are. */
const BOX = 14;
const PANEL = 20;

/* Every entrance animation is applied only once its slide has been reached,
   so a slide plays its arrival when you get to it rather than off-screen on
   page load. Until then `.bro-off` holds it hidden. */
const CSS = `
.bro *{box-sizing:border-box}
.bro ::selection{background:#E7EADF}
@keyframes bro-rise{from{transform:translateY(110%) rotate(3deg);opacity:0}to{transform:none;opacity:1}}
@keyframes bro-fade{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}
@keyframes bro-unveil{from{clip-path:inset(100% 0 0 0 round 20px)}to{clip-path:inset(0 0 0 0 round 20px)}}
@keyframes bro-zoom{from{transform:scale(1.18)}to{transform:scale(1.04)}}
@keyframes bro-draw{to{stroke-dashoffset:0}}
@keyframes bro-morph{0%{border-radius:58% 42% 38% 62%/52% 38% 62% 48%;transform:rotate(0)}50%{border-radius:40% 60% 62% 38%/38% 58% 42% 62%;transform:rotate(8deg)}100%{border-radius:62% 38% 46% 54%/60% 44% 56% 40%;transform:rotate(-6deg)}}
@keyframes bro-spin{to{transform:rotate(360deg)}}
@keyframes bro-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-10px) rotate(-2deg)}}
@keyframes bro-marquee{to{transform:translateX(-50%)}}
@keyframes bro-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-10deg)}75%{transform:rotate(10deg)}}
@keyframes bro-pop{0%{transform:scale(.4)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes bro-nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
@keyframes bro-ring{from{stroke-dashoffset:553}to{stroke-dashoffset:0}}
@keyframes bro-deal{0%{transform:translateY(90px) rotate(9deg);opacity:0}60%{opacity:1}100%{transform:rotate(-2.5deg);opacity:1}}
@keyframes bro-stamp{0%{transform:scale(2.4) rotate(-30deg);opacity:0}60%{transform:scale(.92) rotate(-14deg);opacity:1}100%{transform:scale(1) rotate(-12deg);opacity:1}}
@keyframes bro-swing{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(-1deg)}}
@keyframes bro-wipe{from{clip-path:inset(0 0 100% 0 round 28px)}to{clip-path:inset(0 0 0 0 round 28px)}}
.bro-ticket{animation:bro-deal 1.1s cubic-bezier(.2,.8,.2,1) .35s both;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.bro-ticket:hover{transform:rotate(0) translateY(-6px) !important}
.bro-stamp{animation:bro-stamp .6s cubic-bezier(.2,.8,.2,1) 1.4s both}
.bro-tag{transform-origin:50% 0;animation:bro-swing 4.5s ease-in-out infinite}
.bro-wipe{animation:bro-wipe 1.2s cubic-bezier(.7,0,.2,1) .15s both}
.bro-grow{transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.bro-grow:hover{transform:scale(1.04)}
.bro-grow:active{transform:scale(.99)}
.bro-grow:focus-visible{outline:3px solid #F4E6E3;outline-offset:3px}
.bro-row{transition:padding-left .35s cubic-bezier(.2,.8,.2,1)}
.bro-row:hover{padding-left:10px}
.bro-off{opacity:0}
.bro-ln{display:block;overflow:hidden;padding-bottom:.08em;margin-bottom:-.08em}
.bro-w{display:inline-block;animation:bro-rise .9s cubic-bezier(.2,.8,.2,1) both}
.bro-in{animation:bro-fade .9s cubic-bezier(.2,.8,.2,1) both}
.bro-unveil{animation:bro-unveil 1.2s cubic-bezier(.7,0,.2,1) .2s both}
.bro-zoom{animation:bro-zoom 2.4s cubic-bezier(.2,.8,.2,1) .2s both}
.bro-draw{stroke-dasharray:420;stroke-dashoffset:420}
.bro-draw.on{animation:bro-draw 1.1s cubic-bezier(.6,0,.2,1) both}
.bro-ring{stroke-dasharray:553;stroke-dashoffset:553}
.bro-ring.on{animation:bro-ring 1.6s cubic-bezier(.6,0,.2,1) .5s both}
.bro-blob{animation:bro-morph 12s ease-in-out infinite alternate}
.bro-spin{animation:bro-spin 22s linear infinite}
.bro-bob{animation:bro-bob 5s ease-in-out infinite}
.bro-mq{animation:bro-marquee 40s linear infinite}
.bro-nudge{animation:bro-nudge 1.8s ease-in-out infinite}
.bro-pop{animation:bro-pop .35s cubic-bezier(.2,.8,.2,1) both}
.bro-lift{transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s}
.bro-lift:hover{transform:translateY(-8px) rotate(-.6deg);box-shadow:0 24px 50px -24px rgba(43,37,35,.35)}
.bro-lift:hover .bro-ic{animation:bro-wiggle .5s ease-in-out}
.bro-btn{transition:transform .25s,background-color .25s,box-shadow .25s,opacity .25s}
.bro-btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px -12px rgba(74,54,49,.5)}
.bro-btn:focus-visible,.bro-tap:focus-visible{outline:3px solid #8E9B7B;outline-offset:3px}
.bro-tap{transition:background-color .25s,transform .2s}
.bro-tap:hover{background-color:#F6F3F1}
.bro-tap:active{transform:scale(.98)}
@media (prefers-reduced-motion: reduce){
.bro *,.bro *::before,.bro *::after{animation:none !important;transition:none !important}
.bro .bro-off{opacity:1}
.bro .bro-draw,.bro .bro-ring{stroke-dashoffset:0}
}
`;

/* ───────────────────────── small parts ───────────────────────── */

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** When, where and who, and the calendar file - the same facts every deck prints. */
function appointmentFacts(deck: Deck) {
  const { whenPretty, property, agent, minutes } = deck;
  const ics = deck.startsAt
    ? icsFor(
        { landlordName: deck.recipientName, address: property.address, whenPretty, startsAt: deck.startsAt, minutes, agentName: agent.name, agentPhone: agent.phone },
        deck.createdAt
      )
    : null;
  const facts: { icon: IconName; label: string; value: string; soft?: boolean }[] = [
    { icon: "calendar", label: "When", value: whenPretty || `${agent.firstName || "Your agent"} will confirm a time with you directly`, soft: !whenPretty },
    {
      icon: "pin",
      label: "Where",
      value: `${property.address}${property.postcode && !property.address.toUpperCase().includes(property.postcode.toUpperCase()) ? `, ${property.postcode}` : ""}`,
    },
    ...(agent.name ? [{ icon: "person" as IconName, label: "Who", value: `${agent.name}${agent.title ? ` · ${agent.title}` : ""}` }] : []),
  ];
  return { ics, facts };
}

/** An entrance: `kind` plays once `show` is true, `delay` in seconds. */
const enter = (show: boolean, kind = "bro-in") => (show ? kind : "bro-off");
const at = (delay: number): React.CSSProperties => ({ animationDelay: `${delay}s` });

const eyebrowStyle: React.CSSProperties = { margin: "0 0 18px", fontSize: 13, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: BODY, display: "flex", alignItems: "center", gap: 12 };
const h2 = (size: number | string): React.CSSProperties => ({ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: "-0.04em", color: INK });
const lead: React.CSSProperties = { fontSize: 18, lineHeight: 1.6, color: BODY, margin: 0 };
const pill = (dark: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 10, minHeight: 52, padding: "0 24px", borderRadius: 999,
  background: dark ? BROWN : "#FFFFFF", color: dark ? "#FFFFFF" : INK, textDecoration: "none", fontWeight: 600, fontSize: 15,
  border: dark ? "none" : "1.5px solid #E6D6D2", cursor: "pointer", font: "inherit",
});
const round: React.CSSProperties = { display: "inline-grid", placeItems: "center", width: 52, height: 52, borderRadius: "50%", background: SAGE, color: SAGE_DEEP, textDecoration: "none" };
const blob = (style: React.CSSProperties) => <div aria-hidden className="bro-blob" style={{ position: "absolute", ...style }} />;

/** "01", a short rule, the section's name. No dash character. */
function Eyebrow({ n, children, show, delay = 0 }: { n?: string; children: React.ReactNode; show: boolean; delay?: number }) {
  return (
    <p className={enter(show)} style={{ ...eyebrowStyle, ...at(delay) }}>
      {n && (
        <>
          <span style={{ color: SAGE_INK }}>{n}</span>
          <span aria-hidden style={{ width: 22, height: 1.5, background: "currentColor", opacity: 0.5 }} />
        </>
      )}
      {children}
    </p>
  );
}

/** A handwritten note, with an optional stroke drawn under it. */
function Note({ children, show, delay, size = 34, color = BROWN, line, style }: { children: React.ReactNode; show: boolean; delay: number; size?: number; color?: string; line?: number; style?: React.CSSProperties }) {
  return (
    <div className={enter(show)} style={{ ...at(delay), fontFamily: HAND, fontWeight: 600, fontSize: size, color, lineHeight: 1, ...style }}>
      {children}
      {line && (
        <svg viewBox={`0 0 ${line} 16`} style={{ display: "block", width: line, height: 14, marginTop: 4 }} aria-hidden>
          <path className={`bro-draw ${show ? "on" : ""}`} style={at(delay + 0.5)} d={`M3 10C${line * 0.3} 3 ${line * 0.65} 2 ${line - 3} 8`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

function Stars({ n, color = CLAY }: { n: number; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 3, color }} aria-label={`${n} out of 5`}>
      {Array.from({ length: n }, (_, i) => (
        <svg key={i} width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
        </svg>
      ))}
    </div>
  );
}

/** The date pieces the badge and the sign-off need, in UK time. */
function datePieces(startsAt: string | null | undefined, whenPretty?: string | null) {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.valueOf())) return null;
  const tz = "Europe/London";
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: tz }).format(d);
  const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(d).replace(/\s/g, "").toLowerCase();
  /* The day word comes from the deck's own "Tuesday 19 August at 2:00pm"
     when there is one, so this look can never name a different day from the
     line the other slides and the emails print. */
  const said = whenPretty?.trim().split(/\s+/)[0];
  return { day: said && /day$/i.test(said) ? said : day, short, time };
}

/* ───────────────────────── the slide shell ───────────────────────── */

type Ctx = { deck: Deck; show: boolean; i: number; total: number; go: (i: number) => void; titles: string[]; ground: string };

/**
 * One slide: the stage (or the stacked phone layout), the logo and the
 * "Prepared for" pill along the top, the counter and Back/Next along the
 * foot. `stage` is laid out on 1440x900; `phone` is the same content in a
 * column.
 */
function Slide({ c, ground = "#FFFFFF", stage, phone }: { c: Ctx; ground?: string; stage: React.ReactNode; phone: React.ReactNode }) {
  const { host, fit } = useStage();
  const fx = fit.staged;
  return (
    <section
      ref={host}
      className={`relative flex min-h-full w-full shrink-0 justify-center overflow-hidden ${fx ? "items-center" : "items-start"}`}
      style={{ background: ground, color: INK }}
    >
      <Stage fit={fx ? { staged: true, scale: fit.scale * STAGE_FILL } : fit}>
        {fx ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className="absolute z-[6]" style={{ left: X, top: 40, height: 42 }} />
            {stage}
            <Foot c={c} />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-5 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" style={{ height: 34 }} />
            </div>
            <div className="px-5 pb-6 pt-8">{phone}</div>
            {c.i < c.total - 1 && (
              <div className="flex justify-end px-5 pb-10">
                <button type="button" onClick={() => c.go(c.i + 1)} className="bro-btn" style={{ ...pill(true), background: DARK, paddingRight: 8 }}>
                  Next <span style={{ fontWeight: 400, opacity: 0.7 }}>{c.titles[c.i + 1]}</span>
                  <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.14)" }}><Arrow /></span>
                </button>
              </div>
            )}
          </>
        )}
      </Stage>
    </section>
  );
}

function Foot({ c }: { c: Ctx }) {
  return (
    <>
      <div className="absolute z-[6] flex items-center gap-3" style={{ left: X, bottom: 46 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>
          {String(c.i + 1).padStart(2, "0")}
          <span style={{ color: BODY, fontWeight: 500 }}> / {String(c.total).padStart(2, "0")}</span>
        </span>
        <span style={{ fontSize: 13, color: BODY }}>{c.titles[c.i]}</span>
      </div>
      <div className="absolute z-[6] flex items-center gap-2.5" style={{ right: X, bottom: 36 }}>
        {([["Back", -1], ["Next", 1]] as const).map(([label, dir]) => {
          const to = c.i + dir;
          const can = to >= 0 && to < c.total;
          const solid = dir > 0;
          return (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              disabled={!can}
              onClick={() => can && c.go(to)}
              className="bro-btn"
              style={{
                display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: "50%", border: solid ? "none" : "1.5px solid #E6D6D2",
                background: solid ? DARK : "#FFFFFF", color: solid ? "#FFFFFF" : INK, opacity: can ? 1 : 0.35, cursor: can ? "pointer" : "default",
              }}
            >
              <span style={{ display: "flex", transform: dir < 0 ? "scaleX(-1)" : undefined }}><Arrow /></span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ───────────────────────── 1. Welcome ───────────────────────── */

/**
 * The appointment as a ticket (James's second canvas, 7 Oct 2026): brown,
 * a "45 MINS" stamp, a perforation,
 * where and who below it, and the calendar button. It replaces the door
 * photograph, the date badge and the handwritten note of the first canvas.
 */
function Ticket({ c, width }: { c: Ctx; width: number }) {
  const { deck, show } = c;
  const a = deck.agent;
  const when = datePieces(deck.startsAt, deck.whenPretty);
  const { ics, facts } = appointmentFacts(deck);
  const where = facts.find((f) => f.label === "Where");
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase", color: "#A59D99" };
  /* A phone's ticket is narrower, so the date and the stamp both come down
     a size rather than meeting in the middle. */
  const tight = width < 400;
  const stamp = tight ? 74 : 92;
  return (
    <div style={{ position: "relative", width, maxWidth: "100%", padding: "20px 0" }}>
      <div className={show ? "bro-ticket" : "bro-off"} style={{ position: "relative", borderRadius: 28, background: DARK, color: "#FFFFFF" }}>
        <div style={{ padding: "30px 30px 26px", position: "relative" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".24em", textTransform: "uppercase", color: ON_BROWN }}>Your valuation</div>
          {when ? (
            <>
              <div style={{ marginTop: 18, fontFamily: DISPLAY, fontWeight: 700, fontSize: tight ? 42 : 56, lineHeight: 0.95, letterSpacing: "-0.045em" }}>{when.day.slice(0, 3)} {when.short}</div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 500, color: "#D8D2CE" }}>{when.time}</div>
            </>
          ) : (
            <div style={{ marginTop: 18, maxWidth: 230, fontSize: 19, fontWeight: 500, lineHeight: 1.35, color: "#D8D2CE" }}>{a.firstName || "Your agent"} will confirm a time with you directly</div>
          )}
          <div className={show ? "bro-stamp" : "bro-off"} style={{ position: "absolute", top: tight ? 18 : 22, right: tight ? 18 : 22, width: stamp, height: stamp, borderRadius: "50%", border: `2px solid ${ON_BROWN}`, display: "grid", placeItems: "center", textAlign: "center", color: ON_BROWN }}>
            <div style={{ position: "absolute", inset: 5, borderRadius: "50%", border: "1px dashed #B98F87" }} />
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: tight ? 24 : 30, letterSpacing: "-0.04em" }}>{deck.minutes}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em" }}>MINS</div>
            </div>
          </div>
        </div>
        {/* the perforation */}
        <div style={{ position: "relative", height: 28 }} aria-hidden>
          <span style={{ position: "absolute", left: -14, top: 0, width: 28, height: 28, borderRadius: "50%", background: c.ground }} />
          <span style={{ position: "absolute", right: -14, top: 0, width: 28, height: 28, borderRadius: "50%", background: c.ground }} />
          <span style={{ position: "absolute", left: 26, right: 26, top: 13, borderTop: "2px dashed #6E5751" }} />
        </div>
        <div style={{ padding: "18px 30px 30px", display: "flex", flexDirection: "column", gap: 18 }}>
          {where && (
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ flex: "none", width: 44, height: 44, borderRadius: "50%", background: "#5C4741", display: "grid", placeItems: "center", color: ON_BROWN }}><Line name="pin" size={20} /></span>
              <div><div style={label}>Where</div><div style={{ marginTop: 3, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{where.value}</div></div>
            </div>
          )}
          {a.name && (
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Avatar deck={deck} size={44} dark />
              <div><div style={label}>Who</div><div style={{ marginTop: 3, fontSize: 16, fontWeight: 600 }}>{a.name}{a.title ? ` · ${a.title}` : ""}</div></div>
            </div>
          )}
          {ics && (
            <a href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} download="market-appraisal.ics" className="bro-grow" style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 54, borderRadius: 16, background: ON_BROWN, color: DARK, textDecoration: "none", fontWeight: 700, fontSize: 16 }}>
              <Line name="calendar" size={19} />
              Add it to my calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ deck, size, dark = false }: { deck: Deck; size: number; dark?: boolean }) {
  const a = deck.agent;
  return a.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.photo} alt="" style={{ flex: "none", width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "50% 20%" }} />
  ) : (
    <span style={{ flex: "none", width: size, height: size, borderRadius: "50%", background: dark ? "#5C4741" : SAGE, color: dark ? ON_BROWN : SAGE_INK, display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.34 }}>{initialsOf(a.name)}</span>
  );
}

function Welcome({ c }: { c: Ctx }) {
  const { deck, show } = c;
  const landlord = (deck.recipientName || "").trim().split(/\s+/)[0];
  const w = (word: string, d: number, extra?: React.ReactNode, style?: React.CSSProperties) => (
    <span className={show ? "bro-w" : "bro-off"} style={{ display: "inline-block", ...at(d), ...style }}>{word}{extra}</span>
  );
  const intro = (fx: boolean) => (
    <>
      <p className={enter(show)} style={{ ...at(0), margin: "0 0 22px", fontSize: 13, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: BODY }}>
        Welcome{landlord ? `, ${landlord}` : ""}
      </p>
      <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: fx ? 108 : 52, lineHeight: 0.94, letterSpacing: "-0.05em", color: INK }}>
        <span className="bro-ln">{w("Let’s", 0.1)} {w("get", 0.18)} {w("your", 0.26)}</span>
        <span className="bro-ln">
          {w("property", 0.34)}{" "}
          {w("ready", 0.42, (
            <svg viewBox="0 0 220 24" preserveAspectRatio="none" style={{ position: "absolute", left: "-2%", bottom: "-0.02em", width: "104%", height: ".2em", overflow: "visible" }} aria-hidden>
              <path className={`bro-draw ${show ? "on" : ""}`} style={at(1.2)} d="M4 16C40 6 92 4 140 9s62 6 76 3" fill="none" stroke={SAGE_MID} strokeWidth="7" strokeLinecap="round" />
            </svg>
          ), { position: "relative", color: BROWN })}
        </span>
        <span className="bro-ln">{w("to", 0.5)} {w("let.", 0.58)}</span>
      </h1>
      <p className={enter(show)} style={{ ...at(0.8), ...lead, marginTop: 30, maxWidth: 520, fontSize: fx ? 19 : 17 }}>
        A short guide to your valuation. What happens on the day, who you&rsquo;ll meet, and what you can expect from us.
      </p>
      <div className={enter(show)} style={{ ...at(1), marginTop: 34, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <button type="button" onClick={() => c.go(1)} className="bro-btn" style={{ ...pill(true), background: DARK, minHeight: 54, padding: "0 26px", fontSize: 16 }}>
          Show me what happens
          <span className="bro-nudge" style={{ display: "flex" }}><Arrow /></span>
        </button>
        <span style={{ fontSize: 14, color: BODY }}>2-minute read</span>
      </div>
    </>
  );
  /* The three key facts, under the hero, between two hairlines. */
  const strip = (fx: boolean) => (
    <div className={enter(show)} style={{ ...at(1.2), display: "flex", flexDirection: fx ? "row" : "column", borderTop: `1.5px solid ${HAIR}`, borderBottom: `1.5px solid ${HAIR}` }}>
      {[`About ${deck.minutes} minutes`, "Nothing to prepare", "One person, start to finish"].map((s, n) => (
        <div key={s} style={{ flex: "1 1 0", padding: fx ? "22px 0" : "16px 0", display: "flex", alignItems: "baseline", gap: 14, borderTop: !fx && n > 0 ? `1.5px solid ${HAIR}` : undefined }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: SAGE_INK }}>{String(n + 1).padStart(2, "0")}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: fx ? 22 : 19, letterSpacing: "-0.02em" }}>{s}</span>
        </div>
      ))}
    </div>
  );
  return (
    <Slide
      c={c}
      stage={
        <>
          <div className="absolute" style={{ left: X, top: 146, width: 760 }}>{intro(true)}</div>
          <div className="absolute" style={{ right: X + 20, top: 112 }}><Ticket c={c} width={420} /></div>
          <div className="absolute" style={{ left: X, right: X, top: 716 }}>{strip(true)}</div>
        </>
      }
      phone={
        <>
          {intro(false)}
          <div className="mt-10 flex justify-center"><Ticket c={c} width={360} /></div>
          <div className="mt-8">{strip(false)}</div>
        </>
      }
    />
  );
}

/* ───────────────────────── 2. On the day ───────────────────────── */

function TheDay({ c }: { c: Ctx }) {
  const { deck, show } = c;
  const minutes = deck.minutes;
  const head = (fx: boolean) => (
    <div style={{ display: "flex", flexWrap: fx ? "nowrap" : "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
      <div style={{ minWidth: 0 }}>
        <Eyebrow n="01" show={show}>What happens on the day</Eyebrow>
        <h2 className={enter(show)} style={{ ...h2(fx ? 76 : 40), ...at(0.1) }}>
          About {minutes} minutes,{fx ? <br /> : " "}and a much <span style={{ color: BROWN, background: PINK, padding: "0 .12em", borderRadius: ".18em" }}>clearer</span> picture.
        </h2>
      </div>
      <div className={enter(show)} style={{ ...at(0.3), flex: "none", position: "relative", width: fx ? 200 : 130, height: fx ? 200 : 130 }}>
        <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx="100" cy="100" r="88" fill="none" stroke={PINK} strokeWidth="14" />
          <circle className={`bro-ring ${show ? "on" : ""}`} cx="100" cy="100" r="88" fill="none" stroke={CLAY} strokeWidth="14" strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: fx ? 64 : 42, lineHeight: 0.9, letterSpacing: "-0.05em" }}>{minutes}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: BODY }}>minutes</div>
          </div>
        </div>
      </div>
    </div>
  );
  const cards = (fx: boolean) => (
    <div style={{ display: "grid", gridTemplateColumns: fx ? "repeat(4, 1fr)" : "1fr", gap: fx ? 20 : 12 }}>
      {VISIT_STEPS.map((st, n) => {
        const last = n === VISIT_STEPS.length - 1;
        const sage = n % 2 === 0 && !last;
        return (
          <article key={st.title} className={`${enter(show)} bro-lift`} style={{ ...at(0.35 + n * 0.1), position: "relative", padding: fx ? "32px 28px 34px" : "22px 22px 24px", borderRadius: BOX, background: last ? BROWN : "#FFFFFF", color: last ? "#FFFFFF" : INK, border: last ? "1.5px solid transparent" : `1.5px solid ${RULE}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="bro-ic" style={{ width: 56, height: 56, borderRadius: "50%", background: sage ? SAGE : PINK, display: "grid", placeItems: "center", color: sage ? SAGE_INK : CLAY_DEEP }}>
                <Line name={STEP_ICONS[n]} size={24} />
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, color: last ? "#6A534D" : "#EFE1DD", letterSpacing: "-0.04em" }}>{String(n + 1).padStart(2, "0")}</span>
            </div>
            <h3 style={{ margin: fx ? "28px 0 10px" : "20px 0 8px", fontFamily: DISPLAY, fontWeight: 700, fontSize: fx ? 24 : 21, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{st.title}</h3>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: last ? "#EADCD8" : BODY }}>{st.body}</p>
          </article>
        );
      })}
    </div>
  );
  return (
    <Slide
      c={c}
      stage={
        <div className="absolute" style={{ left: X, right: X, top: 150 }}>
          {head(true)}
          <div style={{ marginTop: 56 }}>{cards(true)}</div>
        </div>
      }
      phone={
        <>
          {head(false)}
          <div style={{ marginTop: 28 }}>{cards(false)}</div>
        </>
      }
    />
  );
}

/* ───────────────────────── 3. Before we arrive ───────────────────────── */

/** One dark panel: the reassurance on the left, the four things on the right. */
function Prepare({ c }: { c: Ctx }) {
  const { show } = c;
  const panel = (fx: boolean) => (
    <div className={enter(show)} style={{ ...at(0.05), borderRadius: PANEL, background: DARK, color: "#FFFFFF", padding: fx ? "64px 64px" : "32px 24px", display: "flex", flexDirection: fx ? "row" : "column", gap: fx ? 64 : 36, height: fx ? "100%" : undefined }}>
      <div style={{ flex: "1.15 1 0", minWidth: 0, alignSelf: fx ? "center" : undefined }}>
        <p className={enter(show)} style={{ ...eyebrowStyle, ...at(0.2), color: "#A59D99" }}>
          <span style={{ color: ON_BROWN }}>02</span>
          <span aria-hidden style={{ width: 22, height: 1.5, background: "currentColor", opacity: 0.5 }} />
          Before we arrive
        </p>
        <h2 className={enter(show)} style={{ ...at(0.3), margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: fx ? 74 : 44, lineHeight: 0.96, letterSpacing: "-0.045em" }}>
          You don&rsquo;t need to prepare <span style={{ color: ON_BROWN }}>anything.</span>
        </h2>
        <p className={enter(show)} style={{ ...at(0.4), margin: "26px 0 0", maxWidth: 460, fontSize: 18, lineHeight: 1.6, color: "#D8D2CE" }}>
          Just make sure we can get in. If you already have any property paperwork, it&rsquo;s useful to have nearby - but don&rsquo;t worry if you don&rsquo;t.
        </p>
      </div>
      <div style={{ flex: "1 1 0", minWidth: 0, alignSelf: fx ? "flex-end" : undefined }}>
        <div className={enter(show)} style={{ ...at(0.45), fontSize: 13, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "#A59D99" }}>Handy to have out</div>
        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {BRING_ALONG.map((b, n) => (
            <li key={b} className={`${enter(show)} bro-row`} style={{ ...at(0.5 + n * 0.08), display: "flex", alignItems: "center", gap: 20, padding: "20px 0", borderTop: "1px solid #614B45", borderBottom: n === BRING_ALONG.length - 1 ? "1px solid #614B45" : undefined }}>
              <span style={{ flex: "none", fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: ON_BROWN }}>{String(n + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 18, fontWeight: 500 }}>{b}</span>
            </li>
          ))}
        </ol>
        <p className={enter(show)} style={{ ...at(0.9), margin: "18px 0 0", fontSize: 15, color: "#A59D99" }}>
          None of it is essential. We can help work through what&rsquo;s needed afterwards.
        </p>
      </div>
    </div>
  );
  return (
    <Slide
      c={c}
      stage={<div className="absolute" style={{ left: X, right: X, top: 116, bottom: 128 }}>{panel(true)}</div>}
      phone={panel(false)}
    />
  );
}

/* ───────────────────────── 4. The agent ───────────────────────── */

/** Who the one person is for - the default introduction's own three things. */
const ONE_PERSON_FOR = ["The valuation", "The marketing", "The call when there’s an offer"];

function Agent({ c }: { c: Ctx }) {
  const { deck, show } = c;
  const a = deck.agent;
  const first = a.firstName || "";
  const tel = a.phone.replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const area = deck.property.postcode ? deck.property.postcode.split(" ")[0] : "";
  /* An agent who wrote their own introduction gets it, whole. Otherwise the
     default's first paragraph ("the one person you deal with - the
     valuation, the marketing, and the call when there's an offer") is shown
     as the three chips, as the canvas lays it out, and its second as text. */
  const own = a.bio.trim();
  const paragraphs = own ? own.split(/\n{2,}/) : [defaultBio(first).split(/\n{2,}/)[1]];
  const t = deck.testimonial;
  const stars = t?.rating != null ? Math.max(0, Math.min(5, Math.round(t.rating))) : 0;
  const portrait = (W: number) => (
    <div style={{ position: "relative", width: W, maxWidth: "100%", paddingBottom: 40 }}>
      <div className={show ? "bro-wipe" : "bro-off"} style={{ position: "relative", width: "100%", aspectRatio: "485 / 620", borderRadius: 28, overflow: "hidden" }}>
        {a.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={show ? "bro-zoom" : ""} src={a.photo} alt={`Portrait of ${a.name}`} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: SAGE }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: SAGE_INK }}>{initialsOf(a.name)}</span>
          </div>
        )}
      </div>
      {/* the name badge, on a clip */}
      <div className={enter(show)} style={{ ...at(0.8), position: "absolute", right: -18, bottom: 0, width: 220 }}>
        <div className="bro-tag">
          <div style={{ margin: "0 auto", width: 34, height: 18, borderRadius: "6px 6px 0 0", background: SAGE_MID }} />
          <div style={{ borderRadius: 12, background: "#FFFFFF", boxShadow: "0 24px 48px -20px rgba(38,33,32,.5)", overflow: "hidden" }}>
            <div style={{ background: DARK, color: "#FFFFFF", padding: "12px 18px", fontSize: 12, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Hello, I&rsquo;m <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FFFFFF" }} />
            </div>
            <div style={{ padding: "14px 18px 18px" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, lineHeight: 1, letterSpacing: "-0.04em", color: INK }}>{first || a.name}</div>
              <div style={{ marginTop: 6, fontSize: 14, color: BODY }}>{a.title || "Lettings Expert"}{area ? ` · ${area}` : ""}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const words = (fx: boolean) => (
    <>
      <Eyebrow n="03" show={show}>Who you&rsquo;ll be meeting</Eyebrow>
      <h2 className={enter(show)} style={{ ...h2(fx ? 72 : 42), lineHeight: 0.96, letterSpacing: "-0.045em", ...at(0.1) }}>
        You&rsquo;ll be dealing{fx ? <br /> : " "}with <span style={{ color: BROWN }}>{first || "us"}.</span>
      </h2>
      {paragraphs.map((para, n) => (
        <p key={n} className={enter(show)} style={{ ...at(0.2 + n * 0.05), ...lead, margin: n === 0 ? "22px 0 0" : "12px 0 0", maxWidth: 560, lineHeight: 1.62 }}>{para}</p>
      ))}
      {!own && (
        <div className={enter(show)} style={{ ...at(0.3), marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: BODY }}>One person for</div>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
            {ONE_PERSON_FOR.map((s, n) => (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 16px 10px 10px", borderRadius: 999, border: "1.5px solid #E2E5DA", fontWeight: 600, fontSize: 15 }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: SAGE, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: SAGE_INK }}>{n + 1}</span>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={enter(show)} style={{ ...at(0.4), marginTop: 26, display: "flex", flexWrap: "wrap", gap: 12 }}>
        {a.phone && (
          <a href={`tel:${tel}`} className="bro-btn" style={{ ...pill(true), background: DARK }}>
            <Line name="phone" size={18} />
            Call {first || "us"}
          </a>
        )}
        {a.email && (
          <a href={`mailto:${a.email}`} className="bro-btn" style={{ ...pill(false), border: "1.5px solid #E2DDDA" }}>
            <Line name="mail" size={18} />
            Email {first || "us"}
          </a>
        )}
        {welcomeReady(deck.welcomeVideo) && <WelcomeVideoButton video={deck.welcomeVideo} firstName={first} className="bro-btn" style={{ ...pill(false), border: "1.5px solid #E2DDDA" }} />}
        {a.phone && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="bro-btn" aria-label="Message on WhatsApp" style={round}>
            <Line name="whatsapp" size={20} />
          </a>
        )}
      </div>
      {t?.quote && (
        <figure className={enter(show)} style={{ ...at(0.55), margin: "30px 0 0", padding: "22px 0 0", borderTop: `1.5px solid ${HAIR}` }}>
          {stars > 0 && <Stars n={stars} color={DARK} />}
          <blockquote style={{ margin: "12px 0 0", fontFamily: DISPLAY, fontWeight: 500, fontSize: fx ? 20 : 19, lineHeight: 1.4, letterSpacing: "-0.01em", color: INK }}>&ldquo;{t.quote}&rdquo;</blockquote>
          <figcaption style={{ marginTop: 12, fontSize: 14, color: BODY }}>{t.author}, landlord</figcaption>
        </figure>
      )}
    </>
  );
  return (
    <Slide
      c={c}
      stage={
        <>
          <div className="absolute" style={{ left: X, top: 120 }}>{portrait(400)}</div>
          <div className="absolute" style={{ left: 600, right: X, top: 126 }}>{words(true)}</div>
        </>
      }
      phone={
        <>
          <div className="flex justify-center px-6 pb-10">{portrait(300)}</div>
          {words(false)}
        </>
      }
    />
  );
}

/* ───────────────────────── 5. Our commitment ───────────────────────── */

function Commitment({ c }: { c: Ctx }) {
  const { show } = c;
  const cols = [
    { title: "What to expect from us", rows: FROM_US, bg: PINK, rule: "#E8D3CE", ink: CLAY_DEEP, body: "#6B5450", icon: "heart" as const },
    { title: "What helps us deliver the best result", rows: FROM_YOU, bg: SAGE, rule: "#D3D9C7", ink: SAGE_INK, body: "#555E49", icon: "check" as const },
  ];
  const body = (fx: boolean) => (
    <>
      <div style={{ display: "flex", flexWrap: fx ? "nowrap" : "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: fx ? 64 : 18 }}>
        <div>
          <Eyebrow n="04" show={show}>Our commitment</Eyebrow>
          <h2 className={enter(show)} style={{ ...h2(fx ? 58 : 40), ...at(0.1) }}>Four things you can{fx ? <br /> : " "}expect from us.</h2>
        </div>
        <p className={enter(show)} style={{ ...at(0.2), ...lead, maxWidth: 440, marginBottom: fx ? 4 : 0 }}>
          Clear advice, good communication and a service designed around your property from start to finish.
        </p>
      </div>
      <div style={{ marginTop: fx ? 32 : 24, display: "grid", gridTemplateColumns: fx ? "1fr 1fr" : "1fr", gap: 18 }}>
        {cols.map((col, k) => (
          <div key={col.title} className={enter(show)} style={{ ...at(0.3 + k * 0.12), padding: fx ? "28px 32px 24px" : "24px 22px", borderRadius: PANEL, background: col.bg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ flex: "none", width: 46, height: 46, borderRadius: "50%", background: "#FFFFFF", display: "grid", placeItems: "center", color: col.ink }}>
                <Line name={col.icon} size={20} />
              </span>
              <h3 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 23, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{col.title}</h3>
            </div>
            <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
              {col.rows.map((r, n) => (
                <li key={r.title} style={{ display: "flex", gap: 16, padding: n === col.rows.length - 1 ? "13px 0 0" : "13px 0", borderTop: `1.5px solid ${col.rule}` }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: col.ink }}>{String(n + 1).padStart(2, "0")}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16.5 }}>{r.title}</div>
                    <div style={{ marginTop: 3, fontSize: 14.5, lineHeight: 1.5, color: col.body }}>{r.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </>
  );
  return <Slide c={c} stage={<div className="absolute" style={{ left: X, right: X, top: 124 }}>{body(true)}</div>} phone={body(false)} />;
}

/* ───────────────────────── 6. Quick answers ───────────────────────── */

function Answers({ c }: { c: Ctx }) {
  const { deck, show } = c;
  const [open, setOpen] = useState(0);
  const faqs: [string, string][] = [
    ["How long will it take?", `About ${deck.minutes} minutes. We'll walk round together, then talk through what we've seen and what it could let for.`],
    ["Do I need to tidy up or prepare anything?", "No. We just need to get in. Any paperwork you already have is a bonus, not a requirement."],
    ["Will you tell me what it could let for?", "Yes. You'll get a realistic rental figure, with the local evidence and reasoning behind it."],
    ["Will I know what your service costs?", "Yes. What the service costs and what it includes, explained clearly before you decide anything."],
  ];
  const left = (fx: boolean) => (
    <>
      <Eyebrow n="05" show={show}>Quick answers</Eyebrow>
      <h2 className={enter(show)} style={{ ...h2(fx ? 64 : 40), ...at(0.1) }}>The things people{fx ? <br /> : " "}usually ask.</h2>
      <Note show={show} delay={0.6} size={30} color="#6B5450" style={{ marginTop: 26, display: "inline-flex", alignItems: "center", gap: 8, transform: "rotate(-3deg)" }}>
        tap to open
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={fx ? "M5 12h14M13 6l6 6-6 6" : "M12 5v14M6 13l6 6 6-6"} />
        </svg>
      </Note>
    </>
  );
  const list = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {faqs.map(([q, ans], n) => {
        const isOpen = open === n;
        return (
          <div key={q} className={enter(show)} style={{ ...at(0.2 + n * 0.08), borderRadius: BOX, background: PINK_SOFT, overflow: "hidden" }}>
            <button type="button" className="bro-tap" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : n)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, width: "100%", minHeight: 72, padding: "18px 24px", border: 0, background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer", color: INK }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>{q}</span>
              <span className={isOpen ? "bro-pop" : undefined} style={{ flex: "none", width: 40, height: 40, borderRadius: "50%", background: isOpen ? BROWN : "#FFFFFF", color: isOpen ? "#FFFFFF" : BROWN, display: "grid", placeItems: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d={isOpen ? "M5 12h14" : "M12 5v14M5 12h14"} /></svg>
              </span>
            </button>
            {isOpen && <p className="bro-in" style={{ margin: 0, padding: "0 24px 22px", fontSize: 17, lineHeight: 1.6, color: BODY, maxWidth: 620, animationDuration: ".45s" }}>{ans}</p>}
          </div>
        );
      })}
    </div>
  );
  return (
    <Slide
      c={c}
      stage={
        <>
          <div className="absolute" style={{ left: X, top: 200, width: 440 }}>{left(true)}</div>
          <div className="absolute" style={{ left: 600, right: X, top: 180 }}>{list}</div>
        </>
      }
      phone={
        <>
          {left(false)}
          <div style={{ marginTop: 28 }}>{list}</div>
        </>
      }
    />
  );
}

/* ───────────────────────── 7. The close ───────────────────────── */

function Close({ c }: { c: Ctx }) {
  const { deck, show } = c;
  const a = deck.agent;
  const first = a.firstName || "";
  const tel = a.phone.replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const subject = `About my appraisal - ${deck.property.address}`;
  const when = datePieces(deck.startsAt, deck.whenPretty);
  const avatar = a.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.photo} alt="" style={{ flex: "none", width: 56, height: 56, borderRadius: "50%", objectFit: "cover", objectPosition: "50% 20%" }} />
  ) : (
    <span style={{ flex: "none", width: 56, height: 56, borderRadius: "50%", background: SAGE, color: SAGE_INK, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 19 }}>{initialsOf(a.name)}</span>
  );
  const words = (fx: boolean) => (
    <>
      <Eyebrow show={show}>Before we meet</Eyebrow>
      <h2 className={enter(show)} style={{ ...h2(fx ? 86 : 44), lineHeight: 0.96, letterSpacing: "-0.045em", ...at(0.1) }}>
        Anything you&rsquo;d{fx ? <br /> : " "}like to <span style={{ color: BROWN }}>ask first?</span>
      </h2>
      <p className={enter(show)} style={{ ...at(0.2), ...lead, marginTop: 24, maxWidth: 520 }}>
        If anything comes to mind before {deck.whenPretty ? "we meet" : "the visit"} - the rent, the property, the paperwork or the local market - send {first || "your agent"} a message. We&rsquo;re happy to talk it through.
      </p>
      <div className={enter(show)} style={{ ...at(0.3), marginTop: 30, display: "flex", flexWrap: "wrap", gap: 12 }}>
        {a.phone && (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(subject)}`} target="_blank" rel="noreferrer" className="bro-btn" style={pill(true)}>
            <Line name="whatsapp" size={18} />
            WhatsApp {first || "us"}
          </a>
        )}
        {a.email && (
          <a href={`mailto:${a.email}?subject=${encodeURIComponent(subject)}`} className="bro-btn" style={pill(false)}>
            <Line name="mail" size={18} />
            Email {first || "us"}
          </a>
        )}
        {a.phone && (
          <a href={`tel:${tel}`} className="bro-btn" aria-label={`Call ${first || "us"}`} title={a.phone} style={round}>
            <Line name="phone" size={20} />
          </a>
        )}
      </div>
      <div className={enter(show)} style={{ ...at(0.45), marginTop: 40, paddingTop: 24, borderTop: `1.5px solid ${RULE}`, display: "flex", alignItems: "center", gap: 18, maxWidth: 560 }}>
        {avatar}
        <div style={{ fontFamily: HAND, fontSize: 34, color: BROWN, lineHeight: 1 }}>
          {when ? `See you ${when.day}!` : "We look forward to meeting you."}
          {first && <span style={{ fontSize: 25, color: "#6B5450" }}> - {first}</span>}
        </div>
      </div>
    </>
  );
  const picture = (W: number) => (
    <div style={{ position: "relative", width: W, maxWidth: "100%" }}>
      {blob({ inset: "-4% -12% 4% 8%", background: PINK, animationDuration: "11s" })}
      <div className={show ? "bro-unveil" : "bro-off"} style={{ position: "relative", width: "100%", aspectRatio: "527 / 568", borderRadius: PANEL, overflow: "hidden", boxShadow: "0 40px 80px -40px rgba(43,37,35,.55)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={show ? "bro-zoom" : ""} src="/brand/photo/welcome.jpg" alt="Someone at a coral front door, about to knock" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 38%", display: "block" }} />
      </div>
      <Note show={show} delay={1} size={34} color={SAGE_DEEP} line={240} style={{ position: "absolute", right: "-4%", bottom: "-12%", transform: "rotate(-5deg)" }}>
        bring your questions.
      </Note>
    </div>
  );
  return (
    <Slide
      c={c}
      stage={
        <>
          <div className="absolute" style={{ left: X, top: 170, width: 660 }}>{words(true)}</div>
          <div className="absolute" style={{ right: X + 60, top: 150 }}>{picture(450)}</div>
        </>
      }
      phone={
        <>
          {words(false)}
          <div className="mt-14 flex justify-center px-6 pb-14">{picture(300)}</div>
          <p style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, letterSpacing: ".26em", textTransform: "uppercase", color: BODY }}>Your property. Our priority.</p>
        </>
      }
    />
  );
}

/* ───────────────────────── the viewer ───────────────────────── */

/* `covers` is the slide in the deck's own list (lib/present, SLIDES_BY_KIND)
   that each of these stands for, so the presentation builder's slide list
   and its preview can talk to each other in either direction. */
const SLIDES: { id: string; title: string; covers: SlideId; render: (c: Ctx) => React.ReactNode }[] = [
  { id: "welcome", title: "Welcome", covers: "welcome", render: (c) => <Welcome c={c} /> },
  { id: "day", title: "On the day", covers: "appointment", render: (c) => <TheDay c={c} /> },
  { id: "prepare", title: "Before we arrive", covers: "appointment", render: (c) => <Prepare c={c} /> },
  { id: "agent", title: "Who you're meeting", covers: "agent", render: (c) => <Agent c={c} /> },
  { id: "why", title: "Our commitment", covers: "why", render: (c) => <Commitment c={c} /> },
  { id: "answers", title: "Quick answers", covers: "questions", render: (c) => <Answers c={c} /> },
  { id: "questions", title: "Before we meet", covers: "questions", render: (c) => <Close c={c} /> },
];

/* The builder lets an agent switch "Why The Letting Experts" off (it is the
   one removable slide in the pre-appraisal), and the brochure obeys: the
   commitments slide goes with it. */
const slidesOf = (deck: Deck) => SLIDES.filter((s) => !(s.covers === "why" && deck.hidden?.includes("why")));

/** How many slides this deck's brochure has. */
export const brochureCount = (deck: Deck) => slidesOf(deck).length;
/** The first brochure slide that stands for one of the deck's slide ids. */
export const brochureIndexOf = (deck: Deck, id: SlideId | undefined) => Math.max(0, slidesOf(deck).findIndex((s) => s.covers === id));
/** Which of the deck's slide ids a brochure slide stands for. */
export const brochureCovers = (deck: Deck, i: number): SlideId => {
  const list = slidesOf(deck);
  return list[Math.max(0, Math.min(list.length - 1, i))].covers;
};

export default function PreAppraisalBrochure({
  token,
  deck,
  embedded = false,
}: {
  token: string;
  deck: Deck;
  /** Inside the presentation builder's preview box: fills its parent, takes
   *  no keys (the agent is typing beside it) and never counts as an open. */
  embedded?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [seen, setSeen] = useState<number[]>([]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setSeen((p) => (p.length ? p : [0])));
    return () => cancelAnimationFrame(t);
  }, []);

  /* Count a real landlord's open, once. Never the showroom copy. */
  useEffect(() => {
    if (token === "sample" || embedded) return;
    const t = setTimeout(() => {
      fetch("/api/present/opened", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [token, embedded]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const cells = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
    const current = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setNow(Number(e.target.getAttribute("data-index")))),
      { root, rootMargin: "0px -45% 0px -45%", threshold: 0 }
    );
    const reveal = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const n = Number(e.target.getAttribute("data-index"));
          setSeen((p) => (p.includes(n) ? p : [...p, n]));
        }),
      { root, rootMargin: "0px -20% 0px 0px", threshold: 0 }
    );
    cells.forEach((el) => {
      current.observe(el);
      reveal.observe(el);
    });
    return () => {
      current.disconnect();
      reveal.disconnect();
    };
  }, []);

  const go = useCallback((i: number) => {
    scroller.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(Math.min(now + 1, list.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(Math.max(now - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [now, go, embedded]);

  const list = slidesOf(deck);
  const titles = list.map((s) => s.title);

  return (
    <div className={`bro relative w-full overflow-hidden bg-white ${embedded ? "h-full" : "h-[100dvh]"} ${figtree.variable} ${caveat.variable}`} style={{ fontFamily: "var(--font-figtree), system-ui, sans-serif" }}>
      <style>{CSS}</style>
      {/* Progress along the top edge, as the canvas has it, by slide. */}
      <div aria-hidden className="absolute inset-x-0 top-0 z-50 h-[4px]">
        <div className="h-full transition-[width] duration-500 ease-out" style={{ width: `${((now + 1) / list.length) * 100}%`, background: SAGE_MID }} />
      </div>
      <div ref={scroller} className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth" style={{ scrollbarWidth: "none" }}>
        {list.map((s, i) => (
          <div key={s.id} data-index={i} className="h-full w-full shrink-0 snap-start overflow-y-auto overflow-x-hidden overscroll-contain" style={{ scrollbarWidth: "none" }}>
            {s.render({ deck, show: seen.includes(i), i, total: list.length, go, titles, ground: "#FFFFFF" })}
          </div>
        ))}
      </div>
    </div>
  );
}
