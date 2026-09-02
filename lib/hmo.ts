import "server-only";
import { readFileSync } from "node:fs";
import { hasDb, q } from "@/lib/db";
import { districtOf } from "@/lib/ma-research";

/**
 * HMO licences, from the councils' public registers.
 *
 * Every licensing council must publish a register. West Northamptonshire
 * publishes a redacted PDF each month: category, households, people, licence
 * date, address, postcode, the issuing body, a reference, and the expiry.
 * No holder name in the redacted file. That is still plenty: an HMO is a
 * portfolio landlord's property by definition, and a licence about to run
 * out is a landlord with council paperwork ahead of them.
 *
 * ── How the file is found ─────────────────────────────────────────────────
 *
 * The PDF's name carries the month, so the link is read off the council's
 * register page each run rather than pinned. If the page changes shape the
 * run fails loudly with the page URL, and nothing is written.
 *
 * ── How it is read ────────────────────────────────────────────────────────
 *
 * pdf-parse with a page renderer that keeps a space between text items -
 * its default runs cells together ("Mandatory6627/02/2023...") and nothing
 * can be parsed out of that. With spaces, each licence is one match of a
 * single pattern. Measured on the February 2026 file: 1,122 licences, 41 of
 * them expiring between September and December 2026.
 *
 * Other councils in the patch (Milton Keynes, Bedford, North Northants)
 * publish differently and are not read yet; the sync reports which councils
 * it knows about.
 */

interface RegisterSource {
  council: string;
  page: string;
  /** Finds the current PDF link on the page. */
  link: RegExp;
}

export const HMO_REGISTERS: RegisterSource[] = [
  {
    council: "West Northamptonshire",
    page: "https://www.westnorthants.gov.uk/private-housing-tenants-and-landlords/houses-multiple-occupation-hmos/hmo-public-register-and",
    link: /href="([^"]*HMO[^"]*Register[^"]*\.pdf)"/i,
  },
];

const ROW =
  /(Mandatory|Additional|TEN|Selective)\s+(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\s+(.+?)\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})/g;

/** DD/MM/YYYY to ISO, or null when the council typed a day that does not
 *  exist. The February 2026 file has a "31/04/2024"; one bad date must not
 *  fail the other thousand licences. */
const iso = (dmy: string): string | null => {
  const [d, m, y] = dmy.split("/").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
};
const numberIn = (s: string) => s.match(/\b(\d+[A-Z]?)\b/i)?.[1]?.toUpperCase() ?? null;

async function pdfText(buf: Buffer): Promise<string> {
  /* The package's index.js runs a self-test that opens a fixture file when
     it thinks it is not the main module, which under Next's bundling it never
     is; the library entry is imported directly to skip it. */
  const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as unknown as (
    data: Buffer,
    opts?: { pagerender?: (page: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => Promise<string> }
  ) => Promise<{ text: string; numpages: number }>;
  const out = await pdf(buf, {
    pagerender: (page) => page.getTextContent().then((tc) => tc.items.map((i) => i.str).join(" ")),
  });
  return out.text.replace(/\s+/g, " ");
}

export interface HmoSyncStatus {
  councils: string[];
  licencesHeld: number;
  expiringSoon: number;
  matched: number;
  lastRun: { council: string; file_name: string; status: string; rows_kept: number; error: string | null; started_at: string; finished_at: string | null } | null;
  running: boolean;
}

export async function hmoSyncStatus(): Promise<HmoSyncStatus> {
  const councils = HMO_REGISTERS.map((r) => r.council);
  if (!hasDb()) return { councils, licencesHeld: 0, expiringSoon: 0, matched: 0, lastRun: null, running: false };
  const [t] = await q<{ n: string; e: string }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 150) AS e FROM os_hmo_licences`
  );
  const [m] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_radar_prospects WHERE hmo_licence_ref IS NOT NULL`);
  const runs = await q<NonNullable<HmoSyncStatus["lastRun"]> & Record<string, unknown>>(
    `SELECT council, file_name, status, rows_kept, error, started_at, finished_at FROM os_hmo_sync ORDER BY started_at DESC LIMIT 1`
  );
  const last = runs[0]
    ? { ...runs[0], started_at: new Date(runs[0].started_at).toISOString(), finished_at: runs[0].finished_at ? new Date(runs[0].finished_at).toISOString() : null }
    : null;
  return { councils, licencesHeld: Number(t?.n ?? 0), expiringSoon: Number(t?.e ?? 0), matched: Number(m?.n ?? 0), lastRun: last, running: last?.status === "running" };
}

/**
 * Read one council's register. Synchronous - the file is half a megabyte -
 * so the caller gets the count straight back.
 */
export async function syncHmoRegister(council: string, opts: { localPdf?: string } = {}): Promise<{ ok: boolean; reason?: string; kept?: number; file?: string }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  const src = HMO_REGISTERS.find((r) => r.council === council);
  if (!src) return { ok: false, reason: `No register known for ${council}. Known: ${HMO_REGISTERS.map((r) => r.council).join(", ")}.` };
  const wanted = new Set((await q<{ district: string }>(`SELECT district FROM os_radar_districts`)).map((r) => r.district));

  const [run] = await q<{ id: number }>(`INSERT INTO os_hmo_sync (council, file_name) VALUES ($1, $2) RETURNING id`, [council, opts.localPdf ?? ""]);
  try {
    let buf: Buffer;
    let file: string;
    if (opts.localPdf) {
      buf = readFileSync(opts.localPdf);
      file = opts.localPdf.split("/").pop() ?? "local.pdf";
    } else {
      const page = await fetch(src.page, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 TLE-OS Bond" }, signal: AbortSignal.timeout(30_000) });
      if (!page.ok) throw new Error(`The register page answered ${page.status}: ${src.page}`);
      const html = await page.text();
      const m = src.link.exec(html);
      if (!m) throw new Error(`No register PDF link found on ${src.page}`);
      const url = new URL(m[1], src.page).toString();
      file = decodeURIComponent(url.split("/").pop() ?? "register.pdf");
      const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 TLE-OS Bond" }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`The register PDF answered ${r.status}: ${url}`);
      buf = Buffer.from(await r.arrayBuffer());
    }
    await q(`UPDATE os_hmo_sync SET file_name = $2 WHERE id = $1`, [run.id, file]);

    const text = await pdfText(buf);
    let kept = 0;
    ROW.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ROW.exec(text))) {
      const [, category, households, people, licensed, address, postcodeRaw, organisation, ref, expires] = m;
      const postcode = postcodeRaw.toUpperCase().replace(/\s+/g, " ").replace(/^([A-Z0-9]+)(\d[A-Z]{2})$/, "$1 $2");
      const district = districtOf(postcode);
      if (!district || !wanted.has(district)) continue;
      await q(
        `INSERT INTO os_hmo_licences
           (licence_ref, council, category, households, people, licensed_on, expires_on, address, postcode, district, house_number, organisation, seen_in, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
         ON CONFLICT (licence_ref) DO UPDATE SET
           category = EXCLUDED.category, households = EXCLUDED.households, people = EXCLUDED.people,
           licensed_on = EXCLUDED.licensed_on, expires_on = EXCLUDED.expires_on, address = EXCLUDED.address,
           postcode = EXCLUDED.postcode, district = EXCLUDED.district, house_number = EXCLUDED.house_number,
           organisation = EXCLUDED.organisation, seen_in = EXCLUDED.seen_in, updated_at = NOW()`,
        [
          `${council}:${ref}`,
          council,
          category,
          Number(households),
          Number(people),
          iso(licensed),
          iso(expires),
          address.trim(),
          postcode,
          district,
          numberIn(address),
          organisation.trim(),
          file,
        ]
      );
      kept++;
    }
    if (kept === 0) throw new Error(`Read ${file} but recognised no licences in it - the layout may have changed.`);
    await q(`UPDATE os_hmo_sync SET status = 'done', rows_kept = $2, finished_at = NOW() WHERE id = $1`, [run.id, kept]);
    await matchHmoLicences();
    return { ok: true, kept, file };
  } catch (e) {
    await q(`UPDATE os_hmo_sync SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`, [run.id, (e as Error).message]);
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Stamp the licence onto every flagged property on the same door, and add
 * the expiring signal where the licence runs out within 150 days. Re-run
 * after every sweep, like the company match.
 */
export async function matchHmoLicences(): Promise<{ matched: number }> {
  if (!hasDb()) return { matched: 0 };
  const rows = await q<{ property_key: string }>(
    `WITH p AS (
       SELECT property_key, postcode,
              upper((regexp_match(coalesce(resolved_address, address), '\\d+[A-Za-z]?'))[1]) AS num
         FROM os_radar_prospects
     ),
     m AS (
       SELECT DISTINCT ON (p.property_key) p.property_key, h.licence_ref, h.expires_on
         FROM p JOIN os_hmo_licences h
           ON upper(h.postcode) = upper(p.postcode) AND p.num IS NOT NULL AND h.house_number = p.num
        ORDER BY p.property_key, h.expires_on DESC
     )
     UPDATE os_radar_prospects r
        SET hmo_licence_ref = m.licence_ref, hmo_expires_on = m.expires_on, updated_at = NOW()
       FROM m WHERE r.property_key = m.property_key
      RETURNING r.property_key`
  );
  await q(
    `UPDATE os_radar_prospects
        SET signals = signals || jsonb_build_array(jsonb_build_object(
              'key', 'hmo_licence_expiring',
              'detail', 'HMO licence runs out ' || to_char(hmo_expires_on, 'DD Mon YYYY'))),
            score = score + 20,
            updated_at = NOW()
      WHERE hmo_expires_on BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE + 150
        AND score > 0
        AND NOT (signals @> '[{"key":"hmo_licence_expiring"}]'::jsonb)`
  );
  return { matched: rows.length };
}
