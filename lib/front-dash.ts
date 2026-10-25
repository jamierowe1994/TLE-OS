/**
 * The front dashboard's figures (new look, 24 Oct 2026): the shapes the
 * route (app/api/dashboard/front) hands the page, and the few rules both sides
 * need - London days, and which chip a lead's source falls under.
 *
 * No "server-only" here: the page reads the same day keys and the same
 * source buckets as the route, so the two can never disagree about which day
 * a lead came in or which chip it sits under.
 */

/** The longest range the page offers (90 days), twice over for the change. */
export const FRONT_DAYS = 180;
export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

/** A London calendar day, "YYYY-MM-DD", for an instant. */
export function londonDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * The last `n` London days, oldest first, ending today. Counted back from
 * noon UTC on today's London date, so a clock change never skips or repeats
 * a day. Worked out from now() every time: it rolls over on its own.
 */
export function lastDays(n: number, now: Date = new Date()): string[] {
  const today = londonDay(now);
  const noon = Date.parse(`${today}T12:00:00Z`);
  const out: string[] = [];
  for (let k = n - 1; k >= 0; k--) out.push(new Date(noon - k * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/**
 * The chips over the leads chart, from the lead's own source field (lib/rex-leads
 * sourceOf). Walk-in and phone are not recorded anywhere a lead carries, so
 * there is no chip for them: they sit in Other with everything else.
 */
export const SOURCE_BUCKETS = [
  { id: "rightmove", label: "Rightmove" },
  { id: "zoopla", label: "Zoopla" },
  { id: "otm", label: "OnTheMarket" },
  { id: "website", label: "Website" },
  { id: "other", label: "Other" },
] as const;
export type SourceBucket = (typeof SOURCE_BUCKETS)[number]["id"];

export function bucketOf(source: string | null | undefined): SourceBucket {
  const s = (source ?? "").trim().toLowerCase();
  if (s.startsWith("rightmove")) return "rightmove";
  if (s.startsWith("zoopla")) return "zoopla";
  if (s.startsWith("onthemarket")) return "otm";
  if (s === "website") return "website";
  return "other";
}

/** One part of the answer: its figures, or the reason it couldn't be read. */
export type Part<T> = { ok: true; data: T } | { ok: false; error: string };

export interface FrontLeads {
  /** Per day (aligned to `days`), per source bucket: every lead received. */
  bySource: Record<SourceBucket, number[]>;
  /** Per day: tenant enquiries (lettings leads asking about a home). */
  tenant: number[];
  /** Per day: leads received that day that are still at New on the board. */
  fresh: number[];
}

export interface FrontLets {
  /** Per day: applications accepted (let agreed) that day. */
  agreed: number[];
  /** Per day: the agreed rents that day, £ pcm, summed, and how many had one. */
  rentSum: number[];
  rentN: number[];
  /** Per day, the last 90 only (zeros before): applications received. */
  applied: number[];
}

export interface FrontTerm {
  /** ISO, when they went to the landlord. Null when nobody recorded it. */
  sentAt: string | null;
  late: boolean;
  /** Which record it is: our own page, a DocuSeal contract, or an e-sign request. */
  from: "page" | "docuseal" | "esign";
}

export interface FrontTerms {
  rows: FrontTerm[];
  /** Days without a signature after which a set counts as late. */
  lateAfterDays: number;
}

/** Market appraisals, the whole office's (the Market Appraisals screen's own list). */
export interface FrontAppraisals {
  /** Per day: appraisals booked (made) that day, not cancelled or tidied away. */
  created: number[];
  /** Per day, by the day it was booked: those of them now won (instructed). */
  won: number[];
  /** Appraisals whose appointment is today, in London. */
  today: number;
}

/** The parts the route can be asked for one at a time (?parts=a,b). */
export const FRONT_PARTS = ["leads", "appraisals", "lets", "terms", "passports", "viewings"] as const;
export type FrontPart = (typeof FRONT_PARTS)[number];

export interface FrontAnswer {
  ok: true;
  /** Oldest first, FRONT_DAYS of them, the last is today in London. */
  days: string[];
  /** Whose figures: true for the whole business, false for one person's own. */
  everything: boolean;
  scopeLabel: string;
  /* Each part is here only when it was asked for (all of them by default). */
  leads?: Part<FrontLeads>;
  appraisals?: Part<FrontAppraisals>;
  lets?: Part<FrontLets>;
  terms?: Part<FrontTerms>;
  /** Per day: passports finished. */
  passports?: Part<number[]>;
  /** Per day: viewings held (in the diary, not cancelled, started by now). */
  viewings?: Part<number[]>;
}

/* ── The records behind a figure (GET /api/dashboard/front/records) ─────── */

/**
 * Which list: every figure and pipeline step has one. leads and tenant can
 * also be one day of the chart, and one source chip.
 */
export const RECORD_KINDS = ["leads", "tenant", "appraisals", "terms", "lets", "applied", "passports", "viewings"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** One record, as the drawer lists it. Never a phone number or an email. */
export interface FrontRecord {
  id: string;
  /** Who: the applicant, landlord or tenant. */
  name: string;
  /** The home it is about, as words. Blank when nothing names one. */
  property: string;
  /** Where it came from, when that is known. */
  source: string | null;
  /** ISO: when it happened (received, booked, sent, agreed, finished, held). */
  at: string | null;
  /** Where it has got to, in a few words. */
  status: string;
  /** The page that opens it. */
  href: string;
  /** Terms only: whole days since it went out, and whether that is late. */
  waiting?: number | null;
  late?: boolean;
  /** Leads only: still at New. */
  fresh?: boolean;
}

export type FrontRecords =
  | {
      ok: true;
      kind: RecordKind;
      /** The London days listed, inclusive; null for terms (now, not a range). */
      from: string | null;
      to: string | null;
      /** How many there are: always the figure the dashboard shows. */
      total: number;
      rows: FrontRecord[];
      offset: number;
      more: boolean;
      everything: boolean;
      lateAfterDays?: number;
    }
  | { ok: false; error: string };

/** Sum the last `n` entries of a series, or the `n` before those (`back` = 1). */
export function sumRange(series: number[], n: number, back = 0): number {
  const end = series.length - n * back;
  let s = 0;
  for (let i = Math.max(0, end - n); i < end; i++) s += series[i] ?? 0;
  return s;
}

/**
 * The last `n` days of a series, one point a day, for a sparkline (25 Oct 2026:
 * it used to fold 30 days into 15 two-day sums and 90 into 15 six-day sums,
 * which smoothed the peaks away and made the hover meaningless).
 */
export function sparkOf(series: number[], n: number): number[] {
  return series.slice(-n);
}
