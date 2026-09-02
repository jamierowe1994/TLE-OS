import "server-only";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { hasDb, q } from "@/lib/db";
import { watchedDistricts } from "@/lib/radar";
import { districtOf } from "@/lib/ma-research";

/**
 * Completed sales, from HM Land Registry Price Paid Data.
 *
 * Free, no account, no licence to sign beyond the Open Government Licence.
 * Published at 11am on the 20th working day of each month: a monthly update
 * (sales registered that month, about 18 MB) and one file per year of sale.
 * Sixteen columns, no header, every field quoted.
 *
 * ── Why Bond wants it ─────────────────────────────────────────────────────
 *
 * A sale followed within a year by a listing to let is a brand new landlord,
 * usually deciding in the first weeks whether to manage it themselves. That
 * is the best-timed prospect there is, and this file is the only free way to
 * see the sale. Homesearch carries a last-sold date per property, but only
 * one call at a time; this is the whole patch in one read.
 *
 * ── Caveats, stated ───────────────────────────────────────────────────────
 *
 * The register runs weeks to months behind completion, so "sold in May"
 * often appears in July's file. Late registrations from years back appear in
 * every monthly file too; they are kept, harmlessly, because the match asks
 * for a sale in the year before the listing. Category B rows (repossessions,
 * buy-to-lets bought at auction, transfers under a power of sale) are kept
 * and marked; they are if anything more interesting.
 */

const HOSTS = [
  "https://prod.publicdata.landregistry.gov.uk",
  "http://prod1.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com",
];

export type SalesFile = "monthly" | `${number}`;

function fileNameFor(f: SalesFile): string {
  return f === "monthly" ? "pp-monthly-update-new-version.csv" : `pp-${f}.csv`;
}

export interface SalesSyncStatus {
  salesHeld: number;
  recent: number;
  lastRun: { file_name: string; status: string; rows_read: number; rows_kept: number; error: string | null; started_at: string; finished_at: string | null } | null;
  running: boolean;
}

export async function salesSyncStatus(): Promise<SalesSyncStatus> {
  if (!hasDb()) return { salesHeld: 0, recent: 0, lastRun: null, running: false };
  const [t] = await q<{ n: string; r: string }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE sold_on > NOW() - INTERVAL '12 months') AS r FROM os_sales`
  );
  const runs = await q<NonNullable<SalesSyncStatus["lastRun"]> & Record<string, unknown>>(
    `SELECT file_name, status, rows_read, rows_kept, error, started_at, finished_at FROM os_sales_sync ORDER BY started_at DESC LIMIT 1`
  );
  const last = runs[0]
    ? { ...runs[0], started_at: new Date(runs[0].started_at).toISOString(), finished_at: runs[0].finished_at ? new Date(runs[0].finished_at).toISOString() : null }
    : null;
  return { salesHeld: Number(t?.n ?? 0), recent: Number(t?.r ?? 0), lastRun: last, running: last?.status === "running" };
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function* lines(stream: Readable): AsyncGenerator<string> {
  let buf = "";
  for await (const chunk of stream) {
    buf += chunk.toString("utf8");
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
    }
  }
  if (buf.trim()) yield buf;
}

/** The number in a PAON ("35", "35A", "ST. DAVIDS HOUSE" → none). */
const numberIn = (s: string): string | null => {
  const m = s.match(/\b(\d+[A-Z]?)\b/i);
  return m ? m[1].toUpperCase() : null;
};

async function open(f: SalesFile, localPath?: string): Promise<{ stream: Readable; name: string }> {
  if (localPath) return { stream: createReadStream(localPath), name: localPath.split("/").pop() ?? "local.csv" };
  const name = fileNameFor(f);
  let lastErr = "";
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/${name}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
      if (r.ok && r.body) {
        return { stream: Readable.fromWeb(r.body as unknown as import("node:stream/web").ReadableStream), name };
      }
      lastErr = `${host} answered ${r.status}`;
    } catch (e) {
      lastErr = `${host}: ${(e as Error).message}`;
    }
  }
  throw new Error(`Could not download ${name}: ${lastErr}`);
}

/**
 * Read one price-paid file into os_sales, keeping the watched districts.
 * Returns at once; the run reports into os_sales_sync.
 */
export async function syncSales(f: SalesFile, opts: { localPath?: string } = {}): Promise<{ ok: boolean; reason?: string; runId?: number }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  const districts = (await watchedDistricts()).map((d) => d.district);
  if (districts.length === 0) return { ok: false, reason: "No districts are watched yet." };
  const wanted = new Set(districts);
  const running = await q<{ id: number }>(`SELECT id FROM os_sales_sync WHERE status = 'running' AND started_at > NOW() - INTERVAL '2 hours'`);
  if (running.length) return { ok: false, reason: "A sales sync is already running." };

  const [run] = await q<{ id: number }>(`INSERT INTO os_sales_sync (file_name) VALUES ($1) RETURNING id`, [opts.localPath ?? fileNameFor(f)]);
  const runId = run.id;

  void (async () => {
    let read = 0;
    let kept = 0;
    try {
      const { stream, name } = await open(f, opts.localPath);
      for await (const line of lines(stream)) {
        if (!line.trim()) continue;
        read++;
        const c = parseLine(line);
        if (c.length < 16) continue;
        const postcode = c[3].trim().toUpperCase();
        const district = districtOf(postcode);
        if (!district || !wanted.has(district)) continue;
        const price = Number(c[1]);
        const soldOn = c[2].slice(0, 10);
        if (!Number.isFinite(price) || !/^\d{4}-\d{2}-\d{2}$/.test(soldOn)) continue;
        const paon = c[7].trim();
        const saon = c[8].trim();
        await q(
          `INSERT INTO os_sales
             (transaction_id, price, sold_on, postcode, district, property_type, new_build, tenure,
              paon, saon, street, town, house_number, category, record_status, seen_in, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
           ON CONFLICT (transaction_id) DO UPDATE SET
             price = EXCLUDED.price, sold_on = EXCLUDED.sold_on, postcode = EXCLUDED.postcode,
             district = EXCLUDED.district, property_type = EXCLUDED.property_type, new_build = EXCLUDED.new_build,
             tenure = EXCLUDED.tenure, paon = EXCLUDED.paon, saon = EXCLUDED.saon, street = EXCLUDED.street,
             town = EXCLUDED.town, house_number = EXCLUDED.house_number, category = EXCLUDED.category,
             record_status = EXCLUDED.record_status, seen_in = EXCLUDED.seen_in, updated_at = NOW()`,
          [
            c[0].trim(),
            Math.round(price),
            soldOn,
            postcode,
            district,
            c[4].trim() || null,
            c[5].trim().toUpperCase() === "Y",
            c[6].trim() || null,
            paon,
            saon,
            c[9].trim(),
            c[11].trim(),
            numberIn(paon),
            c[14].trim() || null,
            c[15].trim() || null,
            name,
          ]
        );
        kept++;
        if (kept % 500 === 0) await q(`UPDATE os_sales_sync SET rows_read = $2, rows_kept = $3 WHERE id = $1`, [runId, read, kept]);
      }
      /* A deleted record (status D) is a correction; drop it. */
      await q(`DELETE FROM os_sales WHERE record_status = 'D'`);
      await q(`UPDATE os_sales_sync SET status = 'done', rows_read = $2, rows_kept = $3, finished_at = NOW() WHERE id = $1`, [runId, read, kept]);
    } catch (e) {
      await q(`UPDATE os_sales_sync SET status = 'failed', rows_read = $2, rows_kept = $3, error = $4, finished_at = NOW() WHERE id = $1`, [
        runId,
        read,
        kept,
        (e as Error).message,
      ]);
    }
  })();

  return { ok: true, runId };
}

export interface RecentSale {
  postcode: string;
  house_number: string | null;
  saon: string;
  sold_on: string;
  price: number;
  new_build: boolean;
  category: string | null;
}

/**
 * Sales in the last 18 months for the watched districts, keyed by postcode,
 * for the signal pass. A few thousand rows, read once per refresh.
 */
export async function recentSales(districts: string[]): Promise<Map<string, RecentSale[]>> {
  const out = new Map<string, RecentSale[]>();
  if (!hasDb() || districts.length === 0) return out;
  const rows = await q<RecentSale & Record<string, unknown>>(
    `SELECT upper(postcode) AS postcode, house_number, saon, sold_on::text AS sold_on, price, new_build, category
       FROM os_sales
      WHERE district = ANY($1::text[]) AND sold_on > NOW() - INTERVAL '18 months'`,
    [districts]
  );
  for (const r of rows) {
    const list = out.get(r.postcode);
    if (list) list.push(r);
    else out.set(r.postcode, [r]);
  }
  return out;
}

/**
 * Does this listing's address agree with a sale? The house number from the
 * sale's PAON must be one of the numbers in the listing's address, and if the
 * sale names a flat number that must be there too. "Flat 8, 35 Shore Road"
 * against PAON 35 / SAON FLAT 8: yes. Against PAON 37: no.
 */
export function saleMatches(address: string, sale: RecentSale): boolean {
  if (!sale.house_number) return false;
  const tokens = new Set((address.toUpperCase().match(/\b\d+[A-Z]?\b/g) ?? []).map((t) => t.toUpperCase()));
  if (!tokens.has(sale.house_number)) return false;
  const flat = numberIn(sale.saon);
  return flat ? tokens.has(flat) : true;
}
