/**
 * NOTICE DATES (Tools > Notice Dates, 10 Nov 2026).
 *
 * The earliest date a notice can take effect, worked out from the tenancy and
 * the day the notice arrives. Three questions: a rent increase, a landlord's
 * notice, a tenant's notice. England and Scotland; Wales runs on occupation
 * contracts and is left to compliance.
 *
 * This is date arithmetic on rules that are written down here as DATA, so
 * compliance can read them and correct one line. It is a guide for the agent:
 * every notice still goes past compliance before it is served, and the screen
 * says so. Nothing here reads or writes a record.
 *
 * Client-safe: no imports, no clock other than the date it is handed.
 */

export type Nation = "england" | "scotland" | "wales";
export type NoticeKind = "rent" | "landlord" | "tenant";
export type Period = { months?: number; weeks?: number; days?: number };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v);

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Calendar months, clamped to the month's last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(iso: string, n: number): string {
  const d = utc(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d);
}

export function addPeriod(iso: string, p: Period): string {
  let out = iso;
  if (p.months) out = addMonths(out, p.months);
  if (p.weeks) out = addDays(out, p.weeks * 7);
  if (p.days) out = addDays(out, p.days);
  return out;
}

export function periodLabel(p: Period): string {
  if (p.months) return `${p.months} month${p.months === 1 ? "" : "s"}`;
  if (p.weeks) return `${p.weeks} week${p.weeks === 1 ? "" : "s"}`;
  if (p.days) return `${p.days} days`;
  return "No wait";
}

/** The first date on or after `iso` that falls on the rent day (clamped to short months). */
export function nextRentDay(iso: string, rentDay: number): string {
  const d = utc(iso);
  for (let i = 0; i < 3; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + i;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const hit = toIso(new Date(Date.UTC(y, m, Math.min(rentDay, last))));
    if (hit >= iso) return hit;
  }
  return iso;
}

export const longDate = (iso: string) =>
  utc(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const shortDate = (iso: string) =>
  utc(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

/* ── The rules, as data ──────────────────────────────────────────────────────
   Compliance: these are the lines to check. Change a figure here and every
   answer on the screen follows it. */

/* Checked against gov.uk, legislation.gov.uk and mygov.scot on 10 Nov 2026.
   Rent increases: the Act says 52 weeks, the guidance and the compliance
   checklist say a year. A year is used: on a monthly rent day the two land on
   the same date, and off one a year is the later (safer) of the two. */
export const ENGLAND = {
  rent: { notice: { months: 2 } as Period, firstIncreaseAfter: { months: 12 } as Period, sinceLast: { months: 12 } as Period },
  tenant: { notice: { months: 2 } as Period },
  /** A landlord's notice runs out if court papers are not filed within this long of serving it. */
  lapse: { months: 12 } as Period,
  /** Grounds marked firstYear cannot take effect until the tenancy is this old. */
  protectedFor: { months: 12 } as Period,
};

export const SCOTLAND = {
  rent: { notice: { months: 3 } as Period, sinceLast: { months: 12 } as Period },
  leave: { short: 28, long: 84, longAfterMonths: 6 },
  tenant: { days: 28 },
  /** Sent by post or email: treated as arriving this many days later. */
  deliveryDays: 2,
};

export type Ground = {
  id: string;
  name: string;
  wait: Period;
  must: boolean; // true = the court must grant it once proven
  firstYear?: boolean;
  /** The date in the notice has to fall inside this part of the year: [month, day] to [month, day]. */
  window?: { from: [number, number]; to: [number, number]; says: string };
  note?: string;
};

/** England, Section 8 (Form 3A): the grounds an agent meets day to day. */
export const ENGLAND_GROUNDS: Ground[] = [
  { id: "1", name: "Landlord or close family moving in", wait: { months: 4 }, must: true, firstYear: true },
  { id: "1A", name: "Landlord selling the home", wait: { months: 4 }, must: true, firstYear: true },
  { id: "2", name: "Mortgage lender taking the home back", wait: { months: 4 }, must: true },
  { id: "4A", name: "Student house needed for the next academic year", wait: { months: 4 }, must: true, window: { from: [6, 1], to: [9, 30], says: "The date in a ground 4A notice has to fall between 1 June and 30 September." } },
  { id: "6", name: "Redevelopment or major works", wait: { months: 4 }, must: true },
  { id: "7", name: "Tenant has died and the tenancy was inherited", wait: { months: 2 }, must: true },
  { id: "7A", name: "Serious anti-social or criminal behaviour", wait: {}, must: true },
  { id: "7B", name: "No right to rent", wait: { weeks: 2 }, must: true },
  { id: "8", name: "Serious rent arrears", wait: { weeks: 4 }, must: true, note: "At least 3 months' rent owed (13 weeks where rent is weekly or fortnightly), both when the notice is served and at the hearing." },
  { id: "10", name: "Some rent owed", wait: { weeks: 4 }, must: false },
  { id: "11", name: "Rent keeps being paid late", wait: { weeks: 4 }, must: false },
  { id: "12", name: "Tenancy agreement broken", wait: { weeks: 2 }, must: false },
  { id: "13", name: "Home damaged or neglected", wait: { weeks: 2 }, must: false },
  { id: "14", name: "Anti-social behaviour", wait: {}, must: false },
  { id: "15", name: "Furniture damaged", wait: { weeks: 2 }, must: false },
  { id: "17", name: "Tenancy won with a false statement", wait: { weeks: 2 }, must: false },
];

export type ScotGround = { id: string; name: string; conduct: boolean };

/** Scotland, notice to leave. Conduct grounds are 28 days however long the tenant has been there. */
export const SCOTLAND_GROUNDS: ScotGround[] = [
  { id: "1", name: "Landlord selling the home", conduct: false },
  { id: "2", name: "Mortgage lender selling the home", conduct: false },
  { id: "3", name: "Major refurbishment", conduct: false },
  { id: "4", name: "Landlord moving in", conduct: false },
  { id: "5", name: "Landlord's family moving in", conduct: false },
  { id: "6", name: "Home to be used for something else", conduct: false },
  { id: "10", name: "Tenant no longer living there", conduct: true },
  { id: "11", name: "Tenancy agreement broken", conduct: true },
  { id: "12", name: "Rent arrears over three months in a row", conduct: true },
  { id: "13", name: "Criminal conviction", conduct: true },
  { id: "14", name: "Anti-social behaviour", conduct: true },
  { id: "15", name: "Living with someone convicted or anti-social", conduct: true },
  { id: "16", name: "Landlord registration refused or revoked", conduct: false },
  { id: "17", name: "HMO licence revoked", conduct: false },
  { id: "18", name: "Overcrowding notice served", conduct: false },
];

/* ── The sums ──────────────────────────────────────────────────────────────── */

export type Step = { label: string; date: string; why: string; decides?: boolean };
export type Answer =
  | { ok: true; title: string; date: string; steps: Step[]; notes: string[]; lapses?: { date: string; says: string } }
  | { ok: false; says: string };

const WALES: Answer = { ok: false, says: "Wales runs on occupation contracts with their own notice rules. Ask compliance for the date." };
const latest = (steps: Step[]) => steps.reduce((a, b) => (b.date > a.date ? b : a));
const settle = (steps: Step[]) => { const top = latest(steps); top.decides = true; return top.date; };
const validDay = (n?: number | null): n is number => typeof n === "number" && n >= 1 && n <= 31;

export type Delivery = "hand" | "post";
/** Scotland: a notice posted or emailed is treated as arriving two days later. */
const arrives = (sent: string, delivery: Delivery) => (delivery === "post" ? addDays(sent, SCOTLAND.deliveryDays) : sent);

export function rentIncrease(i: { nation: Nation; served: string; start: string; last?: string | null; rentDay?: number | null; delivery?: Delivery }): Answer {
  if (i.nation === "wales") return WALES;
  if (!isIso(i.served) || !isIso(i.start)) return { ok: false, says: "Add the date the notice goes out and the date the tenancy started." };
  const steps: Step[] = [];
  const notes: string[] = [];
  if (i.nation === "scotland") {
    const got = arrives(i.served, i.delivery ?? "post");
    if (got !== i.served) steps.push({ label: "Notice arrives", date: got, why: "Posted or emailed, so two days are allowed for delivery." });
    steps.push({ label: "Three months' notice", date: addPeriod(got, SCOTLAND.rent.notice), why: "The tenant gets at least three months from the day it arrives." });
    if (isIso(i.last)) steps.push({ label: "12 months since the last increase", date: addPeriod(i.last, SCOTLAND.rent.sinceLast), why: "Rent can go up once in any 12 months." });
    return { ok: true, title: "Earliest Date the New Rent Can Start", date: settle(steps), steps, notes: [] };
  }
  steps.push({ label: "Two months' notice", date: addPeriod(i.served, ENGLAND.rent.notice), why: "The tenant gets at least two months from the day the notice arrives." });
  steps.push({ label: "First year of the tenancy", date: addPeriod(i.start, ENGLAND.rent.firstIncreaseAfter), why: "The rent cannot go up in the first 12 months." });
  if (isIso(i.last)) steps.push({ label: "12 months since the last increase", date: addPeriod(i.last, ENGLAND.rent.sinceLast), why: "One increase a year, counted from the day the last one took effect." });
  let date = latest(steps).date;
  if (validDay(i.rentDay)) {
    const rolled = nextRentDay(date, i.rentDay);
    if (rolled !== date) steps.push({ label: "Start of the next rent period", date: rolled, why: "The new rent has to start on a rent day." });
    date = rolled;
  } else notes.push("The new rent has to start on the first day of a rent period. Add the rent day for the exact date.");
  settle(steps);
  notes.push("Served on Form 4A.");
  return { ok: true, title: "Earliest Date the New Rent Can Start", date, steps, notes };
}

/** The first date on or after `iso` inside a ground's part of the year. */
function intoWindow(iso: string, w: NonNullable<Ground["window"]>): string {
  const y = Number(iso.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${y}-${pad(w.from[0])}-${pad(w.from[1])}`;
  const to = `${y}-${pad(w.to[0])}-${pad(w.to[1])}`;
  if (iso < from) return from;
  if (iso <= to) return iso;
  return `${y + 1}-${pad(w.from[0])}-${pad(w.from[1])}`;
}

export function landlordNotice(i: { nation: Nation; served: string; start: string; grounds: string[]; delivery?: Delivery }): Answer {
  if (i.nation === "wales") return WALES;
  if (!isIso(i.served) || !isIso(i.start)) return { ok: false, says: "Add the date the notice goes out and the date the tenancy started." };
  if (!i.grounds.length) return { ok: false, says: "Pick the reason for the notice." };
  const steps: Step[] = [];
  const notes: string[] = [];

  if (i.nation === "scotland") {
    const picked = SCOTLAND_GROUNDS.filter((g) => i.grounds.includes(g.id));
    if (!picked.length) return { ok: false, says: "Pick the reason for the notice." };
    const got = arrives(i.served, i.delivery ?? "post");
    if (got !== i.served) steps.push({ label: "Notice arrives", date: got, why: "Posted or emailed, so two days are allowed for delivery." });
    const settled = got > addMonths(i.start, SCOTLAND.leave.longAfterMonths);
    const conductOnly = picked.every((g) => g.conduct);
    const days = !settled || conductOnly ? SCOTLAND.leave.short : SCOTLAND.leave.long;
    const why = conductOnly
      ? "Conduct grounds only, so 28 days however long the tenant has lived there."
      : settled ? "The tenant has lived there more than six months, so 84 days." : "The tenant has lived there six months or less, so 28 days.";
    const ends = addDays(got, days);
    steps.push({ label: `${days} days' notice ends`, date: ends, why });
    steps.push({ label: "The day after", date: addDays(ends, 1), why: "The date written on the notice is the day after the notice period ends." });
    return { ok: true, title: "Earliest Date to Apply to the Tribunal", date: settle(steps), steps, notes: ["The tenant does not have to leave on this date. If they stay, the landlord applies to the tribunal."] };
  }

  const picked = ENGLAND_GROUNDS.filter((g) => i.grounds.includes(g.id));
  if (!picked.length) return { ok: false, says: "Pick the reason for the notice." };
  const longest = picked.reduce((a, b) => (addPeriod(i.served, b.wait) > addPeriod(i.served, a.wait) ? b : a));
  const wait = periodLabel(longest.wait);
  steps.push({
    label: wait === "No wait" ? "No notice period" : `${wait}' notice`,
    date: addPeriod(i.served, longest.wait),
    why: picked.length > 1 ? `Ground ${longest.id} has the longest notice of the ones picked, and the longest applies.` : `Ground ${longest.id} needs ${wait === "No wait" ? "no wait: court papers can go in straight away" : `${wait} from the day the notice arrives`}.`,
  });
  if (picked.some((g) => g.firstYear)) steps.push({ label: "First year of the tenancy", date: addPeriod(i.start, ENGLAND.protectedFor), why: "Grounds 1 and 1A can be served in the first 12 months, but the date in the notice has to fall after them." });
  let date = latest(steps).date;
  for (const g of picked) if (g.window) {
    const moved = intoWindow(date, g.window);
    if (moved !== date) { steps.push({ label: "Next open date", date: moved, why: g.window.says }); date = moved; }
    else notes.push(g.window.says);
  }
  settle(steps);
  for (const g of picked) if (g.note) notes.push(`Ground ${g.id}: ${g.note}`);
  notes.push("Served on Form 3A. The tenant does not have to leave on this date. If they stay, the landlord applies to the court.");
  const lapse = addPeriod(i.served, ENGLAND.lapse);
  return { ok: true, title: "Earliest Date Court Papers Can Go In", date, steps, notes, lapses: { date: lapse, says: "Court papers have to be filed by this date or the notice runs out." } };
}

export function tenantNotice(i: { nation: Nation; served: string; rentDay?: number | null; delivery?: Delivery }): Answer {
  if (i.nation === "wales") return WALES;
  if (!isIso(i.served)) return { ok: false, says: "Add the date the tenant gave notice." };
  const steps: Step[] = [];
  const notes = ["The landlord can agree a shorter notice in writing."];
  if (i.nation === "scotland") {
    const got = arrives(i.served, i.delivery ?? "post");
    if (got !== i.served) steps.push({ label: "Notice arrives", date: got, why: "Posted or emailed, so two days are allowed for delivery." });
    steps.push({ label: "28 days' notice", date: addDays(got, SCOTLAND.tenant.days), why: "The tenant gives at least 28 days from the day the landlord gets the notice." });
    return { ok: true, title: "Earliest Date the Tenancy Can End", date: settle(steps), steps, notes };
  }
  const min = addPeriod(i.served, ENGLAND.tenant.notice);
  steps.push({ label: "Two months' notice", date: min, why: "The tenant gives at least two months from the day the landlord gets the notice." });
  let date = min;
  if (validDay(i.rentDay)) {
    const onDay = nextRentDay(min, i.rentDay);
    const dayBefore = addDays(nextRentDay(addDays(min, 1), i.rentDay), -1);
    const end = dayBefore < onDay ? dayBefore : onDay;
    if (end !== min) steps.push({ label: "End of the rent period", date: end, why: "The tenancy has to end on a rent day or the day before one." });
    date = end;
  } else notes.unshift("The tenancy has to end on a rent day or the day before one. Add the rent day for the exact date.");
  settle(steps);
  return { ok: true, title: "Earliest Date the Tenancy Can End", date, steps, notes };
}
