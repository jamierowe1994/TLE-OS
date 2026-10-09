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
  /* A photo for the card, if they want one. Optional and decorative: it gives
     no Right to Rent cover (only a share code, a certified IDSP or an agent
     seeing the original does), so nothing reads it but the card. Held as a
     small JPEG data URL, resized in the browser before it is sent. */
  photo: string;
  /** Where the photo sits in its circle, "x y" in percent. They drag it. */
  photoFocus: string;

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
  /* ── The work questions referencing turns on (Rhiannon, 1 Oct 2026) ──
     Only asked when they apply. Employed: still on probation (may need a
     guarantor), a zero-hours contract (referencing declines it), full or
     part-time. Self-employed or a director: how long trading (under a year
     may need a guarantor). They travel to the offer and the landlord sees
     them, so nobody finds out at referencing. */
  onProbation: boolean | null;
  zeroHours: boolean | null;
  workHours: string;
  tradingFor: string;

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
  /** "YYYY-MM". Referencing looks back three years, so the move-in month
   *  decides whether a previous address is asked for; livedThreeYears is set
   *  from it and kept for the card and the file. */
  movedIn: string;
  /* Asked so the previous address is only asked of people who have one that
     matters: three years is what referencing looks back over. */
  livedThreeYears: boolean | null;
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
  legalName: "", knownAs: "", dob: "", nationality: "", email: "", mobile: "", photo: "", photoFocus: "",
  hasBritishPassport: null, shareCode: "",
  applicantType: "", annualIncome: "", savings: "",
  onProbation: null, zeroHours: null, workHours: "", tradingFor: "",
  numAdults: "", numChildren: "", coOccupantIncomes: "",
  rentedLast12Months: null, rentOnTime: null, landlordRef: null,
  currentAddress: "", movedIn: "", livedThreeYears: null, previousAddress: "",
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

/**
 * The people on the passport, by name where it has one: them, the other
 * adults from the household page, and the children, who are counted rather
 * than named. The offer ticks these, all on by default.
 */
export function householdPeople(d: Pick<PassportData, "legalName" | "numAdults" | "numChildren" | "coOccupantIncomes">): { id: string; name: string; who: string }[] {
  const adults = Math.max(1, parseInt(d.numAdults, 10) || 1);
  const children = Math.max(0, parseInt(d.numChildren, 10) || 0);
  const lines = d.coOccupantIncomes.split("\n").map((l) => l.split(" - ")[0].trim());
  const out = [{ id: "you", name: d.legalName.trim() || "The applicant", who: "Lead tenant" }];
  for (let k = 0; k < adults - 1; k++) out.push({ id: `adult-${k + 2}`, name: lines[k] || `Adult ${k + 2}`, who: "Adult" });
  for (let k = 0; k < children; k++) out.push({ id: `child-${k + 1}`, name: children === 1 ? "Child" : `Child ${k + 1}`, who: "Child" });
  return out;
}

export const WORK_HOURS = ["Full-time", "Part-time"] as const;
export const TRADING_FOR = ["Under a year", "1 to 2 years", "Over 2 years"] as const;

/** Who gets the employed questions, and who gets asked how long they've traded. */
export const isEmployed = (d: Pick<PassportData, "applicantType">) => d.applicantType === "Employed";
export const isTrading = (d: Pick<PassportData, "applicantType">) => d.applicantType === "Self-employed" || d.applicantType === "Company director";

/**
 * Their work in one line, the way a landlord reads it: "Employed, full-time,
 * past probation" or "Self-employed, trading over 2 years".
 */
export function workLine(d: Pick<PassportData, "applicantType" | "onProbation" | "zeroHours" | "workHours" | "tradingFor">): string {
  if (!d.applicantType) return "Not said";
  const bits: string[] = [d.applicantType];
  if (isEmployed(d)) {
    if (d.workHours) bits.push(d.workHours.toLowerCase());
    if (d.zeroHours === true) bits.push("zero-hours contract");
    if (d.onProbation === true) bits.push("on probation");
    if (d.onProbation === false) bits.push("past probation");
  }
  if (isTrading(d) && d.tradingFor) bits.push(`trading ${d.tradingFor.toLowerCase()}`);
  return bits.join(", ");
}

/**
 * What referencing will make of their work, said before it is found out
 * there. Warnings, never a refusal: the agent and the landlord decide.
 */
export function workFlags(d: Pick<PassportData, "applicantType" | "onProbation" | "zeroHours" | "tradingFor">): string[] {
  const out: string[] = [];
  if (isEmployed(d) && d.zeroHours === true) out.push("Zero-hours contract: referencing declines these, so a guarantor will be needed.");
  if (isEmployed(d) && d.onProbation === true) out.push("Still on probation: may need a guarantor.");
  if (isTrading(d) && d.tradingFor === "Under a year") out.push("Trading under a year: may need a guarantor.");
  return out;
}

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
    /* Mobile too (James, 9 Oct 2026): "we're going to need to be able to contact these people". */
    done: (d) => Boolean(d.legalName.trim() && d.dob && d.nationality.trim() && d.email.trim() && d.mobile.trim()),
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
    title: "Current rental",
    blurb: "Where you are now, and whether the rent has been paid on time.",
    stamp: "HISTORY",
    done: (d) => Boolean(d.currentAddress.trim()) && d.rentedLast12Months !== null && d.livedThreeYears !== null,
  },
  {
    key: "declarations",
    title: "A few last things",
    blurb: "Better said now than found later. None of these is automatically a no.",
    stamp: "DECLARED",
    /* Smoker too (9 Oct 2026): it was asked but never required, so three
       passports finished without it. */
    done: (d) => d.adverseCredit !== null && d.guarantor !== null && d.pets !== null && d.smoker !== null,
  },
];

/**
 * Only known fields, of the right kind (moved here from PUT /api/tenant/passport
 * on 9 Oct 2026 so the account step can save with the same rule). Anything
 * else in a payload is dropped rather than stored in the JSONB.
 */
export function cleanPassportData(raw: Partial<Record<keyof PassportData, unknown>>): PassportData {
  const clean = { ...EMPTY_PASSPORT };
  for (const key of Object.keys(EMPTY_PASSPORT) as (keyof PassportData)[]) {
    const v = raw[key];
    if (typeof v === "string" || typeof v === "boolean" || v === null) {
      (clean as Record<string, unknown>)[key] = v;
    }
  }
  return clean;
}

/** What the tenant is told when the server is missing answers they gave. */
export const INCOMPLETE = "Some of your answers haven't reached us yet - your signal may have dropped. Go back, check each page is filled in, and press again.";

/** Every section answered: the server's test before a passport is marked finished. */
export function passportComplete(d: PassportData): boolean {
  return SECTIONS.every((s) => s.done(d));
}

export function completeness(d: PassportData): { done: number; total: number; pct: number } {
  const done = SECTIONS.filter((s) => s.done(d)).length;
  return { done, total: SECTIONS.length, pct: Math.round((done / SECTIONS.length) * 100) };
}

/**
 * The bar at the top, measured in ANSWERS rather than sections.
 *
 * James wanted it to start part-filled so somebody arrives already underway
 * rather than at zero. Counting answers does that honestly, without inventing
 * credit: the invitation seeds their name and email, so the bar genuinely
 * begins around a fifth of the way along because a fifth of page one is
 * genuinely already filled in.
 *
 * That distinction matters. A bar with a hardcoded floor is a bar that lies at
 * exactly the moment somebody is deciding whether this is worth their time, and
 * it stops moving for their first few answers - which reads as broken.
 *
 * Conditionals are excluded: a share code is only asked of people who need one,
 * and a credit note only of people who said yes. Counting them would mean a
 * British passport holder with clean credit could never reach 100%.
 */
export function answered(d: PassportData): { done: number; total: number; pct: number } {
  const optional = new Set<keyof PassportData>([
    "knownAs", "photo", "photoFocus", "movedIn", "shareCode", "savings", "coOccupantIncomes", "previousAddress",
    "adverseCreditNote", "petsNote", "rentOnTime", "landlordRef", "numChildren",
    /* Only asked of some people, by what they do. */
    "onProbation", "zeroHours", "workHours", "tradingFor",
  ]);
  const keys = (Object.keys(EMPTY_PASSPORT) as (keyof PassportData)[]).filter((k) => !optional.has(k));
  const filled = keys.filter((k) => {
    const v = d[k];
    return typeof v === "boolean" ? true : typeof v === "string" && v.trim() !== "";
  }).length;
  return { done: filled, total: keys.length, pct: Math.round((filled / keys.length) * 100) };
}
