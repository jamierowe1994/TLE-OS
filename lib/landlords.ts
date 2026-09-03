import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Prospect } from "@/lib/radar-signals";
import { listProspects } from "@/lib/radar";

/**
 * Landlords: the unit Bond works in.
 *
 * Spectre's list is people and companies with a portfolio, a score and a
 * marketing status; ours was doors. This gathers the doors into the
 * landlords behind them, from what we can lawfully know:
 *
 *   company   the Land Registry company files - every title a company holds
 *             in the patch, whether flagged or not, so the portfolio is the
 *             real one, not just what is on the market today
 *   owner     an owner somebody recorded on a door (LandInsight, a title, the
 *             HMO register...) - one landlord per name and address
 *
 * REX landlords come next, once the read is wired. Rebuilt after every
 * rescore, keyed so the human side - marketing status, LinkedIn, notes -
 * stays put across rebuilds.
 *
 * ── The opportunity score ─────────────────────────────────────────────────
 *
 * The strongest flagged door plus a little for each further flagged door,
 * plus a little for portfolio size, capped at 100. It is a ranking, not a
 * probability; the band names on the screen say Very high / High / Medium /
 * Low so nobody reads false precision into it.
 */

export type LandlordKind = "company" | "individual" | "unknown";
export type MarketingStatus = "active" | "do_not_send";

export interface Landlord {
  landlord_key: string;
  kind: LandlordKind;
  name: string;
  company_number: string | null;
  address: string;
  source: string;
  portfolio_size: number;
  flagged: number;
  score: number;
  band: "Very high" | "High" | "Medium" | "Low";
  marketing_status: MarketingStatus;
  linkedin_url: string | null;
  notes: string;
  last_written_at: string | null;
  first_seen: string;
  /** Average condition over the doors with a certificate, and how many that is. */
  condition_score: number | null;
  condition_doors: number;
}

export interface LandlordDoor {
  property_key: string;
  address: string;
  postcode: string;
  via: string;
  prospect: Prospect | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function bandOf(score: number): Landlord["band"] {
  return score >= 70 ? "Very high" : score >= 45 ? "High" : score >= 25 ? "Medium" : "Low";
}

/**
 * Derive every landlord again from the sources, keep the human fields, and
 * score them. Seconds on the patch.
 */
export async function rebuildLandlords(): Promise<{ landlords: number; doors: number }> {
  if (!hasDb()) return { landlords: 0, doors: 0 };

  /* Companies, from the Land Registry files: one landlord per company
     number (or name where the file has no number). Every title in the patch
     counts towards the portfolio. */
  await q(
    `INSERT INTO os_bond_landlords (landlord_key, kind, name, company_number, address, source, portfolio_size)
     SELECT 'co:' || coalesce(nullif(company_number, ''), lower(regexp_replace(proprietor_name, '[^A-Za-z0-9]+', ' ', 'g'))) AS landlord_key,
            'company', max(proprietor_name), max(nullif(company_number, '')),
            coalesce(max(nullif(proprietor_address, '')), ''), 'land_registry', count(*)
       FROM os_company_titles
      GROUP BY 1
     ON CONFLICT (landlord_key) DO UPDATE SET
       name = EXCLUDED.name, company_number = EXCLUDED.company_number,
       address = CASE WHEN EXCLUDED.address <> '' THEN EXCLUDED.address ELSE os_bond_landlords.address END,
       portfolio_size = EXCLUDED.portfolio_size, updated_at = NOW()`
  );
  await q(
    `INSERT INTO os_bond_landlord_doors (landlord_key, property_key, address, postcode, via)
     SELECT 'co:' || coalesce(nullif(t.company_number, ''), lower(regexp_replace(t.proprietor_name, '[^A-Za-z0-9]+', ' ', 'g'))),
            coalesce(p.property_key, 'title:' || t.title_number), t.property_address, t.postcode, 'land_registry'
       FROM os_company_titles t
       LEFT JOIN os_radar_prospects p ON p.owner_title_number = t.title_number
     ON CONFLICT (landlord_key, property_key) DO UPDATE SET address = EXCLUDED.address, postcode = EXCLUDED.postcode`
  );

  /* Owners recorded by hand or by a provider: one landlord per name and
     correspondence address. */
  const owners = await q<{ owner_name: string; correspondence_address: string; property_key: string; address: string; provider: string | null }>(
    `SELECT DISTINCT ON (property_key) owner_name, coalesce(correspondence_address, '') AS correspondence_address, property_key, address, provider
       FROM os_bond_owner_lookups WHERE status = 'found' AND owner_name IS NOT NULL
      ORDER BY property_key, completed_at DESC NULLS LAST, id DESC`
  );
  for (const o of owners) {
    const key = `own:${norm(o.owner_name)}|${norm(o.correspondence_address).slice(0, 40)}`;
    const looksCompany = /\b(ltd|limited|plc|llp|holdings|properties|investments|group)\b/i.test(o.owner_name);
    await q(
      `INSERT INTO os_bond_landlords (landlord_key, kind, name, address, source, portfolio_size)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (landlord_key) DO UPDATE SET
         name = EXCLUDED.name, address = CASE WHEN EXCLUDED.address <> '' THEN EXCLUDED.address ELSE os_bond_landlords.address END,
         updated_at = NOW()`,
      [key, looksCompany ? "company" : "individual", o.owner_name.trim(), o.correspondence_address.trim(), o.provider ?? "owner"]
    );
    const pc = o.address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i)?.[1]?.toUpperCase() ?? "";
    await q(
      `INSERT INTO os_bond_landlord_doors (landlord_key, property_key, address, postcode, via)
       VALUES ($1, $2, $3, $4, 'owner')
       ON CONFLICT (landlord_key, property_key) DO NOTHING`,
      [key, o.property_key, o.address, pc]
    );
  }

  /* Portfolio for owner-based landlords is the doors we have tied to them. */
  await q(
    `UPDATE os_bond_landlords l SET portfolio_size = d.n
       FROM (SELECT landlord_key, count(*) AS n FROM os_bond_landlord_doors GROUP BY landlord_key) d
      WHERE d.landlord_key = l.landlord_key AND l.landlord_key LIKE 'own:%'`
  );

  /* Flagged doors and the score. */
  const rows = await q<{ landlord_key: string }>(
    `WITH f AS (
       SELECT d.landlord_key,
              count(*) FILTER (WHERE p.score > 0) AS flagged,
              coalesce(max(p.score), 0) AS best,
              coalesce(sum(p.score) FILTER (WHERE p.score > 0), 0) AS total
         FROM os_bond_landlord_doors d
         LEFT JOIN os_radar_prospects p ON p.property_key = d.property_key
        GROUP BY d.landlord_key
     )
     UPDATE os_bond_landlords l
        SET flagged = f.flagged,
            score = LEAST(100, f.best + LEAST(30, GREATEST(0, f.flagged - 1) * 8) + LEAST(15, GREATEST(0, l.portfolio_size - 1) * 2)),
            updated_at = NOW()
       FROM f WHERE f.landlord_key = l.landlord_key
     RETURNING l.landlord_key`
  );
  /* Portfolio condition: the average over the doors that have a certificate. */
  await q(
    `UPDATE os_bond_landlords l
        SET condition_score = c.avg, condition_doors = c.n
       FROM (SELECT d.landlord_key, round(avg(p.condition_score))::int AS avg, count(p.condition_score)::int AS n
               FROM os_bond_landlord_doors d JOIN os_radar_prospects p ON p.property_key = d.property_key
              WHERE p.condition_score IS NOT NULL GROUP BY d.landlord_key) c
      WHERE c.landlord_key = l.landlord_key`
  );
  const [d] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_bond_landlord_doors`);
  return { landlords: rows.length, doors: Number(d?.n ?? 0) };
}

function toLandlord(r: Record<string, unknown>): Landlord {
  const score = Number(r.score ?? 0);
  return {
    landlord_key: String(r.landlord_key),
    kind: (r.kind as LandlordKind) ?? "unknown",
    name: String(r.name ?? ""),
    company_number: (r.company_number as string) ?? null,
    address: String(r.address ?? ""),
    source: String(r.source ?? ""),
    portfolio_size: Number(r.portfolio_size ?? 0),
    flagged: Number(r.flagged ?? 0),
    score,
    band: bandOf(score),
    marketing_status: r.marketing_status === "do_not_send" ? "do_not_send" : "active",
    linkedin_url: (r.linkedin_url as string) ?? null,
    notes: String(r.notes ?? ""),
    last_written_at: r.last_written_at ? new Date(r.last_written_at as string).toISOString() : null,
    first_seen: new Date(r.first_seen as string).toISOString(),
    condition_score: r.condition_score == null ? null : Number(r.condition_score),
    condition_doors: Number(r.condition_doors ?? 0),
  };
}

export async function listLandlords(opts: { districts?: string[] } = {}): Promise<Landlord[]> {
  if (!hasDb()) return [];
  const rows = opts.districts && opts.districts.length
    ? await q<Record<string, unknown>>(
        `SELECT DISTINCT l.* FROM os_bond_landlords l
           JOIN os_bond_landlord_doors d ON d.landlord_key = l.landlord_key
          WHERE upper(split_part(d.postcode, ' ', 1)) = ANY($1::text[])
          ORDER BY l.score DESC, l.portfolio_size DESC, l.name LIMIT 2000`,
        [opts.districts]
      )
    : await q<Record<string, unknown>>(`SELECT * FROM os_bond_landlords ORDER BY score DESC, portfolio_size DESC, name LIMIT 2000`);
  return rows.map(toLandlord);
}

export async function getLandlord(key: string): Promise<{ landlord: Landlord; doors: LandlordDoor[] } | null> {
  if (!hasDb()) return null;
  const rows = await q<Record<string, unknown>>(`SELECT * FROM os_bond_landlords WHERE landlord_key = $1`, [key]);
  if (!rows[0]) return null;
  const doorRows = await q<{ property_key: string; address: string; postcode: string; via: string }>(
    `SELECT property_key, address, postcode, via FROM os_bond_landlord_doors WHERE landlord_key = $1 ORDER BY postcode, address LIMIT 500`,
    [key]
  );
  const keys = new Set(doorRows.map((d) => d.property_key));
  const prospects = (await listProspects()).filter((p) => keys.has(p.property_key));
  const byKey = new Map(prospects.map((p) => [p.property_key, p]));
  return {
    landlord: toLandlord(rows[0]),
    doors: doorRows.map((d) => ({ ...d, prospect: byKey.get(d.property_key) ?? null })),
  };
}

export async function updateLandlord(
  key: string,
  patch: { marketing_status?: unknown; linkedin_url?: unknown; notes?: unknown }
): Promise<Landlord | null> {
  if (!hasDb()) return null;
  const sets: string[] = [];
  const vals: unknown[] = [key];
  if (patch.marketing_status !== undefined) {
    const v = patch.marketing_status === "do_not_send" ? "do_not_send" : "active";
    vals.push(v);
    sets.push(`marketing_status = $${vals.length}`);
  }
  if (patch.linkedin_url !== undefined) {
    const v = String(patch.linkedin_url ?? "").trim();
    if (v && !/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(v)) throw new Error("That is not a LinkedIn address.");
    vals.push(v || null);
    sets.push(`linkedin_url = $${vals.length}`);
  }
  if (patch.notes !== undefined) {
    vals.push(String(patch.notes ?? ""));
    sets.push(`notes = $${vals.length}`);
  }
  if (sets.length === 0) throw new Error("Nothing to change.");
  const rows = await q<Record<string, unknown>>(
    `UPDATE os_bond_landlords SET ${sets.join(", ")}, updated_at = NOW() WHERE landlord_key = $1 RETURNING *`,
    vals
  );
  return rows[0] ? toLandlord(rows[0]) : null;
}
