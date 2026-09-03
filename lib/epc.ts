import "server-only";
import { hasDb, q } from "@/lib/db";
import { districtOf } from "@/lib/ma-research";

/**
 * Energy Performance Certificates, from the government's register.
 *
 * ── What it is for ───────────────────────────────────────────────────────
 *
 * Two signals. A rating below C is a landlord with a 2030 problem: every
 * private rental must reach C by October 2030 and the work is the landlord's
 * to organise. A certificate near its tenth birthday is a landlord who
 * cannot re-let without a new one. Both are reasons to write, and both come
 * from a free register.
 *
 * ── The service ──────────────────────────────────────────────────────────
 *
 * The old opendatacommunities API closed in May 2026. The replacement is
 * "Get energy performance of buildings data": a GOV.UK One Login account,
 * a bearer token from the account page, and GET /api/domestic/search with
 * council filters and pages of up to 5,000 (documented 3 Sep 2026). The
 * search answers with address, postcode, UPRN, the current band and the
 * registration date, which is all these signals need. Transaction type and
 * tenure sit on the full certificate and are not fetched here.
 *
 * Needs EPC_API_TOKEN on Railway. Until then the status says so and
 * nothing runs. The council names are the ones the register uses; they are
 * listed here rather than looked up so the run is one request per page.
 */

const EPC = "https://api.get-energy-performance-data.communities.gov.uk";
const token = () => (process.env.EPC_API_TOKEN ?? "").trim();

/** The councils covering NN, MK and Bedford. */
export const EPC_COUNCILS = ["West Northamptonshire", "North Northamptonshire", "Milton Keynes", "Bedford"];

export interface EpcSyncStatus {
  connected: boolean;
  needs: string[];
  certificatesHeld: number;
  belowC: number;
  expiringSoon: number;
  matched: number;
  /** Flagged doors carrying a condition score. */
  scored: number;
  lastRun: { council: string; status: string; rows_read: number; rows_kept: number; error: string | null; started_at: string; finished_at: string | null } | null;
  running: boolean;
}

export async function epcSyncStatus(): Promise<EpcSyncStatus> {
  const needs = token()
    ? []
    : [
        "A GOV.UK One Login account on get-energy-performance-data.communities.gov.uk (free).",
        "EPC_API_TOKEN on Railway: the bearer token from that account's page.",
      ];
  if (!hasDb()) return { connected: Boolean(token()), needs, certificatesHeld: 0, belowC: 0, expiringSoon: 0, matched: 0, scored: 0, lastRun: null, running: false };
  const [t] = await q<{ n: string; c: string; e: string }>(
    `SELECT count(*) AS n,
            count(*) FILTER (WHERE band IN ('D','E','F','G')) AS c,
            count(*) FILTER (WHERE registered_on BETWEEN CURRENT_DATE - INTERVAL '10 years' AND CURRENT_DATE - INTERVAL '9 years') AS e
       FROM os_epc`
  );
  const [m] = await q<{ n: string; s: string }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE condition_score IS NOT NULL) AS s FROM os_radar_prospects WHERE epc_band IS NOT NULL`
  );
  const runs = await q<NonNullable<EpcSyncStatus["lastRun"]> & Record<string, unknown>>(
    `SELECT council, status, rows_read, rows_kept, error, started_at, finished_at FROM os_epc_sync ORDER BY started_at DESC LIMIT 1`
  );
  const last = runs[0]
    ? { ...runs[0], started_at: new Date(runs[0].started_at).toISOString(), finished_at: runs[0].finished_at ? new Date(runs[0].finished_at).toISOString() : null }
    : null;
  return {
    connected: Boolean(token()),
    needs,
    certificatesHeld: Number(t?.n ?? 0),
    belowC: Number(t?.c ?? 0),
    expiringSoon: Number(t?.e ?? 0),
    matched: Number(m?.n ?? 0),
    scored: Number(m?.s ?? 0),
    lastRun: last,
    running: last?.status === "running",
  };
}

interface Row {
  certificateNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  postcode?: string;
  uprn?: string | number | null;
  currentEnergyEfficiencyBand?: string;
  potentialEnergyEfficiencyBand?: string;
  registrationDate?: string;
  council?: string;
}

const numberIn = (s: string) => s.match(/\b(\d+[A-Z]?)\b/i)?.[1]?.toUpperCase() ?? null;

/**
 * Read one council's certificates, page by page. Returns at once; progress
 * in os_epc_sync. The register keeps every certificate ever lodged, so the
 * newest per address is what matters and the upsert keeps that.
 */
export async function syncEpc(council: string): Promise<{ ok: boolean; reason?: string; runId?: number }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  if (!token()) return { ok: false, reason: "EPC_API_TOKEN is not set, so the register cannot be read." };
  const wanted = new Set((await q<{ district: string }>(`SELECT district FROM os_radar_districts`)).map((r) => r.district));
  const running = await q<{ id: number }>(`SELECT id FROM os_epc_sync WHERE status = 'running' AND started_at > NOW() - INTERVAL '2 hours'`);
  if (running.length) return { ok: false, reason: "An EPC sync is already running." };
  const [run] = await q<{ id: number }>(`INSERT INTO os_epc_sync (council) VALUES ($1) RETURNING id`, [council]);

  void (async () => {
    let read = 0;
    let kept = 0;
    try {
      for (let page = 1; page < 400; page++) {
        const url = `${EPC}/api/domestic/search?council[]=${encodeURIComponent(council)}&page_size=5000&current_page=${page}`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(60_000),
        });
        if (r.status === 429) {
          await new Promise((res) => setTimeout(res, 60_000));
          page--;
          continue;
        }
        if (!r.ok) throw new Error(`The register answered ${r.status} on page ${page}`);
        const j = (await r.json()) as { data?: Row[]; pagination?: { total_pages?: number; totalPages?: number } };
        const rows = j.data ?? [];
        if (rows.length === 0) break;
        for (const row of rows) {
          read++;
          const postcode = (row.postcode ?? "").toUpperCase().trim();
          const district = districtOf(postcode);
          if (!district || !wanted.has(district)) continue;
          const address = [row.addressLine1, row.addressLine2].filter(Boolean).join(", ").trim();
          const band = (row.currentEnergyEfficiencyBand ?? "").toUpperCase().trim();
          const potential = (row.potentialEnergyEfficiencyBand ?? "").toUpperCase().trim();
          const registered = (row.registrationDate ?? "").slice(0, 10);
          if (!row.certificateNumber || !/^\d{4}-\d{2}-\d{2}$/.test(registered)) continue;
          await q(
            `INSERT INTO os_epc (certificate, council, address, postcode, district, house_number, uprn, band, potential_band, registered_on, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
             ON CONFLICT (certificate) DO UPDATE SET
               address = EXCLUDED.address, postcode = EXCLUDED.postcode, district = EXCLUDED.district,
               house_number = EXCLUDED.house_number, uprn = EXCLUDED.uprn, band = EXCLUDED.band,
               potential_band = EXCLUDED.potential_band, registered_on = EXCLUDED.registered_on, updated_at = NOW()`,
            [row.certificateNumber, council, address, postcode, district, numberIn(address), row.uprn == null ? null : String(row.uprn), band || null, potential || null, registered]
          );
          kept++;
        }
        await q(`UPDATE os_epc_sync SET rows_read = $2, rows_kept = $3 WHERE id = $1`, [run.id, read, kept]);
        const totalPages = j.pagination?.total_pages ?? j.pagination?.totalPages;
        if (totalPages != null && page >= Number(totalPages)) break;
        if (rows.length < 5000) break;
      }
      await q(`UPDATE os_epc_sync SET status = 'done', rows_read = $2, rows_kept = $3, finished_at = NOW() WHERE id = $1`, [run.id, read, kept]);
      await matchEpc();
    } catch (e) {
      await q(`UPDATE os_epc_sync SET status = 'failed', rows_read = $2, rows_kept = $3, error = $4, finished_at = NOW() WHERE id = $1`, [run.id, read, kept, (e as Error).message]);
    }
  })();

  return { ok: true, runId: run.id };
}

/**
 * The newest certificate for each flagged door, by UPRN first and by
 * postcode and house number otherwise; then the two signals.
 */
export async function matchEpc(): Promise<{ matched: number }> {
  if (!hasDb()) return { matched: 0 };
  const rows = await q<{ property_key: string }>(
    `WITH p AS (
       SELECT property_key, postcode, uprn,
              upper((regexp_match(coalesce(resolved_address, address), '\\d+[A-Za-z]?'))[1]) AS num
         FROM os_radar_prospects
     ),
     m AS (
       SELECT DISTINCT ON (p.property_key) p.property_key, e.band, e.registered_on
         FROM p JOIN os_epc e
           ON (p.uprn IS NOT NULL AND e.uprn = p.uprn)
           OR (upper(e.postcode) = upper(p.postcode) AND p.num IS NOT NULL AND e.house_number = p.num)
        ORDER BY p.property_key, e.registered_on DESC
     )
     UPDATE os_radar_prospects r
        SET epc_band = m.band, epc_registered_on = m.registered_on, updated_at = NOW()
       FROM m WHERE r.property_key = m.property_key
      RETURNING r.property_key`
  );
  /* THE CONDITION SCORE. The band is most of it: A 95, B 85, C 70, D 55,
     E 40, F 25, G 10. A certificate over eight years old takes five off,
     because the house has had eight years to drift from it. A big gap to
     the potential band takes a little more off: it means the fabric is
     poor and the fixes are known. Spectre shows a "portfolio condition
     score" out of 100; this is ours, and it is arithmetic, not a feeling. */
  await q(
    `WITH e AS (
       SELECT DISTINCT ON (p.property_key) p.property_key, x.band, x.potential_band, x.registered_on
         FROM os_radar_prospects p
         JOIN os_epc x ON (p.uprn IS NOT NULL AND x.uprn = p.uprn)
                       OR (upper(x.postcode) = upper(p.postcode)
                           AND x.house_number = upper((regexp_match(coalesce(p.resolved_address, p.address), '\\d+[A-Za-z]?'))[1]))
        ORDER BY p.property_key, x.registered_on DESC
     )
     UPDATE os_radar_prospects r
        SET condition_score = GREATEST(0, LEAST(100,
              CASE e.band WHEN 'A' THEN 95 WHEN 'B' THEN 85 WHEN 'C' THEN 70 WHEN 'D' THEN 55 WHEN 'E' THEN 40 WHEN 'F' THEN 25 WHEN 'G' THEN 10 ELSE NULL END
              - CASE WHEN e.registered_on < CURRENT_DATE - INTERVAL '8 years' THEN 5 ELSE 0 END
              - CASE WHEN e.potential_band IS NOT NULL AND e.band IS NOT NULL
                     AND (ascii(e.band) - ascii(e.potential_band)) >= 3 THEN 5 ELSE 0 END))
       FROM e WHERE e.property_key = r.property_key`
  );
  await q(
    `UPDATE os_radar_prospects
        SET signals = signals || jsonb_build_array(jsonb_build_object('key', 'epc_below_c', 'detail', 'EPC ' || epc_band || ', must reach C by October 2030')),
            score = score + 10, updated_at = NOW()
      WHERE epc_band IN ('D','E','F','G') AND score > 0
        AND NOT (signals @> '[{"key":"epc_below_c"}]'::jsonb)`
  );
  await q(
    `UPDATE os_radar_prospects
        SET signals = signals || jsonb_build_array(jsonb_build_object('key', 'epc_expiring', 'detail', 'EPC from ' || to_char(epc_registered_on, 'Mon YYYY') || ' runs out ' || to_char(epc_registered_on + INTERVAL '10 years', 'Mon YYYY'))),
            score = score + 15, updated_at = NOW()
      WHERE epc_registered_on BETWEEN CURRENT_DATE - INTERVAL '10 years' AND CURRENT_DATE - INTERVAL '9 years'
        AND score > 0
        AND NOT (signals @> '[{"key":"epc_expiring"}]'::jsonb)`
  );
  return { matched: rows.length };
}
