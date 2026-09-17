import {
  CERT_META,
  HMO_SET,
  QUIET_SET,
  isOurs,
  requiredCerts,
  statusOf,
  type CertKey,
  type CompProperty,
} from "@/lib/compliance";

/**
 * Compliance per certificate type, on the homes the agency answers for.
 *
 * Susan, 17 Sep 2026: "we need the breakdown of compliance per category type
 * i.e. Gas, EICR etc and % of portfolio". Scoped by isOurs() and judged by
 * requiredCerts(), the same two rules as the Compliance page, so the business
 * tab and the page Michael works from cannot disagree.
 *
 * Pure: takes the book, returns figures. The route does the fetching.
 */

export interface CertBreakdown {
  key: CertKey;
  label: string;
  /** Homes that must hold this certificate. */
  required: number;
  /** In date with more than 30 days left. */
  inDate: number;
  /** In date, but expiring within 30 days. */
  dueSoon: number;
  expired: number;
  noRecord: number;
  /** (inDate + dueSoon) / required, 0-100, one decimal. Null when nothing is required. */
  compliantPct: number | null;
  /** required / homes on the book, 0-100: how much of the portfolio this duty covers. */
  portfolioPct: number;
}

export interface ComplianceBreakdown {
  homes: number;
  hmos: number;
  gasHomes: number;
  /** No gas duty, and nobody has said whether there is gas. A question, not a chase. */
  gasUnanswered: number;
  /** Homes holding every certificate they need, in date. */
  fullyCompliant: number;
  fullyCompliantPct: number | null;
  withExpired: number;
  withNoRecord: number;
  withDueSoon: number;
  certificates: CertBreakdown[];
}

/* Gas first: the hardest deadline in lettings, and the one Susan names first. */
const ORDER: CertKey[] = ["gas", "eicr", "epc", ...HMO_SET, ...QUIET_SET];
const round1 = (n: number) => Math.round(n * 10) / 10;

export function complianceBreakdown(properties: CompProperty[]): ComplianceBreakdown {
  // One row per home (the book carries one per leased listing), ours only.
  const seen = new Set<string>();
  const homes = properties.filter((p) =>
    seen.has(p.id) || !isOurs(p) ? false : (seen.add(p.id), true)
  );

  const byCert = new Map<CertKey, CertBreakdown>(
    ORDER.map((key) => [
      key,
      { key, label: CERT_META[key].short, required: 0, inDate: 0, dueSoon: 0, expired: 0, noRecord: 0, compliantPct: null, portfolioPct: 0 },
    ])
  );

  let fullyCompliant = 0;
  let withExpired = 0;
  let withNoRecord = 0;
  let withDueSoon = 0;
  for (const p of homes) {
    let anyExpired = false;
    let anyMissing = false;
    let anySoon = false;
    for (const key of requiredCerts(p)) {
      const row = byCert.get(key);
      if (!row) continue;
      row.required++;
      const st = statusOf(p.certs[key]);
      if (st === "expired") {
        row.expired++;
        anyExpired = true;
      } else if (st === "missing") {
        row.noRecord++;
        anyMissing = true;
      } else if (st === "urgent") {
        row.dueSoon++;
        anySoon = true;
      } else {
        row.inDate++;
      }
    }
    if (!anyExpired && !anyMissing) fullyCompliant++;
    if (anyExpired) withExpired++;
    if (anyMissing) withNoRecord++;
    if (anySoon) withDueSoon++;
  }

  return {
    homes: homes.length,
    hmos: homes.filter((p) => p.hmo).length,
    gasHomes: homes.filter((p) => p.hasGas).length,
    gasUnanswered: homes.filter((p) => !p.hasGas && !p.gasAnswered).length,
    fullyCompliant,
    fullyCompliantPct: homes.length ? round1((fullyCompliant / homes.length) * 100) : null,
    withExpired,
    withNoRecord,
    withDueSoon,
    certificates: [...byCert.values()]
      .filter((r) => r.required > 0)
      .map((r) => ({
        ...r,
        compliantPct: r.required ? round1(((r.inDate + r.dueSoon) / r.required) * 100) : null,
        portfolioPct: homes.length ? round1((r.required / homes.length) * 100) : 0,
      })),
  };
}
