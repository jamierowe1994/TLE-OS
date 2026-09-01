import { q } from "@/lib/db";

/**
 * The LOCAL copy of the TEG Team Hub's people, and how the OS reads it.
 *
 * The transport lives in lib/business/teg-hub.ts, which already owned the Hub
 * connection before this file existed — one endpoint, one secret, one place to
 * change it. This file is only the store: the table, the upsert, the readers.
 * Nothing here makes a network call, so it is safe to import from any page.
 *
 * The Hub is a Base44 app holding everyone who joins any Experts Group brand:
 * contact details, compliance, partner package, bio, headshot. It is the
 * MASTER for facts about a person, the way Propoly is master for a deal.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ READ-ONLY. This module calls the Hub's `search` and `read` actions and     │
 * │ nothing else. Its dbApi also exposes create/update/delete, and the secret  │
 * │ bypasses row-level security entirely — so a typo here could rewrite the    │
 * │ group's staff register. There is no write path in this file on purpose.    │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ── The join, and why it is two keys ──────────────────────────────────────
 *
 * `rex_id` where it exists, `email` otherwise. rex_id is numeric, case-proof
 * and already how TLE OS thinks about agents — but only the ~20 records that
 * came from the Rex sync carry one; the rest arrived via M365 discovery or by
 * hand. Email covers everyone, at the cost of being case-inconsistent in the
 * stored data (Amrit.Bhogal@TheLettingExperts.co.uk sits beside
 * sean.mcmahon@thelettingexperts.co.uk), so it is lower-cased on both sides
 * and never compared raw.
 *
 * ── Never filter TLE people by email domain ───────────────────────────────
 *
 * Several TLE partners are not on the TLE domain at all — some sit on
 * @thepropertyexperts.co.uk, one on @theexpertsgroup.co.uk. Brand membership
 * is `primary_brand_id` (or `sub_brands`), never the address.
 */

/* The Hub's own field names, kept verbatim so a reader can grep the Base44
   schema and find them. */
export interface TegPerson {
  email: string;
  rexId: string | null;
  name: string | null;
  jobTitle: string | null;
  personType: string | null;
  /** Basic | Pro | Academy — the commercial tier they trade under. */
  partnerPackage: string | null;
  /** Long free text. Blank for most people today; being written by hand. */
  bio: string | null;
  /** Master headshot. Empty for every TLE person as of 28 Aug 2026 — James is
   *  adding them, so this is wired now and will fill in behind us. */
  photoUrl: string | null;
  /**
   * Their home address, free text. PERSONAL DATA — see the warning on
   * `home_address` in lib/business/teg-hub.ts.
   *
   * Read for the signed-in person's OWN record only, by /api/teg/me, to
   * prefill the travel-time origin on their profile. `listTegPeople()`
   * deliberately does NOT select it: that list feeds the admin people screen,
   * and a staff directory that quietly carries everyone's home address is one
   * careless render away from being exactly the dump this was avoiding.
   */
  homeAddress: string | null;
  status: string | null;
  syncedAt: string;
}

/* Index signature so it satisfies q()'s Record constraint. */
interface Row extends Record<string, unknown> {
  email: string;
  rex_id: string | null;
  name: string | null;
  job_title: string | null;
  person_type: string | null;
  partner_package: string | null;
  bio: string | null;
  photo_url: string | null;
  home_address?: string | null;
  status: string | null;
  synced_at: string;
}

const toPerson = (r: Row): TegPerson => ({
  email: r.email,
  rexId: r.rex_id,
  name: r.name,
  jobTitle: r.job_title,
  personType: r.person_type,
  partnerPackage: r.partner_package,
  bio: r.bio,
  photoUrl: r.photo_url,
  homeAddress: r.home_address ?? null,
  status: r.status,
  syncedAt: r.synced_at,
});

/* The everyday columns. NO home_address — see the field's doc comment. Only
   getTegPerson(), which is always somebody's own record, asks for it. */
const COLS = `email, rex_id, name, job_title, person_type,
              partner_package, bio, photo_url, status, synced_at::text AS synced_at`;

/** COLS plus the home address. Used by getTegPerson ONLY. */
const COLS_WITH_HOME = `${COLS}, home_address`;

/** Normalise an email for comparison. The Hub's uniqueness is case-insensitive
 *  and its stored data is not — this is the only safe way to match. */
export const normEmail = (e: string): string => e.trim().toLowerCase();

/**
 * One person, by whichever key we have.
 *
 * Returns null when we hold nothing for them — which is the common case and
 * NOT an error. Most of the register is only partly filled in, and a caller
 * must render an agent with no bio rather than failing.
 */
export async function getTegPerson(opts: {
  email?: string | null;
  rexId?: string | null;
}): Promise<TegPerson | null> {
  const email = opts.email ? normEmail(opts.email) : null;
  const rexId = opts.rexId?.trim() || null;
  if (!email && !rexId) return null;

  try {
    /* rex_id first — it is the stronger key. Falls through to email so a
       person the Rex sync never touched is still found. */
    if (rexId) {
      const byRex = await q<Row>(
        `SELECT ${COLS_WITH_HOME} FROM os_teg_people WHERE rex_id = $1 LIMIT 1`,
        [rexId]
      );
      if (byRex[0]) return toPerson(byRex[0]);
    }
    if (email) {
      const byEmail = await q<Row>(
        `SELECT ${COLS_WITH_HOME} FROM os_teg_people WHERE email = $1 LIMIT 1`,
        [email]
      );
      if (byEmail[0]) return toPerson(byEmail[0]);
    }
    return null;
  } catch {
    /* No table yet, or no database. A missing bio must never take down the
       page that wanted it. */
    return null;
  }
}

/** Everyone we hold, newest sync first. For the admin people list. */
export async function listTegPeople(): Promise<TegPerson[]> {
  try {
    const rows = await q<Row>(`SELECT ${COLS} FROM os_teg_people ORDER BY name NULLS LAST`);
    return rows.map(toPerson);
  } catch {
    return [];
  }
}

/** When the register was last pulled, for the "synced N hours ago" caption. */
export async function tegLastSync(): Promise<string | null> {
  try {
    const rows = await q<{ at: string | null }>(
      `SELECT MAX(synced_at)::text AS at FROM os_teg_people`
    );
    return rows[0]?.at ?? null;
  } catch {
    return null;
  }
}

/** Replace the stored register with what the Hub just gave us. */
export async function storeTegPeople(people: Array<Omit<TegPerson, "syncedAt">>): Promise<number> {
  let written = 0;
  for (const p of people) {
    const email = normEmail(p.email);
    if (!email) continue;
    /* Upsert rather than truncate-and-insert: a Hub call that returns a short
       list (a filter change, a partial failure) would otherwise delete people
       we already knew about, and a landlord page would lose a bio because of a
       transient query problem. Departures are handled by `status`, which the
       Hub sets — not by absence from a response. */
    await q(
      `INSERT INTO os_teg_people
         (email, rex_id, name, job_title, person_type,
          partner_package, bio, photo_url, home_address, status, payload, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (email) DO UPDATE SET
         rex_id = EXCLUDED.rex_id,
         name = EXCLUDED.name,
         job_title = EXCLUDED.job_title,
         person_type = EXCLUDED.person_type,
         partner_package = EXCLUDED.partner_package,
         bio = EXCLUDED.bio,
         photo_url = EXCLUDED.photo_url,
         home_address = EXCLUDED.home_address,
         status = EXCLUDED.status,
         payload = EXCLUDED.payload,
         synced_at = NOW()`,
      [
        email,
        p.rexId,
        p.name,
        p.jobTitle,
        p.personType,
        p.partnerPackage,
        p.bio,
        p.photoUrl,
        p.homeAddress,
        p.status,
        JSON.stringify(p),
      ]
    );
    written += 1;
  }
  return written;
}
