import "server-only";
import { hasDb, q } from "@/lib/db";
import { hsBook } from "@/lib/ma-research";
import { sweepScope, type SweepResult } from "@/lib/listing-capture";
import { resendConfigured, resendSendUnlocked, sendEmail } from "@/lib/resend";
import { assertInternalRecipient } from "@/lib/email-policy";
import {
  isOurs,
  isPrivateLister,
  isStage,
  SIGNALS,
  STAGES,
  STAGE_LABEL,
  type AddressCandidate,
  type Prospect,
  type RadarSummary,
  type Signal,
  type SignalKey,
  type Stage,
} from "@/lib/radar-signals";

/**
 * Landlord Radar — Phase 1 of docs/LANDLORD-RADAR.md.
 *
 * Reads the daily capture for the patch and turns it into a scored list of
 * properties whose landlord looks likely to move agent. No new data source,
 * no personal data: properties, agents and prices only.
 *
 * ── Three tables, three jobs ──────────────────────────────────────────────
 *
 *   os_radar_districts   what we watch. Seeded with NN and MK on first run.
 *   os_listing_events    what changed, written by the sweep (lib/listing-capture).
 *   os_radar_prospects   what the signals say, plus the human side — stage,
 *                        assignee, notes — which survives every recompute.
 *
 * ── Why the recompute is total, not incremental ───────────────────────────
 *
 * Every signal is a function of the current capture and the last few months
 * of events, so the honest way to keep them right is to derive all of them
 * again after every sweep. Six thousand rows takes seconds. An incremental
 * version would have to know which yesterday's signals to retract, and the
 * first bug in that logic would leave a landlord flagged "reduced" forever.
 */

/** James, 2 Sep 2026: "Northampton and Milton Keynes, so NN postcode and MK
 *  postcodes", then the same afternoon "add Bedford, MK40 to MK46". So
 *  NN1–NN18, MK1–MK19 and MK40–MK46. Anything further is ?add=. */
export const PATCH_DISTRICTS: string[] = [
  ...Array.from({ length: 18 }, (_, i) => `NN${i + 1}`),
  ...Array.from({ length: 19 }, (_, i) => `MK${i + 1}`),
  ...Array.from({ length: 7 }, (_, i) => `MK${i + 40}`),
];

export interface WatchedDistrict extends Record<string, unknown> {
  district: string;
  added_by: string;
  last_run_at: string | null;
  last_seen_n: number | null;
}

export async function watchedDistricts(): Promise<WatchedDistrict[]> {
  if (!hasDb()) return [];
  return q<WatchedDistrict>(
    `SELECT district, added_by, last_run_at, last_seen_n FROM os_radar_districts ORDER BY district`
  );
}

/** Additive. Returns what was actually added, so an empty answer is visible. */
export async function addDistricts(raw: string | string[], by: string): Promise<string[]> {
  if (!hasDb()) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(",");
  const added: string[] = [];
  for (const part of parts) {
    const d = part.trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)$/)?.[1];
    if (!d) continue;
    const res = await q<{ district: string }>(
      `INSERT INTO os_radar_districts (district, added_by) VALUES ($1, $2)
       ON CONFLICT (district) DO NOTHING RETURNING district`,
      [d, by]
    );
    if (res.length) added.push(d);
  }
  return added;
}

export function seedPatch(by: string): Promise<string[]> {
  return addDistricts(PATCH_DISTRICTS, by);
}

/**
 * Sweep every watched district. Sequential with a breath between, for the
 * same reason the sector sweep is: Homesearch throttles, and a daily job has
 * all the time in the world. A district that throws is recorded as skipped and
 * the rest still run.
 */
export async function sweepPatch(): Promise<SweepResult[]> {
  const districts = await watchedDistricts();
  const results: SweepResult[] = [];
  for (const [i, d] of districts.entries()) {
    /* Both feeds for the district, lettings first. A property that was let and
       is now for sale only shows up when both are read. */
    for (const market of ["let", "sale"] as const) {
      if (i > 0 || market === "sale") await new Promise((r) => setTimeout(r, 250));
      try {
        results.push(
          await sweepScope({ kind: "district", value: d.district, market }, (v) => hsBook("districts", v, market))
        );
      } catch (e) {
        results.push({
          sector: d.district,
          seen: 0,
          newRows: 0,
          newlyLetAgreed: 0,
          goneNow: 0,
          events: 0,
          market,
          skipped: (e as Error).message,
        });
      }
    }
  }
  return results;
}

/* ── The signals ──────────────────────────────────────────────────────────── */

interface Lite extends Record<string, unknown> {
  listing_key: string;
  property_key: string;
  uprn: string | null;
  address: string;
  street: string | null;
  postcode: string;
  sector: string;
  district: string | null;
  beds: number | null;
  property_type: string | null;
  rent: number | null;
  agent: string | null;
  status: string;
  market: "let" | "sale";
  listed_on: Date | string | null;
  reduced_at: Date | string | null;
  lat: number | null;
  lon: number | null;
  first_seen: Date | string;
  last_seen: Date | string;
  let_agreed_at: Date | string | null;
  gone_at: Date | string | null;
}

const DAY = 86_400_000;
const ms = (d: Date | string | null | undefined): number | null =>
  d == null ? null : new Date(d).getTime();

function daysSince(d: Date | string | null | undefined, now: number): number | null {
  const t = ms(d);
  return t == null ? null : Math.floor((now - t) / DAY);
}

function ymd(d: Date | string | null | undefined): string | null {
  const t = ms(d);
  return t == null ? null : new Date(t).toISOString().slice(0, 10);
}

function dmy(d: Date | string | null | undefined): string {
  const t = ms(d);
  return t == null ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function pounds(n: number | null): string {
  return n == null ? "" : `£${n.toLocaleString("en-GB")}`;
}

/** Listed date with a fallback to when we first saw it, for the rare row with none. */
function listedAt(r: Lite): number {
  return ms(r.listed_on) ?? ms(r.first_seen) ?? 0;
}

/**
 * The signals for one property, read off its listings newest-first.
 *
 * Returned in weight order so the strongest reason reads first on the board.
 */
function signalsFor(
  rows: Lite[],
  drops: Map<string, { from: number; to: number; at: number }>,
  now: number
): Signal[] {
  const cur = rows[0];
  const out: Signal[] = [];
  const agent = cur.agent ?? "no agent named";
  const listedDays = daysSince(cur.listed_on ?? cur.first_seen, now) ?? 0;

  /* THE SALES BRANCH. When the newest listing is a sale, the lettings signals
     do not apply - the landlord is not letting it - and two of their own do.
     A property that has never been let and is simply unsold is a landlord in
     waiting, not a landlord, so "not selling" alone scores low. */
  if (cur.market === "sale") {
    const forSale = (cur.status === "on market" || cur.status === "under offer") && !cur.gone_at;
    if (!forSale) return out;
    /* The let that came before. On a key that names one property (UPRN or
       full address) any let in the last two years counts. On a street-only
       key two similar houses can share the key, so the let must sit within a
       year before the sale went up - the ordinary "tenant left, put it on the
       market" gap - or it is not trusted. */
    const oneProperty = !cur.property_key.startsWith("street:");
    const wasLet = rows.find((r) => {
      if (r.market !== "let" || listedAt(r) >= listedAt(cur)) return false;
      const gap = (listedAt(cur) - listedAt(r)) / DAY;
      return oneProperty ? gap <= 730 : gap <= 365;
    });
    if (wasLet) {
      out.push({
        key: "let_to_sale",
        detail: `To let${wasLet.agent ? ` with ${wasLet.agent}` : ""} from ${dmy(wasLet.listed_on ?? wasLet.first_seen)}, for sale with ${agent} since ${dmy(cur.listed_on)}${cur.rent ? ` at ${pounds(cur.rent)}` : ""}`,
      });
      /* "Still on the market after X days" - James's words - is the rental
         that went up for sale and did not go. On its own, an unsold house in a
         town of 20,000 sale listings is not a lettings prospect: measured 2 Sep,
         2,083 of them over 120 days, 1,168 over 180 and reduced. So this only
         fires on a property that was a rental. */
      if (listedDays >= 120) {
        out.push({ key: "sale_stuck", detail: `${listedDays} days for sale and not gone` });
      }
    }
    return out;
  }

  /* A row keeps its last feed status after it leaves the feed, so "on market"
     alone would keep flagging a property for weeks after it let. */
  const onMarket = cur.status === "on market" && !cur.gone_at;
  /* Street-and-postcode keys can be two different flats. Signals that
     compare one listing with an earlier one are only trusted on a key that
     names one property. See propertyKeyOf in lib/listing-capture. */
  const oneProperty = !cur.property_key.startsWith("street:");

  if (onMarket && isPrivateLister(cur.agent)) {
    out.push({ key: "self_managing", detail: `Listed through ${cur.agent} - no agent involved` });
  }

  /* Homesearch keeps a withdrawn listing in the feed for months (3,087 of the
     first 5,848 rows swept were withdrawn, some a year old), so recency has
     to come from the listing date. Sixty days: withdrawn within two months of
     going up. Some of these let privately and the agent simply took the
     advert down - the detail says so, and the weight is set for that doubt. */
  if (cur.status === "withdrawn" && !cur.gone_at && !cur.let_agreed_at && listedDays <= 60) {
    out.push({
      key: "withdrawn",
      detail: `Withdrawn by ${agent} within ${listedDays} days of listing, never marked let`,
    });
  }

  if (cur.status === "fallen through") {
    out.push({ key: "fallen_through", detail: `A let fell through with ${agent}` });
  }

  /* Back on market: another listing of the same property, listed before this
     one and within a year of it. Only while THIS listing is recent, or the
     history would keep flagging a property that settled down long ago. */
  /* The sale that came before this let: tried to sell, could not, letting it
     instead. Same trust rule as the other cross-listing signals. */
  const prevSale = onMarket && listedDays <= 180
    ? rows.find((r) => {
        if (r.market !== "sale" || listedAt(r) >= listedAt(cur)) return false;
        const gap = (listedAt(cur) - listedAt(r)) / DAY;
        return oneProperty ? gap <= 730 : gap <= 365;
      })
    : undefined;
  if (prevSale) {
    out.push({
      key: "sale_to_let",
      detail: `For sale${prevSale.agent ? ` with ${prevSale.agent}` : ""} from ${dmy(prevSale.listed_on ?? prevSale.first_seen)}${prevSale.rent ? ` at ${pounds(prevSale.rent)}` : ""}, to let since ${dmy(cur.listed_on)}`,
    });
  }

  const prev = oneProperty && cur.status !== "let agreed" && !cur.gone_at
    ? rows.find((r) => r.market === "let" && r.listing_key !== cur.listing_key && listedAt(r) < listedAt(cur))
    : undefined;
  if (prev && listedDays <= 180) {
    const gap = Math.max(0, Math.round((listedAt(cur) - listedAt(prev)) / DAY));
    if (gap <= 365) {
      const prevAgent = (prev.agent ?? "").toLowerCase();
      const curAgent = (cur.agent ?? "").toLowerCase();
      if (prevAgent && curAgent && prevAgent !== curAgent) {
        out.push({ key: "switched_agent", detail: `Moved from ${prev.agent} to ${cur.agent}` });
      } else {
        out.push({ key: "relisted", detail: `Back on the market ${gap} days after the last listing` });
      }
    }
  }

  if (onMarket) {
    if (listedDays >= 90) out.push({ key: "stale_90", detail: `${listedDays} days on the market with ${agent}` });
    else if (listedDays >= 60) out.push({ key: "stale_60", detail: `${listedDays} days on the market with ${agent}` });
    else if (listedDays >= 30) out.push({ key: "stale_30", detail: `${listedDays} days on the market with ${agent}` });
  }

  if (onMarket) {
    const drop = drops.get(cur.listing_key);
    const reducedDays = daysSince(cur.reduced_at, now);
    if (drop) {
      out.push({ key: "reduced", detail: `Rent cut from ${pounds(drop.from)} to ${pounds(drop.to)} on ${dmy(new Date(drop.at))}` });
    } else if (reducedDays != null && reducedDays <= 90) {
      out.push({ key: "reduced", detail: `Reduced on ${dmy(cur.reduced_at)}, now ${pounds(cur.rent)}` });
    }
  }

  if (onMarket && !isPrivateLister(cur.agent) && listedDays <= 7) {
    out.push({ key: "competitor_new", detail: `Listed ${listedDays === 0 ? "today" : `${listedDays} days ago`} with ${agent}` });
  }

  return out;
}

/**
 * Derive every prospect in the watched districts again.
 *
 * Returns how many are active (score above zero) and how many went quiet this
 * run — a property whose signals all cleared keeps its row, its stage and its
 * notes, and simply drops off the default view.
 */
export async function refreshProspects(): Promise<{ active: number; quiet: number; properties: number }> {
  if (!hasDb()) return { active: 0, quiet: 0, properties: 0 };
  const districts = (await watchedDistricts()).map((d) => d.district);
  if (districts.length === 0) return { active: 0, quiet: 0, properties: 0 };

  const rows = await q<Lite>(
    `SELECT listing_key, property_key, uprn, address, street, postcode, sector, district,
            beds, property_type, rent, agent, status, market, listed_on, reduced_at, lat, lon,
            first_seen, last_seen, let_agreed_at, gone_at
       FROM os_listing_capture
      WHERE district = ANY($1::text[]) AND property_key IS NOT NULL`,
    [districts]
  );

  /* Rent reductions we SAW, in the last 90 days. Compared here rather than in
     SQL because the values are text and a cast on a bad row would fail the
     whole query. */
  const drops = new Map<string, { from: number; to: number; at: number }>();
  for (const e of await q<{ listing_key: string; from_value: string | null; to_value: string | null; at: Date | string }>(
    `SELECT listing_key, from_value, to_value, at FROM os_listing_events
      WHERE district = ANY($1::text[]) AND event = 'rent' AND at > NOW() - INTERVAL '90 days'
      ORDER BY at ASC`,
    [districts]
  )) {
    const from = Number(e.from_value);
    const to = Number(e.to_value);
    if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
      /* The earliest "from" and the latest "to" across a run of cuts. */
      const held = drops.get(e.listing_key);
      drops.set(e.listing_key, { from: held?.from ?? from, to, at: ms(e.at) ?? Date.now() });
    }
  }

  const groups = new Map<string, Lite[]>();
  for (const r of rows) {
    const g = groups.get(r.property_key);
    if (g) g.push(r);
    else groups.set(r.property_key, [r]);
  }

  const now = Date.now();
  const active: string[] = [];
  for (const [key, group] of groups) {
    group.sort((a, b) => listedAt(b) - listedAt(a) || (ms(b.first_seen) ?? 0) - (ms(a.first_seen) ?? 0));
    const cur = group[0];
    if (isOurs(cur.agent)) continue;
    const signals = signalsFor(group, drops, now);
    if (signals.length === 0) continue;
    const score = signals.reduce((n, s) => n + SIGNALS[s.key].weight, 0);
    active.push(key);
    await q(
      `INSERT INTO os_radar_prospects
         (property_key, listing_key, uprn, address, street, postcode, sector, district,
          beds, property_type, rent, agent, status, listed_on, signals, score,
          lat, lon, market, asking_price, last_signal_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20, NOW(), NOW())
       ON CONFLICT (property_key) DO UPDATE SET
         listing_key   = EXCLUDED.listing_key,
         uprn          = COALESCE(EXCLUDED.uprn, os_radar_prospects.uprn),
         address       = EXCLUDED.address,
         street        = COALESCE(EXCLUDED.street, os_radar_prospects.street),
         postcode      = EXCLUDED.postcode,
         sector        = EXCLUDED.sector,
         district      = EXCLUDED.district,
         beds          = COALESCE(EXCLUDED.beds, os_radar_prospects.beds),
         property_type = COALESCE(EXCLUDED.property_type, os_radar_prospects.property_type),
         rent          = EXCLUDED.rent,
         agent         = EXCLUDED.agent,
         status        = EXCLUDED.status,
         listed_on     = EXCLUDED.listed_on,
         signals       = EXCLUDED.signals,
         score         = EXCLUDED.score,
         lat           = COALESCE(EXCLUDED.lat, os_radar_prospects.lat),
         lon           = COALESCE(EXCLUDED.lon, os_radar_prospects.lon),
         market        = EXCLUDED.market,
         asking_price  = EXCLUDED.asking_price,
         /* Moves only when the signals actually changed, so "new today" and
            the sort by recency mean something. */
         last_signal_at = CASE
           WHEN os_radar_prospects.signals::text IS DISTINCT FROM EXCLUDED.signals::text
           THEN NOW() ELSE os_radar_prospects.last_signal_at END,
         updated_at    = NOW()`,
      [
        key,
        cur.listing_key,
        cur.uprn,
        cur.address || cur.street || "",
        cur.street,
        cur.postcode,
        cur.sector,
        cur.district,
        cur.beds,
        cur.property_type,
        cur.market === "let" ? cur.rent : null,
        cur.agent,
        cur.status,
        ymd(cur.listed_on),
        JSON.stringify(signals),
        score,
        cur.lat,
        cur.lon,
        cur.market,
        cur.market === "sale" ? cur.rent : null,
      ]
    );
  }

  const quiet = await q<{ property_key: string }>(
    `UPDATE os_radar_prospects
        SET signals = '[]'::jsonb, score = 0, updated_at = NOW()
      WHERE district = ANY($1::text[]) AND score > 0 AND NOT (property_key = ANY($2::text[]))
      RETURNING property_key`,
    [districts, active]
  );

  /* The company on the title, from the Land Registry files, and its signal.
     Imported lazily: lib/company-owners reads the watched districts from
     here, and a static import each way is a cycle. */
  const { matchCompanyOwners } = await import("@/lib/company-owners");
  await matchCompanyOwners();

  return { active: active.length, quiet: quiet.length, properties: groups.size };
}

/* ── Reading the list ─────────────────────────────────────────────────────── */

interface ProspectRow extends Record<string, unknown> {
  property_key: string;
  listing_key: string | null;
  uprn: string | null;
  address: string;
  street: string | null;
  postcode: string;
  sector: string | null;
  district: string | null;
  beds: number | null;
  property_type: string | null;
  rent: number | null;
  agent: string | null;
  status: string | null;
  listed_on: Date | string | null;
  lat: number | null;
  lon: number | null;
  market: "let" | "sale" | null;
  asking_price: number | null;
  signals: Signal[];
  score: number;
  stage: string;
  resolved_address: string | null;
  resolved_uprn: string | null;
  address_confidence: number | null;
  address_candidates: AddressCandidate[] | null;
  resolved_at: Date | string | null;
  assigned_to: string | null;
  notes: string;
  first_flagged: Date | string;
  last_signal_at: Date | string | null;
  last_action_at: Date | string | null;
  owner_company_name: string | null;
  owner_company_number: string | null;
  owner_company_address: string | null;
  owner_title_number: string | null;
  owner_name: string | null;
  owner_address: string | null;
  owner_source: string | null;
  owner_title: string | null;
  owner_at: Date | string | null;
}

/* The prospect row plus the latest owner anybody recorded for it. One query
   shape for the list and the single read, so the two can never disagree. */
const PROSPECT_SELECT = `
  SELECT r.*, o.owner_name, o.owner_address, o.owner_source, o.owner_title, o.owner_at
    FROM os_radar_prospects r
    LEFT JOIN LATERAL (
      SELECT l.owner_name, l.correspondence_address AS owner_address, l.provider AS owner_source,
             l.title_number AS owner_title, l.completed_at AS owner_at
        FROM os_bond_owner_lookups l
       WHERE l.property_key = r.property_key AND l.status = 'found'
       ORDER BY l.completed_at DESC NULLS LAST, l.id DESC
       LIMIT 1
    ) o ON TRUE`;

function toProspect(r: ProspectRow): Prospect {
  return {
    property_key: r.property_key,
    listing_key: r.listing_key,
    uprn: r.uprn,
    address: r.address,
    street: r.street,
    postcode: r.postcode,
    sector: r.sector,
    district: r.district,
    beds: r.beds,
    property_type: r.property_type,
    rent: r.rent,
    agent: r.agent,
    status: r.status,
    listed_on: ymd(r.listed_on),
    lat: r.lat,
    lon: r.lon,
    market: r.market === "sale" ? "sale" : "let",
    asking_price: r.asking_price ?? null,
    signals: Array.isArray(r.signals) ? r.signals : [],
    score: r.score,
    stage: isStage(r.stage) ? r.stage : "new",
    assigned_to: r.assigned_to,
    notes: r.notes ?? "",
    first_flagged: new Date(r.first_flagged).toISOString(),
    last_signal_at: r.last_signal_at ? new Date(r.last_signal_at).toISOString() : null,
    last_action_at: r.last_action_at ? new Date(r.last_action_at).toISOString() : null,
    resolved_address: r.resolved_address ?? null,
    resolved_uprn: r.resolved_uprn ?? null,
    address_confidence: r.address_confidence ?? null,
    address_candidates: Array.isArray(r.address_candidates) ? r.address_candidates : null,
    resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    company: r.owner_company_name
      ? {
          name: r.owner_company_name,
          number: r.owner_company_number ?? null,
          address: r.owner_company_address ?? "",
          title_number: r.owner_title_number ?? null,
        }
      : null,
    owner: r.owner_name
      ? {
          name: r.owner_name,
          address: r.owner_address ?? "",
          source: r.owner_source ?? "",
          title_number: r.owner_title ?? null,
          at: r.owner_at ? new Date(r.owner_at).toISOString() : "",
        }
      : null,
  };
}

/** One prospect, for the routes that act on a single property. */
export async function getProspect(key: string): Promise<Prospect | null> {
  if (!hasDb()) return null;
  const rows = await q<ProspectRow>(`${PROSPECT_SELECT} WHERE r.property_key = $1`, [key]);
  return rows[0] ? toProspect(rows[0]) : null;
}

/** Everything flagged, strongest first, plus anything somebody has worked
 *  even if it has since gone quiet. Capped well above the patch's size. */
export async function listProspects(): Promise<Prospect[]> {
  if (!hasDb()) return [];
  const rows = await q<ProspectRow>(
    `${PROSPECT_SELECT}
      WHERE r.score > 0 OR r.stage <> 'new'
      ORDER BY r.score DESC, r.last_signal_at DESC NULLS LAST, r.address
      LIMIT 3000`
  );
  return rows.map(toProspect);
}

export async function updateProspect(
  key: string,
  patch: { stage?: unknown; assigned_to?: unknown; notes?: unknown }
): Promise<Prospect | null> {
  if (!hasDb()) return null;
  const sets: string[] = [];
  const vals: unknown[] = [key];
  if (patch.stage !== undefined) {
    if (!isStage(patch.stage)) throw new Error(`"${String(patch.stage)}" is not a stage. One of: ${STAGES.join(", ")}.`);
    vals.push(patch.stage);
    sets.push(`stage = $${vals.length}`);
  }
  if (patch.assigned_to !== undefined) {
    vals.push(patch.assigned_to == null ? null : String(patch.assigned_to).trim() || null);
    sets.push(`assigned_to = $${vals.length}`);
  }
  if (patch.notes !== undefined) {
    vals.push(String(patch.notes ?? ""));
    sets.push(`notes = $${vals.length}`);
  }
  if (sets.length === 0) throw new Error("Nothing to change.");
  await q(
    `UPDATE os_radar_prospects SET ${sets.join(", ")}, last_action_at = NOW(), updated_at = NOW()
      WHERE property_key = $1`,
    vals
  );
  return getProspect(key);
}

export async function radarSummary(): Promise<RadarSummary> {
  const empty: RadarSummary = { districts: 0, districtList: [], lastRun: null, active: 0, newToday: 0, bySignal: {}, byStage: {} };
  if (!hasDb()) return empty;
  const districts = await watchedDistricts();
  const [counts] = await q<{ active: string; new_today: string }>(
    `SELECT count(*) FILTER (WHERE score > 0) AS active,
            count(*) FILTER (WHERE score > 0 AND first_flagged >= date_trunc('day', NOW())) AS new_today
       FROM os_radar_prospects`
  );
  const bySignal: Partial<Record<SignalKey, number>> = {};
  for (const r of await q<{ key: string; n: string }>(
    `SELECT s->>'key' AS key, count(*) AS n
       FROM os_radar_prospects, jsonb_array_elements(signals) s
      WHERE score > 0 GROUP BY 1`
  )) {
    if (r.key in SIGNALS) bySignal[r.key as SignalKey] = Number(r.n);
  }
  const byStage: Partial<Record<Stage, number>> = {};
  for (const r of await q<{ stage: string; n: string }>(
    `SELECT stage, count(*) AS n FROM os_radar_prospects WHERE score > 0 OR stage <> 'new' GROUP BY 1`
  )) {
    if (isStage(r.stage)) byStage[r.stage] = Number(r.n);
  }
  const lastRun = districts.reduce<number | null>((m, d) => {
    const t = ms(d.last_run_at);
    return t == null ? m : m == null ? t : Math.max(m, t);
  }, null);
  /* Patch order, not alphabetical: NN then MK, each numerically, because that
     is how James named the patch and how the header reads it back. Anything
     added by hand later sorts after, in its own natural order. */
  const rank = (d: string) => {
    const i = PATCH_DISTRICTS.indexOf(d);
    return i >= 0 ? i : PATCH_DISTRICTS.length + Number(d.replace(/\D/g, "") || 0);
  };
  const ordered = districts.map((d) => d.district).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return {
    districts: districts.length,
    districtList: ordered,
    lastRun: lastRun == null ? null : new Date(lastRun).toISOString(),
    active: Number(counts?.active ?? 0),
    newToday: Number(counts?.new_today ?? 0),
    bySignal,
    byStage,
  };
}

/* ── The digest ───────────────────────────────────────────────────────────── */

/**
 * The morning note: what Radar found, to whoever works the list.
 *
 * Recipients come from RADAR_DIGEST_TO (comma-separated) and every one must
 * be a colleague — lib/email-policy refuses anything else at the send path,
 * and this repeats the check so the refusal is reported here rather than
 * thrown from inside a loop. Unset means "not yet", and the run says so.
 */
export async function sendDigest(): Promise<{ sent: string[]; skipped: string | null }> {
  const raw = (process.env.RADAR_DIGEST_TO ?? "").trim();
  if (!raw) return { sent: [], skipped: "RADAR_DIGEST_TO is not set, so no digest went out." };
  if (!resendConfigured()) return { sent: [], skipped: "Resend is not configured on this environment." };
  if (!resendSendUnlocked()) return { sent: [], skipped: "Sending is locked on this environment (RESEND_ALLOW_SEND)." };

  const summary = await radarSummary();
  const top = (await listProspects()).filter((p) => p.stage === "new").slice(0, 10);
  const lines = [
    `Landlord Radar - ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
    ``,
    `${summary.active} properties flagged across ${summary.districts} districts, ${summary.newToday} new today.`,
    ``,
    ...Object.entries(summary.bySignal)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k, n]) => `  ${SIGNALS[k as SignalKey].label}: ${n}`),
    ``,
    `Top ten not yet worked:`,
    ...top.map(
      (p) =>
        `  ${p.score}  ${p.address || p.street || ""} ${p.postcode}${p.rent ? `  ${pounds(p.rent)} pcm` : ""}${
          p.agent ? `  (${p.agent})` : ""
        }\n      ${p.signals.map((s) => s.detail).join("; ")}`
    ),
    ``,
    `Open Radar: https://tle-os.co.uk/tools/radar`,
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:Unitext,Montserrat,sans-serif;font-size:13px;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`;

  const sent: string[] = [];
  for (const to of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    assertInternalRecipient(to);
    await sendEmail({ to, subject: `Landlord Radar: ${summary.active} flagged, ${summary.newToday} new`, html, text });
    sent.push(to);
  }
  return { sent, skipped: null };
}

export { STAGE_LABEL };
