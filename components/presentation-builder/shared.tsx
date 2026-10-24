"use client";

import type { Comparable, MaResearch, MarketListing, RecentLet } from "@/lib/ma-research";
import type { RmGuide } from "@/lib/rm-guide";
import { MARKET_BLOCKS, MAX_FIXES, MAX_LOVES, type DesignSlideId, type MarketBlock, type PresentNote } from "@/lib/present";

/**
 * What the four steps share (James's builder, 24 Oct 2026): the draft, the
 * comparable as one shape whatever it came from, the match score and the
 * rent guide. See components/presentation-builder/Builder for the screen.
 */

/* ───────────────────────── the draft ───────────────────────── */

/** The facts the builder lists on The home. Type, beds and baths live on the
 *  appraisal's shared record (appraisal-facts); the rest only here. */
export type FactKey = "type" | "beds" | "baths" | "size" | "tenure" | "tax" | "furn" | "parking" | "outside";

/** Where a comparable came from: the market's let agreed, our own book, or advertised now. */
export type Src = "let" | "ours" | "adv";

/**
 * ONE COMPARABLE, whichever list it came from. Snapshotted into the draft when
 * picked, so a pick survives the radius being narrowed past it, and the deck
 * gets exactly what was on screen when it was ticked.
 */
export type Cand = {
  key: string;
  src: Src;
  /** What the card says it is. */
  status: "Let agreed" | "Let by us" | "Ours, letting" | "Advertised";
  /** Agreed or let, rather than asked: the evidence check counts these. */
  actuallyLet: boolean;
  addr: string;
  pc: string;
  beds: number | null;
  type: string | null;
  /** £ pcm, normalised. */
  rent: number;
  /** As the source shows it, which may be weekly. */
  rentText: string;
  days: number | null;
  /** What `days` measures: advertised for, let in, or on our book now. */
  daysAre: "up" | "let" | "live";
  agent: string | null;
  lat: number | null;
  lon: number | null;
  /** Miles from the home, where both points are known. */
  mi: number | null;
  /** Ours only: how near by postcode, for the ones with no position. */
  near: "sector" | "district" | "area" | null;
  reduced: boolean;
  image: string | null;
  photos: string[];
  listingId: number | null;
  advert: string | null;
  room: boolean;
};

export type Draft = {
  /** 0 is the blank one nothing has been saved over yet. */
  v: 0 | 2;
  step: number;
  max: number;
  facts: Partial<Record<FactKey, string>>;
  src: "all" | Src;
  bedsOnly: boolean;
  radius: number;
  /** The home's bedrooms when last seen, so the first search can ask for them. */
  seenBeds: number | null;
  picks: Cand[];
  ask: number | null;
  lo: number | null;
  hi: number | null;
  weeks: string | null;
  scope: "sector" | "district";
  cards: MarketBlock[];
  off: DesignSlideId[];
  cur: DesignSlideId;
  loves: PresentNote[];
  fixes: PresentNote[];
  rmGuide: RmGuide | null;
  /** The agent's own photo of the home, resized, as a data URL. Draft only. */
  photo: string | null;
};

export const blankNotes = (n: number): PresentNote[] => Array.from({ length: n }, () => ({ title: "", line: "" }));
export const padNotes = (rows: PresentNote[] | null | undefined, n: number): PresentNote[] =>
  [...(rows ?? []).slice(0, n), ...blankNotes(n)].slice(0, n).map((r) => ({ title: r.title ?? "", line: r.line ?? "" }));

export const BLANK: Draft = {
  v: 0,
  step: 0,
  max: 0,
  facts: {},
  src: "all",
  bedsOnly: true,
  radius: 0.75,
  seenBeds: null,
  picks: [],
  ask: null,
  lo: null,
  hi: null,
  weeks: null,
  scope: "sector",
  cards: MARKET_BLOCKS.filter((b) => b.on).map((b) => b.id),
  off: [],
  cur: "cover",
  loves: blankNotes(MAX_LOVES),
  fixes: blankNotes(MAX_FIXES),
  rmGuide: null,
  photo: null,
};

export const STEPS = ["The home", "Comparables", "The figure", "The deck"] as const;

export const TIME_TO_LET = ["1 to 2 weeks", "2 to 3 weeks", "3 to 4 weeks", "4 to 6 weeks"];

/** Our own median days to let, as one of the tap options, or null when it is past all of them. */
export function weeksFor(days: number): string | null {
  return days <= 14 ? TIME_TO_LET[0] : days <= 21 ? TIME_TO_LET[1] : days <= 28 ? TIME_TO_LET[2] : days <= 42 ? TIME_TO_LET[3] : null;
}

/* ───────────────────────── small helpers ───────────────────────── */

export const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
export const r25 = (n: number) => Math.round(n / 25) * 25;
export const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
/** Linear-interpolated quantile, as the design's guide works it. */
export const quantile = (a: number[], p: number): number | null => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
/** "£1,150" or "1150" typed into a box, as whole pounds. */
export const pounds = (v: string): number | null => {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
export const miles = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 3958.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const milesText = (mi: number) => (mi < 1 ? (Math.round(mi * 10) / 10).toString() : mi.toFixed(1).replace(/\.0$/, ""));
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "24 Oct, 08:58", London time. */
export const readAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
};

/** Flat, house or a room, from whatever words a source uses. Null when it can't tell. */
export function kindOf(type: string | null | undefined): "flat" | "house" | "room" | null {
  const t = (type ?? "").toLowerCase();
  if (!t) return null;
  if (/\broom\b|hmo|multiple occupation/.test(t)) return "room";
  if (/flat|maisonette|apartment|studio/.test(t)) return "flat";
  if (/house|terrace|semi|detached|bungalow|cottage|town ?house/.test(t)) return "house";
  return null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
/** The same house, by number and street, however each feed spells the rest (as SubjectStory has it). */
export function sameHouse(subject: string, other: string): boolean {
  const a = norm(subject);
  const b = norm(other);
  const num = a.match(/\b\d+[a-z]?\b/)?.[0];
  if (!num) return false;
  const street = a.split(" ").find((w) => w.length > 3 && !/\d/.test(w));
  return Boolean(street) && b.includes(`${num} `) && b.includes(street as string);
}

/** The town, from the appraisal's address: the last part that isn't the postcode. */
export function townOf(address: string, postcode: string): string {
  const pc = norm(postcode).replace(/ /g, "");
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const rest = parts.slice(1).filter((p) => norm(p).replace(/ /g, "") !== pc && !/^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i.test(p));
  return rest[rest.length - 1] ?? "";
}

/** "TQ3 2SE" → "TQ3 2", "TQ3". */
export function sectorOf(postcode: string): { sector: string; district: string } | null {
  const c = postcode.toUpperCase().replace(/\s+/g, "");
  if (c.length < 5) return null;
  const outward = c.slice(0, -3);
  return { sector: `${outward} ${c.slice(-3, -2)}`, district: outward };
}

/* ───────────────────────── the icons ───────────────────────── */

/* The design's line icons (presentation-builder.html PATHS). */
const PATHS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
} as const;
export type IcName = keyof typeof PATHS;
export const Ic = ({ k, w = 1.7 }: { k: IcName; w?: number }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PATHS[k]} />
  </svg>
);

/** Three dots, for anything still on its way. Never a blank, never a zero. */
export const Loading = ({ say }: { say: string }) => (
  <span className="ld" role="status">
    <span aria-hidden>
      <i />
      <i />
      <i />
    </span>
    {say}
  </span>
);

/* ───────────────────────── the comparables ───────────────────────── */

const isRoomish = (type: string | null | undefined, addr: string) => kindOf(type) === "room" || /^\s*room\b/i.test(addr);

/**
 * Every comparable the research holds, in one shape.
 *
 *   Let recently   the market's let agreed homes (Homesearch).
 *   Ours           our own book: lets REX records as leased in this district,
 *                  and our current listings (let agreed, or still letting),
 *                  however far out the rings had to go to find them.
 *   Advertised     on the market now (Homesearch).
 *
 * The home itself is left out wherever it turns up.
 */
export function candidatesFrom(
  d: MaResearch,
  address: string,
  photos: Record<string, { photos: string[]; advert: string | null }>
): Cand[] {
  const at = d.subjectPoint;
  const out: Cand[] = [];
  const dist = (lat: number | null | undefined, lon: number | null | undefined) =>
    at && lat != null && lon != null ? miles(at, { lat, lon }) : null;

  for (const l of d.onMarketNearby as MarketListing[]) {
    if (l.rent == null || l.rent <= 0) continue;
    if (sameHouse(address, l.address)) continue;
    const let_ = l.status === "let agreed";
    const g = l.listingId ? photos[String(l.listingId)] : undefined;
    out.push({
      key: l.listingId ? `hs:${l.listingId}` : `hs:${l.address}|${l.rent}`,
      src: let_ ? "let" : "adv",
      status: let_ ? "Let agreed" : "Advertised",
      actuallyLet: let_,
      addr: l.address,
      pc: l.postcode,
      beds: l.beds,
      type: l.type,
      rent: Math.round(l.rent),
      rentText: `${money(l.rent)} pcm`,
      days: l.daysListed,
      daysAre: "up",
      agent: l.agent,
      lat: l.lat,
      lon: l.lon,
      mi: dist(l.lat, l.lon),
      near: null,
      reduced: Boolean(l.reducedAt),
      image: l.image,
      photos: g?.photos ?? l.photos ?? [],
      listingId: l.listingId,
      advert: g?.advert ?? l.advert ?? null,
      room: isRoomish(l.type, l.address),
    });
  }

  const ours: Cand[] = [];
  for (const c of d.comparables as Comparable[]) {
    if (!c.rentMonthly) continue;
    if (sameHouse(address, c.name)) continue;
    ours.push({
      key: `oc:${c.id}`,
      src: "ours",
      status: c.letAgreed ? "Let by us" : "Ours, letting",
      actuallyLet: c.letAgreed,
      addr: c.name,
      pc: c.locality,
      beds: null,
      type: c.type ?? null,
      rent: c.rentMonthly,
      rentText: c.rentDisplay,
      days: c.daysOnMarket,
      daysAre: c.letAgreed ? "let" : "live",
      agent: null,
      lat: c.lat ?? null,
      lon: c.lon ?? null,
      mi: dist(c.lat, c.lon),
      near: c.nearness,
      reduced: false,
      image: c.image ?? null,
      photos: [],
      listingId: null,
      advert: null,
      room: isRoomish(c.type, c.name),
    });
  }
  for (const r of d.recentlyLet as RecentLet[]) {
    if (r.rent == null || r.rent <= 0) continue;
    if (sameHouse(address, r.address)) continue;
    /* Our current listing of the same house says more than its last tenancy. */
    if (ours.some((o) => sameHouse(o.addr, r.address) || sameHouse(r.address, o.addr))) continue;
    ours.push({
      key: `rl:${r.address}|${r.postcode}`,
      src: "ours",
      status: "Let by us",
      actuallyLet: true,
      addr: r.address,
      pc: r.postcode,
      beds: r.beds,
      type: null,
      rent: Math.round(r.rent),
      rentText: `${money(r.rent)} pcm`,
      days: r.daysToLet,
      daysAre: "let",
      agent: null,
      lat: null,
      lon: null,
      mi: null,
      near: "district",
      reduced: false,
      image: null,
      photos: [],
      listingId: null,
      advert: null,
      room: isRoomish(null, r.address),
    });
  }
  return [...out, ...ours];
}

/**
 * HOW CLOSELY IT MATCHES, out of a hundred-ish: the bedroom difference, the
 * same type, the distance, and a small bonus for having actually let. Ours
 * with no position are scored on how near their postcode is instead, and
 * anything the source doesn't record costs half the full penalty rather than
 * counting as a match.
 */
export function score(c: Cand, beds: number | null, type: string | null): number {
  let s = 100;
  if (c.beds != null && beds != null) s -= Math.abs(c.beds - beds) * 28;
  else s -= 14;
  const a = kindOf(type);
  const b = kindOf(c.type);
  if (a && b) {
    if (a !== b) s -= 25;
  } else s -= 8;
  if (c.mi != null) s -= c.mi * 14;
  else s -= c.near === "sector" ? 7 : c.near === "area" ? 50 : 21;
  if (c.actuallyLet) s += 6;
  return s;
}
export const isClose = (s: number) => s >= 85;
export const matchWord = (s: number) => (s >= 85 ? "Close match" : s >= 65 ? "Good match" : "Loose match");

/** Further out than the agent is looking: ours from beyond the radius or the district. */
export const furtherOut = (c: Cand, radius: number) => c.src === "ours" && (c.mi != null ? c.mi > radius : c.near === "area");

/* ───────────────────────── the figure ───────────────────────── */

export type Guide = { ask: number; lo: number; hi: number; n: number; let: number; from: "picks" | "typed" };

/**
 * The rent guide from the picks, rooms left out: the median rounded to £25,
 * the 25th and 75th percentiles either side, unless the agent has moved them.
 * With no picks it is only what they typed, all three or nothing.
 */
export function guideOf(S: Draft): Guide | null {
  const p = S.picks.filter((c) => !c.room);
  const r = p.map((c) => c.rent);
  if (!r.length) {
    if (S.ask != null && S.lo != null && S.hi != null) return { ask: S.ask, lo: Math.min(S.lo, S.ask), hi: Math.max(S.hi, S.ask), n: 0, let: 0, from: "typed" };
    return null;
  }
  const ask = S.ask ?? r25(median(r) as number);
  const lo = S.lo ?? r25(quantile(r, 0.25) as number);
  const hi = S.hi ?? r25(quantile(r, 0.75) as number);
  return { ask, lo: Math.min(lo, ask), hi: Math.max(hi, ask), n: r.length, let: p.filter((c) => c.actuallyLet).length, from: "picks" };
}

/** The deck's slide notes, under each title on The deck (the design's DECK_NOTE). */
export const SLIDE_NOTE: Record<DesignSlideId, string> = {
  cover: "The home, the landlord and the suggested rent",
  today: "What the visit covers",
  who: "You and the company figures",
  home: "The facts, the three loves and the jobs",
  market: "The market cards you switched on",
  comps: "Your comparables, closest first",
  figure: "The figure, the range and the deposits",
  finding: "Standard",
  fees: "Standard, with your recommendation",
  rules: "Standard",
  plan: "Standard plan",
  next: "Sign the terms",
};
