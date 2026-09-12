import type { TenantHome } from "@/lib/tenant-home-view";
import { EMPTY_PASSPORT, type PassportData } from "@/lib/passport-shape";

/**
 * The sample tenant, for the portal at /tenant/demo: Sophie, mid-way through
 * referencing on a two-bed in Nottingham, with a finished passport. What
 * James, Susan or a partner agent sees when they open "the tenant portal"
 * from the admin without being a tenant. Invented, and says so on the
 * shell; nothing here is read from anywhere or written anywhere.
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
const CURRENT = 2;

export const SOPHIE: TenantHome = {
  first: "Sophie",
  daypart: "Good morning",
  agent: { name: "Emily Watson", email: "sample.agent@example.com", phone: "0115 123 4567", photo: null },
  deal: {
    id: "sample",
    property: "8 Recreation Terrace",
    locality: "Nottingham NG2",
    rentPcm: 850,
    moveIn: "2026-10-01",
    stageKey: "referencing",
    stages: STAGES.map(([key, label], i) => ({ key, label, state: i < CURRENT ? "done" : i === CURRENT ? "current" : "upcoming" })),
    now: "Your references are being checked: employer, previous landlord and credit.",
    next: "Reply quickly to anything the referencing team asks for. It is the one thing that speeds this up.",
    agent: { name: "Emily Watson", email: "sample.agent@example.com" },
    otherTenants: [],
    flatfair: false,
  },
  passport: { record: null, path: null, done: 6, total: 6, data: SOPHIE_PASSPORT },
  next: { title: "Referencing", blurb: "Reply quickly to anything the referencing team asks for. It is the one thing that speeds this up.", cta: "See your tenancy", href: "/tenant/tenancy" },
  stops: STAGES.map(([key, label], i) => ({ id: key, label, sub: key === "move_day" ? "1 Oct 2026" : "", state: i < CURRENT ? "done" : i === CURRENT ? "current" : "upcoming" })),
  activity: [
    { label: "Your references are being checked: employer, previous landlord and credit.", sub: "8 Recreation Terrace", when: "", tone: "live" },
    { label: "Holding fee received", sub: "£196", when: "9 Sep 2026", tone: "done" },
    { label: "Offer accepted", sub: "8 Recreation Terrace", when: "8 Sep 2026", tone: "done" },
    { label: "Passport finished", sub: "6 of 6 sections", when: "6 Sep 2026", tone: "done" },
  ],
};
