import { hasDb, q } from "@/lib/db";
import { sectorOf } from "@/lib/ma-research";

/**
 * WATCHING THE LETTINGS MARKET CHANGE, BECAUSE NOBODY WILL TELL US.
 *
 * The whole reason this file exists is one measurement, taken 30 Aug 2026:
 * NN5 let 2,570 properties in twelve months, and Homesearch's listings feed
 * holds 214 rows for the district. A completed let leaves the feed, there is
 * no archive behind it, and every comparable-lets endpoint 404s. So "how long
 * did that take to let" is unanswerable for anybody's stock but our own.
 *
 * Unless we look every day. A listing seen on market on Monday and let agreed
 * on Friday tells us more than any vendor sells, and it costs one API call per
 * sector per day.
 *
 * This gives nothing retrospectively. It is worth starting for that reason
 * rather than in spite of it — the first useful answers arrive in weeks, and
 * they arrive sooner the earlier it is switched on.
 */

export interface CaptureRow extends Record<string, unknown> {
  listing_key: string;
  sector: string;
  postcode: string;
  address: string;
  beds: number | null;
  property_type: string | null;
  rent: number | null;
  agent: string | null;
  status: string;
  listed_on: string | null;
  first_seen: string;
  last_seen: string;
  let_agreed_at: string | null;
  gone_at: string | null;
}

/** A raw row from `current_listings_crm/search/let/`. */
interface HsRow {
  full_address?: string | null;
  street?: string | null;
  postcode?: string | null;
  beds?: number | null;
  type?: string | null;
  price?: number | null;
  agent?: string | null;
  lat?: number | null;
  lon?: number | null;
  status?: string | null;
  listed_on?: string | null;
  link?: string | null;
}

/** Same identity rule the cards use — the Homesearch listing id where there is one. */
function keyOf(r: HsRow): string {
  const m = /\/(\d+)\/?$/.exec(r.link ?? "");
  return m ? `hs:${m[1]}` : `${r.full_address ?? r.street ?? "?"}|${r.price ?? ""}`;
}

export async function watchedSectors(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ sector: string }>(
    `SELECT sector FROM os_capture_sectors ORDER BY sector`
  );
  return rows.map((r) => r.sector);
}

/**
 * Seed from OUR OWN BOOK — the sectors we actually let in.
 *
 * The first seeder asked os_market_appraisals and got nothing, because the
 * appraisals on screen come from SAMPLE_APPRAISALS in code and the table is
 * empty. A seeder whose source is empty returns [] and looks like it worked,
 * which is why the run reports what it added rather than that it ran.
 *
 * REX is the right source anyway: the patch worth watching is where we already
 * have stock, not where a sample record happens to point. Current residential
 * rentals only — the category filter is load-bearing, without it the pages come
 * back as sales stock.
 */
export async function seedSectorsFromBook(by: string): Promise<string[]> {
  if (!hasDb()) return [];
  const { rexCall, rexRows } = await import("@/lib/rex");
  const seen = new Set<string>();
  for (let page = 0; page < 4; page++) {
    const res = await rexCall("Listings", "search", {
      criteria: [
        { name: "system_listing_state", value: "current" },
        { name: "listing_category_id", value: "residential_rental" },
      ],
      limit: 100,
      offset: page * 100,
    });
    if (!res.ok) break;
    const rows = rexRows(res.result) as Array<{ property?: { adr_postcode?: string } }>;
    for (const r of rows) {
      const sec = sectorOf(r.property?.adr_postcode ?? "");
      if (sec) seen.add(sec);
    }
    if (rows.length < 100) break;
  }
  const added: string[] = [];
  for (const sec of [...seen].sort()) {
    const res = await q<{ sector: string }>(
      `INSERT INTO os_capture_sectors (sector, added_by) VALUES ($1, $2)
       ON CONFLICT (sector) DO NOTHING RETURNING sector`,
      [sec, by]
    );
    if (res.length) added.push(sec);
  }
  return added;
}

/** Add sectors by hand — "NN5 4,NN5 5". Normalised, deduped, additive. */
export async function addSectors(raw: string, by: string): Promise<string[]> {
  if (!hasDb()) return [];
  const added: string[] = [];
  for (const part of raw.split(",")) {
    const sec = sectorOf(part.trim()) ?? sectorOf(part.trim() + " 0AA");
    if (!sec) continue;
    const res = await q<{ sector: string }>(
      `INSERT INTO os_capture_sectors (sector, added_by) VALUES ($1, $2)
       ON CONFLICT (sector) DO NOTHING RETURNING sector`,
      [sec, by]
    );
    if (res.length) added.push(sec);
  }
  return added;
}

/**
 * Seed the watch list from every appraisal postcode we hold.
 *
 * Additive only — it never removes a sector somebody added by hand, because
 * the appraisal book shrinks as records are archived and a watch list that
 * followed it would silently stop watching a patch mid-tenancy-cycle.
 */
export async function seedSectorsFromAppraisals(by: string): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ postcode: string }>(
    `SELECT DISTINCT postcode FROM os_market_appraisals WHERE postcode <> ''`
  );
  const added: string[] = [];
  for (const r of rows) {
    const sec = sectorOf(r.postcode);
    if (!sec) continue;
    const res = await q<{ sector: string }>(
      `INSERT INTO os_capture_sectors (sector, added_by) VALUES ($1, $2)
       ON CONFLICT (sector) DO NOTHING RETURNING sector`,
      [sec, by]
    );
    if (res.length) added.push(sec);
  }
  return added;
}

export interface SweepResult {
  sector: string;
  seen: number;
  newRows: number;
  newlyLetAgreed: number;
  goneNow: number;
  skipped?: string;
}

/**
 * One sector, one day.
 *
 * THE EMPTY-SWEEP GUARD IS THE POINT OF THIS FUNCTION. If Homesearch 429s, or
 * the token lapses, or a sector is simply mistyped, the fetch returns nothing.
 * Writing that through would mark every listing in the sector as gone on the
 * same timestamp, and the history would be confidently wrong forever with
 * nothing to show it had happened. A sweep that sees zero rows writes NOTHING
 * and says so.
 */
export async function sweepSector(
  sector: string,
  fetchRows: (sector: string) => Promise<Array<Record<string, unknown>>>
): Promise<SweepResult> {
  const rows = (await fetchRows(sector)) as unknown as HsRow[];
  if (rows.length === 0) {
    return {
      sector,
      seen: 0,
      newRows: 0,
      newlyLetAgreed: 0,
      goneNow: 0,
      skipped: "no rows came back — nothing written, so a failed fetch cannot erase a book",
    };
  }

  let newRows = 0;
  const seenKeys: string[] = [];
  /* Stamped before the first write, so the flip count below can ask "what
     became let agreed during THIS run" rather than trying to infer it from an
     upsert's RETURNING. Counting inserts-that-arrived-let-agreed instead would
     miss every on-market -> let-agreed transition, which is the one event this
     whole file exists to observe. */
  const runStart = (await q<{ now: string }>(`SELECT NOW() AS now`))[0]?.now;

  for (const r of rows) {
    const key = keyOf(r);
    seenKeys.push(key);
    const status = String(r.status ?? "").trim().toLowerCase();
    const isLetAgreed = status === "let agreed";

    /* let_agreed_at is set ONCE, on the first run that sees the flip, and
       never moved afterwards — COALESCE keeps the original. A property that
       falls through and re-lets keeps the date of the first acceptance, which
       is the honest reading of "when did this let". */
    const res = await q<{ inserted: boolean }>(
      `INSERT INTO os_listing_capture
         (listing_key, sector, postcode, address, beds, property_type, rent,
          agent, lat, lon, status, listed_on, let_agreed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $13 THEN NOW() ELSE NULL END)
       ON CONFLICT (listing_key) DO UPDATE SET
         status        = EXCLUDED.status,
         rent          = EXCLUDED.rent,
         agent         = EXCLUDED.agent,
         postcode      = EXCLUDED.postcode,
         address       = EXCLUDED.address,
         last_seen     = NOW(),
         gone_at       = NULL,
         let_agreed_at = COALESCE(os_listing_capture.let_agreed_at,
                                  CASE WHEN $13 THEN NOW() ELSE NULL END)
       RETURNING (xmax = 0) AS inserted`,
      [
        key,
        sector,
        r.postcode ?? "",
        r.full_address ?? r.street ?? "",
        typeof r.beds === "number" ? r.beds : null,
        r.type ?? null,
        typeof r.price === "number" ? Math.round(r.price) : null,
        r.agent ?? null,
        typeof r.lat === "number" ? r.lat : null,
        typeof r.lon === "number" ? r.lon : null,
        status,
        r.listed_on ?? null,
        isLetAgreed,
      ]
    );
    if (res[0]?.inserted) newRows++;
  }

  /* THE NUMBER THIS JOB EXISTS FOR: properties that became let agreed today.
     Asked of the table after the writes rather than counted during them, so a
     property that was already on the books and flipped is counted, which is
     exactly the case an insert-counter misses. */
  const flipped = await q<{ n: string }>(
    `SELECT count(*) AS n FROM os_listing_capture
      WHERE sector = $1 AND let_agreed_at >= $2`,
    [sector, runStart]
  );
  const newlyLetAgreed = Number(flipped[0]?.n ?? 0);

  /* Anything we hold for this sector that today's sweep did NOT return has
     left the feed. For a row already marked let agreed that is a completed
     let; for anything else it is a withdrawal we cannot tell apart from one.
     Either way the date it disappeared is worth keeping. */
  const gone = await q<{ listing_key: string }>(
    `UPDATE os_listing_capture
        SET gone_at = NOW()
      WHERE sector = $1 AND gone_at IS NULL AND NOT (listing_key = ANY($2::text[]))
      RETURNING listing_key`,
    [sector, seenKeys]
  );

  await q(
    `UPDATE os_capture_sectors SET last_run_at = NOW(), last_seen_n = $2 WHERE sector = $1`,
    [sector, rows.length]
  );

  return { sector, seen: rows.length, newRows, newlyLetAgreed, goneNow: gone.length };
}

/**
 * What we have actually learned — lets with a REAL date on them.
 *
 * This is empty on day one and stays thin for weeks. That is not a bug and the
 * caller must say so rather than rendering an empty list as "nothing lets here".
 */
export async function observedLets(sector: string, limit = 40): Promise<CaptureRow[]> {
  if (!hasDb()) return [];
  return q<CaptureRow>(
    `SELECT * FROM os_listing_capture
      WHERE sector = $1 AND let_agreed_at IS NOT NULL
      ORDER BY let_agreed_at DESC LIMIT $2`,
    [sector, limit]
  );
}
