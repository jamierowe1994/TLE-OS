import type { Stop } from "@/lib/landlord-journey";
import type { TenantHome, TenantProperty } from "@/lib/tenant-home-view";
import { EMPTY_PASSPORT, type PassportData } from "@/lib/passport-shape";
import { DEAL, atLeast, phaseOf, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * The sample tenant, for the portal at /tenant/demo: Sophie, at whichever
 * stage the harness has her - from a passport made and nothing else, through
 * an enquiry, a viewing and an offer on a two-bed in Nottingham, to living
 * in it. What James, Susan or a partner agent sees when they open "the
 * tenant portal" from the admin without being a tenant. Invented, and says
 * so on the shell; nothing here is read from anywhere or written anywhere.
 *
 * `sampleFor(stage)` builds the whole home view for a stage. The dates are
 * fixed around 6 to 12 September 2026 so the activity reads as a story.
 */

const SOPHIE_PASSPORT: PassportData = {
  ...EMPTY_PASSPORT,
  legalName: "Sophie Turner",
  knownAs: "Soph",
  dob: "1996-04-14",
  nationality: "British",
  email: "sophie.sample@example.com",
  mobile: "07700 900123",
  hasBritishPassport: true,
  applicantType: "Employed",
  annualIncome: "34,000",
  savings: "5,200",
  numAdults: "1",
  numChildren: "0",
  rentedLast12Months: true,
  rentOnTime: true,
  landlordRef: true,
  currentAddress: "22 Arboretum Street, Nottingham",
  movedIn: "2024-02",
  livedThreeYears: false,
  previousAddress: "5 Castle Boulevard, Nottingham",
  adverseCredit: false,
  guarantor: true,
  pets: false,
  smoker: false,
};

const AGENT = { name: "Emily Watson", email: "sample.agent@example.com", phone: "0115 123 4567", photo: null };

const HOME: TenantProperty = {
  property: "8 Recreation Terrace",
  locality: "Nottingham NG2",
  rentPcm: 850,
  beds: 2,
  photo: "/brand/photo/property.jpg",
  href: "https://thelettingexperts.co.uk",
};

/** What else Emily has on: three homes near Sophie's budget. */
const MARKET: TenantProperty[] = [
  { property: "14 Trent Bridge Court", locality: "West Bridgford NG2", rentPcm: 925, beds: 2, photo: "/brand/living-room.jpg", href: "https://thelettingexperts.co.uk" },
  { property: "Flat 3, 61 Musters Road", locality: "West Bridgford NG2", rentPcm: 795, beds: 1, photo: null, href: "https://thelettingexperts.co.uk" },
  { property: "27 Lady Bay Road", locality: "Lady Bay NG2", rentPcm: 875, beds: 2, photo: null, href: "https://thelettingexperts.co.uk" },
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

const DEAL_WORDS: Record<string, { now: string; next: string }> = {
  deal_started: { now: "Your offer has been accepted and the paperwork is being set up.", next: "We will ask you for a holding fee to take the property off the market." },
  holding_fee: { now: "We are collecting the holding fee.", next: "Once it is in, your referencing starts." },
  referencing: { now: "Your references are being checked: employer, previous landlord and credit.", next: "Reply quickly to anything the referencing team asks for. It is the one thing that speeds this up." },
  plc: { now: "Your references are back. We are checking the property's certificates and the landlord's documents.", next: "Nothing for you here. This is on us and the landlord." },
  deposit: { now: "The compliance checks have passed. Your deposit is being arranged.", next: "You will hear from us, or from Flatfair if you chose the deposit alternative." },
  tenancy_agreement: { now: "Your tenancy agreement is drawn up and ready to sign.", next: "Read it carefully and sign. Both you and the landlord sign before anything else happens." },
  rent_payment: { now: "The agreement is signed. Your first month's rent and the standing order are being set up.", next: "Pay the first month when the request arrives, and set up the standing order for the rest." },
  move_day: { now: "Everything is in place. It is move-in day.", next: "Keys, inventory and check-in. Emily will meet you at the door at 11am." },
  living: { now: "You are in. We look after the property from here.", next: "Rent goes out on the 1st. Anything that needs fixing, report it from Maintenance." },
};

const ACTIVITY: { at: TenantStageKey; label: string; sub: string; when: string; tone: "done" | "live" | "quiet" }[] = [
  { at: "passport", label: "Passport finished", sub: "6 of 6 sections", when: "6 Sep 2026", tone: "done" },
  { at: "passport", label: "Your tenant area opened", sub: "Welcome in", when: "6 Sep 2026", tone: "quiet" },
  { at: "enquired", label: "You enquired about 8 Recreation Terrace", sub: "Emily has it", when: "8 Sep 2026", tone: "done" },
  { at: "viewing", label: "Viewing booked", sub: "Tue 15 Sep, 2:30pm with Emily", when: "9 Sep 2026", tone: "done" },
  { at: "viewed", label: "You viewed 8 Recreation Terrace", sub: "How was it?", when: "15 Sep 2026", tone: "done" },
  { at: "offer", label: "Offer made: £850 a month", sub: "With the landlord", when: "15 Sep 2026", tone: "done" },
  { at: "deal_started", label: "Offer accepted", sub: "8 Recreation Terrace", when: "16 Sep 2026", tone: "done" },
  { at: "holding_fee", label: "Holding fee received", sub: "£196", when: "17 Sep 2026", tone: "done" },
  { at: "referencing", label: "Referencing started", sub: "Employer, landlord and credit", when: "17 Sep 2026", tone: "done" },
  { at: "plc", label: "References passed", sub: "All three back", when: "22 Sep 2026", tone: "done" },
  { at: "deposit", label: "Deposit registered", sub: "£980 with the DPS", when: "24 Sep 2026", tone: "done" },
  { at: "tenancy_agreement", label: "Tenancy agreement sent for signing", sub: "", when: "25 Sep 2026", tone: "done" },
  { at: "rent_payment", label: "Agreement signed by everyone", sub: "", when: "26 Sep 2026", tone: "done" },
  { at: "move_day", label: "First month's rent received", sub: "£850", when: "29 Sep 2026", tone: "done" },
  { at: "living", label: "Keys handed over", sub: "Inventory signed", when: "1 Oct 2026", tone: "done" },
];

export function sampleFor(stage: TenantStageKey): TenantHome {
  const phase = phaseOf(stage);
  const inDeal = phase !== "finding";

  /* Before the deal: the home she is after, once she has asked about it. */
  const enquiry = atLeast(stage, "enquired") ? { ...HOME, enquiredOn: "2026-09-08" } : null;
  const viewing = atLeast(stage, "viewing") ? { when: "2026-09-15T14:30:00", withName: "Emily", status: (atLeast(stage, "viewed") ? "done" : "booked") as "done" | "booked" } : null;
  const offer = atLeast(stage, "offer") ? { amount: 850, madeOn: "2026-09-15", status: (inDeal ? "accepted" : "with_landlord") as "accepted" | "with_landlord" } : null;

  /* The deal, once there is one. Living is every stage done. */
  const dealIdx = stage === "living" ? STAGES.length : DEAL.indexOf(stage);
  const deal: TenantHome["deal"] | null = inDeal
    ? {
        id: "sample",
        property: HOME.property,
        locality: HOME.locality,
        rentPcm: HOME.rentPcm,
        moveIn: "2026-10-01",
        stageKey: stage,
        stages: STAGES.map(([key, label], i) => ({ key, label, state: i < dealIdx ? "done" : i === dealIdx ? "current" : "upcoming" })),
        now: DEAL_WORDS[stage].now,
        next: DEAL_WORDS[stage].next,
        agent: { name: AGENT.name, email: AGENT.email },
        otherTenants: [],
        flatfair: false,
      }
    : null;

  /* The one next step. */
  const next: TenantHome["next"] = (() => {
    switch (stage) {
      case "passport":
        return { title: "Find your next home", blurb: "Your passport is ready, so applying is one tap when you find the one. Have a look at what Emily has on now.", cta: "See what's on the market", href: "#market" };
      case "enquired":
        return { title: "Book a viewing", blurb: "Emily has your enquiry about 8 Recreation Terrace. Pick a time that suits you and she will meet you there.", cta: "Choose a time", href: "/tenant/next" };
      case "viewing":
        return { title: "Your viewing is booked", blurb: "Tuesday 15 September at 2:30pm, with Emily. Bring some ID and any questions - she will have the answers on the property and the landlord.", cta: "Add to my calendar", href: "/tenant/next" };
      case "viewed":
        return { title: "How was it?", blurb: "Tell us what you thought of 8 Recreation Terrace. If it is the one, you can make your offer from here and your passport does the rest.", cta: "Make an offer", href: "/tenant/next" };
      case "offer":
        return { title: "Your offer is with the landlord", blurb: "£850 a month on 8 Recreation Terrace, sent on 15 September. We usually hear back within a day, and you will know the moment we do.", cta: "See my offer", href: "/tenant/next" };
      case "living":
        return { title: "Nothing needed from you", blurb: "Your rent is set up and your certificates are in date. If anything needs fixing, report it and we will take care of it.", cta: "Report a maintenance issue", href: "/tenant/maintenance" };
      default: {
        const label = STAGES.find(([k]) => k === stage)?.[1] ?? "Your tenancy";
        return { title: label, blurb: DEAL_WORDS[stage].next, cta: stage === "tenancy_agreement" ? "Read and sign" : "See your tenancy", href: "/tenant/tenancy" };
      }
    }
  })();

  /* The spine. Before a deal, the road to one; with a deal, its eight. */
  const road: [TenantStageKey, string, string][] = [
    ["passport", "Passport", "Complete"],
    ["enquired", "Enquire", enquiry ? "8 Recreation Terrace" : "Find the one"],
    ["viewing", "View it", viewing ? "Tue 15 Sep" : ""],
    ["offer", "Offer", offer ? "£850 a month" : ""],
    ["deal_started", "Move in", ""],
  ];
  const roadIdx = ["passport", "enquired", "viewing", "offer"].indexOf(stage === "viewed" ? "viewing" : stage);
  /* "Passport" is done from the start; each later stop is current until the
     one after it has happened. Viewed sits on the viewing stop, done. */
  const stops: Stop[] = inDeal
    ? deal!.stages.map((s) => ({ id: s.key, label: s.label, sub: s.key === "move_day" ? "1 Oct 2026" : "", state: s.state }))
    : road.map(([id, label, sub], i) => ({
        id,
        label,
        sub,
        state: i === 0 ? "done" : i < roadIdx + 1 ? "done" : i === roadIdx + 1 ? "current" : "upcoming",
      }));
  if (!inDeal && stage === "viewed") {
    const v = stops.find((s) => s.id === "viewing");
    if (v) v.state = "done";
    const o = stops.find((s) => s.id === "offer");
    if (o) o.state = "current";
  }

  const activity = ACTIVITY.filter((a) => atLeast(stage, a.at)).reverse();
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
    passport: { record: null, path: null, done: 6, total: 6, data: SOPHIE_PASSPORT },
    next,
    stops,
    activity: activity.slice(0, 4).map(({ at: _at, ...a }) => a),
  };
}

/** The sample as it was before the harness: Sophie mid-referencing. */
export const SOPHIE: TenantHome = sampleFor("referencing");
