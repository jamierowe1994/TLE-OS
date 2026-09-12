"use client";

import { SECTIONS, householdIncome, money, type PassportData } from "@/lib/passport-shape";

/**
 * The passport card, drawn as they fill it in. Two faces.
 *
 * James: "we'll build them out an actual fake passport in real time, just to
 * make it a bit more interesting. It's just a bit of a fun game." And on
 * 12 Sep 2026: "I love the idea of it almost becoming 3D, so it's like you
 * can grab the passport and flip it and spin it around ... and then you can
 * see the back of it, which will then show all of their details."
 *
 * ── Drawn at ONE size and scaled ──────────────────────────────────────────
 *
 * Every measurement in here is in pixels against a 900 x 596 card. The scene
 * scales that to the column and turns it in 3D; the flat version on a phone
 * scales it to the width. One drawing, transformed, cannot drift.
 *
 * ── The front is who they are; the back is everything else ───────────────
 *
 * Page one of the form fills the front: name, photo, birthday, nationality.
 * Every later page writes to the back, and the scene turns the card over as
 * they move on, so what they type is always landing somewhere they can see.
 *
 * ── Its colours are the tenant surface's, not the brand red ──────────────
 *
 * The cover is the palette's chocolate brown with the logo in its pink; the
 * page is warm paper; labels and stamps are brown. James, 12 Sep: "if we're
 * going to pick a colour, pick a colour" - the card, the buttons and the page
 * behind them all draw from the same four.
 *
 * ── The photo is theirs to add, and it is only a picture ──────────────────
 *
 * A tenant's own photo gives no statutory excuse under Right to Rent - only
 * a share code check, a certified IDSP, or an agent seeing the original does.
 * So the photo is optional, says so, and is read by nothing but this card;
 * the real check stays the agent's job. Without one the panel carries a
 * person mark.
 */

export const CARD_W = 900;
export const CARD_H = 596;

/* The palette (globals.css): chocolate brown, light pink, clay. */
export const COVER = "#56423e";
const COVER_DEEP = "#3d2e2b";
export const PINK = "#fdefec";
const CLAY = "#cfa096";
const PAPER = "#fbf6f3";
const INK = "#2e2320";
const LABEL = "#56423e";
const QUIET = "#8b7a75";

/** Derived from their name and date of birth, so it is stable. A number that
 *  reshuffles on every keystroke reads as broken rather than as generated. */
export function docNumber(d: PassportData): string {
  const seed = `${d.legalName}${d.dob}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!seed) return "TLE-000000";
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000000;
  return `TLE-${String(h).padStart(6, "0")}`;
}

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep 1996" from the date input's ISO, or nothing. Spelled out rather
 *  than toLocaleDateString, which gives "Sept". */
export function longDob(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} ${M[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Which field on the card a form input maps to, so the card can light up
 *  the line somebody is typing into. */
export type PassportFocus = "legalName" | "knownAs" | "dob" | "nationality" | null;

/* ── Shared pieces ───────────────────────────────────────────────────────── */

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

function Paper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden" style={{ width: CARD_W, height: CARD_H, borderRadius: 26, background: PAPER, color: INK }}>
      {/* Paper: the faintest speckle, the way security paper is. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.09]"
        style={{
          backgroundImage: `radial-gradient(circle at 22% 28%, ${COVER} 0.7px, transparent 0.8px), radial-gradient(circle at 72% 66%, ${CLAY} 0.7px, transparent 0.8px)`,
          backgroundSize: "17px 17px, 23px 23px",
        }}
      />
      {children}
    </div>
  );
}

/* ── The front ───────────────────────────────────────────────────────────── */

export default function PassportBook({ data, focus = null }: { data: PassportData; focus?: PassportFocus }) {
  const identity = SECTIONS[0].done(data);
  const name = data.legalName.trim();

  return (
    <Paper>
      {/* ── The cover band ── */}
      <div
        className="absolute inset-x-0 top-0 flex items-start justify-between px-9 pt-7"
        style={{ height: 176, background: `linear-gradient(160deg, ${COVER} 0%, ${COVER_DEEP} 100%)` }}
      >
        <Wordmark height={68} />
        <div className="flex items-center gap-5 pt-1">
          <p className="text-right font-medium uppercase" style={{ fontSize: 17, lineHeight: 1.45, letterSpacing: "0.22em", color: PINK, opacity: 0.9 }}>
            Tenant
            <br />
            Passport
          </p>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: PINK, opacity: 0.8 }}>
            <rect x="3.5" y="3" width="17" height="18" rx="3" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7.5 17.5c1-2.2 2.6-3.3 4.5-3.3s3.5 1.1 4.5 3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {/* The page rises into the band on a soft curve. */}
      <div aria-hidden className="absolute inset-x-0" style={{ top: 150, height: 40, background: PAPER, borderRadius: "22px 22px 0 0" }} />

      {/* ── The data page ── */}
      <div className="absolute inset-x-0 flex gap-8 px-9" style={{ top: 186 }}>
        {/* The photo panel: theirs if they added one, cropped to a circle on
            white. Without one, a person mark - never an illustration that
            could read as a placeholder they are meant to replace. */}
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white"
          style={{ width: 208, height: 208, marginTop: 10, border: `2px solid ${COVER}26`, boxShadow: `0 0 0 8px ${PAPER}, 0 0 0 9.5px ${COVER}1f` }}
        >
          {data.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <PersonMark />
          )}
        </div>

        <dl className="relative min-w-0 flex-1" style={{ paddingTop: 6 }}>
          <Row label="Full name" value={name} big lit={focus === "legalName"} />
          <div className="flex" style={{ gap: 36, marginTop: 18 }}>
            <Row label="Date of birth" value={longDob(data.dob)} lit={focus === "dob"} width={230} />
            <Row label="Nationality" value={data.nationality.trim()} lit={focus === "nationality"} width={170} />
          </div>
          <div className="flex" style={{ gap: 36, marginTop: 18 }}>
            <Row label="Tenant ID" value={docNumber(data)} width={230} />
            {data.knownAs.trim() && <Row label="Known as" value={data.knownAs.trim()} lit={focus === "knownAs"} width={170} />}
          </div>

          {/* The round stamp, earned when page one is finished. Absolutely
              placed so the lines never move to make room for it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute transition-all duration-700 ease-out"
            style={{ right: -26, top: 74, opacity: identity ? 0.75 : 0.14, transform: `rotate(-12deg) scale(${identity ? 1 : 1.12})` }}
          >
            <RoundStamp />
          </div>
        </dl>
      </div>

      {/* ── The rule, the stamps and the line ── */}
      <div className="absolute inset-x-0 px-9" style={{ top: 452 }}>
        <div style={{ height: 1.5, background: `${COVER}22` }} />
        <div className="flex items-end justify-between" style={{ marginTop: 18 }}>
          <p className="whitespace-nowrap" style={{ fontFamily: "var(--font-script), cursive", fontSize: 44, lineHeight: 1, color: INK, paddingLeft: 6 }}>
            A smoother letting journey starts here.
          </p>
          <Stamps data={data} />
        </div>
        <div style={{ marginLeft: 380, marginTop: 4, width: 130, height: 3, background: COVER, borderRadius: 2 }} />
      </div>
    </Paper>
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
  const name = pad(`${last}<<${first}`.replace(/[^A-Z<]/g, ""), 39);
  const dob = d.dob ? d.dob.slice(2).replace(/-/g, "") : "<<<<<<";
  const nat = pad(cap(d.nationality).replace(/[^A-Z]/g, ""), 3);
  return [`P<TLE${name}`, pad(`${docNumber(d).replace("-", "")}<${nat}${dob}`, 44)];
}

export function PassportBack({ data }: { data: PassportData }) {
  const d = data;
  const hh = householdIncome(d);
  const [l1, l2] = mrz(d);
  const rtr =
    d.hasBritishPassport === true ? "British or Irish passport"
    : d.hasBritishPassport === false ? (d.shareCode.trim() ? `Share code ${d.shareCode.trim()}` : "Share code to follow")
    : "";

  return (
    <Paper>
      {/* A slim band, so the two faces are clearly one object. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-9" style={{ height: 78, background: `linear-gradient(160deg, ${COVER} 0%, ${COVER_DEEP} 100%)` }}>
        <Wordmark height={40} />
        <p className="font-medium uppercase" style={{ fontSize: 14, letterSpacing: "0.24em", color: PINK, opacity: 0.9 }}>
          {docNumber(d)} · Details
        </p>
      </div>

      <div className="absolute inset-x-0 grid grid-cols-2 px-9" style={{ top: 98, columnGap: 40, rowGap: 16 }}>
        <Group title="Right to rent" done={SECTIONS[1].done(d)}>
          <Row label="Checked by" value={rtr} width={360} />
        </Group>
        <Group title="What they earn" done={SECTIONS[2].done(d)}>
          <div className="flex" style={{ gap: 16 }}>
            <Row label="Status" value={d.applicantType} width={176} />
            <Row label="Income" value={pounds(d.annualIncome)} width={98} />
            <Row label="Savings" value={pounds(d.savings)} width={98} />
          </div>
        </Group>
        <Group title="Who's moving in" done={SECTIONS[3].done(d)}>
          <div className="flex" style={{ gap: 28 }}>
            <Row label="Adults" value={d.numAdults.trim()} width={80} />
            <Row label="Children" value={d.numChildren.trim()} width={90} />
            <Row label="Household" value={hh.total === null ? "" : `£${hh.total.toLocaleString("en-GB")}`} width={150} />
          </div>
        </Group>
        <Group title="Current rental" done={SECTIONS[4].done(d)}>
          <Row label="Address" value={d.currentAddress.trim()} width={360} />
          <div className="flex" style={{ gap: 20, marginTop: 8 }}>
            <Row label="Rented" value={yesNo(d.rentedLast12Months)} width={110} />
            <Row label="On time" value={yesNo(d.rentOnTime)} width={110} />
            <Row label="Reference" value={yesNo(d.landlordRef)} width={120} />
          </div>
        </Group>
        <Group title="Declared" done={SECTIONS[5].done(d)} wide>
          <div className="flex" style={{ gap: 28 }}>
            <Row label="Adverse credit" value={yesNo(d.adverseCredit)} width={200} />
            <Row label="Guarantor" value={yesNo(d.guarantor)} width={140} />
            <Row label="Pets" value={d.pets ? d.petsNote.trim() || "Yes" : yesNo(d.pets)} width={220} />
            <Row label="Smoker" value={yesNo(d.smoker)} width={120} />
          </div>
        </Group>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-9" style={{ paddingBottom: 24, gap: 24 }}>
        <div
          className="min-w-0 flex-1 select-all overflow-hidden whitespace-nowrap font-mono"
          style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: "0.12em", padding: "8px 12px", borderRadius: 6, background: `${COVER}0d`, color: `${COVER}cc` }}
        >
          {l1}
          <br />
          {l2}
        </div>
        <Stamps data={d} />
      </div>
    </Paper>
  );
}

function Group({ title, done, wide, children }: { title: string; done: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
        <h3 className="hand" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: COVER }}>
          {title}
        </h3>
        <span
          className="flex items-center justify-center rounded-full transition-all duration-500"
          style={{ width: 18, height: 18, border: `1.5px solid ${done ? COVER : `${COVER}30`}`, background: done ? `${COVER}1a` : "transparent", color: done ? COVER : `${COVER}50`, fontSize: 9, fontWeight: 700 }}
        >
          {done ? "✓" : ""}
        </span>
      </div>
      {children}
    </section>
  );
}

/* ── Bits ────────────────────────────────────────────────────────────────── */

function Stamps({ data }: { data: PassportData }) {
  return (
    <div className="flex shrink-0 items-center" style={{ gap: 6, paddingBottom: 6 }}>
      {SECTIONS.map((s, i) => {
        const done = s.done(data);
        return (
          <span
            key={s.key}
            title={`${s.title}: ${done ? "done" : "not yet"}`}
            className="flex items-center justify-center rounded-full transition-all duration-500"
            style={{
              width: 22,
              height: 22,
              border: `1.5px solid ${done ? COVER : `${COVER}30`}`,
              background: done ? `${COVER}1a` : "transparent",
              color: done ? COVER : `${COVER}55`,
              fontSize: 10,
              fontWeight: 700,
              transform: done ? `rotate(${i % 2 ? 8 : -8}deg)` : "none",
            }}
          >
            {done ? "✓" : i + 1}
          </span>
        );
      })}
    </div>
  );
}

function Row({ label, value, big, lit, width }: { label: string; value: string; big?: boolean; lit?: boolean; width?: number }) {
  return (
    <div
      className="min-w-0 rounded-[8px] transition-colors duration-300"
      style={{ width, margin: "-4px -8px", padding: "4px 8px", background: lit ? `${COVER}12` : "transparent" }}
    >
      <dt className="font-semibold uppercase" style={{ fontSize: 13, letterSpacing: "0.2em", color: big ? LABEL : QUIET }}>
        {label}
      </dt>
      <dd
        className={`truncate ${big ? "hand" : ""}`}
        style={{
          marginTop: big ? 4 : 3,
          fontSize: big ? 38 : 20,
          fontWeight: big ? 700 : 500,
          letterSpacing: big ? "-0.015em" : "0",
          lineHeight: 1.15,
          color: value ? INK : `${INK}40`,
          borderBottom: `2px solid ${lit ? COVER : "transparent"}`,
          transition: "border-color 300ms, color 300ms",
        }}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

/** The person mark on an empty photo panel. Head and shoulders, in the
 *  cover's brown at low weight, so it reads as "no photo" and not as a
 *  space waiting for one. */
function PersonMark() {
  return (
    <svg width="104" height="104" viewBox="0 0 48 48" fill="none" aria-hidden style={{ color: COVER, opacity: 0.5 }}>
      <circle cx="24" cy="17" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 41c1.6-8.6 8.3-13.5 16.5-13.5S38.9 32.4 40.5 41" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A round rubber stamp: the company round the rim, the initials in the
 *  middle. Drawn once; the card fades it in. */
function RoundStamp() {
  return (
    <svg width="176" height="176" viewBox="0 0 120 120" aria-hidden style={{ color: COVER }}>
      <defs>
        <path id="stampRim" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="1" />
      <text fontSize="9" fontWeight="600" letterSpacing="2.6" fill="currentColor" fontFamily="var(--font-inter), system-ui, sans-serif">
        <textPath href="#stampRim" startOffset="0">THE LETTING EXPERTS · TENANT PASSPORT ·</textPath>
      </text>
      <text x="60" y="69" textAnchor="middle" fontSize="26" fontWeight="700" letterSpacing="1" fill="currentColor" fontFamily="var(--font-bricolage), var(--font-manrope), system-ui, sans-serif">
        TLE
      </text>
    </svg>
  );
}
