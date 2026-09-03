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
  beds?: number | string | null;
  type?: string | null;
  price?: number | string | null;
  agent?: string | null;
  lat?: number | null;
  lon?: number | null;
  status?: string | null;
  listed_on?: string | null;
  /** The feed's own reduction stamp — set when the asking rent came down. */
  reduced_at?: string | null;
  link?: string | null;
  uprn?: number | string | null;
  hs_id?: number | string | null;
  /** The advert's lead photo. */
  image?: string | null;
}

/** Same identity rule the cards use — the Homesearch listing id where there is one.
 *  Sales rows carry their own prefix so the two feeds can never collide. */
function keyOf(r: HsRow, market: "let" | "sale" = "let"): string {
  const m = /\/(\d+)\/?$/.exec(r.link ?? "");
  const p = market === "sale" ? "hss" : "hs";
  return m ? `${p}:${m[1]}` : `${market === "sale" ? "sale|" : ""}${r.full_address ?? r.street ?? "?"}|${r.price ?? ""}`;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * THE PROPERTY, as opposed to the listing.
 *
 * A listing key changes every time a property comes back to market, which is
 * exactly the moment Landlord Radar wants to notice. So a second identity: the
 * UPRN where the feed gives one, which it does for about four listings in ten
 * (measured on NN1, 2 Sep 2026 — 174 of 300 rows had none, almost all of them
 * OpenRent, which publishes a street and a postcode and nothing else).
 *
 * Without a UPRN the key is the full address; without that it is street,
 * postcode and bed count, which is as close as the feed lets us get. Two
 * different two-beds on the same street in one postcode would share a key.
 * That is a known limit, and the price of seeing OpenRent at all.
 */
export function propertyKeyOf(r: HsRow): string | null {
  const uprn = textOrNull(r.uprn);
  if (uprn) return `uprn:${uprn}`;
  const pc = (r.postcode ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!pc) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (r.full_address) return `addr:${norm(r.full_address)}`;
  if (r.street) return `street:${norm(r.street)}|${pc}|${numberOrNull(r.beds) ?? ""}`;
  return null;
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

/**
 * What a sweep looks at. The original capture watched postcode SECTORS, seeded
 * from wherever the REX book had stock. Landlord Radar watches whole DISTRICTS,
 * because a patch is "NN and MK" and nobody wants to name a hundred sectors.
 * Both land in the same table; a row remembers both its sector and district.
 */
export type SweepScope = { kind: "sector" | "district"; value: string; market?: "let" | "sale" };

export interface SweepResult {
  /** The scope value — a sector for the original sweep, a district for Radar.
   *  Still called sector because the capture workflow reads it by that name. */
  sector: string;
  seen: number;
  newRows: number;
  newlyLetAgreed: number;
  goneNow: number;
  /** Events written this run: arrivals, departures, rent, status and agent changes. */
  events: number;
  skipped?: string;
  /** Set when the feed returned the page cap and there may be more behind it. */
  truncated?: boolean;
  market?: "let" | "sale";
}

/** One sector, one day. Kept for the original capture route. */
export async function sweepSector(
  sector: string,
  fetchRows: (sector: string) => Promise<Array<Record<string, unknown>>>
): Promise<SweepResult> {
  return sweepScope({ kind: "sector", value: sector }, fetchRows);
}

type Held = {
  listing_key: string;
  rent: number | null;
  status: string;
  agent: string | null;
  gone_at: string | null;
};

/**
 * One scope, one day.
 *
 * THE EMPTY-SWEEP GUARD IS THE POINT OF THIS FUNCTION. If Homesearch 429s, or
 * the token lapses, or a sector is simply mistyped, the fetch returns nothing.
 * Writing that through would mark every listing in the scope as gone on the
 * same timestamp, and the history would be confidently wrong forever with
 * nothing to show it had happened. A sweep that sees zero rows writes NOTHING
 * and says so.
 *
 * THE DIFF IS THE SECOND POINT. The first version upserted in place, so a rent
 * that came down on Tuesday was simply Tuesday's rent by Wednesday — the
 * reduction itself was never anywhere. Now what we held is read before the
 * write, and every change becomes a row in os_listing_events. Radar's
 * "reduced", "switched agent" and "back on market" signals are read off that
 * table, not inferred from the current state.
 */
export async function sweepScope(
  scope: SweepScope,
  fetchRows: (value: string) => Promise<Array<Record<string, unknown>>>
): Promise<SweepResult> {
  const rows = (await fetchRows(scope.value)) as unknown as HsRow[];
  /* 300 is the feed's page cap. Fourteen sectors hit it exactly on the first
     real run — B16 9, BS7 0, EH3 9, NG1 1, SW8 1 and the rest — which means
     their books were cut off and the tail would then have been marked gone.
     hsLetBook pages now; this flag catches the day it stops being enough. */
  const truncatedAt = rows.length > 0 && rows.length % 300 === 0;
  if (rows.length === 0) {
    return {
      sector: scope.value,
      seen: 0,
      newRows: 0,
      newlyLetAgreed: 0,
      goneNow: 0,
      events: 0,
      skipped:
        "the scope came back empty — nothing written, so this cannot erase a book. " +
        "A throttled or broken fetch now THROWS instead of reaching here, so this " +
        "message means genuinely no stock, not a bad afternoon.",
    };
  }

  const scopeCol = scope.kind === "sector" ? "sector" : "district";
  const district = scope.kind === "district" ? scope.value : scope.value.split(" ")[0];
  const market = scope.market ?? "let";

  /* What we held before this run, so a change can be SEEN rather than
     overwritten. One read per scope, not one per row. */
  const held = new Map<string, Held>();
  for (const h of await q<Held>(
    `SELECT listing_key, rent, status, agent, gone_at FROM os_listing_capture WHERE ${scopeCol} = $1 AND market = $2`,
    [scope.value, market]
  )) {
    held.set(h.listing_key, h);
  }

  let newRows = 0;
  let events = 0;
  const seenKeys: string[] = [];
  /* Stamped before the first write, so the flip count below can ask "what
     became let agreed during THIS run" rather than trying to infer it from an
     upsert's RETURNING. Counting inserts-that-arrived-let-agreed instead would
     miss every on-market -> let-agreed transition, which is the one event this
     whole file exists to observe. */
  const runStart = (await q<{ now: string }>(`SELECT NOW() AS now`))[0]?.now;

  const str = (v: unknown) => (v == null ? null : String(v));

  for (const r of rows) {
    const key = keyOf(r, market);
    seenKeys.push(key);
    const status = String(r.status ?? "").trim().toLowerCase();
    const isLetAgreed = market === "let" && status === "let agreed";
    const postcode = r.postcode ?? "";
    const sector = scope.kind === "sector" ? scope.value : (sectorOf(postcode) ?? `${district} ?`);
    const rent = numberOrNull(r.price);
    const agent = textOrNull(r.agent);
    const propertyKey = propertyKeyOf(r);
    const prev = held.get(key);

    /* WE ONLY KNOW A LET DATE IF WE SAW IT CHANGE.

       The first cut stamped let_agreed_at on insert whenever a row arrived
       already let agreed. Run one then reported 1,985 properties as having let
       agreed that day — every one of them a date we invented, because they went
       let agreed at unknown times before we ever looked. Tomorrow's "let in the
       last 24 hours" would have read 1,985 forever.

       So: NEVER on insert. Only on an UPDATE where the status we held was not
       let agreed and the status we just saw is. That is an observation.

       A row that is let agreed with let_agreed_at NULL is therefore meaningful
       and must stay readable: "already taken when we found it, date unknown".
       It is not the same as "not let", and a report that treats it as such is
       the same fabrication in a different direction. */
    await q(
      `INSERT INTO os_listing_capture
         (listing_key, sector, district, postcode, address, street, beds, property_type,
          rent, agent, lat, lon, status, listed_on, reduced_at, uprn, hs_id, property_key,
          let_agreed_at, market, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, NULL, $20, $21)
       ON CONFLICT (listing_key) DO UPDATE SET
         market        = EXCLUDED.market,
         image_url     = COALESCE(EXCLUDED.image_url, os_listing_capture.image_url),
         status        = EXCLUDED.status,
         rent          = EXCLUDED.rent,
         agent         = EXCLUDED.agent,
         postcode      = EXCLUDED.postcode,
         address       = EXCLUDED.address,
         district      = EXCLUDED.district,
         street        = COALESCE(EXCLUDED.street, os_listing_capture.street),
         reduced_at    = COALESCE(EXCLUDED.reduced_at, os_listing_capture.reduced_at),
         uprn          = COALESCE(EXCLUDED.uprn, os_listing_capture.uprn),
         hs_id         = COALESCE(EXCLUDED.hs_id, os_listing_capture.hs_id),
         property_key  = COALESCE(EXCLUDED.property_key, os_listing_capture.property_key),
         last_seen     = NOW(),
         gone_at       = NULL,
         /* The transition, and only the transition. Held once set. */
         let_agreed_at = COALESCE(
           os_listing_capture.let_agreed_at,
           CASE WHEN $19 AND os_listing_capture.status <> 'let agreed'
                THEN NOW() ELSE NULL END)`,
      [
        key,
        sector,
        district,
        postcode,
        r.full_address ?? r.street ?? "",
        textOrNull(r.street),
        numberOrNull(r.beds),
        r.type ?? null,
        rent == null ? null : Math.round(rent),
        agent,
        typeof r.lat === "number" ? r.lat : null,
        typeof r.lon === "number" ? r.lon : null,
        status,
        r.listed_on ?? null,
        r.reduced_at ?? null,
        textOrNull(r.uprn),
        textOrNull(r.hs_id),
        propertyKey,
        isLetAgreed,
        market,
        textOrNull(r.image),
      ]
    );

    /* The diff. "seen" on arrival; "back" when a listing we had marked gone
       reappears; and one event per field that changed. Rent is compared as a
       rounded integer, the same way it is stored, so a feed that flickers
       between 925 and 925.0 does not write a change. */
    const changes: Array<[string, string | null, string | null]> = [];
    if (!prev) {
      newRows++;
      changes.push(["seen", null, status]);
    } else {
      if (prev.gone_at) changes.push(["back", prev.status, status]);
      const rentNow = rent == null ? null : Math.round(rent);
      if ((prev.rent ?? null) !== rentNow) changes.push(["rent", str(prev.rent), str(rentNow)]);
      if (prev.status !== status) changes.push(["status", prev.status, status]);
      if ((prev.agent ?? "") !== (agent ?? "")) changes.push(["agent", prev.agent, agent]);
    }
    for (const [event, from, to] of changes) {
      await q(
        `INSERT INTO os_listing_events (listing_key, property_key, district, event, from_value, to_value)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [key, propertyKey, district, event, from, to]
      );
      events++;
    }
  }

  /* THE NUMBER THIS JOB EXISTS FOR: properties that became let agreed today.
     Asked of the table after the writes rather than counted during them, so a
     property that was already on the books and flipped is counted, which is
     exactly the case an insert-counter misses. */
  const flipped = await q<{ n: string }>(
    `SELECT count(*) AS n FROM os_listing_capture
      WHERE ${scopeCol} = $1 AND market = $3 AND let_agreed_at >= $2`,
    [scope.value, runStart, market]
  );
  const newlyLetAgreed = Number(flipped[0]?.n ?? 0);

  /* Anything we hold for this scope that today's sweep did NOT return has
     left the feed. For a row already marked let agreed that is a completed
     let; for anything else it is a withdrawal we cannot tell apart from one.
     Either way the date it disappeared is worth keeping. */
  const gone = await q<{ listing_key: string; property_key: string | null; status: string }>(
    `UPDATE os_listing_capture
        SET gone_at = NOW()
      WHERE ${scopeCol} = $1 AND market = $3 AND gone_at IS NULL AND NOT (listing_key = ANY($2::text[]))
      RETURNING listing_key, property_key, status`,
    [scope.value, seenKeys, market]
  );
  for (const g of gone) {
    await q(
      `INSERT INTO os_listing_events (listing_key, property_key, district, event, from_value, to_value)
       VALUES ($1,$2,$3,'gone',$4,NULL)`,
      [g.listing_key, g.property_key, district, g.status]
    );
    events++;
  }

  if (scope.kind === "sector") {
    await q(
      `UPDATE os_capture_sectors SET last_run_at = NOW(), last_seen_n = $2 WHERE sector = $1`,
      [scope.value, rows.length]
    );
  } else if (market === "let") {
    /* The district's stamp is the lettings sweep; the sales sweep rides after it. */
    await q(
      `UPDATE os_radar_districts SET last_run_at = NOW(), last_seen_n = $2 WHERE district = $1`,
      [scope.value, rows.length]
    );
  }

  return {
    sector: scope.value,
    seen: rows.length,
    newRows,
    newlyLetAgreed,
    goneNow: gone.length,
    events,
    market,
    /* A run that stopped at the cap has NOT seen the scope, and the gone_at
       sweep above would then mark the unseen tail as vanished. Reported so a
       silent truncation cannot read as full coverage. */
    ...(truncatedAt ? { truncated: true } : {}),
  };
}

/**
 * Null out let dates that were stamped at INSERT rather than observed.
 *
 * The first real sweep wrote 1,985 of them: every property that was already
 * let agreed when we first looked got NOW(). Those are inventions — the
 * properties let at unknown times before we existed — and left alone they
 * would be indistinguishable from the real observations that follow.
 *
 * The test is the timestamps: a stamped-at-insert date equals first_seen, an
 * observed one comes on a later run and is strictly greater. One second of
 * slack for the write itself.
 *
 * Idempotent, so running it twice is harmless.
 */
export async function repairFabricatedLetDates(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ listing_key: string }>(
    `UPDATE os_listing_capture
        SET let_agreed_at = NULL
      WHERE let_agreed_at IS NOT NULL
        AND let_agreed_at <= first_seen + INTERVAL '1 second'
      RETURNING listing_key`
  );
  return rows.length;
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
