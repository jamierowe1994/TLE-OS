import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { managedBookFor, BOOK_STALE_MS } from "@/lib/managed-book-cache";
import { districtOf } from "@/lib/ma-research";
import { rexConfigured } from "@/lib/rex";
import { isScottish } from "@/lib/property-flags";
import { noDashes } from "@/lib/no-dashes";
import { DEFAULT_PHOTO_Y, splitAddress } from "@/lib/pre-pack";
import { SAMPLE_DECK, defaultBio, firstNameOf, initialsOf, type PresentDeck, type PresentFees } from "@/lib/present";

/**
 * THE APPRAISAL PRESENTATION (Claude Design, 23 Oct 2026).
 *
 * James's twelve-slide deck for the day of the visit, kept as the design's own
 * page (lib/decks/appraisal-presentation.html) and filled here, the same way
 * as the pre-appraisal pack (lib/pre-pack). The page reads one object,
 * `window.D`; this builds it.
 *
 * Where every value comes from:
 *   - the landlord, the home, the agent, the market, the nearby homes and the
 *     fees: the deck the agent made (os_presentations.deck), as frozen then;
 *   - the figure, the loves and the fixes: typed by the agent in the builder
 *     (PresentDeck.figure / loves / fixes). No figure, no figure slide;
 *   - the visit date: the appraisal's own appointment, read now;
 *   - the company figure on "Who we are": LIVE, read as the page is drawn -
 *     homes we look after (the Dashboard's figure). If it can't be read in
 *     time it is left out, never a held number;
 *   - the move-in month: today in London plus five weeks.
 *
 * Everything else is the company's standing copy from the design, with every
 * line that stated a number or a promise we can't stand behind taken out.
 */

export type DeckComp = {
  addr: string;
  locality: string;
  beds: number | null;
  type: string;
  /** £ pcm, for the range bar. Null when the advert's rent can't be read. */
  rent: number | null;
  rentText: string;
  days: number | null;
  status: "let agreed" | "on market" | "listed";
  image: string;
};

export type DeckService = { id: string; name: string; price: string; unit: string; blurb: string; note: string; feats: number[] };

export type DeckData = {
  /** For the open count and the terms. Null on the sample. */
  token: string | null;
  sample: boolean;
  /** Staff presenting: the appraisal whose terms "Let's get it on the market" sends. Null for anyone else. */
  cta: { appraisalId: string | null } | null;
  landlord: { first: string; full: string };
  property: {
    street: string;
    area: string;
    town: string;
    postcode: string;
    district: string;
    type: string;
    beds: number | null;
    baths: number | null;
    epc: string;
    tax: string;
    tenure: string;
    floor: string;
    image: string;
  };
  visit: { date: string };
  agent: {
    name: string;
    first: string;
    role: string;
    initials: string;
    phone: string;
    email: string;
    photo: string;
    photoY: number;
    bio: string;
  };
  /** Live company figures; null = could not be read, and the tile is left out. */
  firm: { homes: number | null };
  loves: [string, string][];
  fixes: [string, string][];
  market: {
    area: string;
    pulled: string;
    advertised: number | null;
    rentByBed: { label: string; n: number; rent: number }[];
    medianRent: number | null;
    bands: { label: string; n: number }[];
    agents: { agent: string; n: number; ours: boolean }[];
    reduced: number | null;
  } | null;
  comps: DeckComp[];
  compsFrom: "comparables" | "listings" | null;
  figure: { low: number; high: number; ask: number; weeks: string } | null;
  services: DeckService[];
  featNames: string[];
  recommended: string;
  feesNote: string;
  timeline: [string, string, string][];
  moveIn: string;
  scottish: boolean;
};

/* ── the company's words (the design's, trimmed to what is true) ── */

const FEAT_NAMES = ["Rightmove, Zoopla and OnTheMarket", "Accompanied viewings", "Referencing and right to rent", "Rent collected and chased", "Monthly statements", "Emergency repairs within 24 hours", "Inspections and renewals"];
const FEATS: Record<string, number[]> = { let: [1, 1, 1, 0, 0, 0, 0], collect: [1, 1, 1, 1, 1, 0, 0], managed: [1, 1, 1, 1, 1, 1, 1] };
const BLURB: Record<string, string> = {
  let: "We find and check the tenant. You take it from there.",
  collect: "We find the tenant and collect the rent every month.",
  managed: "We look after everything, so you don’t have to.",
};
const TIMELINE: [string, string, string][] = [
  ["Today", "Sign the terms", "We email them to you to sign."],
  ["Day 3", "Photos and floor plan", "Our photographer, at a time that suits you."],
  ["Day 4", "Live on the portals", "Rightmove, Zoopla and OnTheMarket."],
  ["Week 1 to 2", "Viewings", "We show every one ourselves."],
  ["Week 2 to 3", "Offer and checks", "References, right to rent and affordability."],
  ["Around week 5", "Move-in", "Keys, meter readings and the inventory."],
];

const LONDON = "Europe/London";
const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: LONDON }).format(d);
const clean = (s: string | null | undefined) => noDashes(String(s ?? "").trim());

/** "Late November": today in London plus five weeks, so it rolls over on its own. */
export function moveInFrom(now: Date = new Date()): string {
  const d = new Date(now.valueOf() + 35 * 86_400_000);
  const day = Number(part(d, { day: "numeric" }));
  const month = part(d, { month: "long" });
  return `${day <= 10 ? "early" : day <= 20 ? "mid" : "late"} ${month}`;
}

/** £ pcm from an advert's rent as shown ("£1,780 pcm", "£350 pw"). Null when it can't be read. */
export function monthlyRent(text: string | null | undefined): number | null {
  const t = String(text ?? "").toLowerCase();
  const m = /£?\s*([\d,]+(?:\.\d+)?)/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return /\b(pw|p\/w|per week|a week|weekly)\b/.test(t) ? Math.round((n * 52) / 12) : Math.round(n);
}

/** One of the deck's material rows by what its label says. "-" and blanks are nothing. */
function mat(deck: PresentDeck, re: RegExp): string {
  const row = (deck.material ?? []).find((r) => re.test(r.label));
  const v = (row?.value ?? "").trim();
  return v === "-" || v === "—" ? "" : v;
}

const kindOf = (label: string | null | undefined) => {
  const n = String(label ?? "").toLowerCase();
  return /manag/.test(n) ? "managed" : /collect/.test(n) ? "collect" : /find|let only/.test(n) ? "let" : null;
};

/** The services slide from the deck's own fee schedule - never the design's sample prices. */
function servicesFrom(fees: PresentFees | null | undefined): { services: DeckService[]; recommended: string; note: string } {
  if (!fees?.rows?.length) return { services: [], recommended: "", note: "" };
  const vat = /includ\w* vat/i.test(fees.note ?? "");
  const order = ["let", "collect", "managed"];
  const services = fees.rows
    .map((r, k) => {
      const kind = kindOf(r.label);
      const once = r.pct == null && (r.firstMonthPct != null || r.oneOff != null);
      const unit = [vat ? "inc. VAT" : "", once ? "once" : r.pct != null ? "monthly" : "", r.minimum ? `£${r.minimum.toLocaleString("en-GB")} minimum` : ""].filter(Boolean).join(", ");
      return {
        id: kind ?? `row${k}`,
        name: clean(r.label),
        price: clean(r.amount),
        unit,
        blurb: kind ? BLURB[kind] : "",
        note: clean(r.note),
        feats: kind ? FEATS[kind] : [],
      };
    })
    .sort((a, b) => (order.indexOf(a.id) + 1 || 9) - (order.indexOf(b.id) + 1 || 9));
  const want = kindOf(fees.headlineFor) ?? "managed";
  return { services, recommended: services.some((s) => s.id === want) ? want : "", note: clean(fees.note) };
}

/* ── the live company figures ── */

const within = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Homes we look after: the Dashboard's own figure (the whole book, every service, so "look after" not "manage"), or null if it can't be read in time or is too old. */
async function homesWeManage(): Promise<number | null> {
  if (!rexConfigured()) return null;
  const got = await within(managedBookFor(null), 6000);
  if (!got || got.ageMs > BOOK_STALE_MS) return null;
  const n = got.book.counts.homes ?? got.book.counts.properties;
  return typeof n === "number" && n > 0 ? n : null;
}

/* The days-to-let tile came out (James, 24 Oct 2026): it showed for 2 of the 16 areas appraised that month, and where it
   showed it said about ten weeks, against the plan's move-in around week 5. Homes is the only live company figure now. */
export async function firmFigures(): Promise<DeckData["firm"]> {
  return { homes: await homesWeManage() };
}

/** The appraisal a deck hangs off: its ref is the lead where there is one, else the appraisal. */
export async function appraisalForRef(ref: string | null | undefined): Promise<MarketAppraisal | null> {
  if (!ref || !hasDb()) return null;
  const rows = await q<{ id: string }>(`SELECT id FROM os_market_appraisals WHERE id = $1 OR lead_id = $1 OR id = 'lead-' || $1 LIMIT 1`, [ref]).catch(() => []);
  return rows[0] ? getAppraisal(rows[0].id).catch(() => null) : null;
}

/** For the sample only, plainly the sample's: a figure, three loves and two fixes for Raj's terrace. */
export const SAMPLE_EXTRAS: Pick<PresentDeck, "figure" | "loves" | "fixes"> = {
  figure: { ask: 1150, low: 1100, high: 1200, weeks: "2 to 3 weeks" },
  loves: [
    { title: "A garden that gets the sun", line: "South facing, and big enough for a table and chairs." },
    { title: "Ten minutes to the station", line: "On foot, with buses into the centre at the end of the road." },
    { title: "Ready to move into", line: "Freshly decorated, with a new kitchen last year." },
  ],
  fixes: [
    { title: "Book the gas safety check before the photos", line: "It’s needed before move-in anyway, and tenants ask about the boiler." },
    { title: "A coat of paint in the hallway", line: "The cheapest way to lift the first photo and the first impression." },
  ],
};

export function sampleDeck(): PresentDeck {
  return { ...SAMPLE_DECK, kind: "appraisal", ...SAMPLE_EXTRAS, createdAt: new Date().toISOString() };
}

/** The page's `D` from a deck. The welcome video isn't part of it: it belongs to the pre-appraisal pack, and here the landlord is sat with the agent (James, 23 Oct 2026). */
export function deckData(
  deck: PresentDeck,
  token: string | null,
  opts: { firm: DeckData["firm"]; appraisal?: MarketAppraisal | null; staff?: boolean; sample?: boolean; now?: Date }
): DeckData {
  const now = opts.now ?? new Date();
  const pc = (deck.property.postcode ?? "").trim().toUpperCase();
  const where = splitAddress(deck.property.address, pc);
  const scottish = isScottish(pc, deck.property.address);
  const a = deck.agent;
  const first = a.firstName || firstNameOf(a.name);

  /* The home: the deck's own facts first, the material rows behind them. */
  const typeRaw = deck.property.propertyType || mat(deck, /type/i);
  const bedsMat = Number.parseInt(mat(deck, /bed/i), 10);
  const bathsMat = Number.parseInt(mat(deck, /bath/i), 10);
  const epcRaw = deck.property.epc || mat(deck, /epc|energy/i);
  const epc = /^[A-G]\b/i.exec(epcRaw.trim())?.[0]?.toUpperCase() ?? "";
  const taxRaw = mat(deck, /council|tax/i);
  const tax = taxRaw ? (/^band/i.test(taxRaw) ? taxRaw : `Band ${taxRaw}`) : "";
  const floor = mat(deck, /floor|area|size/i) || (deck.property.sqft ? `${deck.property.sqft.toLocaleString("en-GB")} sq ft` : "");

  /* When the visit is: the appraisal's appointment, else the deck's own. */
  const when = opts.appraisal?.appointmentAt ?? deck.startsAt ?? null;
  const at = when ? new Date(when) : null;
  const date = at && !Number.isNaN(at.valueOf()) ? `${part(at, { weekday: "long" })} ${part(at, { day: "numeric", month: "long", year: "numeric" })}` : "";

  /* The market slide's figures, only what was ticked. */
  const m = deck.market;
  const rentByBed = (m?.rentByBed ?? []).filter((r): r is { label: string; n: number; rent: number } => typeof r.rent === "number" && r.rent > 0);
  const bands = (m?.bands ?? []).map((b) => ({ label: noDashes(b.label), n: b.n }));
  const agents = m?.agents ?? [];
  const bandTotal = bands.reduce((s, b) => s + b.n, 0);
  const market =
    m && (rentByBed.length || bandTotal || agents.length)
      ? {
          area: m.area,
          pulled: m.pulledAt ? part(new Date(m.pulledAt), { day: "numeric", month: "long" }) : "",
          advertised: typeof m.advertised === "number" && m.advertised > 0 ? m.advertised : bandTotal || null,
          rentByBed,
          medianRent: m.medianRent ?? null,
          bands,
          agents,
          reduced: m.reduced ?? null,
        }
      : null;

  /* Homes like yours: the comparables where there are any, else the homes picked from the market. */
  const fromComps: DeckComp[] = (deck.comparables?.rows ?? []).map((r) => ({
    addr: clean(r.name),
    locality: clean(r.locality),
    beds: r.beds ?? null,
    type: clean(r.type),
    rent: monthlyRent(r.rent),
    rentText: clean(r.rent),
    days: r.days ?? null,
    status: r.letAgreed ? "let agreed" : "listed",
    image: r.image ?? "",
  }));
  const fromListings: DeckComp[] = (deck.listings ?? []).map((l) => ({
    addr: clean(l.address),
    locality: clean(l.locality),
    beds: l.beds ?? null,
    type: clean(l.type),
    rent: monthlyRent(l.rent),
    rentText: clean(l.rent),
    days: l.days ?? null,
    status: l.status === "let agreed" ? "let agreed" : "on market",
    image: l.image ?? "",
  }));
  const compsFrom = fromComps.length >= 2 ? "comparables" : fromListings.length >= 2 ? "listings" : null;
  const comps = (compsFrom === "comparables" ? fromComps : compsFrom === "listings" ? fromListings : []).slice(0, 4);

  const fees = servicesFrom(deck.fees);
  const bio = a.bio?.trim() ? a.bio.trim().replace(/\s*\n+\s*/g, " ") : defaultBio(first, true).split("\n\n")[0];

  return {
    token,
    sample: Boolean(opts.sample),
    cta: opts.staff ? { appraisalId: opts.appraisal?.id ?? null } : null,
    landlord: { first: firstNameOf(deck.recipientName), full: (deck.recipientName ?? "").trim() },
    property: {
      ...where,
      postcode: pc,
      district: districtOf(pc) ?? "",
      type: clean(typeRaw),
      beds: deck.property.beds ?? (Number.isFinite(bedsMat) ? bedsMat : null),
      baths: deck.property.baths ?? (Number.isFinite(bathsMat) ? bathsMat : null),
      epc,
      tax: clean(tax),
      tenure: clean(mat(deck, /tenure/i)),
      floor: clean(floor),
      image: deck.property.image ?? "",
    },
    visit: { date },
    agent: {
      name: a.name,
      first,
      role: a.title?.trim() || "Letting Expert",
      initials: initialsOf(a.name),
      phone: a.phone ?? "",
      email: a.email ?? "",
      photo: a.photo ?? "",
      photoY: a.photoY ?? DEFAULT_PHOTO_Y,
      bio: clean(bio),
    },
    firm: opts.firm,
    loves: (deck.loves ?? []).map((l) => [clean(l.title), clean(l.line)]),
    fixes: (deck.fixes ?? []).map((l) => [clean(l.title), clean(l.line)]),
    market,
    comps,
    compsFrom,
    figure: deck.figure ? { low: deck.figure.low, high: deck.figure.high, ask: deck.figure.ask, weeks: clean(deck.figure.weeks) } : null,
    services: fees.services,
    /* Right to rent doesn't apply in Scotland, so a Scottish landlord isn't told we check it. */
    featNames: scottish ? FEAT_NAMES.map((f) => f.replace("Referencing and right to rent", "Referencing and affordability")) : FEAT_NAMES,
    recommended: fees.recommended,
    feesNote: fees.note,
    timeline: scottish ? TIMELINE.map((t) => (t[1] === "Offer and checks" ? [t[0], t[1], "References and affordability."] : t)) : TIMELINE,
    moveIn: moveInFrom(now),
    scottish,
  };
}

let page: string | null = null;
/** The design's page with this deck's data in it. `<` is escaped so no value can close the script. */
export function deckHtml(d: DeckData): string {
  /* Read once in production; afresh while developing, so an edit to the page shows on reload. */
  if (!page || process.env.NODE_ENV !== "production") page = readFileSync(path.join(process.cwd(), "lib/decks/appraisal-presentation.html"), "utf8");
  const json = JSON.stringify(d)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
  return page.replace("/*__DECK_DATA__*/null", () => json);
}
