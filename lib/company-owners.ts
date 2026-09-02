import "server-only";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import unzipper from "unzipper";
import { hasDb, q } from "@/lib/db";
import { watchedDistricts } from "@/lib/radar";
import { districtOf } from "@/lib/ma-research";

/**
 * Company owners, from the Land Registry's free files.
 *
 * ── What this is ─────────────────────────────────────────────────────────
 *
 * HM Land Registry publishes two files every month, free under the Open
 * Government Licence: every title in England and Wales owned by a UK company
 * (about 3.7 million rows) and every title owned by an overseas company
 * (about 100,000). Each row has the property address and postcode, the
 * company's name and registration number, and the company's correspondence
 * address. Private individuals are stripped by the Land Registry before
 * publication, so there is no personal data in here at all.
 *
 * About one rented home in six is company-owned (English Private Landlord
 * Survey 2024: 15% of tenancies). For those, this is the whole owner lookup,
 * at no cost: name, office, and a company number to look up the directors.
 *
 * ── How it runs ──────────────────────────────────────────────────────────
 *
 * The full file is over a gigabyte zipped. It is streamed, never held: fetch
 * → unzip → CSV lines → keep the rows whose postcode is in a watched district
 * → upsert. A run takes minutes and is started by a cron route that returns
 * immediately; os_company_sync records progress so the Owners room can say
 * "last read 3 September, 4,812 titles held" or "still running".
 *
 * Needs HMLR_DATA_API_KEY: an account on use-land-property-data.service.gov.uk
 * with the CCOD and OCOD licences accepted. James's to create. Without it
 * the sync reports what is missing and does nothing.
 *
 * ── Matching a flagged property to a title ───────────────────────────────
 *
 * Postcode plus the leading house number, both sides. "12 High Street" and
 * "Flat 3, 12 High Street" both start with a number, and the title's
 * property address carries the same one. Street-only listings (OpenRent)
 * have no number, so they do not match here - that is what the front-door
 * pinning is for, and once pinned they carry a numbered address and match on
 * the next refresh.
 */

const HMLR = "https://use-land-property-data.service.gov.uk/api/v1";
const key = () => (process.env.HMLR_DATA_API_KEY ?? "").trim();

export interface CompanySyncStatus {
  connected: boolean;
  needs: string[];
  titlesHeld: number;
  matched: number;
  lastRun: { dataset: string; file_name: string; status: string; rows_read: number; rows_kept: number; error: string | null; started_at: string; finished_at: string | null } | null;
  running: boolean;
}

export async function companySyncStatus(): Promise<CompanySyncStatus> {
  const needs = key()
    ? []
    : [
        "An account on use-land-property-data.service.gov.uk (free), with the UK companies and overseas companies licences accepted.",
        "HMLR_DATA_API_KEY on Railway: the API key from that account.",
      ];
  if (!hasDb()) return { connected: Boolean(key()), needs, titlesHeld: 0, matched: 0, lastRun: null, running: false };
  const [t] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_company_titles`);
  const [m] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_radar_prospects WHERE owner_company_name IS NOT NULL AND score > 0`);
  const runs = await q<CompanySyncStatus["lastRun"] & Record<string, unknown>>(
    `SELECT dataset, file_name, status, rows_read, rows_kept, error, started_at, finished_at
       FROM os_company_sync ORDER BY started_at DESC LIMIT 1`
  );
  const last = runs[0]
    ? {
        ...runs[0],
        started_at: new Date(runs[0].started_at).toISOString(),
        finished_at: runs[0].finished_at ? new Date(runs[0].finished_at).toISOString() : null,
      }
    : null;
  return {
    connected: Boolean(key()),
    needs,
    titlesHeld: Number(t?.n ?? 0),
    matched: Number(m?.n ?? 0),
    lastRun: last,
    running: last?.status === "running",
  };
}

/* ── CSV, the Land Registry way ───────────────────────────────────────────
   Every field double-quoted, comma separated, one record per line, no line
   breaks inside fields. A quote inside a field is doubled. */
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

const houseNumber = (addr: string): string | null => {
  const m = addr.match(/(?:^|\b(?:flat|apartment|unit)\s+\S+,?\s+)?(\d+[a-z]?)\b/i);
  return m ? m[1].toUpperCase() : null;
};

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

/** The CSV inside the zip, as a stream of text. */
async function csvStream(zip: Readable): Promise<Readable> {
  const dir = zip.pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of dir as AsyncIterable<unzipper.Entry>) {
    if (entry.path.toLowerCase().endsWith(".csv")) return entry as unknown as Readable;
    entry.autodrain();
  }
  throw new Error("No CSV inside the zip.");
}

async function latestFileName(dataset: "ccod" | "ocod"): Promise<string> {
  const r = await fetch(`${HMLR}/datasets/${dataset}`, {
    headers: { Authorization: key(), Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json()) as { success?: boolean; error?: string; result?: { resources?: Array<{ file_name: string; name: string }> } };
  if (!r.ok || !j.success) throw new Error(j.error ?? `Land Registry answered ${r.status}`);
  const full = (j.result?.resources ?? []).find((x) => /full/i.test(x.name) || /_FULL_/i.test(x.file_name));
  if (!full) throw new Error(`No full file listed for ${dataset}.`);
  return full.file_name;
}

async function downloadUrl(dataset: "ccod" | "ocod", file: string): Promise<string> {
  const r = await fetch(`${HMLR}/datasets/${dataset}/${file}`, {
    headers: { Authorization: key(), Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json()) as { success?: boolean; error?: string; result?: { download_url?: string } };
  if (!r.ok || !j.success || !j.result?.download_url) throw new Error(j.error ?? `No download link for ${file}`);
  return j.result.download_url;
}

/**
 * Read one dataset into os_company_titles, keeping only the patch.
 *
 * `localZip` is for verification on a laptop: a zip on disk in the same
 * format, instead of the download. Never used in production.
 */
export async function syncCompanyTitles(
  dataset: "ccod" | "ocod",
  opts: { localZip?: string } = {}
): Promise<{ ok: boolean; reason?: string; runId?: number }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  if (!opts.localZip && !key()) return { ok: false, reason: "HMLR_DATA_API_KEY is not set, so the Land Registry files cannot be read." };

  const districts = (await watchedDistricts()).map((d) => d.district);
  if (districts.length === 0) return { ok: false, reason: "No districts are watched yet." };
  const wanted = new Set(districts);

  const running = await q<{ id: number }>(`SELECT id FROM os_company_sync WHERE status = 'running' AND started_at > NOW() - INTERVAL '3 hours'`);
  if (running.length) return { ok: false, reason: "A sync is already running." };

  let fileName = opts.localZip ? opts.localZip.split("/").pop() ?? "local.zip" : "";
  const [run] = await q<{ id: number }>(
    `INSERT INTO os_company_sync (dataset, file_name) VALUES ($1, $2) RETURNING id`,
    [dataset, fileName]
  );
  const runId = run.id;

  /* Detached on purpose: the caller is a cron route that must answer now.
     Progress goes to the sync row, and failure goes there too. */
  void (async () => {
    let read = 0;
    let kept = 0;
    try {
      let zip: Readable;
      if (opts.localZip) {
        zip = createReadStream(opts.localZip);
      } else {
        fileName = await latestFileName(dataset);
        await q(`UPDATE os_company_sync SET file_name = $2 WHERE id = $1`, [runId, fileName]);
        const url = await downloadUrl(dataset, fileName);
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok || !r.body) throw new Error(`Download failed: ${r.status}`);
        zip = Readable.fromWeb(r.body as unknown as import("node:stream/web").ReadableStream);
      }
      const csv = await csvStream(zip);
      let header: string[] | null = null;
      let col: Record<string, number> = {};
      for await (const line of lines(csv)) {
        if (!header) {
          header = parseLine(line);
          col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
          continue;
        }
        if (!line.trim()) continue;
        read++;
        const f = parseLine(line);
        const postcode = (f[col["Postcode"]] ?? "").trim().toUpperCase();
        if (!postcode) continue;
        const district = districtOf(postcode);
        if (!district || !wanted.has(district)) continue;
        const name = (f[col["Proprietor Name (1)"]] ?? f[col["Proprietor name (1)"]] ?? "").trim();
        if (!name) continue;
        const address = (f[col["Property Address"]] ?? "").trim();
        const addr = [f[col["Proprietor (1) Address (1)"]], f[col["Proprietor (1) address (1)"]], f[col["Proprietor (1) Address (2)"]], f[col["Proprietor (1) address (2)"]]]
          .map((x) => (x ?? "").trim())
          .filter(Boolean)
          .join(" | ");
        const others = ["2", "3", "4"].filter((n) => (f[col[`Proprietor Name (${n})`]] ?? f[col[`Proprietor name (${n})`]] ?? "").trim()).length;
        const price = Number((f[col["Price Paid"]] ?? "").replace(/[^\d]/g, ""));
        const added = (f[col["Date Proprietor Added"]] ?? "").trim();
        const addedIso = /^\d{2}-\d{2}-\d{4}$/.test(added) ? added.split("-").reverse().join("-") : null;
        await q(
          `INSERT INTO os_company_titles
             (title_number, source, tenure, property_address, postcode, district, house_number,
              proprietor_name, company_number, category, proprietor_address, proprietor_country,
              other_proprietors, price_paid, proprietor_added, seen_in, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
           ON CONFLICT (title_number) DO UPDATE SET
             source = EXCLUDED.source, tenure = EXCLUDED.tenure, property_address = EXCLUDED.property_address,
             postcode = EXCLUDED.postcode, district = EXCLUDED.district, house_number = EXCLUDED.house_number,
             proprietor_name = EXCLUDED.proprietor_name, company_number = EXCLUDED.company_number,
             category = EXCLUDED.category, proprietor_address = EXCLUDED.proprietor_address,
             proprietor_country = EXCLUDED.proprietor_country, other_proprietors = EXCLUDED.other_proprietors,
             price_paid = EXCLUDED.price_paid, proprietor_added = EXCLUDED.proprietor_added,
             seen_in = EXCLUDED.seen_in, updated_at = NOW()`,
          [
            (f[col["Title Number"]] ?? "").trim(),
            dataset,
            (f[col["Tenure"]] ?? "").trim() || null,
            address,
            postcode,
            district,
            houseNumber(address),
            name,
            (f[col["Company Registration No. (1)"]] ?? "").trim() || null,
            (f[col["Proprietorship Category (1)"]] ?? "").trim() || null,
            addr,
            (f[col["Country Incorporated (1)"]] ?? "").trim() || null,
            others,
            Number.isFinite(price) && price > 0 ? price : null,
            addedIso,
            fileName,
          ]
        );
        kept++;
        if (kept % 500 === 0) {
          await q(`UPDATE os_company_sync SET rows_read = $2, rows_kept = $3 WHERE id = $1`, [runId, read, kept]);
        }
      }
      await q(`UPDATE os_company_sync SET status = 'done', rows_read = $2, rows_kept = $3, finished_at = NOW() WHERE id = $1`, [runId, read, kept]);
      await matchCompanyOwners();
    } catch (e) {
      await q(`UPDATE os_company_sync SET status = 'failed', rows_read = $2, rows_kept = $3, error = $4, finished_at = NOW() WHERE id = $1`, [
        runId,
        read,
        kept,
        (e as Error).message,
      ]);
    }
  })();

  return { ok: true, runId };
}

/**
 * Stamp the company onto every flagged property whose postcode and house
 * number agree with a title, and add the signal. Re-run after every sweep,
 * because prospects come and go daily and the titles change monthly.
 */
export async function matchCompanyOwners(): Promise<{ matched: number }> {
  if (!hasDb()) return { matched: 0 };
  const rows = await q<{ property_key: string }>(
    `WITH p AS (
       SELECT property_key, postcode,
              upper((regexp_match(coalesce(resolved_address, address), '\\d+[A-Za-z]?'))[1]) AS num
         FROM os_radar_prospects
     ),
     m AS (
       SELECT DISTINCT ON (p.property_key)
              p.property_key, t.proprietor_name, t.company_number, t.proprietor_address, t.title_number
         FROM p
         JOIN os_company_titles t
           ON upper(t.postcode) = upper(p.postcode)
          AND p.num IS NOT NULL
          AND t.house_number = p.num
        ORDER BY p.property_key, t.updated_at DESC
     )
     UPDATE os_radar_prospects r
        SET owner_company_name = m.proprietor_name,
            owner_company_number = m.company_number,
            owner_company_address = m.proprietor_address,
            owner_title_number = m.title_number,
            updated_at = NOW()
       FROM m
      WHERE r.property_key = m.property_key
      RETURNING r.property_key`
  );
  /* The signal rides on the recompute: refreshProspects rebuilds signals from
     scratch, so the company line is added afterwards, every time. */
  await q(
    `UPDATE os_radar_prospects
        SET signals = signals || jsonb_build_array(jsonb_build_object('key', 'company_owned', 'detail', 'Owned by ' || owner_company_name)),
            score = score + 10
      WHERE owner_company_name IS NOT NULL
        AND score > 0
        AND NOT (signals @> '[{"key":"company_owned"}]'::jsonb)`
  );
  return { matched: rows.length };
}
