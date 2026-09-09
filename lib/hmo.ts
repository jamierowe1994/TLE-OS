import "server-only";
import { readFileSync } from "node:fs";
import { hasDb, q } from "@/lib/db";
import { districtOf } from "@/lib/ma-research";

/**
 * HMO licences, from the councils' public registers.
 *
 * ── The one fact that shapes all of this ──────────────────────────────────
 *
 * Every licensing council must keep a register under s.232 of the Housing
 * Act 2004, and the statutory register has to carry the licence holder's
 * name and address. What a council chooses to PUBLISH is a different
 * question, and the answer is different in every council. Checked by hand
 * on 9 September 2026, against the real files rather than the council's
 * description of them:
 *
 *   Camden          name AND correspondence address, plus the manager's,
 *                   over an open data API. Complete, and free.
 *   Leicester       first and last name, no address. Free CSV.
 *   Milton Keynes   Licence Holder and Manager/Agent columns, in an XLSX.
 *   West Northants  redacted PDF: no name at all.
 *   Bristol         addresses only; the full register on request.
 *   Enfield         the full register, for a fee of £129.40.
 *
 * So a national Bond cannot assume one shape. The register catalogue below
 * records, per council, what is actually in the published file, so that the
 * Owners room can say "free name here, £7 title needed there" honestly
 * instead of guessing.
 *
 * ── Read the notice before using a name ───────────────────────────────────
 *
 * Camden stamps every row of its register with a warning that it is not
 * intended for marketing and that nobody in it has consented to that use.
 * Postal marketing does not need consent - PECR does not cover post - but
 * UK GDPR still does, and a publisher saying this out loud weighs against
 * us in the legitimate interests balancing test. `notice` carries that text
 * so nothing downstream can use a name without it being visible. James
 * decides whether a register with a notice is used at all; the sync holds
 * the data either way, because knowing who owns a door is also how we avoid
 * paying £7 to find out.
 *
 * ── How the West Northants PDF is read ────────────────────────────────────
 *
 * The PDF's name carries the month, so the link is read off the council's
 * register page each run rather than pinned. If the page changes shape the
 * run fails loudly with the page URL, and nothing is written. pdf-parse with
 * a page renderer that keeps a space between text items - its default runs
 * cells together ("Mandatory6627/02/2023...") and nothing can be parsed out
 * of that. Measured on the February 2026 file: 1,122 licences, 41 of them
 * expiring between September and December 2026.
 */

/** How the council publishes it. Only `pdf` is read so far. */
export type RegisterFormat = "pdf" | "csv" | "xlsx" | "api" | "search" | "request";

/** What the PUBLISHED register carries about the person behind the door. */
export type HolderData =
  /** Name and a correspondence address: enough to post to, on its own. */
  | "name_and_address"
  /** A name but nowhere to send it. Still worth having: it turns a £7 title
   *  from a discovery into a confirmation, and it finds portfolios. */
  | "name_only"
  /** Published redacted. The name exists on the statutory register but not
   *  in the file, so it is a written request or nothing. */
  | "none"
  /** Supplied on request, usually free, usually as a spreadsheet. */
  | "on_request"
  /** Supplied for a fee. */
  | "paid";

interface RegisterSource {
  council: string;
  page: string;
  format: RegisterFormat;
  /** The file or endpoint itself, where the council publishes one directly. */
  data?: string;
  /** Finds the current file on the page, when the name moves with the month. */
  link?: RegExp;
  holder: HolderData;
  /** Only where the council prints one. Shown wherever a name from here is. */
  notice?: string;
  /** ISO date this was last checked by hand, and how. Empty means the entry
   *  came from the council's own description and has not been opened yet. */
  checked?: string;
}

/**
 * The councils Bond knows how to read, or knows what it would find.
 *
 * Ordered by what TLE actually touches: the flagged doors sit in Northants,
 * Milton Keynes and Bedford; the managed book reaches Edinburgh, Bristol,
 * Devon, Leicester, Coventry and London. Scotland and Wales are not in here
 * at all, and that is deliberate - both already run a single national
 * landlord register, so they are a different and much easier problem than
 * England's 300-odd councils. See the note in bond.ts.
 */
export const HMO_REGISTERS: RegisterSource[] = [
  {
    council: "West Northamptonshire",
    page: "https://www.westnorthants.gov.uk/private-housing-tenants-and-landlords/houses-multiple-occupation-hmos/hmo-public-register-and",
    link: /href="([^"]*HMO[^"]*Register[^"]*\.pdf)"/i,
    format: "pdf",
    holder: "none",
    checked: "2026-09-09: read; 1,120 licences held, no holder name in the file",
  },
  {
    council: "Camden",
    page: "https://opendata.camden.gov.uk/Housing/HMO-Licensing-Register/x43g-c2rf",
    data: "https://opendata.camden.gov.uk/api/v3/views/x43g-c2rf/query.csv",
    format: "api",
    holder: "name_and_address",
    notice:
      "Camden: this register is intended for identifying licensed HMOs and management arrangements. It is not intended for marketing purposes and nobody named in it has consented to that use.",
    checked: "2026-09-09: fetched; name_of_licence_holder, address_of_licence_holder, name_of_person_managing, address_of_manager, lat/long",
  },
  {
    council: "Leicester",
    page: "https://data.leicester.gov.uk/explore/dataset/public-register-of-licenced-hmos/",
    data: "https://data.leicester.gov.uk/explore/dataset/public-register-of-licenced-hmos/download/?format=csv",
    format: "csv",
    holder: "name_only",
    checked: "2026-09-09: fetched; 884 rows, landlord_first_name and landlord_last_name, no address",
  },
  {
    council: "Milton Keynes",
    page: "https://www.milton-keynes.gov.uk/housing/houses-multiple-occupation-hmo",
    data: "https://www.milton-keynes.gov.uk/sites/default/files/2025-02/HMOs%20Licensed%20Public%20Register.xlsx",
    format: "xlsx",
    holder: "name_and_address",
    checked: "2026-09-09: fetched; Licence Holder and Manager/Agent columns, holder address alongside",
  },
  /* Known of, not yet opened. The holder column is what the council says it
     publishes, so treat it as a lead to check rather than a fact. */
  { council: "North Northamptonshire", page: "https://www.northnorthants.gov.uk/licensing/licensing-register", format: "search", holder: "name_only" },
  { council: "Bedford", page: "https://www.bedford.gov.uk/housing/houses-multiple-occupation-hmo/hmo-licensing", format: "xlsx", holder: "name_only" },
  { council: "Bristol", page: "https://www.bristol.gov.uk/licences-permits/register-of-licensed-properties", format: "request", holder: "on_request" },
  { council: "Enfield", page: "https://www.enfield.gov.uk/services/housing/houses-in-multiple-occupation", format: "request", holder: "paid" },
  { council: "Coventry", page: "https://www.coventry.gov.uk/licensing-regulation/hmo-licensing/16", format: "search", holder: "name_only" },
  { council: "Warwick", page: "https://www.warwickdc.gov.uk/downloads/download/1372/hmo_public_register", format: "csv", holder: "name_only" },
  { council: "Hounslow", page: "https://data.hounslow.gov.uk/@london-borough-of-hounslow/register-of-licensed-hmos", format: "csv", holder: "name_only" },
  { council: "Barnet", page: "https://www.data.gov.uk/dataset/hmo-register", format: "csv", holder: "name_only" },
];

/** Councils whose published register is enough to write to somebody. */
export const REGISTERS_WITH_A_NAME = HMO_REGISTERS.filter(
  (r) => r.holder === "name_and_address" || r.holder === "name_only"
);

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
  /* The catalogue knows about more councils than the reader can open. Say so
     plainly rather than failing halfway through a run. */
  if (!opts.localPdf && (src.format !== "pdf" || !src.link)) {
    return { ok: false, reason: `${council} publishes its register as ${src.format}, and only the PDF reader is built. Nothing was written.` };
  }
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
      const m = src.link!.exec(html);
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
