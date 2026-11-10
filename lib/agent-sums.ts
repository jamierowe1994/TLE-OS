/**
 * The sums behind TOOLS > CALCULATORS (10 Nov 2026). Pure arithmetic, safe on
 * the client, nothing read or saved.
 *
 * The tax tables were checked against gov.uk, revenue.scot and gov.wales on
 * 10 Nov 2026 (no change in the Budget of 28 Oct 2026). They are data so the
 * next change is one edit: CHECKED says when they were last read.
 */

export const CHECKED = "10 November 2026";

/* ------------------------------ Yield ---------------------------------- */

export type Yield = { yearlyRent: number; gross: number; net: number | null; left: number | null };

/** Gross = a year's rent over the price. Net takes the yearly costs off first. */
export function rentalYield(price: number, monthlyRent: number, yearlyCosts: number | null): Yield | null {
  if (!(price > 0) || !(monthlyRent > 0)) return null;
  const yearlyRent = monthlyRent * 12;
  const costs = yearlyCosts !== null && yearlyCosts > 0 ? yearlyCosts : null;
  return {
    yearlyRent,
    gross: (yearlyRent / price) * 100,
    net: costs === null ? null : ((yearlyRent - costs) / price) * 100,
    left: costs === null ? null : yearlyRent - costs,
  };
}

/* --------------------------- Affordability ------------------------------ */

/** The referencing rule the PLC check uses: yearly income against yearly rent. */
export const INCOME_TIMES = { tenant: 2.5, guarantor: 3 } as const;

export function incomeNeeded(monthlyRent: number) {
  const yearly = monthlyRent * 12;
  return { yearlyRent: yearly, tenant: yearly * INCOME_TIMES.tenant, guarantor: yearly * INCOME_TIMES.guarantor };
}

/** The most rent a yearly income covers, rounded down to the pound. */
export function rentCovered(yearlyIncome: number) {
  return {
    tenant: Math.floor(yearlyIncome / INCOME_TIMES.tenant / 12),
    guarantor: Math.floor(yearlyIncome / INCOME_TIMES.guarantor / 12),
  };
}

/* ------------------------------ Deposit --------------------------------- */

const pennyDown = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/** Tenant Fees Act 2019 (England): the same sums as the phone's calculator. */
export function depositCaps(monthlyRent: number) {
  const yearly = monthlyRent * 12;
  const weekly = yearly / 52;
  const weeks = yearly >= 50000 ? 6 : 5;
  return { weekly: pennyDown(weekly), holding: pennyDown(weekly), deposit: pennyDown(weekly * weeks), weeks };
}

/* ----------------------------- Stamp duty ------------------------------- */

export type TaxNation = "england" | "scotland" | "wales";
export type Buyer = "moving" | "first" | "additional";
/** `to` is the top of the band (null = no top); `rate` is a percentage. */
export type Band = { to: number | null; rate: number };
export type BandLine = { from: number; to: number | null; rate: number; taxed: number; tax: number };
export type Duty = { name: string; total: number; effective: number; lines: BandLine[]; extra: { says: string; tax: number } | null; notes: string[] };

const SDLT: Band[] = [{ to: 125000, rate: 0 }, { to: 250000, rate: 2 }, { to: 925000, rate: 5 }, { to: 1500000, rate: 10 }, { to: null, rate: 12 }];
const SDLT_FIRST: Band[] = [{ to: 300000, rate: 0 }, { to: 500000, rate: 5 }];
const SDLT_FIRST_LIMIT = 500000;
const SDLT_EXTRA = 5;

const LBTT: Band[] = [{ to: 145000, rate: 0 }, { to: 250000, rate: 2 }, { to: 325000, rate: 5 }, { to: 750000, rate: 10 }, { to: null, rate: 12 }];
const LBTT_FIRST: Band[] = [{ to: 175000, rate: 0 }, { to: 250000, rate: 2 }, { to: 325000, rate: 5 }, { to: 750000, rate: 10 }, { to: null, rate: 12 }];
const LBTT_ADS = 8;

const LTT: Band[] = [{ to: 225000, rate: 0 }, { to: 400000, rate: 6 }, { to: 750000, rate: 7.5 }, { to: 1500000, rate: 10 }, { to: null, rate: 12 }];
const LTT_HIGHER: Band[] = [{ to: 180000, rate: 5 }, { to: 250000, rate: 8.5 }, { to: 400000, rate: 10 }, { to: 750000, rate: 12.5 }, { to: 1500000, rate: 15 }, { to: null, rate: 17 }];

/** Second homes under this price pay no surcharge in any of the three. */
const EXTRA_FROM = 40000;

function slice(price: number, bands: Band[], add = 0): BandLine[] {
  const lines: BandLine[] = [];
  let from = 0;
  for (const b of bands) {
    const top = b.to ?? Infinity;
    const taxed = Math.max(0, Math.min(price, top) - from);
    const rate = b.rate + add;
    lines.push({ from, to: b.to, rate, taxed, tax: Math.floor((taxed * rate) / 100) });
    if (price <= top) break;
    from = top;
  }
  return lines;
}

const sum = (lines: BandLine[]) => lines.reduce((t, l) => t + l.tax, 0);

export function stampDuty(nation: TaxNation, buyer: Buyer, price: number): Duty | null {
  if (!(price > 0)) return null;
  const notes: string[] = [];
  let name: string;
  let lines: BandLine[];
  let extra: Duty["extra"] = null;
  const surcharged = buyer === "additional" && price >= EXTRA_FROM;

  if (nation === "england") {
    name = "Stamp Duty Land Tax";
    if (buyer === "first" && price <= SDLT_FIRST_LIMIT) lines = slice(price, SDLT_FIRST);
    else {
      lines = slice(price, SDLT, surcharged ? SDLT_EXTRA : 0);
      if (buyer === "first") notes.push("First-time buyer relief stops above £500,000, so the standard rates apply.");
    }
    if (surcharged) notes.push("Additional homes pay 5% on top of every band.");
    notes.push("England and Northern Ireland. Buyers who are not UK resident pay a further 2%.");
  } else if (nation === "scotland") {
    name = "Land and Buildings Transaction Tax";
    lines = slice(price, buyer === "first" ? LBTT_FIRST : LBTT);
    if (surcharged) extra = { says: "Additional Dwelling Supplement, 8% of the whole price", tax: Math.floor((price * LBTT_ADS) / 100) };
    if (buyer === "first") notes.push("First-time buyers pay nothing on the first £175,000.");
  } else {
    name = "Land Transaction Tax";
    lines = slice(price, surcharged ? LTT_HIGHER : LTT);
    if (surcharged) notes.push("Additional homes pay the higher rates on every band.");
    if (buyer === "first") notes.push("Wales has no first-time buyer relief, so the main rates apply.");
  }
  if (buyer === "additional" && !surcharged) notes.push("Homes under £40,000 pay no extra for being an additional property.");

  const total = sum(lines) + (extra?.tax ?? 0);
  return { name, total, effective: (total / price) * 100, lines, extra, notes };
}
