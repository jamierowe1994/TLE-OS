import "server-only";
import { hasDb, q } from "@/lib/db";
import { pounds, type WorksOrder } from "@/lib/works-orders";

/**
 * How much a landlord wants to hear about the jobs on their homes.
 *
 * James, 6 Oct 2026, to the team: "you want control over the process, but
 * you also want it to be automatic... other landlords might say 'why the
 * hell are you emailing me?'" - and a landlord who only wants to hear about
 * jobs over £250. Kirstie: the landlord-builder who does the work himself.
 *
 *   all    every job email, as it always was. No row means this.
 *   over   only when the job is over their figure, in pounds
 *   none   no job emails - we ring them
 *
 * Only the LANDLORD's emails. The tenant and the contractor are told exactly
 * as before, whatever the landlord chose.
 *
 * And an approval is not a notice: a quote over their authority needs their
 * yes, so a landlord who is not to be emailed is not silently skipped - the
 * job stays Awaiting landlord, the timeline says ring them, and the agent
 * gets a reminder to (lib/reminders, works_ring_for_approval).
 */

export const JOB_EMAILS = ["all", "over", "none"] as const;
export type JobEmails = (typeof JOB_EMAILS)[number];
export const DEFAULT_OVER_AMOUNT = 250;

export interface LandlordPref {
  jobEmails: JobEmails;
  /** Pounds. Only read when jobEmails is "over". */
  overAmount: number;
  updatedBy: string;
  updatedAt: string | null;
}

const DEFAULT: LandlordPref = { jobEmails: "all", overAmount: DEFAULT_OVER_AMOUNT, updatedBy: "", updatedAt: null };

export const landlordKey = (email: string) => email.trim().toLowerCase();

type Row = { landlord_key: string; job_emails: string; over_amount: number; updated_by: string; updated_at: Date | null };

const toPref = (r: Row | undefined): LandlordPref =>
  r
    ? {
        jobEmails: (JOB_EMAILS as readonly string[]).includes(r.job_emails) ? (r.job_emails as JobEmails) : "all",
        overAmount: Number(r.over_amount) || DEFAULT_OVER_AMOUNT,
        updatedBy: r.updated_by ?? "",
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      }
    : { ...DEFAULT };

export async function getLandlordPref(email: string): Promise<LandlordPref> {
  const key = landlordKey(email);
  if (!hasDb() || !key.includes("@")) return { ...DEFAULT };
  const [r] = await q<Row>(`SELECT landlord_key, job_emails, over_amount, updated_by, updated_at FROM os_landlord_prefs WHERE landlord_key = $1`, [key]);
  return toPref(r);
}

/** Several at once, for the board. Only the landlords who chose something other than every job. */
export async function landlordPrefsFor(emails: string[]): Promise<Map<string, LandlordPref>> {
  const keys = [...new Set(emails.map(landlordKey).filter((k) => k.includes("@")))];
  const out = new Map<string, LandlordPref>();
  if (!hasDb() || !keys.length) return out;
  const rows = await q<Row>(
    `SELECT landlord_key, job_emails, over_amount, updated_by, updated_at FROM os_landlord_prefs WHERE landlord_key = ANY($1::text[]) AND job_emails <> 'all'`,
    [keys]
  );
  for (const r of rows) out.set(r.landlord_key, toPref(r));
  return out;
}

export async function setLandlordPref(email: string, input: { jobEmails: JobEmails; overAmount?: number; name?: string }, by: string): Promise<LandlordPref> {
  const key = landlordKey(email);
  if (!key.includes("@")) throw new Error("No email address for this landlord, so there is nothing to choose.");
  if (!JOB_EMAILS.includes(input.jobEmails)) throw new Error("Every job, only over a figure, or none.");
  const over = Math.round(Number(input.overAmount ?? DEFAULT_OVER_AMOUNT));
  if (!Number.isFinite(over) || over < 1 || over > 100000) throw new Error("The figure needs to be a whole number of pounds.");
  const [r] = await q<Row>(
    `INSERT INTO os_landlord_prefs (landlord_key, landlord_name, job_emails, over_amount, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (landlord_key) DO UPDATE SET
       landlord_name = CASE WHEN EXCLUDED.landlord_name <> '' THEN EXCLUDED.landlord_name ELSE os_landlord_prefs.landlord_name END,
       job_emails = EXCLUDED.job_emails, over_amount = EXCLUDED.over_amount, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING landlord_key, job_emails, over_amount, updated_by, updated_at`,
    [key, (input.name ?? "").trim(), input.jobEmails, over, by]
  );
  return toPref(r);
}

/** The figure "only over £X" is measured against: the quote when there is one, else what they pre-authorised. */
export const jobPence = (o: Pick<WorksOrder, "quotePence" | "authorityPence">) => o.quotePence ?? o.authorityPence;

/**
 * Whether this landlord email may go. Null means send it; otherwise the
 * reason it was held, in words for the job's timeline.
 *
 * `approval` is the quote-over-authority email. Held, it says to ring them,
 * because the job cannot move without their answer.
 */
export function landlordHold(o: Pick<WorksOrder, "landlord" | "quotePence" | "authorityPence">, pref: LandlordPref, kind: "notice" | "approval"): string | null {
  if (pref.jobEmails === "all") return null;
  const name = (o.landlord || "").trim().split(/\s+/)[0] || "The landlord";
  const amount = jobPence(o);
  if (pref.jobEmails === "over" && amount > pref.overAmount * 100) return null;
  const why = pref.jobEmails === "none"
    ? `${name} has asked not to be emailed about jobs`
    : `${name} only wants emails about jobs over ${pounds(pref.overAmount * 100)}, and this one is ${o.quotePence == null ? `within their ${pounds(amount)} authority` : pounds(amount)}`;
  return kind === "approval" ? `${why}. Ring them for approval of ${pounds(o.quotePence)} - the job waits on their yes` : why;
}

/** Will this job's approval request be held? The board and the reminders ask, so the job says "ring them". */
export function ringsForApproval(o: Pick<WorksOrder, "landlord" | "quotePence" | "authorityPence"> & { status: string }, pref: LandlordPref | undefined): boolean {
  return o.status === "approval" && !!pref && landlordHold(o, pref, "approval") != null;
}
