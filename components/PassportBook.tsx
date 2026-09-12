"use client";

import { SECTIONS, householdIncome, money, type PassportData } from "@/lib/passport-shape";

/**
 * The passport card, drawn as they fill it in. Two faces.
 *
 * James: "we'll build them out an actual fake passport in real time, just to
 * make it a bit more interesting." Then 12 Sep 2026, with two rendered cards
 * as the reference: a thinner brown band with a clay rim, the photo in a
 * circle, the details in a small grid with icons and hairlines between
 * them, an embossed round stamp, paper with a grain and light falling from
 * the logo side, and a card with an edge rather than a flat rectangle.
 *
 * ── Drawn at ONE size and scaled ──────────────────────────────────────────
 *
 * Every measurement in here is in pixels against a 900 x 596 card. The scene
 * scales that to the column and turns it in 3D; the flat version on a phone
 * scales it to the width. One drawing, transformed, cannot drift.
 *
 * ── The front is who they are; the back is everything else ───────────────
 *
 * Page one of the form fills the front. Every later page writes to the back,
 * and the scene turns the card over as they move on.
 *
 * ── Its colours are the tenant surface's ──────────────────────────────────
 *
 * Chocolate brown cover, the wordmark in pink, clay for the rim and the
 * rules, warm paper for the page. James: "if we're going to pick a colour,
 * pick a colour."
 *
 * ── The photo is theirs to add, and it is only a picture ──────────────────
 *
 * A tenant's own photo gives no statutory excuse under Right to Rent - only
 * a share code check, a certified IDSP, or an agent seeing the original does.
 * So the photo is optional, says so, and is read by nothing but this card.
 */

export const CARD_W = 900;
export const CARD_H = 596;

export const COVER = "#4a3632";
const COVER_DEEP = "#31221f";
export const PINK = "#fdefec";
export const CLAY = "#cfa096";
const PAPER = "#f4ebe4";
const INK = "#2b201d";
const QUIET = "#8a7670";

/** Derived from their name and date of birth, so it is stable. A number that
 *  reshuffles on every keystroke reads as broken rather than as generated. */
export function docNumber(d: PassportData): string {
  const seed = `${d.legalName}${d.dob}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!seed) return "TLE-000000";
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000000;
  return `TLE-${String(h).padStart(6, "0")}`;
}

const M = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "14 APR 1994" from the date input's ISO, or nothing. */
export function longDob(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} ${M[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "x% y%" for object-position, from the stored focus or the default:
 *  a little above centre, where a face usually is. */
export function photoPosition(focus: string): string {
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(focus.trim());
  return m ? `${m[1]}% ${m[2]}%` : "50% 22%";
}

/** Which field on the card a form input maps to, so the card can light up
 *  the line somebody is typing into. */
export type PassportFocus = "legalName" | "knownAs" | "dob" | "nationality" | null;

/* ── Paper, band, texture ────────────────────────────────────────────────── */

/** The wordmark, in pink, cut from the white logo with a mask. */
function Wordmark({ height }: { height: number }) {
  const url = "url(/brand/tle-logo-white.png)";
  return (
    <div
      role="img"
      aria-label="The Letting Experts"
      style={{
        height,
        width: height * (869 / 465),
        background: PINK,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      }}
    />
  );
}

/** A pressed line: a dark hairline with a light one under it, the way a
 *  crease catches the light. */
export const Groove = ({ style }: { style?: React.CSSProperties }) => (
  <div aria-hidden style={{ width: "100%", ...style }}>
    <div style={{ height: 1.5, background: "rgba(74,54,50,0.30)" }} />
    <div style={{ height: 1.5, background: "rgba(255,255,255,0.85)" }} />
  </div>
);

/** The card stock: the band behind, the page rising into it with rounded
 *  corners and a clay rim - the way the reference card is built - then the
 *  grooved rings in the corner, light from the logo side, and the grain. */
function Card({ band, right, children }: { band: number; right: React.ReactNode; children: React.ReactNode }) {
  const rise = 18;
  return (
    <div className="relative overflow-hidden" style={{ width: CARD_W, height: CARD_H, borderRadius: 30, background: COVER_DEEP, color: INK }}>
      {/* The band, lit from the logo corner. */}
      <div
        className="absolute inset-x-0 top-0 px-9"
        style={{
          height: band + rise,
          /* A very light touch: chocolate at the logo corner, roasted by the
             far edge, and nothing else. It only grades the band. */
          background: `linear-gradient(112deg, #5a4540 0%, ${COVER} 30%, #3e2c28 70%, ${COVER_DEEP} 100%)`,
        }}
      >
        {/* What sits on the band lives in the part the page leaves showing. */}
        <div className="relative flex items-center justify-between" style={{ height: band - rise }}>
          <Wordmark height={(band - rise) * 0.52} />
          {right}
        </div>
      </div>
      {/* The page, curved over at the top, with its rim. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          top: band - rise,
          background: PAPER,
          borderRadius: "28px 28px 30px 30px",
          borderTop: `3.5px solid ${CLAY}`,
          boxShadow: "inset 0 1.5px 0 rgba(74,54,50,0.28), 0 -3px 8px rgba(0,0,0,0.25)",
        }}
      />
      {/* Guilloche, pressed in and kept quiet: concentric arcs from a centre
          well off the card, a light copy a pixel up-left and a dark one
          down-right. James liked these; the grain tile that read as a
          square grid is what went. */}
      {[
        { dx: -1, dy: -1, col: "rgba(255,255,255,0.9)", op: 0.42 },
        { dx: 1, dy: 1, col: "rgba(74,54,50,0.45)", op: 0.26 },
      ].map((g, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: -560 + g.dx,
            bottom: -600 + g.dy,
            width: 1160,
            height: 1160,
            borderRadius: "50%",
            opacity: g.op,
            background: `repeating-radial-gradient(circle at 50% 50%, transparent 0 12px, ${g.col} 12px 13.2px)`,
            WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent 46%, rgba(0,0,0,0.9) 52%, rgba(0,0,0,0.3) 60%, transparent 66%)",
            maskImage: "radial-gradient(circle at 50% 50%, transparent 46%, rgba(0,0,0,0.9) 52%, rgba(0,0,0,0.3) 60%, transparent 66%)",
          }}
        />
      ))}
      {children}
    </div>
  );
}

/* ── Bits ────────────────────────────────────────────────────────────────── */

type IconName = "calendar" | "globe" | "id" | "person" | "shield" | "coins" | "people" | "home" | "doc";

function Icon({ name, size = 22, color = COVER }: { name: IconName; size?: number; color?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ color, flexShrink: 0 }}>
      {name === "calendar" && (<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...p} /><path d="M3.5 9.5h17M8 3v4M16 3v4" {...p} /></>)}
      {name === "globe" && (<><circle cx="12" cy="12" r="8.5" {...p} /><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5S9.4 5.9 12 3.5Z" {...p} /></>)}
      {name === "id" && (<><rect x="3" y="5" width="18" height="14" rx="2.5" {...p} /><circle cx="8.5" cy="11" r="2" {...p} /><path d="M6 15.5c.6-1.2 1.5-1.8 2.5-1.8s1.9.6 2.5 1.8M14 10h4M14 13.5h4" {...p} /></>)}
      {name === "person" && (<><circle cx="12" cy="8.5" r="3.6" {...p} /><path d="M5.5 19.5c.9-3.3 3.3-5 6.5-5s5.6 1.7 6.5 5" {...p} /></>)}
      {name === "shield" && (<path d="M12 3.5l7 2.6v5.4c0 4.3-2.8 7.6-7 9-4.2-1.4-7-4.7-7-9V6.1l7-2.6Z" {...p} />)}
      {name === "coins" && (<><ellipse cx="12" cy="7" rx="7" ry="2.8" {...p} /><path d="M5 7v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V7M5 11v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4" {...p} /></>)}
      {name === "people" && (<><circle cx="9" cy="9" r="3" {...p} /><circle cx="16.5" cy="10" r="2.4" {...p} /><path d="M3.5 19c.7-3 2.7-4.6 5.5-4.6s4.8 1.6 5.5 4.6M15 18.5c.4-2 1.6-3.2 3.3-3.2 1.1 0 1.9.4 2.5 1.1" {...p} /></>)}
      {name === "home" && (<><path d="M4 11.5 12 5l8 6.5" {...p} /><path d="M6.5 10v9h11v-9" {...p} /><path d="M10 19v-5h4v5" {...p} /></>)}
      {name === "doc" && (<><rect x="5" y="3.5" width="14" height="17" rx="2.2" {...p} /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" {...p} /></>)}
    </svg>
  );
}

/** A detail: label above, value beside a small icon. */
function Cell({ label, value, icon, lit, width }: { label: string; value: string; icon?: IconName; lit?: boolean; width?: number }) {
  return (
    <div className="min-w-0 rounded-[8px] transition-colors duration-300" style={{ width, margin: "-4px -8px", padding: "4px 8px", background: lit ? `${CLAY}33` : "transparent" }}>
      <dt className="font-semibold uppercase" style={{ fontSize: 12.5, letterSpacing: "0.22em", color: QUIET }}>
        {label}
      </dt>
      <dd className="flex items-center" style={{ marginTop: 6, gap: 8 }}>
        {icon && <Icon name={icon} size={22} color={value ? COVER : `${COVER}55`} />}
        <span
          className="truncate"
          style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: value ? INK : `${INK}40`, borderBottom: `2px solid ${lit ? CLAY : "transparent"}`, transition: "border-color 300ms" }}
        >
          {value || "—"}
        </span>
      </dd>
    </div>
  );
}

/**
 * The round stamp, pressed INTO the paper rather than printed on it: the
 * same drawing three times - a light copy up and left, a dark copy down and
 * right, and the paper-toned one on top. That is what a deboss is.
 */
function Emboss({ size, strong }: { size: number; strong: boolean }) {
  const o = strong ? 1 : 0.55;
  return (
    <div aria-hidden className="pointer-events-none relative" style={{ width: size, height: size, opacity: o }}>
      <div className="absolute inset-0" style={{ transform: "translate(-1.5px,-1.5px)", color: "rgba(255,255,255,0.9)" }}><RoundStamp /></div>
      <div className="absolute inset-0" style={{ transform: "translate(1.5px,1.5px)", color: "rgba(74,54,50,0.45)" }}><RoundStamp /></div>
      <div className="absolute inset-0" style={{ color: "#e6d9d0" }}><RoundStamp /></div>
    </div>
  );
}

function RoundStamp() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 120 120" aria-hidden style={{ display: "block" }}>
      <defs>
        <path id="stampRim" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="60" r="50.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text fontSize="9" fontWeight="700" letterSpacing="2.6" fill="currentColor" fontFamily="var(--font-inter), system-ui, sans-serif">
        <textPath href="#stampRim" startOffset="0">THE LETTING EXPERTS · TENANT PASSPORT ·</textPath>
      </text>
      <text x="60" y="69" textAnchor="middle" fontSize="27" fontWeight="800" letterSpacing="1" fill="currentColor" fontFamily="var(--font-bricolage), var(--font-manrope), system-ui, sans-serif">
        TLE
      </text>
    </svg>
  );
}

/** Six section stamps: brown once earned, outlined until then. */
function Stamps({ data }: { data: PassportData }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      {SECTIONS.map((s, i) => {
        const done = s.done(data);
        return (
          <span
            key={s.key}
            title={`${s.title}: ${done ? "done" : "not yet"}`}
            className="flex items-center justify-center rounded-full transition-all duration-500"
            style={{
              width: 26,
              height: 26,
              border: `1.5px solid ${done ? COVER : `${COVER}55`}`,
              background: done ? `linear-gradient(145deg, #7a5f57, ${COVER})` : "transparent",
              color: done ? PINK : `${COVER}99`,
              fontSize: 11,
              fontWeight: 700,
              boxShadow: done ? "inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(74,54,50,0.25)" : "inset 0 1px 1px rgba(74,54,50,0.12)",
            }}
          >
            {done ? "✓" : i + 1}
          </span>
        );
      })}
    </div>
  );
}

/** The person mark on an empty photo panel. */
function PersonMark() {
  return (
    <svg width="96" height="96" viewBox="0 0 48 48" fill="none" aria-hidden style={{ color: COVER, opacity: 0.45 }}>
      <circle cx="24" cy="17" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 41c1.6-8.6 8.3-13.5 16.5-13.5S38.9 32.4 40.5 41" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ── The front ───────────────────────────────────────────────────────────── */

export default function PassportBook({ data, focus = null }: { data: PassportData; focus?: PassportFocus }) {
  const identity = SECTIONS[0].done(data);
  const name = data.legalName.trim();
  const BAND = 150;

  return (
    <Card
      band={BAND}
      right={
        <div className="flex items-center" style={{ gap: 18 }}>
          <p className="text-right font-medium uppercase" style={{ fontSize: 16, lineHeight: 1.45, letterSpacing: "0.26em", color: PINK, opacity: 0.92 }}>
            Tenant
            <br />
            Passport
          </p>
          <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${CLAY}aa` }}>
            <Icon name="person" size={24} color={PINK} />
          </span>
        </div>
      }
    >
      {/* The photo, in a circle, sat high so the face sits in the middle of it. */}
      <div
        className="absolute flex items-center justify-center overflow-hidden rounded-full bg-white"
        style={{
          left: 54,
          top: BAND + 34,
          width: 214,
          height: 214,
          boxShadow: `0 0 0 6px ${PAPER}, 0 0 0 7.5px ${CLAY}88, 0 14px 26px -12px rgba(74,54,50,0.45), inset 0 0 0 1px rgba(74,54,50,0.08)`,
        }}
      >
        {data.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.photo} alt="" className="h-full w-full object-cover" style={{ objectPosition: photoPosition(data.photoFocus) }} />
        ) : (
          <PersonMark />
        )}
      </div>

      {/* The details. */}
      <dl className="absolute" style={{ left: 302, top: BAND + 32, right: 54 }}>
        <div className="min-w-0 rounded-[8px] transition-colors duration-300" style={{ margin: "-4px -8px", padding: "4px 8px", width: 380, background: focus === "legalName" ? `${CLAY}33` : "transparent" }}>
          <dt className="font-semibold uppercase" style={{ fontSize: 12.5, letterSpacing: "0.22em", color: QUIET }}>Full name</dt>
          <dd className="hand truncate" style={{ marginTop: 2, fontSize: 40, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.1, color: name ? INK : `${INK}40` }}>
            {name || "—"}
          </dd>
          <div style={{ width: 64, height: 3, background: CLAY, borderRadius: 2, marginTop: 6 }} />
        </div>

        <div className="flex" style={{ marginTop: 20, gap: 14 }}>
          <div className="flex flex-col" style={{ gap: 22, width: 214 }}>
            <Cell label="Date of birth" value={longDob(data.dob)} icon="calendar" lit={focus === "dob"} width={214} />
            <Cell label="Tenant ID" value={docNumber(data)} icon="id" width={214} />
          </div>
          <div className="flex flex-col" style={{ gap: 22, width: 160 }}>
            <Cell label="Nationality" value={data.nationality.trim()} icon="globe" lit={focus === "nationality"} width={160} />
            <Cell label="Known as" value={data.knownAs.trim()} icon="person" lit={focus === "knownAs"} width={160} />
          </div>
        </div>
      </dl>

      {/* The stamp, pressed into the paper. Fully pressed once page one is done. */}
      <div className="absolute" style={{ right: 34, top: BAND + 66, transform: "rotate(-8deg)" }}>
        <Emboss size={166} strong={identity} />
      </div>

      {/* The foot: a hairline, a standard line of text, the six stamps. */}
      <div className="absolute inset-x-0 px-9" style={{ bottom: 100 }}>
        <Groove />
      </div>
      <div className="absolute inset-x-0 flex items-end justify-between px-9" style={{ bottom: 38 }}>
        <p className="hand" style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.1, color: INK }}>
          A smoother letting journey starts here.
        </p>
        <Stamps data={data} />
      </div>
    </Card>
  );
}

/* ── The back ────────────────────────────────────────────────────────────── */

const yesNo = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
const pounds = (v: string) => {
  const n = money(v);
  return n === null ? "" : `£${n.toLocaleString("en-GB")}`;
};

/** The two machine-readable lines. Real passports use this shape, which is
 *  what makes the back read as a passport at a glance; the content is ours. */
function mrz(d: PassportData): [string, string] {
  const cap = (s: string) => s.trim().toUpperCase();
  const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
  const parts = cap(d.legalName).split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const first = parts.slice(0, -1).join("<");
  const name = pad(`${last}<<${first}`.replace(/[^A-Z<]/g, ""), 36);
  const dob = d.dob ? d.dob.slice(2).replace(/-/g, "") : "<<<<<<";
  const nat = pad(cap(d.nationality).replace(/[^A-Z]/g, ""), 3);
  return [`P<TLE${name}`, pad(`${docNumber(d).replace("-", "")}<${nat}${dob}`, 41)];
}

function Group({ title, icon, done, children }: { title: string; icon: IconName; done: boolean; children: React.ReactNode }) {
  return (
    <section className="flex" style={{ gap: 16 }}>
      <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: 52, height: 52, border: `1.5px solid ${COVER}33`, background: "rgba(255,255,255,0.35)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.7), 0 1px 2px rgba(74,54,50,0.12)" }}>
        <Icon name={icon} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center" style={{ gap: 10 }}>
          <h3 className="hand" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: INK, lineHeight: 1.1 }}>
            {title}
          </h3>
          <span
            className="flex items-center justify-center rounded-full transition-all duration-500"
            style={{ width: 20, height: 20, border: `1.5px solid ${done ? COVER : `${COVER}40`}`, background: done ? COVER : "transparent", color: PINK, fontSize: 10, fontWeight: 700 }}
          >
            {done ? "✓" : ""}
          </span>
        </div>
        <div style={{ width: 40, height: 2.5, background: CLAY, borderRadius: 2, marginTop: 5 }} />
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </section>
  );
}

/** A small detail on the back: label, value, no icon. */
function Small({ label, value, width }: { label: string; value: string; width?: number }) {
  return (
    <div className="min-w-0" style={{ width }}>
      <dt className="font-semibold uppercase" style={{ fontSize: 11.5, letterSpacing: "0.2em", color: QUIET }}>{label}</dt>
      <dd className="truncate" style={{ marginTop: 3, fontSize: 18, fontWeight: 500, lineHeight: 1.15, color: value ? INK : `${INK}40` }}>{value || "—"}</dd>
    </div>
  );
}

const VRule = () => <div aria-hidden style={{ width: 1.5, alignSelf: "stretch" }} />;

export function PassportBack({ data }: { data: PassportData }) {
  const d = data;
  const hh = householdIncome(d);
  const [l1, l2] = mrz(d);
  const rtr =
    d.hasBritishPassport === true ? "British or Irish passport"
    : d.hasBritishPassport === false ? (d.shareCode.trim() ? `Share code ${d.shareCode.trim()}` : "Share code to follow")
    : "";
  const BAND = 118;

  return (
    <Card
      band={BAND}
      right={
        <p className="font-medium uppercase" style={{ fontSize: 15, letterSpacing: "0.26em", color: PINK, opacity: 0.92 }}>
          {docNumber(d)} · Details
        </p>
      }
    >
      <div className="absolute inset-x-0 grid grid-cols-2 px-9" style={{ top: BAND + 24, columnGap: 36, rowGap: 14 }}>
        <Group title="Right to rent" icon="shield" done={SECTIONS[1].done(d)}>
          <Small label="Checked by" value={rtr} width={330} />
        </Group>
        <Group title="What they earn" icon="coins" done={SECTIONS[2].done(d)}>
          <div className="flex" style={{ gap: 10 }}>
            <Small label="Status" value={d.applicantType} width={150} />
            <VRule />
            <Small label="Income" value={pounds(d.annualIncome)} width={76} />
            <VRule />
            <Small label="Savings" value={pounds(d.savings)} width={76} />
          </div>
        </Group>
        <Group title="Who's moving in" icon="people" done={SECTIONS[3].done(d)}>
          <div className="flex" style={{ gap: 16 }}>
            <Small label="Adults" value={d.numAdults.trim()} width={70} />
            <VRule />
            <Small label="Children" value={d.numChildren.trim()} width={84} />
            <VRule />
            <Small label="Household" value={hh.total === null ? "" : `£${hh.total.toLocaleString("en-GB")}`} width={120} />
          </div>
        </Group>
        <Group title="Current rental" icon="home" done={SECTIONS[4].done(d)}>
          <Small label="Address" value={d.currentAddress.trim()} width={330} />
          <div className="flex" style={{ gap: 16, marginTop: 8 }}>
            <Small label="Rented" value={yesNo(d.rentedLast12Months)} width={80} />
            <VRule />
            <Small label="On time" value={yesNo(d.rentOnTime)} width={84} />
            <VRule />
            <Small label="Reference" value={yesNo(d.landlordRef)} width={100} />
          </div>
        </Group>
        <div style={{ gridColumn: "1 / -1" }}>
          <Group title="Declared" icon="doc" done={SECTIONS[5].done(d)}>
            <div className="flex" style={{ gap: 12 }}>
              <Small label="Adverse credit" value={yesNo(d.adverseCredit)} width={140} />
              <VRule />
              <Small label="Guarantor" value={yesNo(d.guarantor)} width={100} />
              <VRule />
              <Small label="Pets" value={d.pets ? d.petsNote.trim() || "Yes" : yesNo(d.pets)} width={150} />
              <VRule />
              <Small label="Smoker" value={yesNo(d.smoker)} width={80} />
            </div>
          </Group>
        </div>
      </div>

      {/* The stamp, pressed in, bottom right. */}
      <div className="absolute" style={{ right: 30, bottom: 28, transform: "rotate(-6deg)" }}>
        <Emboss size={168} strong={SECTIONS.every((s) => s.done(d))} />
      </div>

      <div className="absolute flex items-end" style={{ left: 36, right: 226, bottom: 34, gap: 18 }}>
        <div
          className="min-w-0 flex-1 select-all overflow-hidden whitespace-nowrap font-mono"
          style={{ fontSize: 13, lineHeight: 1.55, letterSpacing: "0.1em", padding: "7px 11px", borderRadius: 6, background: `${COVER}0d`, color: `${COVER}bb`, boxShadow: "inset 0 1px 2px rgba(74,54,50,0.12)" }}
        >
          {l1}
          <br />
          {l2}
        </div>
        <Stamps data={d} />
      </div>
    </Card>
  );
}
