import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Lead } from "@/lib/leads-sample";
import { searchLikes, searchMatches } from "@/lib/search-match";
import { withEnquirer } from "@/lib/lead-enquirer";
import { leadHeldBySql } from "@/lib/lead-owner";

/**
 * The lead ledger: every enquiry the OS has ever seen, kept.
 *
 * James, 7 Sep 2026: "we cannot forget anything that comes into the system
 * ... we're meant to be making REX slowly irrelevant, so we need to store the
 * data." Until now the board was a cache of REX's newest 500 leads that the
 * next scan overwrote; a lead that scrolled off the 500 was gone from the OS.
 *
 * One row per REX lead, written on every scan (the page's own and the
 * five-minute cron's), never deleted. First seen, last seen, the facts the
 * board sorts and filters on as columns, the whole board object as payload.
 * The board reads the newest rows from here, so it keeps growing past what
 * a single scan of REX can show.
 */

export interface LedgerStats {
  onFile: number;
  since: string | null;
}

export async function recordLeads(leads: Lead[]): Promise<number> {
  if (!hasDb() || !leads.length) return 0;
  const cols: unknown[][] = leads.map((l) => [
    l.id,
    l.receivedAt ?? null,
    l.source,
    l.enquiry,
    l.stage,
    l.name,
    l.email || null,
    l.phone || null,
    l.listingId != null ? String(l.listingId) : null,
    l.contactId ?? null,
    l.assigneeId ?? null,
    l.agent,
    l.address ?? null,
    JSON.stringify(l),
  ]);
  /* One statement for the lot: 500 rows a scan, every five minutes. */
  const values = cols.map((_, i) => `(${cols[0].map((__, j) => `$${i * cols[0].length + j + 1}`).join(", ")})`).join(",\n");
  await q(
    `INSERT INTO os_leads (id, received_at, source, enquiry, stage, name, email, phone, listing_id, contact_id, assignee_id, agent, address, payload)
     VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET
       stage = EXCLUDED.stage, name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
       listing_id = EXCLUDED.listing_id, contact_id = EXCLUDED.contact_id, assignee_id = EXCLUDED.assignee_id,
       agent = EXCLUDED.agent, address = EXCLUDED.address,
       /* The scan's payload wins, except for the enquiry read in full from
          REX (/api/leads/[id]/enquiry): the scan only ever sees REX's
          100-character snippet, and must not write it back over the whole
          message. jsonb_strip_nulls drops the keys a lead never had. */
       payload = EXCLUDED.payload || jsonb_strip_nulls(jsonb_build_object(
         'enquiryFull', os_leads.payload->'enquiryFull',
         'enquiryFields', os_leads.payload->'enquiryFields',
         'enquirySource', os_leads.payload->'enquirySource',
         'enquiryV', os_leads.payload->'enquiryV',
         'enquiryEmail', os_leads.payload->'enquiryEmail')),
       last_seen = NOW()`,
    cols.flat()
  );
  return leads.length;
}

/**
 * Sales valuations already on file, before the scan learned to set them aside
 * (lib/rex-leads isSalesValuation). Read from what the row holds - the
 * snippet, and the whole enquiry once somebody has opened it - so a lead
 * opened for the first time drops off the board if it turns out to be a sale.
 * The same pattern as the scan's, in Postgres's words.
 */
const NOT_SALES = `NOT (
  COALESCE(source, '') ILIKE '%getagent%'
  OR (COALESCE(enquiry, '') = 'Valuation'
      AND concat_ws(' ', payload->>'subject', payload->>'enquiryMessage', payload->>'enquiryFull', payload->>'enquiryFields')
          ~* '(enquiry type:\\s*sales|\\mfor sale\\M|\\mvendor\\M|estimated value|quoted fee)')
)`;

/**
 * Every lead on file that reads as a sale (see NOT_SALES), for the board to
 * drop whichever way it came - the scan's REX book carries only REX's short
 * snippet, which never says "sales", so the board has to ask the ledger.
 */
export async function salesLeadIds(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ id: string }>(`SELECT id FROM os_leads WHERE NOT ${NOT_SALES}`).catch(() => []);
  return new Set(rows.map((r) => r.id));
}

/**
 * The same question asked only of the ids the board is about to draw (2 Oct
 * 2026). salesLeadIds runs the regex over the whole ledger, thousands of rows,
 * on every board open; this is a primary-key lookup over five hundred.
 */
export async function salesAmong(ids: string[]): Promise<Set<string>> {
  if (!hasDb() || !ids.length) return new Set();
  const rows = await q<{ id: string }>(`SELECT id FROM os_leads WHERE id = ANY($1::text[]) AND NOT ${NOT_SALES}`, [ids]);
  return new Set(rows.map((r) => r.id));
}

/**
 * Read the whole enquiry for new valuation requests, at the scan - not when
 * somebody first opens one. Only the full message says "Enquiry type: sales"
 * (19 Sep 2026: Sunny Brar and Cheryl M Jennings sat on the board as landlord
 * leads for a day). A handful a day, twenty a run at most, READ-ONLY on REX.
 */
export async function readNewValuations(limit = 20, opts: { everyNewLead?: boolean } = {}): Promise<number> {
  if (!hasDb()) return 0;
  const { readEnquiry, ENQUIRY_VERSION } = await import("@/lib/rex-enquiry");
  /* everyNewLead (the five-minute scan, 15 Oct 2026): every lead from the
     last two days too, valuations first. The whole enquiry is where the name
     and number the person TYPED live (lib/lead-enquirer) - REX files it under
     whichever contact already has that email, and Sean McMahon's test as
     "Sean Murphy" read as Sean McMahon on the board until somebody opened it.
     A few new leads per run, one Leads/read each, still READ-ONLY. */
  const rows = await q<{ id: string }>(
    `SELECT id FROM os_leads
      WHERE id LIKE 'rex-%'
        AND (payload->>'enquiryFull' IS NULL OR COALESCE((payload->>'enquiryV')::int, 0) <> $1)
        AND ((enquiry = 'Valuation' AND COALESCE(received_at, first_seen) > NOW() - INTERVAL '120 days')
             OR ($3 AND COALESCE(received_at, first_seen) > NOW() - INTERVAL '2 days'))
      ORDER BY (enquiry = 'Valuation') DESC, received_at DESC NULLS LAST LIMIT $2`,
    [ENQUIRY_VERSION, limit, opts.everyNewLead === true]
  ).catch(() => []);
  let n = 0;
  for (const r of rows) {
    const e = await readEnquiry(r.id.slice(4)).catch(() => null);
    if (!e) continue;
    await q(
      `UPDATE os_leads SET payload = payload || jsonb_build_object('enquiryFull', $2::text, 'enquiryFields', $3::jsonb, 'enquirySource', $4::text, 'enquiryV', $5::int) WHERE id = $1`,
      [r.id, e.message, JSON.stringify(e.fields), e.source, ENQUIRY_VERSION]
    ).catch(() => {});
    n++;
  }
  return n;
}

/** The newest leads on file, the whole business or one agent's. Lettings only. */
export async function ledgerBoard(rexUserId: string | null, limit = 500): Promise<Lead[]> {
  if (!hasDb()) return [];
  const rows = await q<{ payload: Lead }>(
    rexUserId
      ? `SELECT payload FROM os_leads WHERE ${leadHeldBySql("os_leads", "$2")} AND ${NOT_SALES} ORDER BY received_at DESC NULLS LAST LIMIT $1`
      : `SELECT payload FROM os_leads WHERE ${NOT_SALES} ORDER BY received_at DESC NULLS LAST LIMIT $1`,
    rexUserId ? [limit, rexUserId] : [limit]
  ).catch(() => []);
  return rows.map((r) => asAsked(r.payload));
}

/** Named leads from the ledger, for a board that must show leads REX's walk
    for its scope never returns (passed on in the OS, lib/lead-owner). */
export async function ledgerLeadsByIds(ids: string[]): Promise<Lead[]> {
  if (!hasDb() || !ids.length) return [];
  const rows = await q<{ payload: Lead }>(`SELECT payload FROM os_leads WHERE id = ANY($1::text[]) AND ${NOT_SALES}`, [ids]).catch(() => []);
  return rows.map((r) => asAsked(r.payload));
}

/** A ledger row's lead with the enquirer's own name and number (lib/lead-enquirer). */
const asAsked = (p: Lead): Lead => withEnquirer(p, (p as { enquiryFields?: unknown }).enquiryFields);

/**
 * The same, for a board that did not come from the ledger: the scan's cached
 * book is REX's list as REX returned it, without the enquiry read in full.
 * One primary-key lookup for the ids drawn, like salesAmong.
 */
export async function asAskedAll<L extends Lead>(leads: L[]): Promise<L[]> {
  const ids = leads.filter((l) => l.id?.startsWith("rex-")).map((l) => l.id);
  if (!hasDb() || !ids.length) return leads;
  const rows = await q<{ id: string; f: unknown }>(
    `SELECT id, payload->'enquiryFields' AS f FROM os_leads
      WHERE id = ANY($1::text[]) AND jsonb_typeof(payload->'enquiryFields') = 'array'`,
    [ids]
  ).catch(() => []);
  if (!rows.length) return leads;
  const fields = new Map(rows.map((r) => [r.id, r.f]));
  return leads.map((l) => (fields.has(l.id) ? withEnquirer(l, fields.get(l.id)) : l));
}

/** One cell of the Lead sources tile: lettings leads on file in a London month, by side and source. */
export interface SourceMonthRow {
  month: string;
  side: "tenant" | "landlord";
  source: string;
  n: number;
}

/**
 * Lettings leads on file per month, side and source, from the first of last
 * month (London) to now. The dashboard's Lead sources tile counts from this
 * (Rig P-010, 10 Oct 2026): it used to count the newest 500 the board holds,
 * and 690 had come in by the 10th, so "leads this month" stopped wherever 500
 * reached and last month (1,505 in September) was never in reach at all.
 * Null when it cannot be read - the tile says so rather than counting the board.
 */
export async function ledgerSourceMonths(rexUserId: string | null, hidden: string[] = []): Promise<SourceMonthRow[] | null> {
  if (!hasDb()) return null;
  const rows = await q<{ month: string; side: "tenant" | "landlord"; source: string; n: number }>(
    `SELECT to_char(received_at AT TIME ZONE 'Europe/London', 'YYYY-MM') AS month,
            CASE WHEN enquiry = 'Letting' THEN 'tenant' ELSE 'landlord' END AS side,
            COALESCE(source, '') AS source,
            COUNT(*)::int AS n
       FROM os_leads
      WHERE received_at >= date_trunc('month', (NOW() AT TIME ZONE 'Europe/London') - INTERVAL '1 month') AT TIME ZONE 'Europe/London'
        AND ${NOT_SALES}
        AND NOT (id = ANY($1::text[]))
        ${rexUserId ? `AND ${leadHeldBySql("os_leads", "$2")}` : ""}
      GROUP BY 1, 2, 3`,
    rexUserId ? [hidden, rexUserId] : [hidden]
  ).catch(() => null);
  return rows ? rows.map((r) => ({ ...r, n: Number(r.n) })) : null;
}

/**
 * Every lead on file matching what was typed, not just the newest 500 the
 * board loads (Susan, 19 Sep 2026: "if a lead is missing, you don't want to
 * have to click through every single person to find it"). Name, email,
 * address, the agent it is for, and the phone by its digits alone. Lettings
 * only, one agent's or the business's, newest first.
 */
export async function searchLedger(rexUserId: string | null, needle: string, limit = 60): Promise<Lead[]> {
  const text = needle.trim();
  if (!hasDb() || text.length < 3) return [];
  /* Every word, any order (9 Oct 2026): "6 ruskin place" finds the lead
     whose address reads "Ruskin Place 6". */
  const likes = searchLikes(text);
  if (!likes.length) return [];
  const digits = text.replace(/\D/g, "");
  const params: unknown[] = [likes, digits.length >= 5 ? `%${digits}%` : null, limit * 3];
  if (rexUserId) params.push(rexUserId);
  /* The name and number typed on the enquiry are searched too (lib/lead-
     enquirer): Sean McMahon looked for "Sean Murphy", the name on his
     website enquiry, and REX had filed it under Sean McMahon. */
  const rows = await q<{ payload: Lead; name: string | null; email: string | null; address: string | null; agent: string | null; area: string | null; phone: string | null; asked: string | null }>(
    `SELECT payload, name, email, address, agent, payload->>'area' AS area, phone, asked FROM (
       SELECT os_leads.*, (SELECT string_agg(f->>1, ' ') FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(payload->'enquiryFields') = 'array' THEN payload->'enquiryFields' ELSE '[]'::jsonb END) f
              WHERE lower(f->>0) IN ('name', 'first name', 'last name', 'phone default', 'phone number', 'phone')) AS asked
         FROM os_leads
        WHERE ${NOT_SALES}
          ${rexUserId ? `AND ${leadHeldBySql("os_leads", "$4")}` : ""}
     ) l
      WHERE (concat_ws(' ', name, email, address, agent, payload->>'area', asked) ILIKE ALL($1::text[])
             OR ($2::text IS NOT NULL AND regexp_replace(concat_ws(' ', phone, asked), '\\D', '', 'g') LIKE $2))
      ORDER BY received_at DESC NULLS LAST LIMIT $3`,
    params
  ).catch(() => []);
  return rows
    .filter((r) => searchMatches(text, r.name, r.email, r.address, r.agent, r.area, r.phone, r.asked))
    .slice(0, limit)
    .map((r) => asAsked(r.payload));
}

export async function ledgerStats(): Promise<LedgerStats> {
  if (!hasDb()) return { onFile: 0, since: null };
  const rows = await q<{ n: string; since: Date | null }>(`SELECT COUNT(*)::text AS n, MIN(first_seen) AS since FROM os_leads`).catch(() => []);
  return { onFile: Number(rows[0]?.n ?? 0), since: rows[0]?.since ? new Date(rows[0].since).toISOString() : null };
}

/** Every lead on file for one listing, newest first: the property's own enquiries. */
export async function leadsForListing(listingId: string, limit = 100): Promise<Lead[]> {
  if (!hasDb()) return [];
  const rows = await q<{ payload: Lead }>(
    `SELECT payload FROM os_leads WHERE listing_id = $1 ORDER BY received_at DESC NULLS LAST LIMIT $2`,
    [listingId, limit]
  ).catch(() => []);
  return rows.map((r) => asAsked(r.payload));
}

/**
 * New enquiries for one person's bell and phone (5 Oct 2026): James wanted a
 * buzz "when a tenant inquires about a property, when they get a new landlord
 * lead through ... when a tenant requests a viewing". The last three days, so
 * the bell never fills with last month.
 *
 *   their own leads          REX leads assigned to them (assignee_id), lettings
 *                            only, the diary's own viewers left out - a person
 *                            the scan filed from a booked viewing is not news
 *   tenant area enquiries    os_tenant_enquiries emailed to them
 *   every landlord lead      owners only (allLandlords): valuation requests on
 *                            anybody's book, and landlords added to the leads
 *                            by somebody else
 *
 * `words` is what the enquiry said, for telling a viewing request apart.
 */
export interface NewLead {
  id: string;
  at: string;
  landlord: boolean;
  name: string;
  source: string;
  address: string;
  words: string;
}

export async function newLeadsFor(p: { rexUserId: string | null; email: string; allLandlords: boolean; days?: number; limit?: number }): Promise<NewLead[]> {
  if (!hasDb()) return [];
  const days = p.days ?? 3;
  const limit = p.limit ?? 25;
  const iso = (d: Date | string) => new Date(d).toISOString();
  const [rex, portal, added] = await Promise.all([
    p.rexUserId || p.allLandlords
      ? q<{ id: string; received_at: Date; enquiry: string; source: string; name: string; address: string | null; words: string }>(
          /* Timed by when the OS first saw it, not when REX received it: the
             phone scan only sends what is newer than its last send, and a
             lead the five-minute scan files late would otherwise land behind
             that line and never buzz. */
          `SELECT id, first_seen AS received_at, enquiry, COALESCE(source, '') AS source, COALESCE(name, '') AS name, address,
                  concat_ws(' ', payload->>'subject', payload->>'enquiryMessage', payload->>'enquiryFull') AS words
             FROM os_leads
            WHERE received_at > NOW() - make_interval(days => $1) AND first_seen > NOW() - make_interval(days => $1)
              AND COALESCE(source, '') <> 'REX diary'
              AND ${NOT_SALES}
              AND (($2::text IS NOT NULL AND ${leadHeldBySql("os_leads", "$2")}) OR ($3 AND enquiry = 'Valuation'))
            ORDER BY first_seen DESC LIMIT $4`,
          [days, p.rexUserId, p.allLandlords, limit]
        ).catch(() => [])
      : [],
    q<{ id: string; created_at: Date; name: string; address: string; message: string }>(
      `SELECT id, created_at, name, address, message FROM os_tenant_enquiries
        WHERE LOWER(sent_to) = LOWER($1) AND created_at > NOW() - make_interval(days => $2)
        ORDER BY created_at DESC LIMIT $3`,
      [p.email, days, limit]
    ).catch(() => []),
    p.allLandlords
      ? q<{ id: string; created_at: Date; name: string; address: string | null; source: string | null; notes: string | null }>(
          `SELECT id, created_at, name, address, source, notes FROM os_contacts
            WHERE kind = 'landlord' AND created_at > NOW() - make_interval(days => $1)
              AND LOWER(COALESCE(created_by, '')) <> LOWER($2) AND NOT COALESCE(is_test, FALSE)
            ORDER BY created_at DESC LIMIT $3`,
          [days, p.email, limit]
        ).catch(() => [])
      : [],
  ]);
  return [
    ...rex.map((r) => ({ id: r.id, at: iso(r.received_at), landlord: r.enquiry === "Valuation", name: r.name, source: r.source, address: r.address ?? "", words: r.words ?? "" })),
    ...portal.map((r) => ({ id: `tenant-area:${r.id}`, at: iso(r.created_at), landlord: false, name: r.name, source: "Tenant area", address: r.address, words: r.message })),
    ...added.map((r) => ({ id: `os-${r.id}`, at: iso(r.created_at), landlord: true, name: r.name, source: r.source?.trim() || "Added to the leads", address: r.address ?? "", words: r.notes ?? "" })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
