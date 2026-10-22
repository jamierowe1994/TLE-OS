import "server-only";
import { hasDb, q } from "@/lib/db";
import { getApplicationById, type Applicant, type Application } from "@/lib/applications";
import { isTestId, testApplication } from "@/lib/test-overlay";
import { findDonePassportByEmail, findPassportByEmail, getPassport, type PassportRecord } from "@/lib/passport";
import { forScreen, passportRules } from "@/lib/passport-scotland";
import { isEmployed, isTrading, otherAdultCount, otherCredit, otherName, type PassportData } from "@/lib/passport-shape";
import { offerPeople, type OfferPerson } from "@/lib/offer-people";
import { letTenants } from "@/lib/let-tenants";
import { guarantorsFor, type Guarantor } from "@/lib/guarantors";
import type { PlcCase } from "@/lib/plc";

/**
 * TENANT ANSWERS ON THE PLC PACK (21 Oct 2026, "PLC Checks and OS Updates").
 *
 * After the PLC check Kirstie fills in the Propoly deal, and everything the
 * tenants said - pets, smokers, who is moving in, what they asked for before
 * moving day - was in three places she had to dig through. This gathers it
 * onto the pack she is already looking at, laid out the way Propoly's deal
 * groups it, so it goes across field by field.
 *
 * Read only, and from where the OS already holds it, never a new form:
 *   - the application on the let (the listings system's, an offer accepted
 *     in the OS, or a test one),
 *   - the offer or application form the tenant sent in
 *     (os_tenant_viewing_responses, kind "offer"), and each other adult's
 *     own part of it (lib/offer-people),
 *   - each tenant's passport (os_tenant_passports), finished or not,
 *   - tenants added on the let (lib/let-tenants) and guarantors
 *     (lib/guarantors).
 *
 * Where two of them answer the same question the passport wins: an offer
 * saves its changes onto the passport, so the passport is never older.
 *
 * Nothing here writes to Propoly. Its deal API takes rent, term, move-in,
 * deposit and template on POST /deals and name, email and mobile on POST
 * /tenants; pets, occupiers, guarantors and clauses are read-only to us, so
 * these are for copying across by hand.
 */

export type AnswerRow = {
  label: string;
  /** As read on the screen. */
  value: string;
  /** What the copy button puts on the clipboard, when it differs: a bare
   *  figure or a dd/mm/yyyy date pastes into a form field; "£1,250" does not. */
  copy?: string;
};
export type AnswerGroup = { title: string; rows: AnswerRow[] };
export type AnswerPerson = {
  key: string;
  name: string;
  role: "Lead tenant" | "Tenant" | "Guarantor";
  /** Where these answers came from, in a few words each. */
  from: string[];
  groups: AnswerGroup[];
};
export type TenantAnswers = {
  /** The let as a whole: Propoly's terms, permitted occupiers, extra clauses. */
  let: AnswerGroup[];
  people: AnswerPerson[];
  /** Where the let's answers came from. */
  from: string[];
};

/* ── formatting ─────────────────────────────────────────────────────────── */

const yn = (b: boolean | null | undefined) => (b == null ? null : b ? "Yes" : "No");
const pounds = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const ymd = (s: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const longDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const slashDate = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const monthYear = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? new Date(`${s}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : s);
const first = <T>(...vs: (T | null | undefined | "")[]): T | null => {
  for (const v of vs) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
};
const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Only the rows somebody answered. An empty "Not said" is noise when pasting. */
function rows(list: (AnswerRow | null | false)[]): AnswerRow[] {
  return list.filter((r): r is AnswerRow => Boolean(r && r.value.trim()));
}
const row = (label: string, value: string | null | undefined, copy?: string | null): AnswerRow | null =>
  value ? { label, value, ...(copy && copy !== value ? { copy } : {}) } : null;
const dateRow = (label: string, s: string | null | undefined) => {
  const d = ymd(s);
  return d ? row(label, longDate(d), slashDate(d)) : null;
};
const moneyRow = (label: string, v: unknown, suffix = "") => {
  const n = pounds(v);
  return n ? row(label, `${gbp(n)}${suffix}`, String(n)) : null;
};

/** Propoly's tenant form takes a first and a last name. Middle names stay with the first. */
function splitName(full: string): { first: string; last: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first: words[0] ?? "", last: "" };
  return { first: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}

/* ── where it is held ───────────────────────────────────────────────────── */

type FormApplicant = {
  name?: string; email?: string; phone?: string; dob?: string; isPrimary?: boolean;
  employment?: string; job?: string; company?: string; position?: string;
  zeroHours?: boolean; inProbation?: boolean; income?: number;
  rightToRent?: boolean; landlordRef?: boolean; guarantor?: boolean; adverseCredit?: boolean; adverseCreditNote?: string;
};
type OfferPayload = {
  source?: string;
  via?: string;
  amount?: number;
  moveIn?: string;
  movingIn?: string[];
  works?: string[];
  adults?: number;
  children?: number;
  pets?: boolean;
  petsNote?: string;
  note?: string;
  passport?: Partial<PassportData>;
  applicants?: FormApplicant[];
};
type OfferRow = { id: string; email: string | null; name: string | null; listing_id: string | null; payload: OfferPayload | null; created_at: Date | string };

async function offerById(id: string): Promise<OfferRow | null> {
  const r = await q<OfferRow>(
    `SELECT id, email, name, listing_id, payload, created_at FROM os_tenant_viewing_responses WHERE id = $1 AND kind = 'offer'`,
    [id]
  ).catch(() => []);
  return r[0] ?? null;
}

/** The form behind an application from the listings system: the same home, one of its tenants, the accepted one first. */
async function offerFor(app: Application): Promise<OfferRow | null> {
  const emails = app.applicants.map((a) => lower(a.email)).filter(Boolean);
  if (!app.listingId || !emails.length) return null;
  const r = await q<OfferRow>(
    `SELECT r.id, r.email, r.name, r.listing_id, r.payload, r.created_at
       FROM os_tenant_viewing_responses r
       LEFT JOIN os_offer_decisions d ON d.ref = 'os:' || r.id
      WHERE r.kind = 'offer' AND r.listing_id = $1 AND LOWER(r.email) = ANY($2::text[])
      ORDER BY (d.decision = 'accepted') DESC NULLS LAST, r.created_at DESC
      LIMIT 1`,
    [String(app.listingId), emails]
  ).catch(() => []);
  return r[0] ?? null;
}

async function passportOf(email: string | null): Promise<PassportRecord | null> {
  if (!email) return null;
  const hit = (await findDonePassportByEmail(email).catch(() => null)) ?? (await findPassportByEmail(email, null).catch(() => null));
  return hit ? getPassport(hit.token).catch(() => null) : null;
}

/* ── one person ─────────────────────────────────────────────────────────── */

type Person = {
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  dob: string | null;
  /** The listings system's application, for this person. */
  applicant?: Applicant;
  /** What they put on the offer or application form. */
  form?: FormApplicant;
  /** Their own part of the offer (another adult's link). */
  part?: OfferPerson;
  /** The lead's answers as the offer carried them. */
  offerPassport?: Partial<PassportData>;
  addedOnLet?: boolean;
};

function samePerson(a: Pick<Person, "name" | "email">, b: { name?: string | null; email?: string | null }): boolean {
  if (a.email && b.email && lower(a.email) === lower(b.email)) return true;
  return Boolean(a.name && b.name && lower(a.name) === lower(b.name));
}

/** `onLet`: everybody on the let by name, so an adult with their own entry is not answered for twice. */
function personGroups(p: Person, pass: PassportData | null, onLet: Set<string>): AnswerGroup[] {
  const d = pass;
  const f = p.form;
  const pa = p.part?.filled ? p.part.answers : null;
  const k = p.applicant?.keyInfo ?? null;
  const op = p.offerPassport ?? null;
  const name = first<string>(d?.legalName, p.name) ?? "";
  const { first: firstName, last } = splitName(name);

  const type = first<string>(d?.applicantType, pa?.applicantType, f?.employment, op?.applicantType, k?.employment);
  const employed = type ? isEmployed({ applicantType: type }) : false;
  const trading = type ? isTrading({ applicantType: type }) : false;
  const hours = first<string>(d?.workHours, pa?.workHours, op?.workHours);
  const zero = first<boolean>(d?.zeroHours, pa?.zeroHours, f?.zeroHours, op?.zeroHours, k?.zeroHours);
  const probation = first<boolean>(d?.onProbation, pa?.onProbation, f?.inProbation, op?.onProbation, k?.inProbation);
  const british = first<boolean>(d?.hasBritishPassport, pa?.hasBritishPassport, op?.hasBritishPassport);
  const shareCode = first<string>(d?.shareCode, pa?.shareCode, op?.shareCode);
  const rtr = first<boolean>(f?.rightToRent, k?.rightToRent);
  const adverse = first<boolean>(d?.adverseCredit, pa?.adverseCredit, f?.adverseCredit, op?.adverseCredit, k?.adverseCredit);
  const adverseNote = first<string>(d?.adverseCreditNote, pa?.adverseCreditNote, f?.adverseCreditNote, op?.adverseCreditNote, k?.adverseCreditNote);
  const pets = first<boolean>(d?.pets, op?.pets);
  const petsNote = first<string>(d?.petsNote, op?.petsNote);

  /* Every other adult's credit, as the lead's passport answered for them (Rhiannon, 14 Oct 2026). */
  const others = d ? otherAdultCount(d) : 0;
  const othersCredit: AnswerRow[] = d
    ? rows(
        Array.from({ length: others }, (_, i) => {
          const who = otherName(d, i);
          if (who && onLet.has(lower(who))) return null;
          const c = otherCredit(d, i);
          return row(`Adverse credit, ${who || `adult ${i + 2}`}`, c.credit ? `Yes${c.note.trim() ? `: ${c.note.trim()}` : ""}` : yn(c.credit));
        })
      )
    : [];

  return [
    {
      /* Propoly's tenant: title, first and last name, email, mobile, address. */
      title: "Tenant Details",
      rows: rows([
        row("First name", firstName),
        row("Last name", last),
        row("Known as", d?.knownAs),
        row("Email", first<string>(d?.email, p.email, pa?.email, f?.email)),
        row("Mobile", first<string>(d?.mobile, p.phone, pa?.mobile, f?.phone, op?.mobile)),
        dateRow("Date of birth", first<string>(d?.dob, pa?.dob, f?.dob, p.dob)),
        row("Nationality", d?.nationality),
        row("Current address", d?.currentAddress),
        row("Lived there since", d?.movedIn ? monthYear(d.movedIn) : null),
        d?.livedThreeYears === false ? row("Previous address", d.previousAddress) : null,
      ]),
    },
    {
      /* Not a Propoly field: what the referencing asks, kept beside the rest so nobody opens the passport for it. */
      title: "Work and Money",
      rows: rows([
        row("What they do", type),
        employed ? row("Hours", hours) : null,
        employed ? row("Zero-hours contract", yn(zero)) : null,
        employed ? row("On probation", yn(probation)) : null,
        trading ? row("Trading for", first<string>(d?.tradingFor, pa?.tradingFor, op?.tradingFor)) : null,
        row("Job", first<string>(pa?.job, f?.job, k?.job)),
        row("Employer", first<string>(pa?.employer, f?.company, k?.company)),
        moneyRow("Income, a year", first<unknown>(d?.annualIncome, pa?.annualIncome, f?.income, op?.annualIncome, k?.salary, p.applicant?.incomePerYear)),
        moneyRow("Savings", d?.savings),
        row("Other adults' incomes", d?.coOccupantIncomes),
      ]),
    },
    {
      title: "Checks They Answered",
      rows: rows([
        /* Right to rent is England only: never shown on a Scottish let (lib/passport-scotland). */
        british === true ? row("Right to rent", "British or Irish passport") : null,
        british !== true && shareCode ? row("Right to rent share code", shareCode) : null,
        british == null && !shareCode && rtr != null ? row("Right to rent", rtr ? "Yes" : "No") : null,
        row("Rented in the last 12 months", yn(d?.rentedLast12Months)),
        row("Rent paid on time", yn(d?.rentOnTime)),
        row("Landlord reference", yn(first<boolean>(d?.landlordRef, pa?.landlordRef, f?.landlordRef, op?.landlordRef, k?.landlordRef))),
        row("Adverse credit", adverse ? `Yes${adverseNote ? `: ${adverseNote}` : ""}` : yn(adverse)),
        ...othersCredit,
        row("Guarantor available", yn(first<boolean>(d?.guarantor, pa?.guarantor, f?.guarantor, op?.guarantor, k?.guarantor))),
        row("Smoker", yn(first<boolean>(d?.smoker, pa?.smoker, op?.smoker))),
        row("Pets", pets ? petsNote || "Yes" : yn(pets)),
      ]),
    },
  ].filter((g) => g.rows.length);
}

function guarantorPerson(g: Guarantor): AnswerPerson {
  const { first: firstName, last } = splitName(g.name);
  return {
    key: `guarantor:${g.id}`,
    name: g.name,
    role: "Guarantor",
    from: [`the let, added ${shortDay(g.createdAt)}`],
    groups: [
      {
        /* Propoly's guarantor: the same fields as a tenant's, and whose they are. */
        title: "Guarantor Details",
        rows: rows([
          row("Guarantor for", g.applicantName),
          row("First name", firstName),
          row("Last name", last),
          row("Email", g.email),
          row("Mobile", g.phone),
          row("Address", g.address),
          row("Relationship", g.relationship),
        ]),
      },
    ].filter((x) => x.rows.length),
  };
}

/* ── the pack ───────────────────────────────────────────────────────────── */

export async function tenantAnswersFor(c: PlcCase): Promise<TenantAnswers> {
  const ref = c.applicationRef;
  const from: string[] = [];

  /* The application, and the form behind it. */
  let app: Application | null = null;
  let offer: OfferRow | null = null;
  if (isTestId(ref)) {
    app = (await testApplication(ref).catch(() => null))?.app ?? null;
  } else if (ref.startsWith("os:")) {
    /* An offer accepted in the OS: the form IS the application. Read it
       straight, rather than pulling the whole book to find one row. */
    offer = hasDb() ? await offerById(ref.slice(3)) : null;
  } else {
    app = await getApplicationById(ref).catch(() => null);
  }
  if (app && !offer && hasDb()) offer = await offerFor(app);

  const pl: OfferPayload = offer?.payload ?? {};
  const formName = pl.via === "Offer link" ? "the offer link" : pl.via === "Application form" || pl.source === "application-form" ? "the application form" : "the offer";
  if (app) from.push(isTestId(ref) ? "the test application" : "the application");
  if (offer) from.push(`${formName}, ${shortDay(String(offer.created_at instanceof Date ? offer.created_at.toISOString() : offer.created_at))}`);

  /* Everybody on it, once. */
  const people: Person[] = [];
  const add = (p: Person) => {
    const same = people.find((x) => samePerson(x, p));
    if (!same) return people.push(p);
    same.email ??= p.email;
    same.phone ??= p.phone;
    same.dob ??= p.dob;
    same.applicant ??= p.applicant;
    same.form ??= p.form;
    same.part ??= p.part;
    same.offerPassport ??= p.offerPassport;
  };
  for (const a of app?.applicants ?? []) {
    add({ name: a.name, email: a.email, phone: a.phone, isPrimary: a.isPrimary, dob: a.dob, applicant: a });
  }
  if (offer) {
    const formLead = (pl.applicants ?? []).find((a) => a.isPrimary) ?? null;
    add({
      name: offer.name || offer.email || "Lead tenant",
      email: offer.email,
      phone: formLead?.phone ?? null,
      isPrimary: true,
      dob: formLead?.dob ?? null,
      ...(formLead ? { form: formLead } : {}),
      offerPassport: pl.passport ?? undefined,
    });
    for (const a of (pl.applicants ?? []).filter((x) => !x.isPrimary && x.name)) {
      add({ name: a.name!, email: a.email || null, phone: a.phone || null, isPrimary: false, dob: a.dob || null, form: a });
    }
    const parts = (await offerPeople([offer.id]).catch(() => new Map<string, OfferPerson[]>())).get(offer.id) ?? [];
    for (const m of parts) {
      add({ name: m.name, email: m.answers.email || null, phone: m.answers.mobile || null, isPrimary: false, dob: m.answers.dob || null, part: m });
    }
  }
  for (const t of await letTenants(ref).catch(() => [])) {
    add({ name: t.name, email: t.email, phone: t.phone, isPrimary: false, dob: null, addedOnLet: true });
  }
  /* The lead first, as Propoly lists them. */
  people.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const onLet = new Set(people.map((p) => lower(p.name)));
  const shaped: AnswerPerson[] = [];
  const smokers: string[] = [];
  let anyoneSmokeAnswer = false;
  for (const p of people) {
    const rec = await passportOf(p.email);
    const rules = rec ? await passportRules(rec, c.address).catch(() => ({})) : {};
    const d = rec ? forScreen(rec.data, rules) : null;
    const personFrom: string[] = [];
    if (rec) personFrom.push(rec.submittedAt ? `their passport, finished ${shortDay(rec.submittedAt)}` : "their passport, started but not finished");
    if (p.form || p.offerPassport) personFrom.push(formName);
    if (p.part) personFrom.push(p.part.filled ? `their own part of the offer${p.part.filledAt ? `, ${shortDay(p.part.filledAt)}` : ""}` : "their part of the offer, not filled in yet");
    if (p.applicant) personFrom.push(isTestId(ref) ? "the test application" : "the application");
    if (p.addedOnLet) personFrom.push("the let, where they were added");
    const smoke = first<boolean>(d?.smoker, p.part?.filled ? p.part.answers.smoker : null, p.offerPassport?.smoker);
    if (smoke != null) anyoneSmokeAnswer = true;
    if (smoke) smokers.push(p.name);
    shaped.push({
      key: `tenant:${lower(p.email) || lower(p.name)}`,
      name: first<string>(d?.legalName, p.name) ?? p.name,
      role: p.isPrimary ? "Lead tenant" : "Tenant",
      from: personFrom,
      groups: personGroups(p, d, onLet),
    });
  }

  const guarantors = await guarantorsFor({ emails: people.map((p) => p.email), letRef: ref }).catch(() => []);
  for (const g of guarantors) shaped.push(guarantorPerson(g));

  /* ── the let as a whole ── */
  const leadPass = shaped.length ? await passportOf(people[0]?.email ?? null) : null;
  const lp = leadPass?.data ?? null;
  /* The application counts children among its occupants. */
  const appAdults = app?.occupants != null ? app.occupants - (app.dependents ?? 0) : null;
  const adults = first<number>(pl.adults || null, Number(lp?.numAdults) || null, appAdults && appAdults > 0 ? appAdults : null);
  const children = first<number>(typeof pl.children === "number" ? pl.children : null, lp?.numChildren ? Number(lp.numChildren) : null, app?.dependents);
  const pets = first<boolean>(typeof pl.pets === "boolean" ? pl.pets : null, lp?.pets, app?.hasPets);
  const petsNote = first<string>(pl.petsNote, lp?.petsNote);
  /* Children are counted above, as the offer lists them ("Child (6)"). */
  const occupiers = (pl.movingIn ?? []).filter((n) => n && !onLet.has(lower(n)) && !/^child/i.test(n));
  const rent = first<number>(app?.offerAmount, pounds(pl.amount));

  const letGroups: AnswerGroup[] = [
    {
      /* Propoly's deal terms. Rent, move-in and term go across on the push; pets is typed in. */
      title: "Terms",
      rows: rows([
        rent ? row("Rent, a month", gbp(rent), String(rent)) : null,
        dateRow("Move-in date", first<string>(c.moveInDate, pl.moveIn, app?.startDate)),
        app?.agreementMonths ? row("Term", `${app.agreementMonths} months`, String(app.agreementMonths)) : null,
        row("Pets", pets ? petsNote || "Yes" : yn(pets)),
        anyoneSmokeAnswer ? row("Smokers", smokers.length ? `Yes, ${smokers.join(" and ")}` : "No") : null,
      ]),
    },
    {
      /* Propoly's permitted occupiers: who lives there without being a tenant. */
      title: "Permitted Occupiers",
      rows: rows([
        adults ? row("Adults moving in", String(adults)) : null,
        children != null ? row("Children moving in", String(children)) : null,
        occupiers.length ? row("Also moving in, not a tenant", occupiers.join(", ")) : null,
      ]),
    },
    {
      /* Propoly's extra clauses: anything they asked for in their own words. */
      title: "Special Requirements",
      rows: rows([
        ...(pl.works ?? []).filter(Boolean).map((w, i, all) => row(all.length > 1 ? `Before moving day (${i + 1})` : "Before moving day", w)),
        row("In their words", pl.note?.trim()),
        row("On the application", ref.startsWith("os:") ? null : app?.conditions?.trim()),
      ]),
    },
  ].filter((g) => g.rows.length);

  return { let: letGroups, people: shaped, from };
}
