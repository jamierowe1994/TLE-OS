import "server-only";
import { managedBookFor } from "@/lib/managed-book-cache";
import { hasDb, q } from "@/lib/db";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { getTegPerson, listTegPeople } from "@/lib/teg-people";

/**
 * What the book earns, what it is on course to earn, and what somebody wants
 * it to earn.
 *
 * James, 7 Sep 2026: "being able to build out a 12-month forecast of what
 * they want to earn based on their projections. We should be able to look at
 * this year and see how much their portfolio has grown... what they're
 * predicted to hit and what they want to hit."
 *
 * ── Everything here is derived, nothing is typed in ───────────────────────
 *
 * The Finances board has said "not connected" since 6 Sep because the fee
 * figures on it had been typed in, and a made-up fee on Susan's screen is
 * the one thing that board must never show. This does not repeat that: every
 * property, rent, service type and start date comes from the managed book,
 * live out of REX.
 *
 * The one thing REX cannot tell us is the rate we charge. That is a business
 * decision, still open with Susan, so it is a SETTING - blank until somebody
 * fills it in, and the screen says so rather than guessing. Fill it in and
 * every figure below computes from the real book.
 *
 * ── What is honest about the past, and what is a reconstruction ───────────
 *
 * REX gives each home a rent and the date it came on the books, but not what
 * its rent used to be. So a past month's rent roll is "the homes we had that
 * month, at the rent they are on today". That is a fair measure of how the
 * BOOK has grown and an unfair one for how income moved, so it is labelled
 * as the book's shape, never as historic income.
 */

/**
 * What a partner package means in money (James, 11 Sep 2026: "what platform
 * they're on... if they're on the pro licence"). The Hub says which package
 * each partner trades under - Basic, Pro or Academy; these say what that
 * package keeps of a fee and what it pays a month. Blank until an owner
 * fills them in, like every other rate here.
 */
export interface PackageTerms {
  /** The share of fee income the partner keeps, as a percentage. */
  sharePct: number | null;
  /** The monthly licence the partner pays, in pence. */
  licencePence: number | null;
}

export const PACKAGES = ["Basic", "Pro", "Academy"] as const;

export interface FeeBasis {
  /** Management fee as a percentage of rent, on fully managed homes. */
  managementPct: number | null;
  /** The same for rent collect, which is a lighter service and a lower rate. */
  rentCollectPct: number | null;
  /** The one-off charged when a new tenancy starts, in pence. */
  setupFeePence: number | null;
  /** Let-only earns the set-up fee and no monthly fee. */
  letOnlySetupPence: number | null;
  /** Keyed on the Hub's package names. */
  packages: Record<string, PackageTerms>;
}

export const EMPTY_BASIS: FeeBasis = {
  managementPct: null,
  rentCollectPct: null,
  setupFeePence: null,
  letOnlySetupPence: null,
  packages: {},
};

export interface MonthPoint {
  /** YYYY-MM, so a chart never has to parse a label. */
  month: string;
  label: string;
  /** Homes on the books at the end of that month. */
  properties: number;
  managed: number;
  /** Monthly rent of the homes that earn a percentage, in pence. */
  feeableRentPence: number;
  /** Tenancies that started in the month. */
  newLets: number;
  managementFeePence: number | null;
  setupFeePence: number | null;
  totalPence: number | null;
  /** Forward months are a projection, past ones are the book as it was. */
  projected: boolean;
}

export interface Growth {
  addedThisYear: number;
  addedLast12: number;
  perMonth: number;
  propertiesNow: number;
  managedNow: number;
  feeableRentNowPence: number;
  /** The book twelve months ago, for the year-on-year line. */
  propertiesYearAgo: number;
  feeableRentYearAgoPence: number;
  growthPct: number | null;
}

export interface ForecastAnswer {
  live: boolean;
  reason?: string;
  basisSet: boolean;
  basis: FeeBasis;
  past: MonthPoint[];
  ahead: MonthPoint[];
  growth: Growth;
  /** What they said they want, per year, in pence. */
  targetPence: number | null;
  /** What the next twelve months come to at the current trajectory. */
  predictedPence: number | null;
  ageMs: number;
  /**
   * The person looking, as the Hub knows them: their package and what it
   * means. Null package = the Hub has no record of them (owners, support).
   */
  mine: {
    package: string | null;
    sharePct: number | null;
    licencePence: number | null;
  };
  /**
   * What they take home this month and next: fees × their share, less the
   * licence. Null until the package's share is set. An owner looking at the
   * whole business gets null too - a share is a partner's, not the firm's.
   */
  paidThisMonthPence: number | null;
  paidNextMonthPence: number | null;
  /** Next month's fee income, off the same projection as the year ahead. */
  nextMonthPence: number | null;
  /**
   * Licence income across the active partners, for an owner: the Hub's
   * headcount per package times the licence on each. Null on an agent's
   * view - it is not their money.
   */
  licenceIncome: {
    partners: number;
    byPackage: { name: string; partners: number; licencePence: number | null; totalPence: number | null }[];
    totalPence: number | null;
  } | null;
}

const MONTHS = 12;

/** REX keeps rent in whole pounds; every figure in this file is pence. */
const rentPence = (p: ManagedProperty) => Math.round((p.rentMonthly ?? 0) * 100);
const pct = (p: number | null, pence: number) => (p == null ? null : Math.round((pence * p) / 100));

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

/** The last day of the month a date falls in, so "on the books by then" is inclusive. */
function endOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

/* ── the rates, which only a person can tell us ─────────────────────────── */

const SETTINGS_KEY = "fees";

export async function feeBasis(): Promise<FeeBasis> {
  if (!hasDb()) return EMPTY_BASIS;
  const rows = await q<{ value: Partial<FeeBasis> | null }>(`SELECT value FROM os_settings WHERE key = $1`, [SETTINGS_KEY]).catch(() => []);
  const stored = rows[0]?.value ?? {};
  return { ...EMPTY_BASIS, ...stored, packages: { ...(stored.packages ?? {}) } };
}

export async function saveFeeBasis(next: Partial<FeeBasis>): Promise<FeeBasis> {
  const cur = await feeBasis();
  /* Packages merge by name, so setting Pro does not blank Basic. */
  const packages = { ...cur.packages };
  for (const [name, terms] of Object.entries(next.packages ?? {})) {
    packages[name] = { ...(packages[name] ?? { sharePct: null, licencePence: null }), ...terms };
  }
  const merged = { ...cur, ...next, packages };
  if (hasDb()) {
    await q(
      `INSERT INTO os_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [SETTINGS_KEY, JSON.stringify(merged)]
    ).catch(() => {});
  }
  return merged;
}

const TARGET_KEY = "finance-target-v1";

export async function readTarget(userId: string): Promise<number | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: { annualPence?: number } | null }>(
    `SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`,
    [userId, TARGET_KEY]
  ).catch(() => []);
  const v = rows[0]?.value?.annualPence;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function saveTarget(userId: string, annualPence: number | null): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, TARGET_KEY, JSON.stringify({ annualPence })]
  ).catch(() => {});
}

/* ── which homes earn what ──────────────────────────────────────────────── */

/**
 * A home's monthly fee, by the service REX has on it.
 *
 * "Not set" earns nothing here on purpose. 144 of 473 homes carry no service
 * type, and counting them as managed would inflate every figure on the page
 * by a third - exactly the sort of flattering guess this file exists to
 * avoid. They are reported separately so the gap is visible and fixable.
 */
function monthlyFeeFor(p: ManagedProperty, basis: FeeBasis): number | null {
  const rent = rentPence(p);
  if (!rent) return null;
  if (p.service === "Managed") return pct(basis.managementPct, rent);
  if (p.service === "Rent Collect") return pct(basis.rentCollectPct, rent);
  return null;
}

const earnsMonthly = (p: ManagedProperty) => p.service === "Managed" || p.service === "Rent Collect";

/* ── the answer ─────────────────────────────────────────────────────────── */

export interface ForecastWho {
  id: string;
  email: string | null;
  rexUserId: string | null;
}

export async function forecastFor(rexUserId: string | null, who: ForecastWho): Promise<ForecastAnswer> {
  const basis = await feeBasis();
  const targetPence = await readTarget(who.id);
  const basisSet = basis.managementPct != null || basis.setupFeePence != null;
  const whole = rexUserId === null;

  /* The person and the partners, as the Hub holds them. Read here rather
     than in a second route so one fetch fills every tile on the board. */
  const [person, everyone] = await Promise.all([
    getTegPerson({ email: who.email, rexId: who.rexUserId }),
    whole ? listTegPeople() : Promise.resolve([]),
  ]);
  const myPackage = person?.partnerPackage ?? null;
  const myTerms = myPackage ? basis.packages[myPackage] : undefined;
  const mine = {
    package: myPackage,
    sharePct: myTerms?.sharePct ?? null,
    licencePence: myTerms?.licencePence ?? null,
  };
  /* Active partners only. Departed and duplicate rows are in the Hub too,
     and counting them would invoice people who have left. */
  const active = everyone.filter((p) => p.status === "Active" && p.personType === "Partner" && p.partnerPackage);
  const licenceIncome = whole
    ? (() => {
        const names = [...new Set([...PACKAGES, ...active.map((p) => p.partnerPackage as string)])];
        const byPackage = names
          .map((name) => {
            const partners = active.filter((p) => p.partnerPackage === name).length;
            const licencePence = basis.packages[name]?.licencePence ?? null;
            return { name, partners, licencePence, totalPence: licencePence == null ? null : partners * licencePence };
          })
          .filter((row) => row.partners > 0);
        const priced = byPackage.filter((r) => r.totalPence != null);
        return {
          partners: active.length,
          byPackage,
          totalPence: priced.length ? priced.reduce((a, r) => a + (r.totalPence ?? 0), 0) : null,
        };
      })()
    : null;
  const takeHome = (feesPence: number | null): number | null =>
    whole || feesPence == null || mine.sharePct == null
      ? null
      : Math.round((feesPence * mine.sharePct) / 100) - (mine.licencePence ?? 0);

  let properties: ManagedProperty[] = [];
  let ageMs = 0;
  try {
    const got = await managedBookFor(rexUserId);
    properties = got.book.properties;
    ageMs = got.ageMs;
  } catch (e) {
    return {
      live: false,
      reason: e instanceof Error ? e.message : "REX did not answer.",
      basisSet, basis, past: [], ahead: [],
      growth: { addedThisYear: 0, addedLast12: 0, perMonth: 0, propertiesNow: 0, managedNow: 0, feeableRentNowPence: 0, propertiesYearAgo: 0, feeableRentYearAgoPence: 0, growthPct: null },
      targetPence, predictedPence: null, ageMs: 0,
      mine, paidThisMonthPence: null, paidNextMonthPence: null, nextMonthPence: null, licenceIncome,
    };
  }

  const now = new Date();
  const on = (p: ManagedProperty) => (p.onBooksSince ? new Date(p.onBooksSince).getTime() : null);
  const let_ = (p: ManagedProperty) => (p.letSince ? new Date(p.letSince).getTime() : null);

  /* ── the trailing year, month by month ── */
  const past: MonthPoint[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cutoff = endOf(m);
    const had = properties.filter((p) => { const t = on(p); return t != null && t <= cutoff; });
    const feeable = had.filter(earnsMonthly);
    const rent = feeable.reduce((a, p) => a + rentPence(p), 0);
    const newLets = properties.filter((p) => {
      const t = let_(p);
      return t != null && t >= new Date(m.getFullYear(), m.getMonth(), 1).getTime() && t <= cutoff;
    }).length;
    const mgmt = feeable.reduce<number | null>((a, p) => {
      const f = monthlyFeeFor(p, basis);
      return f == null ? a : (a ?? 0) + f;
    }, basisSet ? 0 : null);
    const setup = basis.setupFeePence == null ? null : newLets * basis.setupFeePence;
    past.push({
      month: monthKey(m), label: monthLabel(m),
      properties: had.length, managed: feeable.length,
      feeableRentPence: rent, newLets,
      managementFeePence: mgmt, setupFeePence: setup,
      totalPence: mgmt == null && setup == null ? null : (mgmt ?? 0) + (setup ?? 0),
      projected: false,
    });
  }

  /* ── growth, off the same dates ── */
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1).getTime();
  const addedThisYear = properties.filter((p) => { const t = on(p); return t != null && t >= yearStart; }).length;
  const addedLast12 = properties.filter((p) => { const t = on(p); return t != null && t >= yearAgo; }).length;
  const nowFeeable = properties.filter(earnsMonthly);
  const hadYearAgo = properties.filter((p) => { const t = on(p); return t != null && t <= yearAgo; });
  const growth: Growth = {
    addedThisYear,
    addedLast12,
    perMonth: Math.round((addedLast12 / MONTHS) * 10) / 10,
    propertiesNow: properties.length,
    managedNow: nowFeeable.length,
    feeableRentNowPence: nowFeeable.reduce((a, p) => a + rentPence(p), 0),
    propertiesYearAgo: hadYearAgo.length,
    feeableRentYearAgoPence: hadYearAgo.filter(earnsMonthly).reduce((a, p) => a + rentPence(p), 0),
    growthPct: hadYearAgo.length ? Math.round(((properties.length - hadYearAgo.length) / hadYearAgo.length) * 1000) / 10 : null,
  };

  /* ── the twelve months ahead ──
     The book keeps growing at the rate it actually grew over the last year,
     and each new home is worth the average rent of the ones we have. No
     optimism is added: if the book stood still, so does the line. */
  const avgRent = nowFeeable.length ? Math.round(growth.feeableRentNowPence / nowFeeable.length) : 0;
  /* Of the homes added in the last year, the share that earn a monthly fee -
     so growth is not assumed to be all fully managed. */
  const recent = properties.filter((p) => { const t = on(p); return t != null && t >= yearAgo; });
  const feeableShare = recent.length ? recent.filter(earnsMonthly).length / recent.length : 0;
  const letsPerMonth = past.reduce((a, m) => a + m.newLets, 0) / MONTHS;

  const ahead: MonthPoint[] = [];
  let runningFeeable = nowFeeable.length;
  let runningRent = growth.feeableRentNowPence;
  for (let i = 1; i <= MONTHS; i++) {
    const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const added = growth.perMonth * feeableShare;
    runningFeeable += added;
    runningRent += added * avgRent;
    const mgmt = basis.managementPct == null ? null : Math.round((runningRent * basis.managementPct) / 100);
    const setup = basis.setupFeePence == null ? null : Math.round(letsPerMonth * basis.setupFeePence);
    ahead.push({
      month: monthKey(m), label: monthLabel(m),
      properties: Math.round(growth.propertiesNow + growth.perMonth * i),
      managed: Math.round(runningFeeable),
      feeableRentPence: Math.round(runningRent),
      newLets: Math.round(letsPerMonth),
      managementFeePence: mgmt, setupFeePence: setup,
      totalPence: mgmt == null && setup == null ? null : (mgmt ?? 0) + (setup ?? 0),
      projected: true,
    });
  }

  const predictedPence = ahead.every((m) => m.totalPence == null)
    ? null
    : ahead.reduce((a, m) => a + (m.totalPence ?? 0), 0);

  const thisMonthPence = past[past.length - 1]?.totalPence ?? null;
  const nextMonthPence = ahead[0]?.totalPence ?? null;

  return {
    live: true, basisSet, basis, past, ahead, growth, targetPence, predictedPence, ageMs,
    mine,
    paidThisMonthPence: takeHome(thisMonthPence),
    paidNextMonthPence: takeHome(nextMonthPence),
    nextMonthPence,
    licenceIncome,
  };
}
