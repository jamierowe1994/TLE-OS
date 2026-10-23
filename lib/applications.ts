import "server-only";
import { londonToday } from "@/lib/london-clock";
import { rexCall, rexRows } from "@/lib/rex";
import { unitLine } from "@/lib/address-parse";
import { hasDb, q } from "@/lib/db";
import { isScottish } from "@/lib/property-flags";
import { introOnlyIds } from "@/lib/intro-only";
import { applyLead, leadOverrides } from "@/lib/lead-tenant";
import { decisionsFor } from "@/lib/offer-decisions";

/**
 * Tenancy applications — the real ones, out of REX.
 *
 * This is not a new pipeline. 576 applications already live in REX and 457 of
 * them were made this year, 87% of those by Howard's JotForm → Power Automate
 * flow. What follows was measured against that book on 21 Aug 2026, because
 * the shape of the form we build has to be the shape of the data that exists.
 *
 * WHAT THE MEASUREMENT FOUND
 *
 * REX's application record is generous. It holds an applicant sub-record per
 * person (`related.listing_application_tenants`) with date of birth, net income
 * and period, employment status, a guarantors array and a linked contact. It is
 * mostly well filled: across 2026, employment 457/457, dob 432/457, income
 * 371/457.
 *
 * Four answers, though, are in NO field. Right to Rent, a landlord reference
 * for the last two years, whether a guarantor is offered, and whether there is
 * adverse credit are pushed into the free-text `notes` column as a single line
 * of prose, in a stable pipe-separated format:
 *
 *   PRIMARY — Rachel Oakes (Employed) | Job: … | Company: … | Position: … |
 *   Zero hours: No | In probation: No | Salary: £ 21,774 p/year |
 *   Right to rent: Yes | LL ref (2y): Yes | Guarantor: No | Poor credit: No
 *
 * Three consequences, and they are the reason this task exists:
 *
 *  1. THE LINE ONLY EVER DESCRIBES THE PRIMARY APPLICANT. 473 blobs, not one
 *     mentions a second person. There are 265 joint applicants on 2026's
 *     applications, and for every one of them Right to Rent is unrecorded —
 *     in prose or otherwise. Right to Rent is a statutory check per adult
 *     occupier, so this is the gap that matters most.
 *
 *  2. `guarantors` IS EMPTY ON ALL 457, while the prose says "Guarantor: Yes"
 *     on a good hundred of them. We know a guarantor was offered; we have
 *     never recorded who.
 *
 *  3. THE EMPLOYMENT MAPPING IS LOSSY. The form offers Employed, Self-Employed,
 *     Student, Benefits and In Receipt of Pension. REX's enum has no Student,
 *     Benefits or Pension, so all three land on `unemployed` — 104 applicants
 *     recorded as unemployed who are nothing of the sort. Affordability is
 *     computed off income, not status, so the sums are safe; anyone reading or
 *     filtering the status is not.
 *
 * So `parseKeyInfo` below reads the prose back out. It is not a nicety: it is
 * the only way to see the Right to Rent answer on the 413 applications already
 * recorded that way, and it lets the new form and the old flow feed one screen.
 */

/* ── the vocabulary, as the form asks it ──────────────────────────────────── */

/** What the JotForm offers. Recovered from the live book, not invented. */
export const EMPLOYMENT = [
  "Employed",
  "Self-Employed",
  "Student",
  "Benefits",
  "In Receipt of Pension",
] as const;
export type Employment = (typeof EMPLOYMENT)[number];

/**
 * Our word → REX's enum id.
 *
 * Three of the five have no honest home, and they are marked as such rather
 * than quietly rounded off. `lossy: true` means REX will hold something that
 * is not what the applicant said, and the true answer survives only in our own
 * record — which is why `keyInfo.employment` is kept verbatim alongside it.
 */
export const EMPLOYMENT_TO_REX: Record<Employment, { id: string; lossy: boolean }> = {
  Employed: { id: "full_time", lossy: false },
  "Self-Employed": { id: "self_employed", lossy: false },
  Student: { id: "unemployed", lossy: true },
  Benefits: { id: "unemployed", lossy: true },
  "In Receipt of Pension": { id: "unemployed", lossy: true },
};

/** REX's own agreement types, as used on the live book. */
export const AGREEMENT_TYPES = [
  { id: "ast", text: "Assured Shorthold Tenancy (AST)" },
  { id: "apt", text: "Assured Periodic Tenancy (APT)" },
  { id: "153279", text: "Private Residential Tenancy (PRT) (Scotland)" },
  { id: "company", text: "Company" },
  { id: "periodic_oc", text: "Periodic Occupation Contract" },
] as const;

/** The four statuses in use, in the order a deal passes through them. */
export const APPLICATION_STATUSES = [
  { id: "received", text: "Received" },
  { id: "communicated", text: "Communicated" },
  { id: "accepted", text: "Accepted" },
  { id: "unsuccessful", text: "Unsuccessful" },
] as const;

/* ── the shape we hand the UI ─────────────────────────────────────────────── */

/** The four answers that live in prose today, per applicant. */
export interface KeyInfo {
  employment: string | null;
  job: string | null;
  company: string | null;
  /** "Permanent" | "Temporary" */
  position: string | null;
  zeroHours: boolean | null;
  inProbation: boolean | null;
  /** Annual, in pounds. */
  salary: number | null;
  rightToRent: boolean | null;
  /** A landlord reference covering the last two years. */
  landlordRef: boolean | null;
  guarantor: boolean | null;
  adverseCredit: boolean | null;
  /** What they wrote when they ticked "poor credit" — always worth reading. */
  adverseCreditNote: string | null;
}

export interface Applicant {
  id: string | null;
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  dob: string | null;
  /** Normalised to pounds per year, whatever period REX stored. */
  incomePerYear: number | null;
  employmentRex: string | null;
  guarantorCount: number;
  /** Only ever present for the primary, and only when the flow wrote it. */
  keyInfo: KeyInfo | null;
}

export type OfferDecision = { decision: "accepted" | "declined"; by: string; at: string };

export interface Application {
  id: string;
  status: string;
  statusLabel: string;
  /**
   * Where it has actually got to, as opposed to which of REX's four statuses
   * it is on. Filled by the list route from Propoly's deals; absent on a
   * record read any other way, in which case statusLabel is all there is.
   */
  stageLabel?: string;
  /**
   * Why this one is no longer open, though REX still says it is. Filled by
   * the list route from closedReasons(); null means it is genuinely in play.
   */
  closed?: string | null;
  /**
   * The agent's Accept or Decline in the OS (lib/offer-decisions), which REX
   * does not know about yet - it is still updated by hand. Filled by
   * getApplications (null: nobody has decided here); absent on a record
   * read any other way.
   */
  osDecision?: OfferDecision | null;
  listingId: number | null;
  /** The PROPERTY, not the listing. Compliance certificates hang off this. */
  propertyId: string | null;
  property: string;
  locality: string;
  image: string | null;
  agent: string | null;
  offerAmount: number | null;
  offerPeriod: string;
  startDate: string | null;
  agreementMonths: number | null;
  occupants: number | null;
  households: number | null;
  dependents: number | null;
  hasPets: boolean | null;
  affordabilityPct: number | null;
  totalIncome: number | null;
  holdingDepositAmount: number | null;
  dateReceived: string | null;
  dateAccepted: string | null;
  conditions: string | null;
  applicants: Applicant[];
  createdBy: string | null;
  createdAt: number | null;
  /** REX's system_modtime, seconds. */
  updatedAt: number | null;
  /** True when nobody has recorded Right to Rent for every adult applicant. */
  rightToRentIncomplete: boolean;
  /** A tenant swap (lib/tenant-swaps): who leaves, who stays, who joins. Only
   *  the joiners are referenced, and the push starts a new deal. */
  swap?: {
    /** swap / add / rereference (lib/tenant-swaps, 19 Oct 2026). Absent = swap. */
    kind?: "swap" | "add" | "rereference";
    /** Staying tenants referenced again, by name. */
    rereference?: string[];
    leaving: string[];
    staying: string[];
    joining: string[];
    /** What the newcomer pays by themselves, when the agent gave it. */
    rentPortion?: number | null;
    /** The home as the push needs it when it has no REX listing (a REX PM
     *  home, "pm-link-<property>"): its first line and postcode to find it in
     *  Propoly, who manages the deal, and the service. */
    home: { line1: string; postcode: string; agentEmail: string | null; managed: boolean };
    /** The home's id on Portfolio (a REX listing number, or "pm-link-<property>"). */
    homeRef?: string;
    /** The REX property behind the home, so the OS record's landlord can be
     *  read for a home with no REX listing (16 Oct 2026). */
    rexPropertyId?: string | null;
  } | null;
  /** The Propoly deal this application started, when the OS pushed it (its
   *  handover's "deal" step). The let page matches a deal to its application
   *  by this first: a swap on a REX PM home has no listing number and its
   *  address is written differently in Propoly ("South Bridge 44 (3f1)" vs
   *  "3f1, 44 South Bridge"), so without it the deal opened as a second file
   *  with the PLC check greyed out (Lianna, 16 Oct 2026). */
  propolyDealId?: string | null;
}

/* ── reading the prose back out ───────────────────────────────────────────── */

const YES = /^\s*yes/i;
const NO = /^\s*no/i;

function tri(v: string | null): boolean | null {
  if (v == null) return null;
  if (YES.test(v)) return true;
  if (NO.test(v)) return false;
  return null;
}

/** Pull `Label: value` out of the pipe-separated line. */
function field(blob: string, label: string): string | null {
  const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([^|\\n]*)`, "i");
  const m = re.exec(blob);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

function money(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[£,\s]/g, "").replace(/p\/?year|per\s*year|pa/i, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Recover the four checks from the `notes` blob.
 *
 * Returns null when the note was written by a person rather than the flow —
 * better an honest absence than a half-parsed record that reads as an answer.
 */
export function parseKeyInfo(notes: string | null | undefined): KeyInfo | null {
  if (!notes) return null;
  const after = notes.split(/Tenant key info:/i)[1];
  if (!after) return null;
  const blob = after.trim();
  if (!blob) return null;

  const employment = /^\s*PRIMARY\s+—\s+[^(]*\(([^)]*)\)/m.exec(blob)?.[1]?.trim() ?? null;
  const credit = field(blob, "Poor credit");
  // "Poor credit: Yes (…their explanation, which can run for paragraphs…)"
  const creditNote = credit && /^yes/i.test(credit) ? /\(([\s\S]*)/.exec(credit)?.[1] ?? null : null;

  return {
    employment,
    job: field(blob, "Job"),
    company: field(blob, "Company"),
    position: field(blob, "Position"),
    zeroHours: tri(field(blob, "Zero hours")),
    inProbation: tri(field(blob, "In probation")),
    // Three different labels carry the income, depending on which branch of
    // the form they took. The benefits one is stated MONTHLY — taking it at
    // face value understated those applicants twelvefold.
    salary:
      money(field(blob, "Salary")) ??
      money(field(blob, "Last 12 months")) ??
      (() => {
        const m = money(field(blob, "Monthly benefit income"));
        return m == null ? null : m * 12;
      })(),
    rightToRent: tri(field(blob, "Right to rent")),
    // `field` escapes the label itself — pre-escaping the brackets here double
    // escaped them and the match silently failed, reading every landlord
    // reference as unanswered.
    landlordRef: tri(field(blob, "LL ref (2y)")),
    guarantor: tri(field(blob, "Guarantor")),
    adverseCredit: tri(credit),
    adverseCreditNote: creditNote ? creditNote.replace(/\)\s*$/, "").trim() : null,
  };
}

/** Write the same line back, so a form-made application reads like a flow-made
 *  one. Same order, same labels — REX's note history stays one format. */
export function formatKeyInfo(name: string, k: KeyInfo): string {
  const yn = (b: boolean | null) => (b == null ? "—" : b ? "Yes" : "No");
  const parts = [`PRIMARY — ${name} (${k.employment ?? "—"})`];
  if (k.job) parts.push(`Job: ${k.job}`);
  if (k.company) parts.push(`Company: ${k.company}`);
  if (k.position) parts.push(`Position: ${k.position}`);
  if (k.zeroHours != null) parts.push(`Zero hours: ${yn(k.zeroHours)}`);
  if (k.inProbation != null) parts.push(`In probation: ${yn(k.inProbation)}`);
  if (k.salary) parts.push(`Salary: £ ${k.salary.toLocaleString("en-GB")} p/year`);
  parts.push(`Right to rent: ${yn(k.rightToRent)}`);
  parts.push(`LL ref (2y): ${yn(k.landlordRef)}`);
  parts.push(`Guarantor: ${yn(k.guarantor)}`);
  parts.push(
    `Poor credit: ${yn(k.adverseCredit)}${k.adverseCredit && k.adverseCreditNote ? ` (${k.adverseCreditNote})` : ""}`
  );
  return parts.join(" | ");
}

/* ── REX → our shape ──────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** REX hands image URLs back protocol-relative — unusable outside a browser. */
function https(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

const PER_YEAR: Record<string, number> = { year: 1, month: 12, week: 52, fortnight: 26, day: 365 };

function applicantOf(t: Row, keyInfo: KeyInfo | null): Applicant {
  const contact = (t.contact ?? {}) as Row;
  const period = str((t.net_income_period as Row | null)?.id) ?? "year";
  const income = num(t.net_income);
  const isPrimary = Boolean(t.is_primary);
  return {
    id: str(t.id),
    contactId: str(contact.id),
    name: str(contact.name) ?? "Name not recorded",
    email: str(contact.email_address),
    phone: str(contact.phone_number),
    isPrimary,
    dob: str(t.dob),
    incomePerYear: income != null ? Math.round(income * (PER_YEAR[period] ?? 1)) : null,
    employmentRex: str((t.employment_status as Row | null)?.text),
    guarantorCount: Array.isArray(t.guarantors) ? t.guarantors.length : 0,
    // The blob describes the primary and nobody else — attaching it to a joint
    // applicant would be inventing an answer they were never asked for.
    keyInfo: isPrimary ? keyInfo : null,
  };
}

/**
 * A let in Scotland, where Right to Rent is not the law (James, 15 Oct 2026:
 * it is England-only, so it is neither asked on a Scottish passport nor owed
 * on a Scottish application). By the postcode, or REX's Scottish agreement
 * type (153279, as lib/handover-deal reads it) when the listing carries one.
 */
function scottishLet(r: Row, postcode: string | null): boolean {
  const listing = (r.listing ?? {}) as Row;
  return String(((listing.agreement_type ?? null) as Row | null)?.id ?? "") === "153279" || isScottish(postcode);
}

export function shapeApplication(r: Row): Application {
  const listing = (r.listing ?? {}) as Row;
  const property = (listing.property ?? {}) as Row;
  const keyInfo = parseKeyInfo(str(r.notes));
  const tenants = ((r.related as Row | null)?.listing_application_tenants ?? []) as Row[];
  const applicants = tenants.map((t) => applicantOf(t, keyInfo));

  const street = [str(property.adr_street_number), str(property.adr_street_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  const building =
    typeof property.adr_building === "string"
      ? property.adr_building
      : str((property.adr_building as Row | null)?.name);
  const name =
    [
      /* "Room 2", not "Apartment Room 2" (6 Oct 2026) - see unitLine. */
      unitLine(str(property.adr_unit_number)),
      building,
      street || null,
    ]
      .filter(Boolean)
      .join(", ") ||
    str(property.system_search_key) ||
    "Address not recorded";

  const status = str((r.application_status as Row | null)?.id) ?? "received";

  return {
    id: String(r.id ?? ""),
    status,
    statusLabel:
      str((r.application_status as Row | null)?.text) ??
      APPLICATION_STATUSES.find((s) => s.id === status)?.text ??
      "Received",
    listingId: num(listing.id),
    propertyId: property.id != null ? String(property.id) : null,
    property: name,
    locality:
      [str(property.adr_suburb_or_town), str(property.adr_postcode)].filter(Boolean).join(" ") ||
      "—",
    image: https(str((listing.listing_primary_image as Row | null)?.url)),
    agent: str((r.agent as Row | null)?.name),
    offerAmount: num(r.offer_amount),
    offerPeriod: str((r.offer_amount_period as Row | null)?.text) ?? "Per Month",
    startDate: str(r.start_date),
    agreementMonths: num(r.agreement_length_months),
    occupants: num(r.num_of_occupants),
    households: num(r.num_of_households),
    dependents: num(r.num_of_dependents),
    hasPets: r.has_pets == null ? null : Boolean(r.has_pets),
    affordabilityPct: num(r.system_affordability_percentage),
    totalIncome: num(r.system_total_income),
    holdingDepositAmount: num(r.holding_deposit_amount),
    dateReceived: str(r.date_received),
    dateAccepted: str(r.date_accepted),
    conditions: str(r.conditions),
    applicants,
    createdBy: str((r.system_created_user as Row | null)?.name),
    createdAt: num(r.system_ctime),
    updatedAt: num(r.system_modtime),
    // The whole point of the exercise. One "Yes" on the primary is not a
    // Right to Rent check on a household of three. Never owed on a Scottish let.
    rightToRentIncomplete:
      !scottishLet(r, str(property.adr_postcode)) && applicants.length > 0 && applicants.some((a) => a.keyInfo?.rightToRent !== true),
  };
}

/**
 * The live book, newest first.
 *
 * REX caps a page at 100 and — this is the trap — returns an EMPTY array rather
 * than an error when you ask for more, so a limit of 200 reads as "no
 * applications" instead of failing. Paged deliberately.
 */
/**
 * @param rexUserId  Whose applications. Null or omitted returns the business.
 *
 * MULTI-TENANT. Filtered AT REX on `application.agent_id` - the same field
 * the dashboard's figures route counts on - rather than after the walk, so
 * another agent's applicants, with their incomes and offers, never enter this
 * process for this request. This read predated the OS going per-person (22
 * Aug against 27 Aug) and was the one screen on the rail still showing every
 * agent everybody's book.
 */
/**
 * The pull, kept for a minute.
 *
 * REX caps a page at 100, so asking for 300 is three round trips - measured
 * 14 Sep 2026 at four to six seconds. The journey behind an application does
 * exactly that to find ONE application by its id, which is why opening a file
 * left an agent looking at "Checking where this is up to" for seven seconds
 * with the answer itself taking 1.7 of them.
 *
 * A minute: short enough that the screen is still live (an application that
 * changed in REX is on the board within the minute, and every figure on it
 * is REX's own), long enough that the list and the file opened from it share
 * one pull instead of paying for two.
 *
 * Keyed by what was asked for, because the business pull and one agent's pull
 * are different books and must never be served to each other.
 */
const APPS_TTL_MS = 60_000;
/* On globalThis, so the list route, the journey and the scans - separate
   route modules - share one pull rather than one each (2 Oct 2026). */
const appsCache: Map<string, { at: number; apps: Application[] }> = ((globalThis as unknown as { __appsCache?: Map<string, { at: number; apps: Application[] }> }).__appsCache ??= new Map());

/**
 * Pulls already asked for and not yet answered, shared by whoever asks next
 * (22 Oct 2026). A pull of 300 is nine REX searches side by side, and the
 * board, the dashboard, the search palette, the listing's applications and
 * the PLC prefill each asked for their own at once - so while REX was off the
 * network on 21 Oct every screen opened waited ten seconds on nine more
 * connections that were never going to open: 3,292 failed
 * TenancyApplications searches in an afternoon and evening. Now the second
 * caller waits on the first one's answer, good or bad.
 */
const appsInFlight: Map<string, Promise<Application[]>> = ((globalThis as unknown as { __appsInFlight?: Map<string, Promise<Application[]>> }).__appsInFlight ??= new Map());

export async function getApplications(limit = 100, rexUserId?: string | null): Promise<Application[]> {
  const key = `${limit}:${rexUserId ?? ""}`;
  const hit = appsCache.get(key);
  if (hit && Date.now() - hit.at < APPS_TTL_MS) return hit.apps;

  /* A bigger pull already in hand answers a smaller one: the list asks for
     100 and the journey for 300, and the second is a superset of the first. */
  for (const [k, v] of appsCache) {
    const [n, who] = k.split(":");
    if (who === (rexUserId ?? "") && Number(n) >= limit && Date.now() - v.at < APPS_TTL_MS) {
      /* A pull of 100 or more also carries every open application, however
         old (below), so it is handed over whole rather than cut back to the
         newest `limit` - cutting it would drop exactly those. */
      return limit >= 100 ? v.apps : v.apps.slice(0, limit);
    }
  }

  const running = appsInFlight.get(key);
  if (running) return running;
  /* A bigger pull on its way answers a smaller one, as the cache does. */
  for (const [k, p] of appsInFlight) {
    const [n, who] = k.split(":");
    if (who === (rexUserId ?? "") && Number(n) >= limit) return p.then((apps) => (limit >= 100 ? apps : apps.slice(0, limit)));
  }
  const pull: Promise<Application[]> = pullApplications(limit, rexUserId, key).finally(() => {
    if (appsInFlight.get(key) === pull) appsInFlight.delete(key);
  });
  appsInFlight.set(key, pull);
  return pull;
}

async function pullApplications(limit: number, rexUserId: string | null | undefined, key: string): Promise<Application[]> {
  /* The pages SIDE BY SIDE (19 Sep 2026). They were asked for one after the
     other - three REX calls end to end for the 300 the dashboard wants, which
     is most of what a cold load cost. The offsets are known before anything
     is asked, so nothing is gained by waiting; a page past the end comes back
     empty and costs nothing. Same order, same refusal if any page is refused. */
  /* Every open one, asked for alongside the newest pages rather than after
     them (see below for why it exists). */
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const openPull =
    limit >= 100
      ? allApplications([
          ...(rexUserId ? [{ name: "application.agent_id", type: "=", value: rexUserId }] : []),
          { name: "application.application_status_id", type: "in", value: ["received", "communicated", "accepted"] },
        ])
      : Promise.resolve([] as Application[]);
  /* Not left dangling if a newest page is refused first. */
  openPull.catch(() => null);
  const offsets: number[] = [];
  for (let offset = 0; offset < limit; offset += 100) offsets.push(offset);
  const pages = await Promise.all(
    offsets.map(async (offset) => {
      const res = await rexCall("TenancyApplications", "search", {
        ...(rexUserId ? { criteria: [{ name: "application.agent_id", type: "=", value: rexUserId }] } : {}),
        limit: Math.min(100, limit - offset),
        offset,
        order_by: { system_ctime: "desc" },
      });
      if (!res.ok) throw new Error(res.error ?? "REX wouldn't answer.");
      return rexRows(res.result);
    })
  );
  /* An application landing mid-read pushes one row onto the next page. Once each. */
  const seen = new Set<string>();
  const out: Application[] = [];
  for (const rows of pages) {
    for (const a of rows.map(shapeApplication)) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  /* EVERY OPEN ONE, HOWEVER OLD (1 Oct 2026). The board read the newest 200
     and nothing else, so an application still waiting on a landlord from
     June simply was not there: on 30 Sep REX held 673, the board saw back to
     mid-July, and 40 applications the OS itself counts as open (38 awaiting
     a landlord decision) were missing - "All open" said 60 when it was 100.
     So the newest `limit` stay for history, and on top come every received
     and communicated application in REX, plus accepted ones whose move-in is
     still ahead (an accepted one that has moved in is history, and there are
     a couple of hundred of those). closedReasons still decides which of them
     are really over. Skipped for small pulls (the dashboard tiles' 10s). */
  if (limit >= 100) {
    for (const a of await openPull) {
      if (seen.has(a.id)) continue;
      if (a.status === "accepted" && a.startDate && a.startDate.slice(0, 10) < today) continue;
      seen.add(a.id);
      out.push(a);
    }
    out.sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0));
  }
  /* Offers accepted in the OS are applications too (12 Oct 2026, below). */
  if (limit >= 100) {
    const extra = await Promise.all([
      osAcceptedApplications(rexUserId ?? null, out).catch(() => [] as Application[]),
      swapApplications(rexUserId ?? null).catch(() => [] as Application[]),
    ]);
    for (const a of extra.flat()) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    out.sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0));
  }
  if (limit >= 100) {
    const pushed = await pushedDeals().catch(() => new Map<string, string>());
    for (const a of out) {
      const d = pushed.get(a.id);
      if (d) a.propolyDealId = d;
    }
  }
  /* The lead tenant as an agent changed it in the OS (lib/lead-tenant). */
  const leads = await leadOverrides().catch(() => new Map<string, string>());
  if (leads.size) for (const a of out) applyLead(a, leads);
  await applyAgreedRent(out).catch(() => null);
  await applyDecisions(out).catch(() => null);
  appsCache.set(key, { at: Date.now(), apps: out });
  return out;
}

/**
 * The agent's Accept or Decline in the OS, on the REX applications themselves
 * (22 Oct 2026). It was only laid on by the list routes, AFTER the board had
 * worked out each one's stage and whether it was closed - so a let accepted
 * here and never marked in REX read "Landlord decision", and once REX had the
 * home as let it went to Closed as "Home let", as if somebody else had it.
 * Rhiannon's 12b Cliff Road moved in on 22 Oct and still asked her to accept
 * the offer. Null means nobody has decided here.
 */
async function applyDecisions(apps: Application[]): Promise<void> {
  const rex = apps.filter((a) => !isOsApplication(a.id));
  if (!rex.length || !hasDb()) return;
  const decided = await decisionsFor(rex.map((a) => `rex:${a.id}`));
  for (const a of rex) a.osDecision = decided.get(`rex:${a.id}`) ?? null;
}

/**
 * A REX application accepted here at a countered figure (16 Oct 2026,
 * lib/offer-counters): the agreed rent and move-in, not REX's first offer,
 * so the file and the push to Propoly carry what was agreed. REX itself is
 * updated by hand. OS offers carry theirs on the offer already.
 */
async function applyAgreedRent(apps: Application[]): Promise<void> {
  const rex = apps.filter((a) => !isOsApplication(a.id));
  if (!rex.length || !hasDb()) return;
  const { agreedOnRexApps } = await import("@/lib/offer-counters");
  const agreed = await agreedOnRexApps(rex.map((a) => a.id));
  for (const a of rex) {
    const c = agreed.get(a.id);
    if (!c) continue;
    a.offerAmount = c.amount;
    if (c.moveIn) a.startDate = c.moveIn;
  }
}

/** Application id -> the Propoly deal its push started, newest push winning. */
async function pushedDeals(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!hasDb()) return out;
  const rows = await q<{ application_id: string; deal: string | null }>(
    `SELECT application_id,
            (SELECT s->'response'->>'uuid' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(steps) = 'array' THEN steps ELSE '[]'::jsonb END) s
              WHERE s->>'id' = 'deal' AND s->>'state' = 'ok' LIMIT 1) AS deal
       FROM os_handovers
      WHERE mode = 'live' AND status = 'ok'
      ORDER BY started_at ASC`
  );
  for (const r of rows) if (r.deal) out.set(r.application_id, r.deal);
  return out;
}

/* ── OFFERS ACCEPTED IN THE OS ARE APPLICATIONS (James, 12 Oct 2026) ────────

   Lianna accepted Annie Macmillan-Klyne's offer on 6 Ruskin Place, made in the
   OS on the phone, and the home fell into a hole: let agreed, so off Listings;
   no REX application behind it, so not on Applications either, and nothing to
   push to Propoly. "As soon as we click accept, it should then launch us onto
   the page that we need to see, and we will then have the ability to push this
   through."

   So an offer accepted here becomes an application here: id "os:<offer id>",
   accepted on the day it was accepted, the agreed rent and move-in off the
   offer, the home, agent and photo off its REX listing, the lead tenant as the
   applicant. The board, the file, the push to Propoly and the held-offers rule
   read it like any other. One whose tenant later shows up on a REX application
   for the same home gives way to that one. Undo the accept and it goes. */

type OsOfferRow = {
  id: string;
  email: string | null;
  name: string | null;
  listing_id: string | null;
  address: string | null;
  payload: {
    amount?: number; moveIn?: string; adults?: number; children?: number; pets?: boolean; movingIn?: string[]; recordedBy?: { name?: string };
    /* The lead's offer answers, and (from the public offer link) every applicant's own. */
    passport?: Partial<Record<string, unknown>>;
    applicants?: Array<{ name?: string; email?: string; phone?: string; dob?: string; isPrimary?: boolean; employment?: string; job?: string; company?: string; position?: string; zeroHours?: boolean; inProbation?: boolean; income?: number; rightToRent?: boolean; landlordRef?: boolean; guarantor?: boolean; adverseCredit?: boolean; adverseCreditNote?: string }>;
  } | null;
  created_at: Date;
  by_name: string | null;
  decided_at: Date;
};

const listingRead = new Map<string, { at: number; row: Row | null }>();
async function listingRow(id: string): Promise<Row | null> {
  const hit = listingRead.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.row;
  const res = await rexCall("Listings", "read", { id: Number(id) }).catch(() => null);
  const row = res?.ok ? ((res.result ?? null) as Row | null) : null;
  if (row || !hit) listingRead.set(id, { at: Date.now(), row });
  return row ?? hit?.row ?? null;
}

async function osAcceptedApplications(rexUserId: string | null, rexApps: Application[]): Promise<Application[]> {
  if (!hasDb()) return [];
  const rows = await q<OsOfferRow>(
    `SELECT r.id, r.email, r.name, r.listing_id, r.address, r.payload, r.created_at, d.by_name, d.decided_at
       FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
      WHERE d.decision = 'accepted' AND r.listing_id IS NOT NULL AND d.decided_at > NOW() - INTERVAL '120 days'
      ORDER BY d.decided_at DESC LIMIT 100`
  );
  const out: Application[] = [];
  /* Every other adult's own part (lib/offer-people, 14 Oct 2026). */
  const { offerPeople } = await import("@/lib/offer-people");
  const parts = await offerPeople(rows.map((r) => r.id)).catch(() => new Map());
  /* The lead's mobile where the offer itself has none (23 Oct 2026). An
     offer an agent keys in keeps the passport's offer answers, which leave
     the mobile out, so 6 Tenbury Crescent reached Propoly with no number and
     its tenant was refused. Their passport, then their enquiry, hold it. */
  const emails = [...new Set(rows.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean))];
  const phones = new Map<string, string>();
  if (emails.length) {
    const found = await q<{ email: string; phone: string | null }>(
      `SELECT email, phone FROM (
         SELECT LOWER(email) AS email, NULLIF(TRIM(data->>'mobile'), '') AS phone, 1 AS pick, updated_at AS at FROM os_tenant_passports WHERE LOWER(email) = ANY($1)
         UNION ALL
         SELECT LOWER(email), NULLIF(TRIM(phone), ''), 2, received_at FROM os_leads WHERE LOWER(email) = ANY($1)
       ) x WHERE phone IS NOT NULL ORDER BY pick, at DESC NULLS LAST`,
      [emails]
    ).catch(() => []);
    for (const f of found) if (!phones.has(f.email) && f.phone) phones.set(f.email, f.phone);
  }
  for (const r of rows) {
    const email = (r.email ?? "").trim().toLowerCase();
    /* Somebody made the REX application by hand: that one is the file. */
    const twin = rexApps.some(
      (a) => String(a.listingId ?? "") === String(r.listing_id) && a.status !== "unsuccessful" && a.applicants.some((p) => email && (p.email ?? "").toLowerCase() === email)
    );
    if (twin) continue;
    const listing = await listingRow(String(r.listing_id));
    const agents = [listing?.listing_agent_1, listing?.listing_agent_2].map((x) => {
      const v = (x as Row | null)?.id;
      return v == null ? null : String(v);
    });
    if (rexUserId && !agents.includes(String(rexUserId))) continue;
    const p = r.payload ?? {};
    const images = (((listing?.related as Row | null)?.listing_images ?? []) as Row[]).map((i) => str(i.url)).filter(Boolean);
    const shaped = shapeApplication({
      id: `os:${r.id}`,
      application_status: { id: "accepted", text: "Accepted" },
      listing: { ...(listing ?? {}), id: Number(r.listing_id), listing_primary_image: (listing?.listing_primary_image as Row | null) ?? (images[0] ? { url: images[0] } : null) },
      agent: (listing?.listing_agent_1 as Row | null) ?? null,
      offer_amount: typeof p.amount === "number" ? p.amount : null,
      start_date: p.moveIn ?? null,
      num_of_occupants: (p.adults ?? 0) + (p.children ?? 0) || null,
      num_of_dependents: p.children ?? null,
      has_pets: typeof p.pets === "boolean" ? p.pets : null,
      date_received: new Date(r.created_at).toISOString().slice(0, 10),
      date_accepted: new Date(r.decided_at).toISOString().slice(0, 10),
      system_ctime: Math.floor(new Date(r.decided_at).getTime() / 1000),
      system_modtime: Math.floor(new Date(r.decided_at).getTime() / 1000),
      system_created_user: { name: p.recordedBy?.name ?? r.by_name ?? null },
    });
    /* EVERY ADULT IS AN APPLICANT (James, 14 Oct 2026). The lead from the
       offer; the others from their own parts, or from the offer link where
       the lead typed everyone in. So each of them reaches the deal in
       Propoly with their email, as the push needs (lib/deal-handoff). */
    const pp = (p.passport ?? {}) as Record<string, unknown>;
    const b = (v: unknown) => (typeof v === "boolean" ? v : null);
    const formLead = (p.applicants ?? []).find((a) => a.isPrimary) ?? null;
    const formOthers = (p.applicants ?? []).filter((a) => !a.isPrimary && a.name);
    const income = Number(String(pp.annualIncome ?? "").replace(/[£,\s]/g, "")) || null;
    const lead: Applicant = {
      id: null, contactId: null, name: r.name || r.email || "Tenant", email: r.email, phone: formLead?.phone || (typeof pp.mobile === "string" ? pp.mobile : null) || phones.get(email) || null, isPrimary: true,
      dob: formLead?.dob || null, incomePerYear: formLead?.income || income, employmentRex: null, guarantorCount: 0,
      keyInfo: formLead
        ? { employment: formLead.employment || null, job: formLead.job || null, company: formLead.company || null, position: formLead.position || null, zeroHours: b(formLead.zeroHours), inProbation: b(formLead.inProbation), salary: formLead.income || null, rightToRent: b(formLead.rightToRent), landlordRef: b(formLead.landlordRef), guarantor: b(formLead.guarantor), adverseCredit: b(formLead.adverseCredit), adverseCreditNote: formLead.adverseCreditNote || null }
        : pp.applicantType || pp.hasBritishPassport != null
          ? { employment: (pp.applicantType as string) || null, job: null, company: null, position: null, zeroHours: b(pp.zeroHours), inProbation: b(pp.onProbation), salary: income, rightToRent: pp.hasBritishPassport === true || Boolean(pp.shareCode) ? true : b(pp.hasBritishPassport), landlordRef: b(pp.landlordRef), guarantor: b(pp.guarantor), adverseCredit: b(pp.adverseCredit), adverseCreditNote: (pp.adverseCreditNote as string) || null }
          : null,
    };
    const fromForm: Applicant[] = formOthers.map((a) => ({
      id: null, contactId: null, name: a.name!, email: a.email || null, phone: a.phone || null, isPrimary: false, dob: a.dob || null, incomePerYear: a.income || null, employmentRex: null, guarantorCount: 0,
      keyInfo: { employment: a.employment || null, job: a.job || null, company: a.company || null, position: a.position || null, zeroHours: b(a.zeroHours), inProbation: b(a.inProbation), salary: a.income || null, rightToRent: b(a.rightToRent), landlordRef: b(a.landlordRef), guarantor: b(a.guarantor), adverseCredit: b(a.adverseCredit), adverseCreditNote: a.adverseCreditNote || null },
    }));
    const fromParts: Applicant[] = (parts.get(r.id) ?? []).map((m: import("@/lib/offer-people").OfferPerson) => {
      const a = m.answers;
      const inc = Number(a.annualIncome) || null;
      return {
        id: null, contactId: null, name: m.name, email: a.email || null, phone: a.mobile || null, isPrimary: false, dob: a.dob || null, incomePerYear: inc, employmentRex: null, guarantorCount: 0,
        keyInfo: m.filled
          ? { employment: a.applicantType || null, job: a.job || null, company: a.employer || null, position: null, zeroHours: a.zeroHours, inProbation: a.onProbation, salary: inc, rightToRent: a.hasBritishPassport === true || Boolean(a.shareCode) ? true : a.hasBritishPassport, landlordRef: a.landlordRef, guarantor: a.guarantor, adverseCredit: a.adverseCredit, adverseCreditNote: a.adverseCreditNote || null }
          : null,
      };
    });
    const applicants = [lead, ...fromForm, ...fromParts];
    const named = new Set(applicants.map((a) => a.name.trim().toLowerCase()));
    /* Anybody named on the offer with no part of their own yet. */
    const others = (p.movingIn ?? []).filter((n) => n && !named.has(n.trim().toLowerCase()) && !/^child/i.test(n));
    const waiting = fromParts.filter((a) => !a.keyInfo).map((a) => a.name);
    out.push({
      ...shaped,
      /* No address on a listing REX would not read: the offer's own. */
      property: listing ? shaped.property : (r.address ?? "").split(",")[0] || shaped.property,
      locality: listing ? shaped.locality : (r.address ?? "").split(",").slice(1).join(",").trim() || shaped.locality,
      conditions: [others.length ? `Also moving in: ${others.join(", ")}.` : "", waiting.length ? `Still to fill in their part: ${waiting.join(", ")}.` : ""].filter(Boolean).join(" ") || null,
      osDecision: null,
      applicants,
      rightToRentIncomplete: !isScottish(shaped.locality, r.address) && (others.length > 0 || applicants.some((a) => a.keyInfo?.rightToRent !== true)),
    });
  }
  return out;
}

/** The book changed in the OS (an offer decided, a swap made): the minute's
 *  held pull is out of date, so the next read is fresh. */
export function forgetApplications(): void {
  appsCache.clear();
  /* A pull asked before the change is not handed to anyone after it. */
  appsInFlight.clear();
}

/** An application made in the OS - an offer accepted here, or a tenant swap. */
export function isOsApplication(id: string): boolean {
  return id.startsWith("os:") || id.startsWith("swap:");
}

/* ── TENANT SWAPS ARE APPLICATIONS TOO (12 Oct 2026, lib/tenant-swaps) ───── */
const surnameKey = (n: string) => { const w = n.toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/); return `${w[0] ?? ""} ${w[w.length - 1] ?? ""}`; };
async function nameOfRexUser(rexUserId: string): Promise<string | null> {
  const rows = await q<{ name: string | null }>(`SELECT name FROM os_users WHERE rex_user_id = $1 LIMIT 1`, [rexUserId]).catch(() => []);
  return rows[0]?.name ?? null;
}
async function swapApplications(rexUserId: string | null): Promise<Application[]> {
  if (!hasDb()) return [];
  const { openSwaps, CHANGE_LABEL } = await import("@/lib/tenant-swaps");
  /* What the let is, in one line (19 Oct 2026: add someone, re-reference). */
  const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(", ");
  const changeLine = (sw: Awaited<ReturnType<typeof openSwaps>>[number]) =>
    sw.kind === "add" ? `Tenant added: ${names(sw.joining)} joining ${names(sw.staying)}.${sw.rereference.length ? ` ${sw.rereference.join(", ")} referenced again.` : ""}`
    : sw.kind === "rereference" ? `Re-reference: ${sw.rereference.join(", ")} referenced again for a new contract.`
    : `Tenant swap: ${names(sw.leaving)} out, ${names(sw.joining)} in.${sw.rereference.length ? ` ${sw.rereference.join(", ")} referenced again.` : ""}`;
  const out: Application[] = [];
  for (const sw of await openSwaps()) {
    /* A REX PM home has no REX listing ("pm-link-<property id>"). */
    const listing = /^\d+$/.test(sw.listingId) ? await listingRow(sw.listingId) : null;
    const rexPropertyId = sw.listingId.startsWith("pm-link-") ? sw.listingId.slice(8) : null;
    const osHome = rexPropertyId
      ? (await q<{ name: string; postcode: string | null; service_level: string | null; agent_name: string | null }>(`SELECT name, postcode, service_level, agent_name FROM os_properties WHERE rex_property_id = $1 ORDER BY active DESC LIMIT 1`, [rexPropertyId]).catch(() => []))[0] ?? null
      : null;
    const agents = [listing?.listing_agent_1, listing?.listing_agent_2].map((x) => {
      const v = (x as Row | null)?.id;
      return v == null ? null : String(v);
    });
    /* A REX PM home has no listing agent to scope by: the agent named on it
       or whoever made the swap sees it, and the office. */
    if (rexUserId && listing && !agents.includes(String(rexUserId))) continue;
    if (rexUserId && !listing) {
      const me = await nameOfRexUser(rexUserId);
      const same = (a: string | null | undefined) => Boolean(me && a && surnameKey(a) === surnameKey(me));
      if (!same(osHome?.agent_name) && !same(sw.by)) continue;
    }
    const at = Math.floor(new Date(sw.at).getTime() / 1000);
    const postcode = (sw.property.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i)?.[0] ?? osHome?.postcode ?? "").trim().toUpperCase();
    const line1 = osHome?.name ?? sw.property.split(",")[0];
    const shaped = shapeApplication({
      id: `swap:${sw.id}`,
      application_status: { id: "accepted", text: "Tenant swap" },
      listing: listing ? { ...listing, id: Number(sw.listingId) } : {},
      agent: (listing?.listing_agent_1 as Row | null) ?? null,
      offer_amount: sw.rentPcm,
      start_date: sw.moveIn,
      num_of_occupants: sw.staying.length + sw.joining.length,
      date_received: sw.at.slice(0, 10),
      date_accepted: sw.at.slice(0, 10),
      system_ctime: at,
      system_modtime: at,
      system_created_user: { name: sw.by },
    });
    const person = (x: { name: string; email: string | null; phone: string | null; contactId?: string | null }, isPrimary: boolean): Applicant => ({
      id: null, contactId: x.contactId ?? null, name: x.name, email: x.email, phone: x.phone, isPrimary, dob: null, incomePerYear: null, employmentRex: null, guarantorCount: 0, keyInfo: null,
    });
    out.push({
      ...shaped,
      property: listing ? shaped.property : sw.property.split(",")[0],
      agent: listing ? shaped.agent : sw.by,
      statusLabel: CHANGE_LABEL[sw.kind],
      conditions: [changeLine(sw), sw.rentPortion != null ? `Their portion of the rent: £${sw.rentPortion.toLocaleString("en-GB")} a month.` : "", sw.note].filter(Boolean).join(" "),
      osDecision: null,
      applicants: [...sw.joining.map((x, i) => person(x, i === 0)), ...sw.staying.map((x, i) => person(x, !sw.joining.length && i === 0))],
      rightToRentIncomplete: !isScottish(shaped.locality, sw.property),
      locality: listing ? shaped.locality : sw.property.split(",").slice(1).join(",").trim() || shaped.locality,
      swap: {
        kind: sw.kind,
        rereference: sw.rereference,
        leaving: sw.leaving.map((x) => x.name),
        staying: sw.staying.map((x) => x.name),
        joining: sw.joining.map((x) => x.name),
        rentPortion: sw.rentPortion,
        home: { line1, postcode, agentEmail: sw.byEmail, managed: listing ? true : (osHome?.service_level ?? "managed") === "managed" },
        homeRef: sw.listingId,
        rexPropertyId: rexPropertyId ?? ((listing?.property as Row | null)?.id != null ? String((listing!.property as Row).id) : null),
      },
    });
  }
  return out;
}

/** Every application matching some criteria: the first page says how many,
 *  the rest are asked for side by side. Refuses if any page is refused, so a
 *  half-read never passes for the whole book. */
async function allApplications(criteria: Record<string, unknown>[]): Promise<Application[]> {
  const page = async (offset: number) => {
    const res = await rexCall("TenancyApplications", "search", {
      criteria,
      limit: 100,
      offset,
      order_by: { system_ctime: "desc" },
    });
    if (!res.ok) throw new Error(res.error ?? "REX wouldn't answer.");
    return res.result as { rows?: Row[]; total?: number } | Row[];
  };
  /* Six pages at once: the open book was under 500 on 1 Oct 2026, and asking
     for the first page to learn the total, then the rest, was two REX round
     trips back to back (about five seconds). A page past the end comes back
     empty. If the sixth is full there is more, so it carries on, side by side
     again, up to 2,000. */
  const BATCH = 6;
  const pages: Awaited<ReturnType<typeof page>>[] = [];
  for (let start = 0; start < 2000; start += BATCH * 100) {
    const got = await Promise.all(Array.from({ length: BATCH }, (_, i) => page(start + i * 100)));
    pages.push(...got);
    if (rexRows(got[BATCH - 1]).length < 100) break;
  }
  return pages.flatMap((r) => rexRows(r)).map(shapeApplication);
}

/**
 * One application, by its id.
 *
 * The journey behind a file needs exactly one, and it was finding it by
 * pulling three hundred - three round trips and four to six seconds, to throw
 * 299 away (14 Sep 2026). REX will filter on the id, so this asks for the one.
 *
 * If REX will not answer that way it falls back to the walk, which is what
 * the caller did before, so the worst case is today's behaviour rather than
 * an empty screen.
 */
export async function getApplicationById(id: string): Promise<Application | null> {
  if (isOsApplication(id)) return (await getApplications(300)).find((a) => a.id === id) ?? null;
  const fresh = Date.now() - APPS_TTL_MS;
  for (const [, v] of appsCache) {
    if (v.at > fresh) {
      const hit = v.apps.find((a) => a.id === id);
      if (hit) return hit;
    }
  }

  const res = await rexCall("TenancyApplications", "search", {
    criteria: [{ name: "id", type: "=", value: id }],
    limit: 1,
  }).catch(() => null);
  const rows = res?.ok ? rexRows(res.result) : [];
  if (rows.length) {
    const one = applyLead(shapeApplication(rows[0]), await leadOverrides().catch(() => new Map<string, string>()));
    await applyAgreedRent([one]).catch(() => null);
    return one;
  }

  /* REX would not filter on the id. Do it the long way rather than tell an
     agent the file does not exist. */
  return (await getApplications(300)).find((a) => a.id === id) ?? null;
}

/* ── making one ───────────────────────────────────────────────────────────── */

export interface NewApplicant {
  name: string;
  email: string;
  phone: string;
  dob: string;
  isPrimary: boolean;
  employment: Employment;
  job?: string;
  company?: string;
  position?: string;
  zeroHours?: boolean;
  inProbation?: boolean;
  /** Annual, in pounds. */
  income: number;
  rightToRent: boolean;
  landlordRef: boolean;
  guarantor: boolean;
  adverseCredit: boolean;
  adverseCreditNote?: string;
}

export interface NewApplication {
  listingId: number;
  offerAmount: number;
  startDate: string;
  agreementMonths: number;
  occupants: number;
  dependents: number;
  hasPets: boolean;
  conditions?: string;
  applicants: NewApplicant[];
}

/** Every reason this application cannot be filed. Empty means it can. */
export function validateApplication(a: NewApplication, askingRent: number | null): string[] {
  const errs: string[] = [];
  if (!a.listingId) errs.push("No property — an application has to be against a listing.");
  if (!a.applicants.length) errs.push("No applicants.");
  if (a.applicants.filter((x) => x.isPrimary).length !== 1) {
    errs.push("Exactly one applicant must be the lead.");
  }
  a.applicants.forEach((p, i) => {
    const who = p.name?.trim() || `Applicant ${i + 1}`;
    if (!p.name?.trim()) errs.push(`Applicant ${i + 1} has no name.`);
    if (!p.email?.trim()) errs.push(`${who} has no email address.`);
    if (!p.dob) errs.push(`${who} has no date of birth.`);
    // The gap this whole task exists to close: asked of EVERY adult, not just
    // the lead. A statutory check is not a lead-applicant question.
    if (p.rightToRent !== true) {
      errs.push(`${who} hasn't confirmed their right to rent in the UK.`);
    }
  });
  if (!(a.offerAmount > 0)) errs.push("No offer amount.");
  // Howard's form has a price indicator and no rule. Rent is not an auction.
  if (askingRent != null && a.offerAmount > askingRent) {
    errs.push(`The advertised rent is £${askingRent.toLocaleString("en-GB")} — an offer can't be above it.`);
  }
  if (!a.startDate) errs.push("No move-in date.");
  return errs;
}

/**
 * The REX create payload.
 *
 * Applicants go in as nested `related.listing_application_tenants` — the proven
 * write shape for this API, where a nested `related` block on create/update IS
 * the way to write sub-records. The prose line goes into `notes` as well, in
 * the flow's exact format, so the note history stays readable in one style;
 * the structured answers are the copy that matters.
 */
export function buildCreatePayload(a: NewApplication): Record<string, unknown> {
  const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  const keyInfo: KeyInfo = {
    employment: lead.employment,
    job: lead.job ?? null,
    company: lead.company ?? null,
    position: lead.position ?? null,
    zeroHours: lead.zeroHours ?? null,
    inProbation: lead.inProbation ?? null,
    salary: lead.income || null,
    rightToRent: lead.rightToRent,
    landlordRef: lead.landlordRef,
    guarantor: lead.guarantor,
    adverseCredit: lead.adverseCredit,
    adverseCreditNote: lead.adverseCreditNote ?? null,
  };

  // Joint applicants get their own line. The flow never wrote these, which is
  // why 265 people have no recorded Right to Rent — we write all of them.
  const others = a.applicants
    .filter((p) => p !== lead)
    .map(
      (p) =>
        `ALSO — ${p.name} (${p.employment}) | Salary: £ ${p.income.toLocaleString("en-GB")} p/year | ` +
        `Right to rent: ${p.rightToRent ? "Yes" : "No"} | LL ref (2y): ${p.landlordRef ? "Yes" : "No"} | ` +
        `Guarantor: ${p.guarantor ? "Yes" : "No"} | Poor credit: ${p.adverseCredit ? "Yes" : "No"}`
    );

  return {
    listing_id: a.listingId,
    application_status_id: "received",
    offer_amount: a.offerAmount,
    offer_amount_period_id: "month",
    date_received: londonToday(),
    start_date: a.startDate,
    agreement_length_months: a.agreementMonths,
    num_of_occupants: a.occupants,
    num_of_dependents: a.dependents,
    num_of_households: 1,
    has_pets: a.hasPets,
    conditions: a.conditions || null,
    notes: ["Tenant key info:", formatKeyInfo(lead.name, keyInfo), ...others].join("\n"),
    related: {
      listing_application_tenants: a.applicants.map((p) => ({
        is_primary: p.isPrimary,
        dob: p.dob,
        net_income: p.income,
        net_income_period_id: "year",
        employment_status_id: EMPLOYMENT_TO_REX[p.employment].id,
        contact: {
          name: p.name,
          email_address: p.email,
          phone_number: p.phone,
        },
      })),
    },
  };
}

/**
 * File it, AS SOMEBODY.
 *
 * Refused by the REX write lock until this exact method is unlocked — creating
 * a real application in the team's live system is not a thing to discover
 * working by accident.
 *
 * ── The actor token is not optional, and this is why ──────────────────────
 *
 * This called rexCall with no token, so it fell back to the office service
 * account. That is precisely how the first listing write on 29 Aug came to be
 * recorded against "System User": REX's audit trail then says the office did
 * it, and the person who actually did it is unrecoverable.
 *
 * lib/rex-contacts refuses on the same grounds and has done since it was
 * written. This now matches it rather than being the one write that quietly
 * does not care who is asking — and it refuses BEFORE building a payload, so
 * nothing is half-done.
 */
export async function createApplication(a: NewApplication, actorToken: string | null) {
  if (!actorToken) {
    throw new Error(
      "No REX sign-in held for you, so this application would be filed under the office account " +
        "rather than your name. Link your REX account on Profile, then try again."
    );
  }
  const res = await rexCall(
    "TenancyApplications",
    "create",
    { data: buildCreatePayload(a), return_id: true },
    actorToken
  );
  if (!res.ok) throw new Error(res.error ?? "REX refused the application.");
  /* The book has changed, so the minute's grace is over: an agent who has
     just filed one must see it on the list they land back on. */
  appsCache.clear();
  return res.result;
}

/**
 * Why an application REX still calls open is not open any more.
 *
 * REX never closes an application by itself. The tenant moves in, or the home
 * goes to somebody else, and the application sits on "Accepted" or
 * "Communicated" for ever. On 18 Sep 2026 that made the board say 162 open
 * against 67 homes available: 52 had already moved in, 41 were on homes let
 * to someone else or withdrawn. About 63 were real.
 *
 * Three reasons, each read off live data, nothing written back to REX:
 *   - accepted, and the move-in date has come      → "Moved in"
 *   - not accepted, and the home is now let        → "Home let"
 *   - not accepted, and the listing was withdrawn  → "Listing withdrawn"
 *
 * An accepted one on a let home with move-in still ahead stays open - that
 * is the let going through, which is exactly what the board is for.
 *
 * One Listings search per hundred listings, filtered AT REX to the let and
 * withdrawn ones. If REX will not answer, the listing checks are skipped and
 * only "Moved in" applies - a board that over-counts is better than none.
 */
/* Which listings are let or withdrawn, remembered for a minute and asked for
   side by side (19 Sep 2026). This ran on EVERY load of the board and of the
   dashboard tile, one REX call after another - six to eight seconds each time,
   with the applications themselves already held. Whether a home has been let
   does not change inside a minute, which is the rule the applications keep. */
const LISTING_STATE_TTL_MS = 60_000;
const listingStateCache = new Map<number, { at: number; state: string | null }>();

async function listingStates(ids: number[]): Promise<Map<number, string>> {
  const now = Date.now();
  const out = new Map<number, string>();
  const ask: number[] = [];
  for (const id of ids) {
    const hit = listingStateCache.get(id);
    if (hit && now - hit.at < LISTING_STATE_TTL_MS) {
      if (hit.state) out.set(id, hit.state);
    } else ask.push(id);
  }
  const chunks: number[][] = [];
  for (let i = 0; i < ask.length; i += 100) chunks.push(ask.slice(i, i + 100));
  await Promise.all(
    chunks.map(async (chunk) => {
      const res = await rexCall("Listings", "search", {
        criteria: [
          { name: "id", type: "in", value: chunk },
          { name: "system_listing_state", type: "in", value: ["leased", "withdrawn"] },
        ],
        limit: 100,
      }).catch(() => null);
      /* Not answered is not remembered: the next load asks again. */
      if (!res?.ok) return;
      const found = new Map<number, string>();
      for (const r of rexRows(res.result)) found.set(Number(r.id), String(r.system_listing_state));
      for (const id of chunk) {
        const st = found.get(id) ?? null;
        listingStateCache.set(id, { at: now, state: st });
        if (st) out.set(id, st);
      }
    })
  );
  if (listingStateCache.size > 5_000) {
    for (const [k, v] of listingStateCache) if (now - v.at >= LISTING_STATE_TTL_MS) listingStateCache.delete(k);
  }
  return out;
}

/** Applications with a PLC pack that is not finished and was worked on in the last fortnight. */
async function openPlcPacks(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ application_ref: string }>(
    `SELECT application_ref FROM os_plc_cases
      WHERE state NOT IN ('approved', 'declined') AND updated_at > NOW() - INTERVAL '14 days'`
  ).catch(() => []);
  return new Set(rows.map((r) => String(r.application_ref)));
}

/** Lets the agent cancelled from their page (lib/let-cancel, 12 Oct 2026). */
async function cancelledRefs(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ ref: string }>(`SELECT ref FROM os_let_cancellations`).catch(() => []);
  return new Set(rows.map((r) => String(r.ref)));
}

export async function closedReasons(apps: Application[]): Promise<Map<string, string>> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  /* A pack left half-done long after the move-in is abandoned, not live. */
  const monthAgo = new Date(Date.now() - 30 * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const ids = [...new Set(apps.map((a) => a.listingId).filter((x): x is number => x != null))];
  const [state, packOpen, cancelled, intro] = await Promise.all([listingStates(ids), openPlcPacks(), cancelledRefs(), introOnlyIds().catch(() => new Set<string>())]);

  const out = new Map<string, string>();
  for (const a of apps) {
    if (a.status === "unsuccessful") continue;
    /* Cancelled by the agent from the let's page (lib/let-cancel). */
    if (cancelled.has(String(a.id))) {
      out.set(a.id, "Deal cancelled");
      continue;
    }
    const s = a.listingId != null ? state.get(a.listingId) : undefined;
    /* Intro only (lib/intro-only): agreed is the end of it. Nothing more
       happens here, so it leaves the lets in progress. */
    const agreed = a.status === "accepted" || a.osDecision?.decision === "accepted";
    if (agreed && !a.swap && a.listingId != null && intro.has(String(a.listingId))) {
      out.set(a.id, "Marketing only - done");
      continue;
    }
    /* Accepted here and not yet in REX (22 Oct 2026): REX having the home as
       let is THIS tenant's let, not "Home let" to someone else - 12b Cliff
       Road and 7 Caernarvon Close were both in Closed that way. Moved in
       once the home is let and the move-in has come; until REX has it let,
       a start date gone by is only the date the tenant first asked for. */
    const hereOnly = a.status !== "accepted" && a.osDecision?.decision === "accepted";
    if (a.status === "accepted" || (hereOnly && s === "leased")) {
      /* Not while its PLC check is still going (6 Oct 2026): REX's start
         date passing does not move anybody in, and Rhiannon's Room 2 vanished
         from the board on the 5th with the pack still being put together. */
      const start = a.startDate?.slice(0, 10) ?? null;
      const checking = packOpen.has(String(a.id)) && start != null && start >= monthAgo;
      if (start && start <= today && !checking) out.set(a.id, "Moved in");
    } else if (hereOnly) continue;
    else if (s === "leased") out.set(a.id, "Home let");
    else if (s === "withdrawn") out.set(a.id, "Listing withdrawn");
  }
  return out;
}
