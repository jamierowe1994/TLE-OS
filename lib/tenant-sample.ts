import type { Stop } from "@/lib/landlord-journey";
import type { TenantHome, TenantProperty } from "@/lib/tenant-home-view";
import { EMPTY_PASSPORT, type PassportData } from "@/lib/passport-shape";
import { DEAL, STAGE_UPDATE, atLeast, fillUpdate, findingRoad, phaseOf, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * The sample tenant, for the portal at /tenant/demo: Sophie, at whichever
 * stage the harness has her - from a passport made and nothing else, through
 * an enquiry, a viewing and an offer on a two-bed in Nottingham, to living
 * in it. What James, Susan or a partner agent sees when they open "the
 * tenant portal" from the admin without being a tenant. Invented, and says
 * so on the shell; nothing here is read from anywhere or written anywhere.
 *
 * `sampleFor(stage)` builds the whole home view for a stage. The dates roll
 * (11 Oct 2026): they were fixed in September, so by launch the "upcoming"
 * viewing was a month gone. The story is laid out in days from the passport
 * (DAY), and whichever stage is shown is today, so every snapshot reads true
 * on the day it is opened: a booked viewing is a few days ahead, keys were
 * handed over yesterday.
 */

export const SOPHIE_PASSPORT: PassportData = {
  ...EMPTY_PASSPORT,
  legalName: "Sophie Turner",
  knownAs: "Soph",
  dob: "1996-04-14",
  nationality: "British",
  email: "sophie.sample@example.com",
  mobile: "07700 900123",
  hasBritishPassport: true,
  applicantType: "Employed",
  workHours: "Full-time",
  zeroHours: false,
  onProbation: false,
  annualIncome: "34,000",
  savings: "5,200",
  /* Two of them and a dog (1 Oct 2026), so the offer's Who's moving in has
     names to tick and the pets come through from the passport. */
  numAdults: "2",
  numChildren: "0",
  coOccupantIncomes: "Jordan Reid - 26,000",
  rentedLast12Months: true,
  rentOnTime: true,
  landlordRef: true,
  currentAddress: "22 Arboretum Street, Nottingham",
  movedIn: "2024-02",
  livedThreeYears: false,
  previousAddress: "5 Castle Boulevard, Nottingham",
  adverseCredit: false,
  guarantor: true,
  pets: true,
  petsNote: "A small, older dog",
  smoker: false,
};

/* The same agent as Raj's (lib/landlord-sample): one home, one landlord, one
   tenant, one agent, so the Showroom's screens and emails tell one story
   (James, 28 Sep 2026). */
const AGENT = { name: "Sam Whitaker", email: "sam@thelettingexperts.co.uk", phone: "0115 123 4567", photo: null };

const HOME: TenantProperty = {
  property: "8 Recreation Terrace",
  locality: "Nottingham NG2",
  rentPcm: 1250,
  beds: 2,
  photo: "/brand/photo/property.jpg",
  images: ["/brand/photo/property.jpg", "/brand/living-room.jpg"],
  /* An invented home, so it opens Find a home rather than a listing. */
  href: "/tenant/homes",
};

/** What else Sam has on: three homes near Sophie's budget. */
const MARKET: TenantProperty[] = [
  { property: "14 Trent Bridge Court", locality: "West Bridgford NG2", rentPcm: 925, beds: 2, photo: "/brand/living-room.jpg", href: "/tenant/homes" },
  { property: "Flat 3, 61 Musters Road", locality: "West Bridgford NG2", rentPcm: 795, beds: 1, photo: null, href: "/tenant/homes" },
  { property: "27 Lady Bay Road", locality: "Lady Bay NG2", rentPcm: 875, beds: 2, photo: null, href: "/tenant/homes" },
];

const STAGES = [
  ["deal_started", "Offer accepted"],
  ["holding_fee", "Holding fee"],
  ["referencing", "Referencing"],
  ["plc", "Compliance checks"],
  ["deposit", "Deposit"],
  ["tenancy_agreement", "Tenancy agreement"],
  ["rent_payment", "First rent"],
  ["move_day", "Move-in day"],
] as const;

/* The deal's words, from the one table every stage now uses. Kept as a name
   of its own because the sample reads it three times. */
const DEAL_WORDS: Record<string, { now: string; next: string }> = Object.fromEntries(
  Object.entries(STAGE_UPDATE).map(([key, u]) => [key, { now: u.blurb, next: u.next }])
);

/* The story in days from the passport. The viewing is on day 9. */
const VIEWING_DAY = 9;
const KEYS_DAY = 25;
/* Which day of the story each stage is "today". */
const NOW_DAY: Record<TenantStageKey, number> = {
  passport: 0, enquired: 2, matched: 2, viewing: 4, viewed: 10, offer: 10, declined: 10, deal_started: 10,
  holding_fee: 11, referencing: 12, plc: 16, deposit: 18, tenancy_agreement: 19, rent_payment: 20, move_day: 23, living: 26,
};

const ACTIVITY: { at: TenantStageKey; label: string; sub: string; day: number; tone: "done" | "live" | "quiet" }[] = [
  { at: "passport", label: "Passport finished", sub: "6 of 6 sections", day: 0, tone: "done" },
  { at: "passport", label: "Your tenant area opened", sub: "Welcome in", day: 0, tone: "quiet" },
  { at: "enquired", label: "You enquired about 8 Recreation Terrace", sub: "Sam has it", day: 2, tone: "done" },
  { at: "matched", label: "Four homes sent to you", sub: "Matched to your budget and area", day: 2, tone: "done" },
  { at: "viewing", label: "Viewing booked", sub: "VIEWING with Sam", day: 3, tone: "done" },
  { at: "viewed", label: "You viewed 8 Recreation Terrace", sub: "How was it?", day: 9, tone: "done" },
  { at: "offer", label: "Offer made: £1,250 a month", sub: "With the landlord", day: 9, tone: "done" },
  { at: "declined", label: "The landlord went with another application", sub: "Others sent the same day", day: 10, tone: "done" },
  { at: "deal_started", label: "Offer accepted", sub: "8 Recreation Terrace", day: 10, tone: "done" },
  { at: "holding_fee", label: "Holding fee received", sub: "£288", day: 11, tone: "done" },
  { at: "referencing", label: "Referencing started", sub: "Employer, landlord and credit", day: 11, tone: "done" },
  { at: "plc", label: "References passed", sub: "All three back", day: 16, tone: "done" },
  { at: "deposit", label: "Deposit registered", sub: "£1,442 with the DPS", day: 18, tone: "done" },
  { at: "tenancy_agreement", label: "Tenancy agreement sent for signing", sub: "", day: 19, tone: "done" },
  { at: "rent_payment", label: "Agreement signed by everyone", sub: "", day: 20, tone: "done" },
  { at: "move_day", label: "First month's rent received", sub: "£1,250", day: 23, tone: "done" },
  { at: "living", label: "Keys handed over", sub: "Inventory signed", day: 25, tone: "done" },
];

export function sampleFor(stage: TenantStageKey): TenantHome {
  /* Day 0 of the story, so that this stage's day is today. */
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() - (NOW_DAY[stage] ?? 0));
  const day = (n: number, h = 0, m = 0) => { const d = new Date(base); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const isoTime = (d: Date) => `${iso(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
  const long = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  const short = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  const full = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const viewingAt = day(VIEWING_DAY, 14, 30);

  const phase = phaseOf(stage);
  const inDeal = phase !== "finding";

  /* Before the deal: the home she is after, once she has asked about it. */
  const enquiry = atLeast(stage, "enquired") ? { ...HOME, enquiredOn: iso(day(2)) } : null;
  const viewing = atLeast(stage, "viewing") ? { when: isoTime(viewingAt), withName: "Sam", status: (atLeast(stage, "viewed") ? "done" : "booked") as "done" | "booked" } : null;
  const offer = atLeast(stage, "offer") ? { amount: 1250, madeOn: iso(day(VIEWING_DAY)), status: (inDeal ? "accepted" : "with_landlord") as "accepted" | "with_landlord" } : null;

  /* The deal, once there is one. Living is every stage done. */
  const dealIdx = stage === "living" ? STAGES.length : DEAL.indexOf(stage);
  const deal: TenantHome["deal"] | null = inDeal
    ? {
        id: "sample",
        property: HOME.property,
        locality: HOME.locality,
        rentPcm: HOME.rentPcm,
        moveIn: iso(day(KEYS_DAY)),
        stageKey: stage,
        stages: STAGES.map(([key, label], i) => ({ key, label, state: i < dealIdx ? "done" : i === dealIdx ? "current" : "upcoming" })),
        now: DEAL_WORDS[stage].now,
        next: DEAL_WORDS[stage].next,
        agent: { name: AGENT.name, email: AGENT.email },
        otherTenants: [],
        flatfair: false,
      }
    : null;

  /* The one next step, in the words every stage now carries (STAGE_UPDATE).
     The sample fills the placeholders from this one property; the live
     portal fills them from the tenant's own. */
  const u = STAGE_UPDATE[stage];
  const next: TenantHome["next"] = {
    title: u.title,
    blurb: fillUpdate(u.blurb, {
      property: HOME.property,
      agent: AGENT.name,
      when: viewing ? `${full(viewingAt)} at 2:30pm` : null,
      amount: offer ? `£${offer.amount}` : null,
    }),
    cta: u.cta,
    href: u.href,
  };

  /* The spine. Before a deal, the road to one (lib/tenant-journey
     findingRoad); with a deal, its eight. */
  const stops: Stop[] = inDeal
    ? deal!.stages.map((s) => ({ id: s.key, label: s.label, sub: s.key === "move_day" ? long(day(KEYS_DAY)) : "", state: s.state }))
    : findingRoad(stage, {
        home: enquiry && stage !== "declined" ? HOME.property : null,
        viewing: viewing ? short(viewingAt) : null,
        offer: offer ? "£1,250 a month" : null,
      });

  const activity = ACTIVITY.filter((a) => atLeast(stage, a.at)).reverse()
    .map(({ day: d, sub, ...a }) => ({ ...a, sub: sub.replace("VIEWING", `${short(viewingAt)}, 2:30pm`), when: long(day(d)) }));
  if (inDeal && stage !== "living") activity.unshift({ at: stage, label: DEAL_WORDS[stage].now, sub: HOME.property, when: "", tone: "live" });

  return {
    first: "Sophie",
    daypart: "Good morning",
    stage,
    enquiry,
    viewing,
    offer,
    market: MARKET,
    agent: AGENT,
    deal,
    passport: { record: null, path: null, done: 6, total: 6, data: SOPHIE_PASSPORT, rules: {} },
    next,
    stops,
    activity: activity.slice(0, 4).map(({ at: _at, ...a }) => a),
  };
}

/** The sample as it was before the harness: Sophie mid-referencing. */
export const SOPHIE: TenantHome = sampleFor("referencing");
