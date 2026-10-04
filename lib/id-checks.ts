import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * RIGHT TO RENT CHECKS, KEPT BY THE OS (4 Oct 2026, tracker s11).
 *
 * Susan, 14 Sep 2026: referencing and ID still run through Propoly, and when
 * Propoly goes the OS has to do it. The phone already photographs the
 * document at a viewing (app/api/m/id-check); what was missing:
 *
 *   - the office could not open a single one of those photos (the route the
 *     table's note promised was never built);
 *   - nothing recorded how long the person may rent for, so nothing knew a
 *     follow-up check was owed;
 *   - a share code - the online check, for anybody without a British or Irish
 *     passport - had nowhere to go but "send them to the office".
 *
 * So each check now carries HOW it was made (the document seen, or a share
 * code checked on GOV.UK), and HOW LONG the right lasts: no time limit, or
 * until a date. A time-limited right is owed a follow-up check, and the date
 * is worked out here, once.
 *
 * ── The follow-up date ────────────────────────────────────────────────────
 *
 * The Home Office's rule for a time-limited right to rent: check again before
 * the LATER of the end of their permission, or twelve months after the first
 * check. Doing it by then keeps the landlord's statutory excuse.
 *
 * ── Never automated ──────────────────────────────────────────────────────
 *
 * The GOV.UK checker is a person's job: they type the share code and date of
 * birth in their own browser, look at the photo, and save the result page.
 * The OS opens the page and keeps what they saved. The date of birth is not
 * stored - it is only needed at the moment of checking.
 */

export const ID_DOC_LABEL: Record<string, string> = {
  passport: "Passport",
  card: "ID card or permit",
  other: "Other document",
  share_code: "Share code (online check)",
};

export const SHARE_CODE_CHECKER = "https://www.gov.uk/view-right-to-rent";

/** A share code: nine letters and numbers, often written in threes. */
export const cleanShareCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isShareCode = (v: string) => /^[A-Z0-9]{9}$/.test(cleanShareCode(v));

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** When the follow-up check is owed, or null for a right with no time limit. */
export function followUpFor(rightUntil: string | null, checkedOn: Date = new Date()): string | null {
  if (!rightUntil || !/^\d{4}-\d{2}-\d{2}$/.test(rightUntil)) return null;
  const yearOn = new Date(checkedOn);
  yearOn.setUTCFullYear(yearOn.getUTCFullYear() + 1);
  const twelve = ymd(yearOn);
  return rightUntil > twelve ? rightUntil : twelve;
}

export interface IdCheck {
  id: string;
  name: string;
  property: string;
  method: "document" | "share_code";
  docType: string;
  pages: number;
  by: string;
  at: string;
  seenInPerson: boolean;
  likeness: boolean;
  /** YYYY-MM-DD; null with noTimeLimit false means nobody said. */
  rightUntil: string | null;
  noTimeLimit: boolean;
  followUpOn: string | null;
  /** The last four of the share code only: the whole code is on the result file. */
  shareCodeEnd: string | null;
  leadId: string | null;
  hasFile: boolean;
}

type Row = {
  id: string; person_name: string; property: string; method: string | null; doc_type: string; pages: number;
  checked_by_name: string; checked_at: Date; seen_in_person: boolean; likeness: boolean;
  right_until: Date | string | null; no_time_limit: boolean | null; follow_up_on: Date | string | null;
  share_code: string | null; lead_id: string | null; file_key: string | null;
};

/* A DATE column comes back as local midnight, so it is read in local parts:
   through toISOString a summer date in London lands a day early. */
const day = (v: Date | string | null) =>
  v ? (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v).slice(0, 10)) : null;

const shape = (r: Row): IdCheck => ({
  id: r.id,
  name: r.person_name,
  property: r.property,
  method: r.method === "share_code" ? "share_code" : "document",
  docType: ID_DOC_LABEL[r.method === "share_code" ? "share_code" : r.doc_type] ?? r.doc_type,
  pages: r.pages,
  by: r.checked_by_name,
  at: new Date(r.checked_at).toISOString(),
  seenInPerson: r.seen_in_person,
  likeness: r.likeness,
  rightUntil: day(r.right_until),
  noTimeLimit: Boolean(r.no_time_limit),
  followUpOn: day(r.follow_up_on),
  shareCodeEnd: r.share_code ? r.share_code.slice(-4) : null,
  leadId: r.lead_id,
  hasFile: Boolean(r.file_key),
});

/** Every check, newest first, for the office. A name narrows it. */
export async function listIdChecks(opts: { search?: string; limit?: number } = {}): Promise<IdCheck[]> {
  if (!hasDb()) return [];
  const term = (opts.search ?? "").trim();
  const rows = await q<Row>(
    `SELECT id, person_name, property, method, doc_type, pages, checked_by_name, checked_at, seen_in_person, likeness,
            right_until, no_time_limit, follow_up_on, share_code, lead_id, file_key
       FROM os_id_checks
      WHERE ($1 = '' OR person_name ILIKE '%' || $1 || '%' OR property ILIKE '%' || $1 || '%')
      ORDER BY checked_at DESC
      LIMIT $2`,
    [term, Math.min(500, opts.limit ?? 200)]
  );
  return rows.map(shape);
}

/** Time-limited rights whose follow-up check falls within `days` (or has passed), soonest first. */
export async function followUpsDue(days = 28): Promise<IdCheck[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT id, person_name, property, method, doc_type, pages, checked_by_name, checked_at, seen_in_person, likeness,
            right_until, no_time_limit, follow_up_on, share_code, lead_id, file_key
       FROM os_id_checks c
      WHERE follow_up_on IS NOT NULL
        AND follow_up_on <= (NOW() AT TIME ZONE 'Europe/London')::date + $1::int
        /* A newer check on the same person replaces this one's follow-up. */
        AND NOT EXISTS (SELECT 1 FROM os_id_checks n WHERE lower(n.person_name) = lower(c.person_name) AND n.checked_at > c.checked_at)
      ORDER BY follow_up_on`,
    [days]
  ).catch(() => [] as Row[]);
  return rows.map(shape);
}

/** The stored file's key and type, for the office's own viewer. */
export async function idCheckFile(id: string): Promise<{ key: string; type: string; name: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ file_key: string; file_type: string; person_name: string }>(`SELECT file_key, file_type, person_name FROM os_id_checks WHERE id = $1`, [id]);
  const r = rows[0];
  return r?.file_key ? { key: r.file_key, type: r.file_type, name: r.person_name } : null;
}
