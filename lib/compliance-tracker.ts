import "server-only";
import {
  BIG_THREE,
  requiredCerts,
  statusOf,
  CERT_META,
  type CertKey,
  type CertStatus,
  type CompProperty,
} from "@/lib/compliance";

/**
 * Michael's tracker — what is outstanding, what is coming, and who to chase.
 *
 * The compliance page already answers "is this property compliant". This
 * answers a different question, and it is the back-office one: **across the
 * whole book, what needs a person today.**
 *
 * ── THE BAND, NOT THE DAY ─────────────────────────────────────────────────
 *
 * The brief says reminders at 30, 14 and 7 days. The obvious reading —
 * `daysLeft === 30` — is a bug waiting to happen: miss one run, and that
 * certificate never gets its 30-day chase at all. Nobody would notice, because
 * the thing that didn't happen leaves no trace.
 *
 * So a reminder is owed by BAND. A certificate with 22 days left is in the
 * 30-day band and stays there until it crosses into the 14-day band. Whether
 * it has already been chased is a question about what we SENT, not about what
 * is due — and since sending isn't wired yet, `alreadySent` is left for the
 * caller to supply once there is a send log.
 *
 * ── BOTH PARTIES, ALWAYS ──────────────────────────────────────────────────
 *
 * Every reminder addresses the landlord AND the agent. James was explicit and
 * the reason is good: an agent must never be surprised by a chase on their own
 * file. It also means a reminder with no agent attached is a defect worth
 * showing rather than quietly sending to one party.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * It does not send. It builds the queue and stops. An unattended process that
 * emails landlords is not something to switch on without a person watching the
 * first batch, and the queue is independently useful anyway — Michael can work
 * it by hand from day one.
 */

/** The three chase points, furthest out first. */
export const BANDS = [30, 14, 7] as const;
export type Band = (typeof BANDS)[number];

/** Which chase a certificate is owed, from days remaining. Null = none owed. */
export function bandFor(daysLeft: number | null): Band | null {
  if (daysLeft == null) return null;
  // Already expired: past chasing, it is an escalation. Handled separately so
  // an expired certificate never sits quietly in a "7 day reminder" queue.
  if (daysLeft < 0) return null;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 14) return 14;
  if (daysLeft <= 30) return 30;
  return null;
}

export interface ChaseRow {
  propertyId: string;
  property: string;
  locality: string;
  cert: CertKey;
  certLabel: string;
  status: CertStatus;
  /** Negative = expired by that many days. Null = no record at all. */
  daysLeft: number | null;
  band: Band | null;
  /** Is the certificate document actually on file, or just a date? */
  attached: boolean;
  landlord: string;
  /** The letting agent. Missing is a defect, not a blank. */
  agent: string | null;
  tenant: string | null | undefined;
  /** Why this is on the list, in the words Michael would use. */
  reason: string;
}

export interface TrackerBook {
  /** Expired or no record at all — nothing to schedule, someone must act. */
  outstanding: ChaseRow[];
  /** In date but inside a chase band. */
  upcoming: ChaseRow[];
  counts: {
    properties: number;
    expired: number;
    missing: number;
    band30: number;
    band14: number;
    band7: number;
    /** Rows we cannot chase because nobody knows who the agent is. */
    noAgent: number;
    /** In date, but we hold a date with no document behind it. */
    dateWithoutDocument: number;
    /** Duplicate property rows collapsed — a property listed twice is still
     *  one property, and chasing it twice is how a landlord stops reading. */
    duplicateRowsCollapsed: number;
  };
  /** Addresses under more than one REX property id. Reported, never merged:
   *  they may be separate flats or duplicate records, and guessing either
   *  hides a real obligation or invents one. */
  duplicateAddresses: { name: string; ids: string[] }[];
}

/**
 * A property's chaseable certificates.
 *
 * Only what the property is REQUIRED to hold — `requiredCerts` already knows
 * that a gasless house needs no gas certificate and a non-HMO needs no licence.
 * Inventing a requirement is how a tracker starts crying wolf.
 */
function rowsFor(p: CompProperty, agent: string | null): ChaseRow[] {
  return requiredCerts(p).map((key) => {
    const cert = p.certs[key];
    const status = statusOf(cert);
    const daysLeft = cert?.expires ?? null;
    const band = bandFor(daysLeft);
    const attached = Boolean(cert?.attached);

    const reason =
      status === "missing"
        ? "No record at all — we cannot say whether this exists."
        : status === "expired"
          ? `Expired ${Math.abs(daysLeft ?? 0)} days ago.`
          : !attached
            ? "In date, but the certificate itself isn't on file — we can't produce it on request."
            : `Due in ${daysLeft} days.`;

    return {
      propertyId: p.id,
      property: p.name,
      locality: p.locality,
      cert: key,
      certLabel: CERT_META[key]?.label ?? key,
      status,
      daysLeft,
      band,
      attached,
      landlord: p.landlord,
      agent,
      tenant: p.tenant,
      reason,
    };
  });
}

/**
 * Sort so the top of the list is the thing to do first.
 *
 * Expired before missing before soonest-due. Within a tie, the BIG_THREE
 * (EICR, gas, EPC) outrank the rest — a missing smoke-alarm record and a
 * missing gas certificate are not the same emergency.
 */
function urgency(r: ChaseRow): number {
  const big = BIG_THREE.includes(r.cert) ? 0 : 1;
  if (r.status === "expired") return 0 + big * 0.5 - Math.min(0, r.daysLeft ?? 0) / 100000;
  if (r.status === "missing") return 2 + big * 0.5;
  return 10 + (r.daysLeft ?? 999) / 1000 + big * 0.5;
}

/**
 * One row per property, not per listing.
 *
 * MEASURED, and it is not theoretical: the compliance book is built by mapping
 * over LISTINGS, so a property with two live listings arrives twice. Across
 * 280 rows that produced **64 duplicate (property, certificate) pairs** — the
 * same expired EICR on the same flat, listed twice.
 *
 * Michael would have chased it twice, and the second chase is the one that
 * makes a landlord stop reading our emails. Collapse on the property id and
 * keep the worst copy, since a property is compliant or not regardless of how
 * many times it is advertised.
 *
 * NOTE this does NOT merge properties that merely share an ADDRESS. "52 Moor
 * Street" exists under three different REX property ids; those might be three
 * flats, or three duplicate records, and guessing would either hide two real
 * obligations or invent one. That is surfaced instead — see `sameAddress`.
 */
function byProperty(book: CompProperty[]): CompProperty[] {
  const held = new Map<string, CompProperty>();
  for (const p of book) {
    const seen = held.get(p.id);
    if (!seen) {
      held.set(p.id, p);
      continue;
    }
    // Keep the worse record per certificate: the earliest expiry wins, and a
    // missing record beats a present one, because the safe reading of two
    // disagreeing copies is the one that gets someone to look.
    const certs = { ...seen.certs };
    for (const [k, v] of Object.entries(p.certs) as [CertKey, CompProperty["certs"][CertKey]][]) {
      const cur = certs[k];
      if (!cur || (v && cur.expires != null && (v.expires == null || v.expires < cur.expires))) {
        certs[k] = v;
      }
    }
    held.set(p.id, { ...seen, certs, hmo: seen.hmo || p.hmo, hasGas: seen.hasGas || p.hasGas });
  }
  return [...held.values()];
}

/** Addresses carried by more than one REX property id — a data-quality flag,
 *  deliberately reported rather than merged. */
function sameAddress(book: CompProperty[]): { name: string; ids: string[] }[] {
  const byName = new Map<string, Set<string>>();
  for (const p of book) {
    const set = byName.get(p.name) ?? new Set<string>();
    set.add(p.id);
    byName.set(p.name, set);
  }
  return [...byName.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([name, ids]) => ({ name, ids: [...ids] }));
}

export function buildTracker(
  rawBook: CompProperty[],
  agentFor: (propertyId: string) => string | null = () => null
): TrackerBook {
  const duplicateAddresses = sameAddress(rawBook);
  const book = byProperty(rawBook);
  const collapsed = rawBook.length - book.length;
  const rows = book.flatMap((p) => rowsFor(p, agentFor(p.id)));

  const outstanding = rows
    .filter((r) => r.status === "expired" || r.status === "missing")
    .sort((a, b) => urgency(a) - urgency(b));

  const upcoming = rows
    .filter((r) => r.band !== null)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  return {
    outstanding,
    upcoming,
    counts: {
      properties: book.length,
      expired: rows.filter((r) => r.status === "expired").length,
      missing: rows.filter((r) => r.status === "missing").length,
      band30: upcoming.filter((r) => r.band === 30).length,
      band14: upcoming.filter((r) => r.band === 14).length,
      band7: upcoming.filter((r) => r.band === 7).length,
      noAgent: rows.filter((r) => !r.agent && (r.status === "expired" || r.band)).length,
      // In date, document absent. EPC is the worst offender — measured at zero
      // documents across 100 sampled entries. A date we cannot evidence.
      dateWithoutDocument: rows.filter((r) => r.status !== "missing" && !r.attached).length,
      duplicateRowsCollapsed: collapsed,
    },
    duplicateAddresses,
  };
}

/* ── the reminder queue ───────────────────────────────────────────────────── */

export interface QueuedReminder {
  key: string;
  band: Band;
  propertyId: string;
  property: string;
  certLabel: string;
  daysLeft: number;
  /** Both, always. A reminder that reaches only one of them is a defect. */
  to: { landlord: string; agent: string | null };
  subject: string;
  /** Why this cannot be sent yet, if it can't. */
  blocked: string | null;
}

/**
 * What would go out, if sending were wired.
 *
 * Nothing here sends. It is a list Michael can read, work by hand, and check
 * against once the sender exists — which is also the only honest way to
 * evaluate an automated chase before it starts writing to landlords.
 */
export function buildQueue(tracker: TrackerBook): QueuedReminder[] {
  return tracker.upcoming
    .filter((r) => r.band !== null)
    .map((r) => ({
      key: `${r.propertyId}:${r.cert}:${r.band}`,
      band: r.band as Band,
      propertyId: r.propertyId,
      property: r.property,
      certLabel: r.certLabel,
      daysLeft: r.daysLeft ?? 0,
      to: { landlord: r.landlord, agent: r.agent },
      subject: `${r.certLabel} for ${r.property} expires in ${r.daysLeft} days`,
      blocked: r.agent
        ? null
        : "No agent on this property — the chase would reach the landlord without their agent knowing.",
    }));
}
