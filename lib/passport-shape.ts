/**
 * The passport's SHAPE - types, sections and what counts as finished.
 *
 * Split out of lib/passport.ts because that file is `server-only` and the
 * passport drawing is a client component. The rule that matters: the screen and
 * the store must agree on what "done" means, so `done()` lives here once and
 * both read it. A progress bar that disagrees with the stamps on the passport
 * is worse than having neither.
 *
 * ── Where these questions come from ───────────────────────────────────────
 *
 * Not invented. They are the questions TLE already asks, read off Howard's
 * "TLE Rental Passport" Power Automate flow (created 18 Aug 2026), which posts
 * to REX Contacts/create and then writes the answers as a note titled "Tenant
 * Affordability Assessment".
 *
 * A first draft of this file asked employment-shaped questions - job title,
 * employer, probation, zero hours. That was wrong. TLE's actual assessment is
 * AFFORDABILITY-shaped: what the household earns between them, what they have
 * saved, and whether they have paid rent on time before. Those decide an
 * application; a job title does not.
 *
 * ── The seam: what belongs to a PERSON and what to an APPLICATION ─────────
 *
 * Howard's flow is per-property. It takes a property address, a monthly rent
 * and viewing availability, and freezes a pass/refer status against them.
 *
 * A passport cannot work that way, because affordability is a comparison and
 * one of its two sides is the property: £1,400 a month is affordable at one
 * house and not at the next. So everything reusable about the PERSON lives
 * here, and rent, property and availability stay on the application. The status
 * is then calculated when they apply, from passport plus property, rather than
 * being true on the day they signed up and quietly wrong afterwards.
 */

export interface PassportData {
  /* ── Page one: who they are ── */
  legalName: string;
  knownAs: string;
  dob: string;
  nationality: string;
  email: string;
  mobile: string;

  /* ── Right to rent ──
     Asked the way the law works rather than the way a database would like it:
     a British passport settles it outright, and everybody else has a share
     code. "Do you have the right to rent?" asked cold gets a yes from people
     who have not checked. */
  hasBritishPassport: boolean | null;
  shareCode: string;

  /* ── What they earn ──
     Annual and before tax, matching the flow and the apply form. `savings` is
     asked because it is what rescues a borderline application, and a tenant
     who is not asked will not think to mention it. */
  applicantType: string;
  annualIncome: string;
  savings: string;

  /* ── Who is moving in ──
     Other adults' incomes count towards the household total, which is what the
     affordability test actually uses. Held as text lines rather than a number
     array so somebody can write "brother, 24000" and it still means something
     to whoever reads it. */
  numAdults: string;
  numChildren: string;
  coOccupantIncomes: string;

  /* ── Rental history ── */
  rentedLast12Months: boolean | null;
  rentOnTime: boolean | null;
  landlordRef: boolean | null;
  currentAddress: string;
  previousAddress: string;

  /* ── The awkward ones, asked once ── */
  adverseCredit: boolean | null;
  adverseCreditNote: string;
  guarantor: boolean | null;
  pets: boolean | null;
  petsNote: string;
  smoker: boolean | null;
}

export const EMPTY_PASSPORT: PassportData = {
  legalName: "", knownAs: "", dob: "", nationality: "", email: "", mobile: "",
  hasBritishPassport: null, shareCode: "",
  applicantType: "", annualIncome: "", savings: "",
  numAdults: "", numChildren: "", coOccupantIncomes: "",
  rentedLast12Months: null, rentOnTime: null, landlordRef: null,
  currentAddress: "", previousAddress: "",
  adverseCredit: null, adverseCreditNote: "", guarantor: null,
  pets: null, petsNote: "", smoker: null,
};

/** How they described themselves. REX collapses Student, Benefits and Pension
 *  into "unemployed", which is why these are kept separate HERE and mapped on
 *  the way out - the tenant should not have to call themselves unemployed. */
export const APPLICANT_TYPES = [
  "Employed",
  "Self-employed",
  "Company director",
  "Student",
  "Retired",
  "On benefits",
  "Not working",
] as const;

/** Money as typed - "32,000", "£32k", "32000" - read as a number, or null. */
export function money(v: string): number | null {
  const raw = v.trim().toLowerCase().replace(/[£,\s]/g, "");
  if (!raw) return null;
  const k = raw.endsWith("k");
  const n = Number(k ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(n)) return null;
  return k ? n * 1000 : n;
}

/**
 * What the household earns between them.
 *
 * The co-occupant lines are free text, so anything that looks like an amount is
 * taken and anything else is ignored. A total that silently drops a
 * housemate's wage is worse than no total, so the count of amounts found is
 * returned too and the screen shows it.
 */
export function householdIncome(d: PassportData): { total: number | null; from: number } {
  const mine = money(d.annualIncome);
  const others = (d.coOccupantIncomes.match(/[\d][\d,.]*\s*k?/gi) ?? [])
    .map((s) => money(s))
    .filter((n): n is number => n !== null && n > 0);
  if (mine === null && others.length === 0) return { total: null, from: 0 };
  return {
    total: (mine ?? 0) + others.reduce((a, b) => a + b, 0),
    from: (mine === null ? 0 : 1) + others.length,
  };
}

/**
 * The sections, and what counts as finished.
 *
 * Nothing here requires an optional answer. A share code is only asked of
 * people who need one, and a credit note only of people who said yes - so
 * neither can hold a section open, or a British passport holder with clean
 * credit would be stuck on questions that do not apply to them.
 */
export const SECTIONS: {
  key: string;
  title: string;
  blurb: string;
  stamp: string;
  done: (d: PassportData) => boolean;
}[] = [
  {
    key: "identity",
    title: "Who you are",
    blurb: "Your legal name as it appears on your ID, so referencing matches first time.",
    stamp: "IDENTITY",
    done: (d) => Boolean(d.legalName.trim() && d.dob && d.nationality.trim() && d.email.trim()),
  },
  {
    key: "right-to-rent",
    title: "Right to rent",
    blurb: "Every landlord in England has to check this by law. It takes one question.",
    stamp: "RIGHT TO RENT",
    done: (d) => d.hasBritishPassport === true || (d.hasBritishPassport === false && Boolean(d.shareCode.trim())),
  },
  {
    key: "income",
    title: "What you earn",
    blurb: "Before tax, and anything you have saved. This is what affordability is worked out from.",
    stamp: "INCOME",
    done: (d) => Boolean(d.applicantType && money(d.annualIncome) !== null),
  },
  {
    key: "household",
    title: "Who's moving in",
    blurb: "Other adults' income counts towards the total, so it is worth putting in.",
    stamp: "HOUSEHOLD",
    done: (d) => Boolean(d.numAdults.trim()),
  },
  {
    key: "history",
    title: "Where you've rented",
    blurb: "Whether you have rented before, and whether the rent was paid on time.",
    stamp: "HISTORY",
    done: (d) => Boolean(d.currentAddress.trim()) && d.rentedLast12Months !== null,
  },
  {
    key: "declarations",
    title: "A few last things",
    blurb: "Better said now than found later. None of these is automatically a no.",
    stamp: "DECLARED",
    done: (d) => d.adverseCredit !== null && d.guarantor !== null && d.pets !== null,
  },
];

export function completeness(d: PassportData): { done: number; total: number; pct: number } {
  const done = SECTIONS.filter((s) => s.done(d)).length;
  return { done, total: SECTIONS.length, pct: Math.round((done / SECTIONS.length) * 100) };
}
